import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startBackground } from '../../src/background/start.ts';
import {
  PREFILTER_TIMEOUT_MS,
  startBootstrap,
  type Bootstrap,
} from '../../src/content/bootstrap.ts';
import { createStoreClient } from '../../src/content/store-client.ts';
import type { FeatureModule } from '../../src/core/types.ts';
import { LocalMyDevStore } from '../../src/storage/local-mydev-store.ts';
import { createChromeMock, type ChromeMock } from '../helpers/chrome-mock.ts';
import { createFakeStore } from '../helpers/fake-store.ts';
import { mountFixture, setUrl } from '../helpers/fixtures.ts';

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), warnOnce: vi.fn() };
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const prefilterOn = () => document.documentElement.hasAttribute('data-mydev-prefilter');
const prefilterStyles = () => document.querySelectorAll('style[data-mydev="prefilter"]');

let boot: Bootstrap | null;
const start = (options: Parameters<typeof startBootstrap>[0] = {}) => {
  boot = startBootstrap({ log, ...options });
  return boot;
};

const noopFeature = (init: FeatureModule['init'] = () => undefined): FeatureModule => ({
  id: 'noop',
  matches: () => true,
  init,
  dispose: () => undefined,
});

let mock: ChromeMock;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  mock = createChromeMock();
  mock.install();
  setUrl('/');
  mountFixture('logged-out/feed.html');
  boot = null;
});

afterEach(() => {
  boot?.stop();
  mock.uninstall();
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('pre-filter', () => {
  it('is on straight away on a home-feed URL and off once the features have started', async () => {
    const b = start({ store: createFakeStore(), features: [noopFeature()] });
    expect(prefilterOn()).toBe(true);
    expect(prefilterStyles()).toHaveLength(1);
    expect(prefilterStyles()[0]?.textContent).toContain('visibility: hidden');
    await b.ready;
    expect(prefilterOn()).toBe(false);
    expect(prefilterStyles()).toHaveLength(0);
  });

  it('is never switched on for pages that are not home feeds', async () => {
    setUrl('/t/javascript');
    const b = start({ store: createFakeStore(), features: [noopFeature()] });
    expect(prefilterOn()).toBe(false);
    expect(prefilterStyles()).toHaveLength(0);
    await b.ready;
  });

  it('is removed after the timeout even if the ID set never loads', async () => {
    vi.useFakeTimers();
    const never = createFakeStore([], true); // ready stays pending
    start({ store: never, features: [noopFeature(() => never.ready)] });
    expect(prefilterOn()).toBe(true);
    await vi.advanceTimersByTimeAsync(PREFILTER_TIMEOUT_MS - 1);
    expect(prefilterOn()).toBe(true);
    await vi.advanceTimersByTimeAsync(2);
    expect(prefilterOn()).toBe(false);
    expect(prefilterStyles()).toHaveLength(0);
  });

  it('is removed when the ID set fails to load, well before the timeout', async () => {
    const failing = createFakeStore([], true);
    const b = start({ store: failing, timeoutMs: 60_000 });
    failing.rejectReady(new Error('boom'));
    await b.ready;
    expect(prefilterOn()).toBe(false);
    // Fails open: nothing was hidden.
    expect(document.querySelectorAll('[data-mydev-hidden]')).toHaveLength(0);
  });

  it('is removed even if a feature throws', async () => {
    const b = start({
      store: createFakeStore(),
      features: [
        noopFeature(() => {
          throw new Error('bad feature');
        }),
      ],
    });
    await b.ready;
    expect(prefilterOn()).toBe(false);
  });

  it('is removed by stop()', () => {
    const b = start({ store: createFakeStore(), features: [noopFeature()] });
    b.stop();
    expect(prefilterOn()).toBe(false);
  });
});

describe('DOM ready', () => {
  it('waits for DOMContentLoaded before starting features', async () => {
    const init = vi.fn();
    Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });
    try {
      const b = start({ store: createFakeStore(), features: [noopFeature(init)] });
      await flush();
      expect(init).not.toHaveBeenCalled();
      expect(prefilterOn()).toBe(true);
      Object.defineProperty(document, 'readyState', { value: 'interactive', configurable: true });
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await b.ready;
      expect(init).toHaveBeenCalledTimes(1);
      expect(prefilterOn()).toBe(false);
    } finally {
      delete (document as { readyState?: unknown }).readyState;
    }
  });
});

describe('FR-9: nothing recognisable on a home feed', () => {
  it('starts nothing, warns exactly once and lifts the pre-filter', async () => {
    document.body.replaceChildren();
    const init = vi.fn();
    const b = start({ store: createFakeStore(), features: [noopFeature(init)] });
    await b.ready;
    expect(init).not.toHaveBeenCalled();
    expect(log.warnOnce).toHaveBeenCalledTimes(1);
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
    expect(prefilterOn()).toBe(false);
  });

  it('does not warn on pages that are simply not home feeds', async () => {
    setUrl('/someone/a-post-1abc');
    document.body.replaceChildren();
    const b = start({ store: createFakeStore(), features: [noopFeature()] });
    await b.ready;
    expect(log.warnOnce).not.toHaveBeenCalled();
  });
});

describe('end to end with the background', () => {
  it('hides a saved post, adds ticks and the myDEV tab, and leaves no pre-filter behind', async () => {
    let clock = 1;
    const { ready: backgroundReady } = startBackground({
      store: new LocalMyDevStore({ now: () => clock++, log }),
    });
    await backgroundReady;
    // Save a post through the real path, then "reload" the page.
    const seed = createStoreClient(log);
    await seed.ready;
    const bootSeed = start({ store: seed });
    await bootSeed.ready;
    document
      .querySelector<HTMLElement>('[data-feed-content-id="4917021"] button[data-mydev="tick"]')
      ?.click();
    await flush();
    await flush();
    bootSeed.stop();
    seed.dispose();
    expect(mock.data.get('mydev:item:4917021')).toBeDefined();

    mountFixture('logged-out/feed.html');
    const store = createStoreClient(log);
    const b = start({ store });
    expect(prefilterOn()).toBe(true);
    await b.ready;
    expect(prefilterOn()).toBe(false);
    expect(
      document.querySelector('[data-feed-content-id="4917021"]')?.hasAttribute('data-mydev-hidden'),
    ).toBe(true);
    expect(
      document.querySelector('[data-feed-content-id="4911807"]')?.hasAttribute('data-mydev-hidden'),
    ).toBe(false);
    expect(document.querySelectorAll('button[data-mydev="tick"]')).toHaveLength(3);
    expect(document.querySelectorAll('[data-mydev="tab"]')).toHaveLength(1);
    store.dispose();
  });
});
