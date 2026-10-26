/** URL / active-tab → `Route`, and route-change detection (SPEC §6.4, §8.4, FR-8). */
import type { FeedKind, Route, Unsubscribe } from '../../core/types.ts';
import { FEED, MYDEV_HASH, ROOT_FEED, ROUTE_TABLE, SESSION, TABS } from './selectors.ts';

export interface LocationLike {
  pathname: string;
  hash: string;
}

const FEED_KINDS: readonly string[] = [
  'relevant',
  'latest',
  'top',
  'discover',
  'following',
  'curated',
] satisfies FeedKind[];

const isFeedKind = (value: string | null | undefined): value is FeedKind =>
  typeof value === 'string' && FEED_KINDS.includes(value);

export function isLoggedIn(doc: Document): boolean {
  return doc.body?.getAttribute(SESSION.bodyAttr) === SESSION.loggedIn;
}

/** The feed a path belongs to according to the route table, or null if it is not a home feed. */
export function feedForPath(pathname: string, loggedIn: boolean): FeedKind | null {
  for (const rule of ROUTE_TABLE) {
    if (!rule.path.test(pathname)) continue;
    if (rule.feed !== 'root') return rule.feed;
    return loggedIn ? ROOT_FEED.loggedIn : ROOT_FEED.loggedOut;
  }
  return null;
}

/** The feed of the highlighted tab, if the tab bar is present and the highlighted tab is a feed. */
export function activeTabFeed(doc: Document): FeedKind | null {
  const nav = doc.querySelector(TABS.nav);
  if (!nav) return null;
  const loggedIn = isLoggedIn(doc);

  for (const listSelector of TABS.list) {
    const list = nav.querySelector(listSelector);
    if (!list) continue;
    const current = [...list.querySelectorAll(TABS.tab)].find(
      (tab) =>
        tab.classList.contains(TABS.currentClass) || tab.getAttribute('aria-current') === 'page',
    );
    if (!current) return null;
    const declared = current.getAttribute(TABS.feedAttr);
    if (declared !== null) return isFeedKind(declared) ? declared : null;
    const href = current.getAttribute('href');
    return href ? feedForPath(href.split(/[?#]/)[0] ?? '', loggedIn) : null;
  }
  return null;
}

/**
 * The route for a location. The highlighted tab wins over the URL (a logged-out `/following` is
 * served the logged-out page); the URL is the fallback. `#mydev` on a home-feed path selects the
 * myDEV view.
 */
export function parseRoute(loc: LocationLike, doc: Document): Route {
  const fromUrl = feedForPath(loc.pathname, isLoggedIn(doc));
  if (fromUrl === null) return { kind: 'other' };
  if (loc.hash === MYDEV_HASH) return { kind: 'home', feed: 'mydev' };
  return { kind: 'home', feed: activeTabFeed(doc) ?? fromUrl };
}

export const routeKey = (route: Route): string =>
  route.kind === 'home' ? `home:${route.feed}` : 'other';

export const routesEqual = (a: Route, b: Route): boolean => routeKey(a) === routeKey(b);

export interface RouteWatchOptions {
  doc?: Document;
  win?: Window & typeof globalThis;
}

/**
 * Calls `cb` whenever the route changes. dev.to switches feeds with `history.pushState`, which fires
 * no event, so besides `popstate` / `hashchange` a MutationObserver on the main content root
 * (class changes on the tabs, swapped content) re-checks the route. Calls are de-duplicated on the
 * route, so repeated events and unrelated mutations are free.
 */
export function onRouteChange(
  cb: (route: Route) => void,
  options: RouteWatchOptions = {},
): Unsubscribe {
  const doc = options.doc ?? document;
  const win = options.win ?? window;

  let last = parseRoute(win.location, doc);
  let scheduled = false;
  let stopped = false;

  const check = () => {
    scheduled = false;
    if (stopped) return;
    const next = parseRoute(win.location, doc);
    if (routesEqual(next, last)) return;
    last = next;
    cb(next);
  };
  const schedule = () => {
    if (scheduled || stopped) return;
    scheduled = true;
    queueMicrotask(check);
  };

  win.addEventListener('popstate', schedule);
  win.addEventListener('hashchange', schedule);

  const observer = new win.MutationObserver(() => {
    observeRoot();
    schedule();
  });
  let observedRoot: Element | null = null;
  let attached = false;
  const observeRoot = () => {
    const root = doc.querySelector(FEED.contentRoot);
    if (attached && root === observedRoot) return;
    attached = true;
    observer.disconnect();
    observedRoot = root;
    if (root) {
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'aria-current'],
      });
    }
    // Watch the body's direct children so a replaced content root is picked up again.
    if (doc.body) observer.observe(doc.body, { childList: true });
  };
  observeRoot();

  return () => {
    stopped = true;
    win.removeEventListener('popstate', schedule);
    win.removeEventListener('hashchange', schedule);
    observer.disconnect();
  };
}
