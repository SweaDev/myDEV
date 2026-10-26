import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeatureContext, Route } from '../../src/core/types.ts';
import { myDevFeature } from '../../src/features/mydev/index.ts';
import { createDevtoAdapter } from '../../src/site/devto/adapter.ts';
import { createFakeStore, type FakeStore } from '../helpers/fake-store.ts';
import { mountFixture, setUrl } from '../helpers/fixtures.ts';

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), warnOnce: vi.fn() };
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const site = createDevtoAdapter();

let controller: AbortController;
let store: FakeStore;
let liveObservers: number;
let liveListeners: Map<string, number>;

const RealObserver = window.MutationObserver;
const addListener = window.addEventListener.bind(window);
const removeListener = window.removeEventListener.bind(window);

/** Counts observers that observe but were never disconnected, and window listeners added but not removed. */
function trackLeaks() {
  liveObservers = 0;
  liveListeners = new Map();
  class Tracked extends RealObserver {
    #on = false;
    override observe(target: Node, options?: MutationObserverInit) {
      if (!this.#on) liveObservers++;
      this.#on = true;
      super.observe(target, options);
    }
    override disconnect() {
      if (this.#on) liveObservers--;
      this.#on = false;
      super.disconnect();
    }
  }
  window.MutationObserver = Tracked;
  globalThis.MutationObserver = Tracked;
  const bump = (type: string, by: number) =>
    liveListeners.set(type, (liveListeners.get(type) ?? 0) + by);
  window.addEventListener = ((type: string, ...rest: unknown[]) => {
    if (type === 'popstate' || type === 'hashchange') bump(type, 1);
    return (addListener as (...a: unknown[]) => void)(type, ...rest);
  }) as typeof window.addEventListener;
  window.removeEventListener = ((type: string, ...rest: unknown[]) => {
    if (type === 'popstate' || type === 'hashchange') bump(type, -1);
    return (removeListener as (...a: unknown[]) => void)(type, ...rest);
  }) as typeof window.removeEventListener;
}

function restoreGlobals() {
  window.MutationObserver = RealObserver;
  globalThis.MutationObserver = RealObserver;
  window.addEventListener = addListener as typeof window.addEventListener;
  window.removeEventListener = removeListener as typeof window.removeEventListener;
}

const ctx = (): FeatureContext => ({ site, store, log, signal: controller.signal });

beforeEach(() => {
  vi.clearAllMocks();
  controller = new AbortController();
  setUrl('/');
  mountFixture('logged-out/feed.html');
  store = createFakeStore(['4917021']);
  trackLeaks();
});

afterEach(() => {
  myDevFeature.dispose();
  controller.abort();
  restoreGlobals();
  document.body.replaceChildren();
});

describe('myDevFeature', () => {
  it('is the mydev feature and matches every home feed, but not other pages', () => {
    expect(myDevFeature.id).toBe('mydev');
    const home = (feed: string) => ({ kind: 'home', feed }) as Route;
    for (const feed of ['relevant', 'latest', 'top', 'discover', 'following', 'curated', 'mydev']) {
      expect(myDevFeature.matches(home(feed))).toBe(true);
    }
    expect(myDevFeature.matches({ kind: 'other' })).toBe(false);
  });

  it('wires the filter, tick buttons and tab together', async () => {
    await myDevFeature.init(ctx());
    expect(
      document.querySelector('[data-feed-content-id="4917021"]')?.hasAttribute('data-mydev-hidden'),
    ).toBe(true);
    expect(document.querySelectorAll('button[data-mydev="tick"]')).toHaveLength(3);
    expect(document.querySelectorAll('[data-mydev="tab"]')).toHaveLength(1);
  });

  it('checks a post end to end: saved, hidden, and listed in the view', async () => {
    await myDevFeature.init(ctx());
    document
      .querySelector<HTMLElement>('[data-feed-content-id="4911807"] button[data-mydev="tick"]')
      ?.click();
    await flush();
    expect(store.added.map((r) => r.postId)).toEqual(['4911807']);
    expect(
      document.querySelector('[data-feed-content-id="4911807"]')?.hasAttribute('data-mydev-hidden'),
    ).toBe(true);
  });

  it('opens the myDEV view from #mydev', async () => {
    await myDevFeature.init(ctx());
    setUrl('/#mydev');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flush();
    expect(document.querySelector('[data-mydev="view"]')).not.toBeNull();
    expect(document.querySelector('#substories')?.hasAttribute('data-mydev-feed-hidden')).toBe(
      true,
    );
  });

  it('leaves no nodes, markers, observers or listeners behind after dispose', async () => {
    await myDevFeature.init(ctx());
    setUrl('/#mydev');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flush();
    expect(liveObservers).toBeGreaterThan(0);

    myDevFeature.dispose();
    expect(document.querySelectorAll('[data-mydev]')).toHaveLength(0);
    expect(
      document.querySelectorAll(
        '[data-mydev-hidden], [data-mydev-processed], [data-mydev-feed-hidden]',
      ),
    ).toHaveLength(0);
    expect(liveObservers).toBe(0);
    expect([...liveListeners.values()].every((n) => n === 0)).toBe(true);
  });

  it('cleans up when the host aborts the signal (route change)', async () => {
    await myDevFeature.init(ctx());
    controller.abort();
    expect(document.querySelectorAll('[data-mydev]')).toHaveLength(0);
    expect(liveObservers).toBe(0);
  });

  it('can be initialised again after dispose without duplicating anything', async () => {
    await myDevFeature.init(ctx());
    myDevFeature.dispose();
    controller = new AbortController();
    await myDevFeature.init(ctx());
    expect(document.querySelectorAll('[data-mydev="tab"]')).toHaveLength(1);
    expect(document.querySelectorAll('button[data-mydev="tick"]')).toHaveLength(3);
  });

  it('re-initialising without dispose replaces the previous instance', async () => {
    await myDevFeature.init(ctx());
    await myDevFeature.init(ctx());
    expect(document.querySelectorAll('[data-mydev="tab"]')).toHaveLength(1);
    expect(document.querySelectorAll('button[data-mydev="tick"]')).toHaveLength(3);
  });

  it('still adds the tab when the ID set cannot be loaded, and does not hide anything', async () => {
    store = createFakeStore(['4917021'], true);
    const started = myDevFeature.init(ctx());
    store.rejectReady(new Error('boom'));
    await started;
    expect(document.querySelectorAll('[data-mydev="tab"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-mydev-hidden]')).toHaveLength(0);
    expect(document.querySelectorAll('button[data-mydev="tick"]')).toHaveLength(0);
  });
});
