/**
 * Everything the extension knows about dev.to's markup lives in this file (SPEC §6.4).
 *
 * FINDINGS (T-401, checked 2026-10-26)
 * - Two feed layouts exist:
 *   - Logged out: server-rendered. Tabs Relevant (/), Latest (/latest), Top (/top/week …) in a
 *     `ul.crayons-navigation`; the active tab has `aria-current="page"` and the class
 *     `crayons-navigation__item--current`. Cards are plain HTML inside `#main-content`
 *     (featured card first, then `#substories`).
 *   - Logged in: tabs Discover (/discover), Following (/following), Curated (/curated),
 *     Latest (/latest) as `a[data-feed-nav]` inside `.feed-pill-nav`, plus a "⋯" dropdown with Top
 *     and other Latest variants. The active tab has only the class
 *     `crayons-navigation__item--current` (no aria-current). `#homepage-feed` is EMPTY in the page
 *     source: cards are rendered client-side (Preact), so logged-in card markup is NOT captured here.
 *     That is T-402.
 * - Tab clicks are soft navigations (history.pushState + a `forem:feed:refresh` event), so route
 *   changes must be detected, not assumed to reload the page.
 * - Post card: `.crayons-story[data-feed-content-id="<digits>"]`; the first one on a page also has
 *   `.crayons-story--featured`. The ID in `data-feed-content-id` equals the numeric part of the
 *   title link id (`article-link-<id>`).
 * - Logged-out cards have NO Bookmark button: `.crayons-story__save` holds only "N min read".
 * - Every one of the 90 logged-out cards sampled had a cover (`data-preload-image` on the title
 *   link), so a card without a cover is not captured; coverImageUrl stays nullable.
 * - Post images are served from media2.dev.to (see IMAGE_HOSTS in core/url-guard.ts).
 * - Billboards/ads are injected by JavaScript and are absent from the static HTML. Treat anything
 *   that is not a `.crayons-story` with a numeric `data-feed-content-id` as "not a post".
 */
import type { FeedKind } from '../../core/types.ts';

export const CARD = {
  /** A post card. Anything else in the feed is ignored. */
  root: '.crayons-story[data-feed-content-id]',
  idAttr: 'data-feed-content-id',
  idPattern: /^\d{1,20}$/,
  featuredClass: 'crayons-story--featured',

  /** Title link: href is the absolute post URL; `data-preload-image` is the cover image. */
  titleLink: 'h2.crayons-story__title a',
  coverAttr: 'data-preload-image',
  /** Featured cards also show the cover as an <img>. */
  coverImage: '.crayons-article__cover img',

  authorPic: '.crayons-story__author-pic',
  /** Avatar link: href is `/<username>`. */
  authorLink: '.crayons-story__author-pic a[href^="/"]',
  authorAvatar: '.crayons-story__author-pic img',
  /** Visible author name (the profile-preview button repeats it with extra icons). */
  authorName: '.crayons-story__secondary',

  /** `a.crayons-tag` with href `/t/<tag>`. */
  tag: '.crayons-story__tags a.crayons-tag',
  tagHrefPrefix: '/t/',

  time: 'time[datetime]',

  /** `<small>` inside the save area reads "6 min read". */
  save: '.crayons-story__save',
  readingTime: '.crayons-story__save small',
  readingTimePattern: /(\d+)\s*min read/i,

  /** Row holding reactions and comments, and the save area (read time, and Bookmark when logged in). */
  actionRow: '.crayons-story__bottom',
  /** The Bookmark button. Not present logged out; logged-in selector to be confirmed in T-402. */
  bookmarkButton: 'button[id^="article-save-button-"], button.bookmark-button',
} as const;

export const FEED = {
  /** Logged-in Preact mount point, then the logged-out main column. First match wins. */
  containers: ['#homepage-feed', '#main-content'],
  /** Main content root watched for client-side navigation. */
  contentRoot: '#main-content',
} as const;

export const TABS = {
  nav: 'nav[aria-label="View posts by"]',
  /** Direct parent of the tab `<li>` elements, per layout. First match inside `nav` wins. */
  list: ['.feed-pill-nav', 'ul.crayons-navigation'],
  tab: 'a.crayons-navigation__item',
  /** Present on logged-in tabs only: `discover | following | curated | latest`. */
  feedAttr: 'data-feed-nav',
  currentClass: 'crayons-navigation__item--current',
} as const;

export const SESSION = {
  /** `<body data-user-status="logged-in">` */
  bodyAttr: 'data-user-status',
  loggedIn: 'logged-in',
} as const;

/** How the feed is chosen for a path. `root` means `/`, which depends on the login state. */
export type RouteFeed = FeedKind | 'root';

export interface RouteRule {
  path: RegExp;
  feed: RouteFeed;
}

/**
 * URL path → feed. First match wins. `/` is Relevant when logged out and Discover when logged in.
 * The active tab, when it can be read, takes precedence over the URL (a logged-out `/following` is
 * served the logged-out page).
 */
export const ROUTE_TABLE: readonly RouteRule[] = [
  { path: /^\/?$/, feed: 'root' },
  { path: /^\/discover\/?$/, feed: 'discover' },
  { path: /^\/following(\/latest)?\/?$/, feed: 'following' },
  { path: /^\/curated\/?$/, feed: 'curated' },
  { path: /^\/latest(_less_filtered)?\/?$/, feed: 'latest' },
  { path: /^\/top\/(week|month|year|infinity)\/?$/, feed: 'top' },
];

/** Feed shown at `/` per login state. */
export const ROOT_FEED = { loggedIn: 'discover', loggedOut: 'relevant' } as const satisfies Record<
  string,
  FeedKind
>;

/** The hash that opens the myDEV view. */
export const MYDEV_HASH = '#mydev';
