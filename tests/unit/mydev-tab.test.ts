import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeatureContext } from '../../src/core/types.ts';
import { createMyDevTab, type MyDevTab } from '../../src/features/mydev/mydev-tab.ts';
import { createDevtoAdapter } from '../../src/site/devto/adapter.ts';
import { createFakeStore } from '../helpers/fake-store.ts';
import { mountFixture, setUrl } from '../helpers/fixtures.ts';

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), warnOnce: vi.fn() };
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const site = createDevtoAdapter();

let controller: AbortController;

function start(): MyDevTab {
  const ctx: FeatureContext = { site, store: createFakeStore(), log, signal: controller.signal };
  return createMyDevTab(ctx);
}

const ourTab = () => document.querySelector<HTMLElement>('[data-mydev="tab"]');
const ourLink = () => ourTab()?.querySelector<HTMLElement>('a') as HTMLElement;
const nativeLinks = () => site.findTabs().filter((tab) => !ourTab()?.contains(tab));
const current = (el: Element) => site.isTabCurrent(el);
const currentNatives = () =>
  nativeLinks()
    .filter(current)
    .map((tab) => tab.textContent?.trim().split(/\s+/)[0]);

/** Moves to a URL and fires what the browser fires. */
async function navigate(url: string) {
  setUrl(url);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  await flush();
}

beforeEach(() => {
  vi.clearAllMocks();
  controller = new AbortController();
  setUrl('/');
});

afterEach(() => {
  controller.abort();
  document.body.replaceChildren();
});

describe.each([
  ['logged out', 'logged-out/feed.html', false, ['Relevant']],
  ['logged in', 'logged-in/tab-bar.html', true, ['Discover']],
] as const)('%s layout', (_name, fixture, loggedIn, highlighted) => {
  beforeEach(() => mountFixture(fixture, loggedIn));

  it('appends one myDEV tab after the native tabs', () => {
    start();
    const tabs = site.findTabs();
    const ours = ourTab();
    expect(document.querySelectorAll('[data-mydev="tab"]')).toHaveLength(1);
    expect(tabs.at(-1)).toBe(ourLink());
    expect(ours?.parentElement).toBe(site.findTabBar());
    expect(ourLink().textContent).toContain('myDEV');
    expect(ourLink().getAttribute('href')).toBe('#mydev');
    expect(current(ourLink())).toBe(false);
  });

  it('starts inactive and leaves the native highlight alone', () => {
    const tab = start();
    expect(tab.isActive()).toBe(false);
    expect(currentNatives()).toEqual(highlighted);
  });

  it('moves the highlight to the myDEV tab when #mydev opens, and back when it closes', async () => {
    const tab = start();
    const changes: boolean[] = [];
    tab.onChange((active) => changes.push(active));

    await navigate('/#mydev');
    expect(tab.isActive()).toBe(true);
    expect(currentNatives()).toEqual([]);
    expect(current(ourLink())).toBe(true);
    expect(ourLink().getAttribute('aria-current')).toBe('page');

    await navigate('/');
    expect(tab.isActive()).toBe(false);
    expect(currentNatives()).toEqual(highlighted);
    expect(current(ourLink())).toBe(false);
    expect(ourLink().hasAttribute('aria-current')).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it('opens directly from a deep link', () => {
    setUrl('/#mydev');
    const tab = start();
    expect(tab.isActive()).toBe(true);
    expect(currentNatives()).toEqual([]);
    expect(current(ourLink())).toBe(true);
  });

  it('keeps the highlight on myDEV when dev.to re-highlights its own tab', async () => {
    start();
    await navigate('/#mydev');
    const native = nativeLinks()[0];
    if (!native) throw new Error('no native tab');
    site.setTabCurrent(native, true);
    await flush();
    expect(currentNatives()).toEqual([]);
    expect(current(ourLink())).toBe(true);
  });

  it('does not restore the old highlight if dev.to has already chosen a new one', async () => {
    const tab = start();
    await navigate('/#mydev');
    const last = nativeLinks().at(-1);
    if (!last) throw new Error('no native tab');
    // Back: the URL changes and dev.to highlights its tab before our observers run.
    setUrl('/latest');
    site.setTabCurrent(last, true);
    await flush();
    expect(current(last)).toBe(true);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flush();
    expect(tab.isActive()).toBe(false);
    expect(current(ourLink())).toBe(false);
    expect(nativeLinks().filter(current)).toEqual([last]);
  });

  it('clears the hash and hands over when a native tab is clicked', async () => {
    const tab = start();
    await navigate('/#mydev');
    const target = nativeLinks()[1];
    if (!target) throw new Error('no native tab');
    const devtoHandler = vi.fn((event: Event) => event.preventDefault());
    site.findTabBar()?.addEventListener('click', devtoHandler);

    target.click();
    expect(window.location.hash).toBe('');
    expect(tab.isActive()).toBe(false);
    expect(current(ourLink())).toBe(false);
    expect(devtoHandler).toHaveBeenCalledTimes(1);
    // The old highlight is dev.to's to move, so it is not put back by us.
    expect(currentNatives()).toEqual([]);
  });

  it('hides its click from dev.to handlers on the tab and above it', () => {
    start();
    const seenByPage = vi.fn();
    const seenByTab = vi.fn();
    document.addEventListener('click', seenByPage);
    ourLink().addEventListener('click', seenByTab);
    ourLink().addEventListener('click', (event) => event.preventDefault(), { once: true });
    ourLink().click();
    expect(seenByPage).not.toHaveBeenCalled();
    expect(seenByTab).not.toHaveBeenCalled();
    document.removeEventListener('click', seenByPage);
  });

  it('puts the tab back if the page removes it', async () => {
    start();
    ourTab()?.remove();
    await flush();
    expect(document.querySelectorAll('[data-mydev="tab"]')).toHaveLength(1);
    expect(site.findTabs().at(-1)).toBe(ourLink());
  });

  it('removes the tab and gives the highlight back on dispose', async () => {
    const tab = start();
    await navigate('/#mydev');
    controller.abort();
    expect(ourTab()).toBeNull();
    expect(currentNatives()).toEqual(highlighted);
    expect(tab.isActive()).toBe(false);

    await navigate('/#mydev');
    expect(document.querySelectorAll('[data-mydev="tab"]')).toHaveLength(0);
  });

  it('stops notifying after unsubscribe', async () => {
    const tab = start();
    const cb = vi.fn();
    tab.onChange(cb)();
    await navigate('/#mydev');
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('no tab bar', () => {
  it('does nothing visible, warns once and does not throw', async () => {
    mountFixture('logged-out/non-post-synthetic.html');
    const tab = start();
    expect(document.querySelectorAll('[data-mydev="tab"]')).toHaveLength(0);
    expect(log.warnOnce).toHaveBeenCalledWith('no-tab-bar', expect.any(String));
    await navigate('/#mydev');
    expect(tab.isActive()).toBe(true);
  });
});
