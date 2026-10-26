/** The dev.to `SiteAdapter` (SPEC §6.4). Never throws: any miss is `null`, `false` or `[]` (FR-9). */
import { MARKER } from '../../core/markers.ts';
import type {
  MyDevRecordInput,
  Route,
  SiteAdapter,
  SourceFeed,
  Unsubscribe,
} from '../../core/types.ts';
import { parseCard, postIdOf } from './parse-card.ts';
import { onRouteChange, parseRoute, type RouteWatchOptions } from './routes.ts';
import { CARD, FEED, TABS } from './selectors.ts';

const ARIA_CURRENT = 'aria-current';

/** Runs `fn`, returning `fallback` if it throws. */
function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function createDevtoAdapter(options: RouteWatchOptions = {}): SiteAdapter {
  const doc = options.doc ?? document;
  const win = options.win ?? window;

  const currentRoute = (): Route => safe(() => parseRoute(win.location, doc), { kind: 'other' });

  const isPostCard = (el: Element): boolean =>
    safe(() => el.matches(CARD.root) && postIdOf(el) !== null, false);

  const findFeedContainer = (): Element | null => {
    for (const selector of FEED.containers) {
      const found = doc.querySelector(selector);
      if (found) return found;
    }
    return null;
  };

  /** The element that directly holds the tabs (where a new tab is appended). */
  const findTabList = (): Element | null => {
    const nav = doc.querySelector(TABS.nav);
    if (!nav) return null;
    for (const selector of TABS.list) {
      const list = nav.querySelector(selector);
      if (list) return list;
    }
    return null;
  };

  return {
    currentRoute,

    onRouteChange(cb): Unsubscribe {
      return safe(
        () => onRouteChange(cb, options),
        () => undefined,
      );
    },

    findFeedContainer: () => safe(findFeedContainer, null),

    findTabBar: () => safe(findTabList, null),

    findPostCards(root) {
      return safe(() => {
        const cards = [...root.querySelectorAll(CARD.root)].filter(isPostCard);
        if (root instanceof Element && isPostCard(root)) cards.unshift(root);
        return cards;
      }, []);
    },

    isPostCard,

    getPostId: (card) => safe(() => postIdOf(card), null),

    /** After the Bookmark button; without one (logged out), at the end of the save area. */
    findActionAnchor(card) {
      return safe(() => {
        const bookmark = card.querySelector(CARD.bookmarkButton);
        if (bookmark?.parentElement) return { parent: bookmark.parentElement, after: bookmark };
        const row = card.querySelector(CARD.save) ?? card.querySelector(CARD.actionRow);
        return row ? { parent: row, after: row.lastElementChild } : null;
      }, null);
    },

    parseCard(card): MyDevRecordInput | null {
      return safe(() => {
        const route = currentRoute();
        const feed: SourceFeed =
          route.kind === 'home' && route.feed !== 'mydev' ? route.feed : 'unknown';
        return parseCard(card, feed);
      }, null);
    },

    findTabs() {
      return safe(() => {
        const list = findTabList();
        return list ? [...list.querySelectorAll<HTMLElement>(TABS.tab)] : [];
      }, []);
    },

    isTabCurrent: (tab) =>
      safe(
        () =>
          tab.classList.contains(TABS.currentClass) || tab.getAttribute(ARIA_CURRENT) === 'page',
        false,
      ),

    setTabCurrent(tab, current) {
      safe(() => {
        tab.classList.toggle(TABS.currentClass, current);
        if (current) tab.setAttribute(ARIA_CURRENT, 'page');
        else tab.removeAttribute(ARIA_CURRENT);
      }, undefined);
    },

    createTab(label, href) {
      return safe(() => {
        const template = [...(findTabList()?.querySelectorAll<HTMLElement>(TABS.tab) ?? [])].pop();
        if (!template) return null;
        const wrapper = template.parentElement;
        const item = (wrapper?.tagName === 'LI' ? wrapper : template).cloneNode(
          true,
        ) as HTMLElement;
        const link = item.matches(TABS.tab) ? item : item.querySelector<HTMLElement>(TABS.tab);
        if (!link) return null;

        for (const el of [item, ...item.querySelectorAll('*')]) el.removeAttribute('id');
        item.querySelectorAll('svg, img, script, style').forEach((node) => node.remove());
        link.removeAttribute(TABS.feedAttr);
        link.classList.remove(TABS.currentClass);
        link.removeAttribute(ARIA_CURRENT);
        if (link.hasAttribute('data-text')) link.setAttribute('data-text', label);
        link.setAttribute('href', href);

        // Every visible text run becomes the label (dev.to repeats the label to reserve width).
        const walker = doc.createTreeWalker(link, NodeFilter.SHOW_TEXT);
        const runs: Text[] = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if ((node.textContent ?? '').trim()) runs.push(node as Text);
        }
        if (runs.length === 0) link.textContent = label;
        for (const run of runs) run.textContent = label;
        return { item, link };
      }, null);
    },

    findFeedRegion() {
      return safe(() => {
        const container = findFeedContainer();
        if (!container?.parentElement) return null;
        const nav = doc.querySelector(TABS.nav);
        // The logged-out container is the whole main column and holds the tab bar: keep that part.
        const hide =
          nav && container.contains(nav)
            ? [...container.children].filter((child) => !child.contains(nav))
            : [container];
        if (hide.length === 0) return null;
        const first = hide[0] as Element;
        return {
          hide,
          mount: { parent: first.parentElement as Element, before: first },
        };
      }, null);
    },

    hideCard: (card) => safe(() => card.setAttribute(MARKER.hidden, ''), undefined),
    unhideCard: (card) => safe(() => card.removeAttribute(MARKER.hidden), undefined),
  };
}
