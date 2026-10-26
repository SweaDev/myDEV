import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFeatureHost } from '../../src/content/feature-host.ts';
import type { FeatureContext, FeatureModule, Route, SiteAdapter } from '../../src/core/types.ts';
import { features as registry } from '../../src/features/index.ts';
import { SETTINGS_KEY } from '../../src/storage/schema.ts';
import { createChromeMock, type ChromeMock } from '../helpers/chrome-mock.ts';
import { createFakeStore } from '../helpers/fake-store.ts';

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), warnOnce: vi.fn() };
const makeLogger = () => log;
const home: Route = { kind: 'home', feed: 'latest' };
const other: Route = { kind: 'other' };

/** A site whose route the test controls. */
function fakeSite(initial: Route) {
  let route = initial;
  const listeners = new Set<(route: Route) => void>();
  const site = {
    currentRoute: () => route,
    onRouteChange(cb: (route: Route) => void) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
  } as unknown as SiteAdapter;
  return {
    site,
    go(next: Route) {
      route = next;
      for (const listener of [...listeners]) listener(next);
    },
    listenerCount: () => listeners.size,
  };
}

function fakeFeature(id: string, overrides: Partial<FeatureModule> = {}) {
  const contexts: FeatureContext[] = [];
  const feature: FeatureModule = {
    id,
    matches: (route) => route.kind === 'home',
    init: vi.fn((ctx: FeatureContext) => void contexts.push(ctx)),
    dispose: vi.fn(),
    ...overrides,
  };
  return { feature, contexts };
}

let mock: ChromeMock;

beforeEach(() => {
  vi.clearAllMocks();
  mock = createChromeMock();
  mock.install();
});

afterEach(() => mock.uninstall());

const build = (route: Route, features: FeatureModule[], extra = {}) => {
  const s = fakeSite(route);
  const host = createFeatureHost({
    site: s.site,
    store: createFakeStore(),
    features,
    makeLogger,
    ...extra,
  });
  return { ...s, host };
};

describe('registry', () => {
  it('lists the myDEV feature', () => {
    expect(registry.map((f) => f.id)).toEqual(['mydev']);
  });
});

describe('starting features', () => {
  it('inits matching features with a scoped context and skips non-matching ones', async () => {
    const a = fakeFeature('a');
    const b = fakeFeature('b', { matches: () => false });
    const { host } = build(home, [a.feature, b.feature]);
    await host.start();
    expect(a.feature.init).toHaveBeenCalledTimes(1);
    expect(b.feature.init).not.toHaveBeenCalled();
    const ctx = a.contexts[0] as FeatureContext;
    expect(ctx.signal.aborted).toBe(false);
    expect(ctx.store).toBeDefined();
    expect(ctx.site).toBeDefined();
  });

  it('waits for async inits before start() resolves', async () => {
    let finished = false;
    const slow = fakeFeature('slow', {
      init: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        finished = true;
      },
    });
    const { host } = build(home, [slow.feature]);
    await host.start();
    expect(finished).toBe(true);
  });

  it('does not re-init a running feature when the route changes within its matches', async () => {
    const a = fakeFeature('a');
    const { host, go } = build(home, [a.feature]);
    await host.start();
    go({ kind: 'home', feed: 'top' });
    go({ kind: 'home', feed: 'mydev' });
    expect(a.feature.init).toHaveBeenCalledTimes(1);
    expect(a.feature.dispose).not.toHaveBeenCalled();
  });
});

describe('route changes', () => {
  it('disposes a feature that stops matching (aborting its signal) and re-inits it when it matches again', async () => {
    const a = fakeFeature('a');
    const { host, go } = build(home, [a.feature]);
    await host.start();
    const first = a.contexts[0] as FeatureContext;

    go(other);
    expect(a.feature.dispose).toHaveBeenCalledTimes(1);
    expect(first.signal.aborted).toBe(true);

    go(home);
    expect(a.feature.init).toHaveBeenCalledTimes(2);
    const second = a.contexts[1] as FeatureContext;
    expect(second.signal.aborted).toBe(false);
    expect(second).not.toBe(first);
  });

  it('starts a feature that begins to match', async () => {
    const a = fakeFeature('a');
    const { host, go } = build(other, [a.feature]);
    await host.start();
    expect(a.feature.init).not.toHaveBeenCalled();
    go(home);
    expect(a.feature.init).toHaveBeenCalledTimes(1);
  });

  it('only touches the features whose match changed', async () => {
    const homeOnly = fakeFeature('home-only');
    const everywhere = fakeFeature('everywhere', { matches: () => true });
    const { host, go } = build(home, [homeOnly.feature, everywhere.feature]);
    await host.start();
    go(other);
    expect(homeOnly.feature.dispose).toHaveBeenCalledTimes(1);
    expect(everywhere.feature.dispose).not.toHaveBeenCalled();
  });
});

