/** The myDEV tab and the `#mydev` navigation state (FR-1, FR-8). */
import { MARKER } from '../../core/markers.ts';
import type { FeatureContext, Unsubscribe } from '../../core/types.ts';
import { MYDEV_HASH } from '../../site/devto/selectors.ts';

export const TAB_ROLE = 'tab';

export interface MyDevTab {
  /** True while the myDEV view should be showing (the URL hash is `#mydev`). */
  isActive(): boolean;
  onChange(cb: (active: boolean) => void): Unsubscribe;
}

/**
 * Adds a myDEV tab after the native tabs and tracks whether it is active.
 *
 * The tab is a plain link to `#mydev`, so opening it is an ordinary hash navigation: the browser
 * pushes the history entry (Back works) and a deep link needs no extra code. Our click handler only
 * stops dev.to's own tab handlers from seeing the click. While active, the native tabs' highlight is
 * moved to ours and kept there; a click on a native tab clears the hash and hands over to dev.to.
 */
export function createMyDevTab(ctx: FeatureContext): MyDevTab {
  const { site, log, signal } = ctx;
  const listeners = new Set<(active: boolean) => void>();

  let active = false;
  let item: HTMLElement | null = null;
  let link: HTMLElement | null = null;
  let saved: { tab: Element; ariaCurrent: string | null }[] = [];
  let guard: MutationObserver | null = null;

  const isMyDevRoute = (): boolean => {
    const route = site.currentRoute();
    return route.kind === 'home' && route.feed === 'mydev';
  };

  const nativeTabs = () => site.findTabs().filter((tab) => tab !== link);

  const stripNativeHighlight = () => {
    for (const tab of nativeTabs()) if (site.isTabCurrent(tab)) site.setTabCurrent(tab, false);
  };

  const applyActive = () => {
    saved = nativeTabs()
      .filter((tab) => site.isTabCurrent(tab))
      .map((tab) => ({ tab, ariaCurrent: tab.getAttribute('aria-current') }));
    stripNativeHighlight();
    if (link) site.setTabCurrent(link, true);
    const list = site.findTabBar();
    if (list) {
      // dev.to re-highlights its own tab on popstate; keep the highlight on ours while active.
      guard = new MutationObserver(() => {
        // Once the URL has left #mydev the highlight belongs to dev.to again.
        if (isMyDevRoute()) stripNativeHighlight();
      });
      guard.observe(list, {
        attributes: true,
        attributeFilter: ['class', 'aria-current'],
        subtree: true,
      });
    }
  };

  const applyInactive = (restore: boolean) => {
    guard?.disconnect();
    guard = null;
    if (link) site.setTabCurrent(link, false);
    // Only put the old highlight back if dev.to has not already chosen a new one.
    if (restore && !nativeTabs().some((tab) => site.isTabCurrent(tab))) {
      for (const { tab, ariaCurrent } of saved) {
        site.setTabCurrent(tab, true);
        if (ariaCurrent === null) tab.removeAttribute('aria-current');
      }
    }
    saved = [];
  };

  const setActive = (next: boolean, restore = true) => {
    if (next === active) return;
    active = next;
    if (next) applyActive();
    else applyInactive(restore);
    for (const listener of [...listeners]) {
      try {
        listener(next);
      } catch (error) {
        log.error('myDEV tab listener failed', error);
      }
    }
  };

  const ensureTab = () => {
    if (signal.aborted || (item && item.isConnected)) return;
    const list = site.findTabBar();
    const created = site.createTab('myDEV', MYDEV_HASH);
    if (!list || !created) {
      log.warnOnce('no-tab-bar', 'feed tab bar not found; not adding the myDEV tab');
      return;
    }
    item = created.item;
    link = created.link;
    item.setAttribute(MARKER.owned, TAB_ROLE);
    link.addEventListener('click', (event) => event.stopImmediatePropagation(), { signal });
    list.append(item);
    if (active) applyActive();
  };

  ensureTab();
  setActive(isMyDevRoute());

  const stopRoutes = site.onRouteChange((route) => {
    ensureTab();
    setActive(route.kind === 'home' && route.feed === 'mydev');
  });

  // Re-add the tab if the page rebuilds the tab bar's children.
  const list = site.findTabBar();
  const rebuilt = list ? new MutationObserver(ensureTab) : null;
  if (list) rebuilt?.observe(list, { childList: true });

  // A click on a native tab leaves myDEV: clear the hash first, then dev.to does its own thing.
  const onNativeTabClick = (event: Event) => {
    if (!active || !(event.target instanceof Element)) return;
    const clicked = nativeTabs().find((tab) => tab.contains(event.target as Element));
    if (!clicked) return;
    if (window.location.hash === MYDEV_HASH) {
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search,
      );
    }
    setActive(false, false);
  };
  list?.addEventListener('click', onNativeTabClick, { capture: true, signal });

  signal.addEventListener(
    'abort',
    () => {
      stopRoutes();
      rebuilt?.disconnect();
      if (active) applyInactive(true);
      active = false;
      item?.remove();
      listeners.clear();
    },
    { once: true },
  );

  return {
    isActive: () => active,
    onChange(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
  };
}
