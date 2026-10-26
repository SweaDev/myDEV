/** Shared types for the myDEV extension. See spec/SPEC-01.md §5.1 and §6.3–6.5. */

/**
 * Native dev.to home feeds. Which of them exist depends on layout and login state: `relevant`,
 * `latest`, `top` (seen logged out) and `discover`, `following`, `curated` (logged-in layout).
 */
export type FeedKind = 'relevant' | 'latest' | 'top' | 'discover' | 'following' | 'curated';

export type SourceFeed = FeedKind | 'unknown';

/** `feed: 'mydev'` means the home page is showing the myDEV view (`#mydev`). */
export type Route = { kind: 'home'; feed: FeedKind | 'mydev' } | { kind: 'other' };

export type Unsubscribe = () => void;

export const SCHEMA_VERSION = 1 as const;

export interface MyDevAuthor {
  name: string;
  username: string;
  avatarUrl: string | null;
}

/** Snapshot fields captured from a post card. Timestamps are set by the store only. */
export interface MyDevRecordInput {
  postId: string;
  url: string;
  title: string;
  author: MyDevAuthor;
  tags: string[];
  coverImageUrl: string | null;
  readingTimeMinutes: number | null;
  publishedAt: string | null;
  sourceFeed: SourceFeed;
}

export interface MyDevRecord extends MyDevRecordInput {
  addedAt: number;
  updatedAt: number;
  /** `null` means active; a number means soft-deleted. */
  deletedAt: number | null;
  schemaVersion: typeof SCHEMA_VERSION;
}

export interface Meta {
  schemaVersion: number;
  installId: string;
}

export interface FeatureSettings {
  enabled: boolean;
}

export interface Settings {
  features: Record<string, FeatureSettings>;
}

export type ErrorCode =
  | 'invalid-request'
  | 'unknown-type'
  | 'unsupported-version'
  | 'forbidden-sender'
  | 'storage-error'
  | 'quota-exceeded'
  | 'unavailable'
  | 'internal';

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  /** Logs a warning at most once per `key`. */
  warnOnce(key: string, ...args: unknown[]): void;
}

/** Everything that knows about dev.to's DOM and routes sits behind this interface (SPEC §6.4). */
export interface SiteAdapter {
  currentRoute(): Route;
  onRouteChange(cb: (route: Route) => void): Unsubscribe;
  findFeedContainer(): Element | null;
  findTabBar(): Element | null;
  isPostCard(el: Element): boolean;
  getPostId(card: Element): string | null;
  /** Where the tick button goes: right after Bookmark, or the end of the action row. */
  findActionAnchor(card: Element): { parent: Element; after: Element | null } | null;
  parseCard(card: Element): MyDevRecordInput | null;
  /** Reversible, attribute-based. */
  hideCard(card: Element): void;
  unhideCard(card: Element): void;
}

export interface StoreChange {
  added: string[];
  removed: string[];
}

/** Content-side proxy for the background store (SPEC §6.2). */
export interface StoreClient {
  /** Resolves once the active-ID set has loaded. */
  readonly ready: Promise<void>;
  has(postId: string): boolean;
  add(record: MyDevRecordInput): Promise<void>;
  remove(postId: string): Promise<void>;
  list(): Promise<MyDevRecord[]>;
  onChange(cb: (change: StoreChange) => void): Unsubscribe;
}

export interface FeatureContext {
  site: SiteAdapter;
  store: StoreClient;
  log: Logger;
  /** Aborted on dispose and on route change. */
  signal: AbortSignal;
}

export interface FeatureModule {
  id: string;
  matches(route: Route): boolean;
  init(ctx: FeatureContext): void | Promise<void>;
  /** Remove all DOM, listeners and observers the feature created. */
  dispose(): void;
}

/** Content script → background requests (SPEC §6.3). */
export type Request =
  | { v: 1; type: 'mydev/add'; record: MyDevRecordInput }
  | { v: 1; type: 'mydev/remove'; postId: string }
  | { v: 1; type: 'mydev/list' }
  | { v: 1; type: 'mydev/activeIds' };

export type Response<T> =
  { ok: true; data: T } | { ok: false; error: { code: ErrorCode; message: string } };