describe('error isolation', () => {
  it('a feature whose init throws does not stop the others', async () => {
    const bad = fakeFeature('bad', {
      init: () => {
        throw new Error('sync boom');
      },
    });
    const good = fakeFeature('good');
    const { host } = build(home, [bad.feature, good.feature]);
    await expect(host.start()).resolves.toBeUndefined();
    expect(good.feature.init).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('"bad"'), expect.any(Error));
  });

  it('a feature whose init rejects is disposed and stays off for the page', async () => {
    const bad = fakeFeature('bad', { init: vi.fn(() => Promise.reject(new Error('async boom'))) });
    const good = fakeFeature('good');
    const { host, go } = build(home, [bad.feature, good.feature]);
    await host.start();
    expect(bad.feature.dispose).toHaveBeenCalledTimes(1);
    expect(good.feature.dispose).not.toHaveBeenCalled();

    go(other);
    go(home);
    expect(bad.feature.init).toHaveBeenCalledTimes(1);
    expect(good.feature.init).toHaveBeenCalledTimes(2);
  });

  it('a throwing dispose does not stop other features being disposed', async () => {
    const bad = fakeFeature('bad', {
      dispose: vi.fn(() => {
        throw new Error('dispose boom');
      }),
    });
    const good = fakeFeature('good');
    const { host, go } = build(home, [bad.feature, good.feature]);
    await host.start();
    go(other);
    expect(bad.feature.dispose).toHaveBeenCalled();
    expect(good.feature.dispose).toHaveBeenCalled();
  });

  it('a throwing matches() turns that feature off without affecting the rest', async () => {
    const bad = fakeFeature('bad', {
      matches: () => {
        throw new Error('matches boom');
      },
    });
    const good = fakeFeature('good');
    const { host } = build(home, [bad.feature, good.feature]);
    await host.start();
    expect(bad.feature.init).not.toHaveBeenCalled();
    expect(good.feature.init).toHaveBeenCalledTimes(1);
  });
});

describe('settings', () => {
  it('skips a feature whose flag is disabled, even when it matches', async () => {
    const a = fakeFeature('a');
    const b = fakeFeature('b');
    const { host } = build(home, [a.feature, b.feature], {
      readSettings: async () => ({ features: { a: { enabled: false } } }),
    });
    await host.start();
    expect(a.feature.init).not.toHaveBeenCalled();
    expect(b.feature.init).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no settings stored', async () => null],
    [
      'settings that name other features only',
      async () => ({ features: { other: { enabled: false } } }),
    ],
    ['a failing settings read', async () => Promise.reject(new Error('storage down'))],
  ])('runs features by default with %s', async (_name, readSettings) => {
    const a = fakeFeature('a');
    const { host } = build(home, [a.feature], { readSettings });
    await host.start();
    expect(a.feature.init).toHaveBeenCalledTimes(1);
  });

  it('reads the stored settings key by default and validates it', async () => {
    mock.data.set(SETTINGS_KEY, { features: { a: { enabled: false } } });
    const a = fakeFeature('a');
    const off = build(home, [a.feature]);
    await off.host.start();
    expect(a.feature.init).not.toHaveBeenCalled();

    mock.data.set(SETTINGS_KEY, { features: { a: { enabled: 'nope' } } });
    const b = fakeFeature('a');
    const invalid = build(home, [b.feature]);
    await invalid.host.start();
    expect(b.feature.init).toHaveBeenCalledTimes(1);
  });
});

describe('stop', () => {
  it('disposes every running feature and stops following the route', async () => {
    const a = fakeFeature('a');
    const b = fakeFeature('b');
    const { host, go, listenerCount } = build(home, [a.feature, b.feature]);
    await host.start();
    expect(listenerCount()).toBe(1);
    host.stop();
    expect(a.feature.dispose).toHaveBeenCalledTimes(1);
    expect(b.feature.dispose).toHaveBeenCalledTimes(1);
    expect(listenerCount()).toBe(0);
    go(other);
    go(home);
    expect(a.feature.init).toHaveBeenCalledTimes(1);
  });

  it('does not start anything if stopped while settings were loading', async () => {
    const a = fakeFeature('a');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { host } = build(home, [a.feature], {
      readSettings: async () => {
        await gate;
        return null;
      },
    });
    const started = host.start();
    host.stop();
    release();
    await started;
    expect(a.feature.init).not.toHaveBeenCalled();
  });
});
