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

  return {
    currentRoute,

    onRouteChange(cb): Unsubscribe {
      return safe(
        () => onRouteChange(cb, options),
        () => undefined,
      );
    },

    findFeedContainer() {
      return safe(() => {
        for (const selector of FEED.containers) {
          const found = doc.querySelector(selector);
          if (found) return found;
        }
        return null;
      }, null);
    },

    /** The element that directly holds the tabs, where a new tab is appended. */
    findTabBar() {
      return safe(() => {
        const nav = doc.querySelector(TABS.nav);
        if (!nav) return null;
        for (const selector of TABS.list) {
          const list = nav.querySelector(selector);
          if (list) return list;
        }
        return null;
      }, null);
    },

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

    hideCard: (card) => safe(() => card.setAttribute(MARKER.hidden, ''), undefined),
    unhideCard: (card) => safe(() => card.removeAttribute(MARKER.hidden), undefined),
  };
}
