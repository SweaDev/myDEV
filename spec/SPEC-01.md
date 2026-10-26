# SPEC-01 — "myDEV" Feed for dev.to

| Field        | Value                                  |
| ------------ | -------------------------------------- |
| Spec ID      | SPEC-01                                |
| Feature ID   | F-01 `mydev`                           |
| Status       | Draft                                  |
| Targets      | Chrome (and Chromium), Firefox — MV3   |
| Stack        | TypeScript, Vite, Vitest, pnpm         |
| Companion    | [PLAN-01.md](./PLAN-01.md)             |

---

## 1. Overview

**myDEV** is a browser extension that changes the dev.to home page for anyone who installs it. The first feature, F-01, adds a home-feed tab called **myDEV** after the native feed tabs.

Each post card in the native feeds gets a tick button right after the Bookmark button. The tick starts unchecked. When the user checks it, the post:

1. is removed from the current feed straight away,
2. is saved locally as a *myDEV record*,
3. appears in the **myDEV** feed, and
4. is hidden from all native feeds every time they load in the future.

This is the first of several planned features. The architecture in §6 is built so later features, a settings UI, and server-side sync can be added **without redesigning** what this spec puts in place.

### 1.1 Goals

- G1: Let a user take any post out of the native feeds and keep it in a personal "myDEV" list.
- G2: Keep posts that are already in myDEV out of the native feeds. This must work across reloads, infinite scroll, client-side navigation and multiple tabs.
- G3: Store data locally only, with a data model ready for sync.
- G4: Build a modular, minimal-permission, secure-by-default extension base for future features.

### 1.2 Non-goals for this spec

- Syncing to a server or across devices.
- An options or settings page.
- A tick button on article (post detail) pages, user profiles, search results, tag pages, or anywhere other than the home feeds.
- Import or export of myDEV data.
- Search, sort, or filter inside the myDEV feed. It has a single fixed order (§3, FR-5).
- Mobile browsers.

---

## 2. Glossary

| Term             | Meaning                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| Native feed      | A dev.to home feed tab. dev.to shows different tabs depending on the layout: Relevant, Latest, Top (verified logged out) or Discover, Following, Curated, Latest. See §6.4. |
| myDEV feed        | The feed this extension adds. It lists the user's myDEV records.                                          |
| Post card        | The DOM element dev.to renders for one post in a feed list, including the large "featured" first card.   |
| Post ID          | dev.to's numeric article ID, read from the post card markup. It is the primary key.                      |
| myDEV record      | The locally stored snapshot of a checked post (§5).                                                      |
| Tick button      | The toggle button this extension adds to each post card.                                                 |
| Site adapter     | The module that holds *all* knowledge of dev.to's DOM and routes (§6.4).                                 |
| Feature module   | A self-contained unit of extension behavior that plugs into the feature host (§6.5).                     |

---

## 3. Functional Requirements

| ID    | Requirement |
| ----- | ----------- |
| FR-1  | **myDEV tab.** On the dev.to home page, the extension adds a tab labelled **myDEV** to the feed tab bar, after the last native tab. It looks and behaves like the native tabs (active state, hover, focus). It appears whether the user is logged in or not. The set of native tabs varies by layout and login state; the myDEV tab always goes after whichever tabs are present. |
| FR-2  | **Tick button.** Every post card in a native feed gets a tick button placed right after the card's Bookmark button. If a card has no Bookmark button (for example, logged out), the tick button goes at the end of the card's action row. Ads, billboards, sponsor blocks, onboarding widgets and any non-post card are skipped. Each card gets at most one tick button, even if it is processed more than once. |
| FR-3  | **Check → move to myDEV.** When the user activates an unchecked tick button: (a) the card is parsed into a myDEV record (§5); (b) the record is saved; (c) after the save succeeds, the card is hidden from the current feed. If parsing or saving fails, the card stays visible, the button stays unchecked, and a short, non-blocking error message appears near the button. |
| FR-4  | **Filter native feeds.** Whenever a native feed renders post cards (first page load, switching tabs, infinite-scroll pages, in-app navigation back to home), any card whose post ID matches an *active* myDEV record (one with `deletedAt === null`) is hidden. The user must not see a flash of the hidden card (§8.2). |
| FR-5  | **myDEV feed view.** Selecting the myDEV tab replaces the native feed list with the myDEV list, and the myDEV tab becomes the active tab. The list shows active myDEV records sorted by `addedAt`, newest first. Each item is a card built only from the stored snapshot (title, link, author name and avatar, tags, cover image when present, reading time, publish date). It needs no network request to dev.to beyond loading images. When the list is empty, an empty state explains how to add posts. |
| FR-6  | **Uncheck → remove from myDEV.** Every card in the myDEV view shows a *checked* tick button. Activating it soft-deletes the record (§5.3) and removes the card from the myDEV view straight away. The post is eligible to appear in native feeds again the next time they load. Feeds already on screen do not need to re-insert it. |
| FR-7  | **Multi-tab consistency.** A change made in one tab shows up in every other open dev.to tab with no reload. A newly added post disappears from their native feeds, and the myDEV view updates if it is open. |
| FR-8  | **Navigation.** The myDEV view can be deep-linked with the URL hash `#mydev` on the home page. Opening myDEV pushes a history entry, so browser Back returns to the native feed that was showing before. Loading `https://dev.to/#mydev` opens the myDEV view directly. Choosing any native tab leaves the myDEV view and restores the native feed. |
| FR-9  | **Fail-safe.** If the site adapter cannot find the structures it needs (for example, because dev.to changed its markup), the extension does nothing visible on that page. It must never hide native content it cannot positively identify, and must never break dev.to's own behavior. It logs a diagnostic warning to the console (§8.1). |

---

## 4. UX & Accessibility

- **Tick button**
  - It is a native `<button type="button">` with `aria-pressed="false|true"`.
  - Its accessible name is "Add to myDEV" when unchecked and "Remove from myDEV" when checked. The same text appears in `title` as a tooltip.
  - The icon is an inline SVG check mark: an outline when unchecked, filled and in the accent color when checked. The extension bundles the SVG; it is never taken from page data.
  - It is sized and spaced to match dev.to's icon buttons in the card action row, and has a visible focus ring.
  - Keyboard: Tab can reach it, and Enter or Space toggles it, as native buttons do.
  - While a save is in progress, the button shows a busy state (`aria-busy="true"`, disabled) so it can't be clicked twice.
- **myDEV tab.** It matches the native tab element and its active and inactive styling. It sets `aria-current="page"` when active, matching dev.to's convention.
- **Theme.** All extension CSS uses dev.to's existing CSS custom properties, such as `--card-bg`, `--base-*` and `--accent-brand`, with sensible fallbacks. Light, dark and other dev.to themes are then supported automatically.
- **Errors.** Error messages are short, appear inline next to the control, use `role="status"`, and disappear on their own after a few seconds.
- **Empty state (myDEV).** "No posts in myDEV yet. Use the ✓ button on any post in the other feeds to move it here."

---

## 5. Data Model

### 5.1 `MyDevRecord` (schema version 1)

| Field                 | Type                                   | Required | Notes |
| --------------------- | -------------------------------------- | -------- | ----- |
| `postId`              | `string` (decimal digits only)         | yes      | dev.to article ID. Stored as a string to avoid precision issues and to make a stable key. |
| `url`                 | `string`                               | yes      | Absolute `https://dev.to/...` URL. Must pass the URL guard (SEC-4). |
| `title`               | `string` (1–300 chars)                 | yes      | Plain text. |
| `author.name`         | `string` (≤ 120 chars)                 | yes      | Plain text. |
| `author.username`     | `string` (`[A-Za-z0-9_]{1,60}`)        | yes      |  |
| `author.avatarUrl`    | `string \| null`                       | no       | Must pass the URL guard. |
| `tags`                | `string[]` (≤ 10, each `[a-z0-9]{1,40}`) | yes    | May be empty. |
| `coverImageUrl`       | `string \| null`                       | no       | Must pass the URL guard. |
| `readingTimeMinutes`  | `number \| null` (integer 0–600)       | no       |  |
| `publishedAt`         | `string \| null` (ISO-8601)            | no       |  |
| `sourceFeed`          | `"relevant" \| "latest" \| "top" \| "discover" \| "following" \| "curated" \| "unknown"` | yes | The feed the post was checked from. |
| `addedAt`             | `number` (epoch ms)                    | yes      | When the post was first checked. Re-checking after a removal resets it. |
| `updatedAt`           | `number` (epoch ms)                    | yes      | Changes on every write. Used for future sync merges. |
| `deletedAt`           | `number \| null` (epoch ms)            | yes      | `null` means active. A number means soft-deleted. |
| `schemaVersion`       | `1`                                    | yes      |  |

### 5.2 Storage layout (`chrome.storage.local`)

| Key                     | Value |
| ----------------------- | ----- |
| `meta`                  | `{ schemaVersion: 1, installId: string /* random UUID v4, created once on install */ }` |
| `mydev:item:<postId>`    | One `MyDevRecord`. |
| `settings`              | `{ features: { mydev: { enabled: true } } }`. Reserved for feature flags (§6.5). |

- Each record has its own key. That keeps writes small, gives `storage.onChanged` one change per post, and makes later sync diffs at record level simple.
- Every value read from storage goes through schema validation (SEC-5). Records that fail are ignored and logged; they are never rendered.
- The expected size is about 1 KB per record, so the 10 MB `storage.local` quota holds roughly 10,000 posts. `unlimitedStorage` is **not** requested.

### 5.3 Lifecycle

| Operation       | Effect |
| --------------- | ------ |
| Add (check)     | Insert, or revive a soft-deleted record: write a fresh snapshot, set `addedAt = updatedAt = now`, `deletedAt = null`. |
| Remove (uncheck)| Set `deletedAt = updatedAt = now`. Keep the snapshot fields. |
| Read            | Feeds and the myDEV view use only records with `deletedAt === null`. |

Soft-deleted records (tombstones) are kept so a future sync can spread deletions to other devices. A purge policy for tombstones will be defined together with sync. Locally, tombstones are small and cause no user-visible effect.

### 5.4 Migrations

`meta.schemaVersion` records the storage schema version. On startup, the background runs ordered, idempotent migrations `vN → vN+1` before it answers any request. Version 1 is the baseline, so there is no migration yet, only the hook for future ones.

---

## 6. Architecture

### 6.1 Components

```
┌──────────────────────── dev.to tab (isolated world) ────────────────────────┐
│  content/index.ts  (bootstrap @ document_start)                             │
│     ├─ FeatureHost ── registers ──► features/mydev  (FeedFilter, CheckButton,│
│     │                                MyDevTab, MyDevView)                   │
│     ├─ SiteAdapter (site/devto) ── the ONLY module that knows dev.to DOM    │
│     └─ StoreClient ── typed messages ──┐        ▲ storage.onChanged (read)  │
└────────────────────────────────────────┼────────┼───────────────────────────┘
                                         ▼        │
┌──────────────── background (SW on Chrome / event page on Firefox) ──────────┐
│  MessageRouter ── validates sender + payload ──► MyDevStore (interface)      │
│                                                    └─ LocalMyDevStore        │
│                                                         └─ chrome.storage.local
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Responsibilities

| Component          | Responsibility |
| ------------------ | -------------- |
| **Background**     | The only process that **writes** storage. Owns `MyDevStore`, runs migrations, and creates `meta.installId`. Later it will also host the sync engine. It never touches the DOM. |
| **Content script** | Runs only on `https://dev.to/*` in the isolated world. Hosts feature modules and uses the site adapter to read and modify the page. It reads data from the background and listens to `storage.onChanged` for live updates. It writes **only** by sending messages to the background. |
| **StoreClient**    | The content-side proxy with the same read and write methods as `MyDevStore`. It turns calls into typed messages and keeps an in-memory `Set<postId>` of active records for synchronous lookups while filtering feeds. |
| **SiteAdapter**    | Holds every selector, route rule and parsing step for dev.to (§6.4). |
| **FeatureHost**    | Loads the registered feature modules that are enabled for the current route, and isolates their failures from each other (§6.5). |

Having the background as the single writer keeps writes in one place, ordered and validated. When sync is added, it becomes the one spot where local and remote state meet, and content scripts don't change.

### 6.3 Message protocol

Messages use `chrome.runtime.sendMessage`. Each one is a discriminated union with a protocol version:

```ts
type Request =
  | { v: 1; type: "mydev/add";      record: MyDevRecordInput }   // snapshot fields only
  | { v: 1; type: "mydev/remove";   postId: string }
  | { v: 1; type: "mydev/list" }                               // active records
  | { v: 1; type: "mydev/activeIds" };                         // string[] for the filter

type Response<T> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; message: string } };
```

- `MyDevRecordInput` contains only the snapshot fields. The background sets `addedAt`, `updatedAt`, `deletedAt` and `schemaVersion`, so content scripts can't forge timestamps.
- The background rejects any message that fails validation, has an unknown `type` or `v`, or does not come from this extension (SEC-6).
- Unknown message types are an error, never ignored silently.

### 6.4 Site adapter (`site/devto`)

This is the only module allowed to contain dev.to selectors, URL patterns or knowledge of card markup. Its interface:

```ts
interface SiteAdapter {
  currentRoute(): Route;                       // { kind: "home"; feed: FeedKind | "mydev" } | { kind: "other" }
  onRouteChange(cb: (r: Route) => void): Unsubscribe;
  findFeedContainer(): Element | null;
  findTabBar(): Element | null;
  isPostCard(el: Element): boolean;
  getPostId(card: Element): string | null;
  findActionAnchor(card: Element): { parent: Element; after: Element | null } | null; // Bookmark position
  parseCard(card: Element): MyDevRecordInput | null;   // sourceFeed comes from currentRoute()
  hideCard(card: Element): void;               // reversible, attribute-based
}
```

- All selectors live in a single `selectors.ts` constants file, checked against saved HTML fixtures in unit tests.
- **Feed layouts.** dev.to shows different feed tabs depending on layout and login state. The adapter does not assume a fixed list of feeds: a route table in `selectors.ts` maps URL paths to feed kinds (`relevant`, `latest`, `top`, `discover`, `following`, `curated`), and the active feed is taken from the active tab (`aria-current="page"`) with the URL as fallback. The tab bar is found through its markup, and the myDEV tab is cloned from an existing tab, so a layout with different tabs needs only table and fixture changes. Verified logged out: tabs Relevant (`/`), Latest (`/latest`), Top (`/top/*`) in `nav[aria-label="View posts by"]`; post cards carry `data-feed-content-id`. The logged-in layout is to be captured in T-402.
- When something can't be found, the adapter returns `null` and never throws. That is the basis of FR-9.
- If dev.to changes its markup, the fix should be limited to this module and its fixtures.

### 6.5 Feature modules

```ts
interface FeatureModule {
  id: string;                                   // e.g. "mydev"
  matches(route: Route): boolean;
  init(ctx: FeatureContext): void | Promise<void>;
  dispose(): void;                              // remove all DOM, listeners, observers it created
}

interface FeatureContext {
  site: SiteAdapter;
  store: StoreClient;                           // feature-scoped clients may be added later
  log: Logger;                                  // prefixed with feature id
  signal: AbortSignal;                          // aborted on dispose / route change
}
```

- Features are listed in a static registry (`features/index.ts`). A feature runs only if `settings.features[id].enabled` is true (default `true` for `mydev`).
- The host wraps `init` and `dispose` in try/catch, so an error in one feature is logged and disables only that feature.
- On a route change, the host disposes features that no longer match and starts those that now match.
- Features must not depend on each other. Anything they share goes in `core/` or the adapter.
- Every DOM node a feature creates carries a `data-mydev` attribute, which makes cleanup and debugging reliable.

### 6.6 F-01 internal modules

| Module          | Role |
| --------------- | ---- |
| `feed-filter`   | Watches the feed container with a MutationObserver and hides cards whose ID is in the active set. Reacts to set changes (FR-4, FR-7). |
| `check-button`  | Adds the tick button to each eligible card and handles toggling (FR-2, FR-3). |
| `mydev-tab`      | Adds the myDEV tab and manages the `#mydev` hash and history (FR-1, FR-8). |
| `mydev-view`     | Renders the myDEV list and empty state, and handles uncheck (FR-5, FR-6). |

---

## 7. Security Requirements

| ID    | Requirement |
| ----- | ----------- |
| SEC-1 | **Least privilege.** The manifest declares only the `storage` permission. The content script matches only `https://dev.to/*`. No `host_permissions` beyond that, and no `tabs`, `scripting`, `cookies`, `webRequest`, `<all_urls>`, `web_accessible_resources` or `externally_connectable`. |
| SEC-2 | **No remote code.** All code is bundled. No `eval`, `new Function`, or remote `<script>`. The extension CSP is `script-src 'self'; object-src 'self'`. |
| SEC-3 | **Safe DOM construction.** Page-derived or stored strings are never assigned to `innerHTML`, `outerHTML`, `insertAdjacentHTML` or `document.write`. All UI is built through `core/dom.ts` (createElement + `textContent` + an allowlisted attribute setter). Lint rules enforce this (`no-unsanitized`). |
| SEC-4 | **URL guard.** Before any value is used in `href` or `src`, it is parsed with `new URL()` and must be `https:`, with a host on the allowlist: `dev.to` for links, plus dev.to's media and CDN hosts for images, the exact list to be confirmed during implementation. Anything else is dropped. That means the field becomes `null` or the record is rejected if the field is required. External links get `rel="noopener noreferrer"`. |
| SEC-5 | **Validation at every boundary.** Every message (in the background) and every storage read (in both contexts) is checked with hand-written type guards against the §5.1 schema, including length and character limits. Invalid data is discarded and logged, never partly used. |
| SEC-6 | **Sender verification.** The background accepts messages only when `sender.id === chrome.runtime.id` and the sender is one of our content scripts on `https://dev.to/` or one of our own extension pages. |
| SEC-7 | **Isolated world only.** Nothing is injected into the page's main JS world. The extension never reads or calls dev.to's JS globals, and never trusts or dispatches page `postMessage` or custom events. |
| SEC-8 | **No sensitive data.** The extension never reads cookies, auth tokens, form fields, or private user data. It reads only public post metadata visible in feed cards. |
| SEC-9 | **No telemetry.** No data leaves the browser in this version. Logging goes to the local console only. |
| SEC-10| **Dependencies.** Runtime dependencies: none. Dev dependencies are pinned through `pnpm-lock.yaml` (committed), and `pnpm audit` runs in CI or before release. |

---

## 8. Robustness & Performance

### 8.1 Failure handling
- The adapter returns `null` instead of throwing (§6.4), and features check for it and skip.
- Logger output is prefixed `[mydev:<feature>]`. Warnings are rate-limited, so a broken selector doesn't flood the console.
- If the background is unreachable (for example, a Chrome service worker restart), the StoreClient retries once, then shows the FR-3 inline error.

### 8.2 No-flash filtering
- The content script runs at `document_start`. It asks for `mydev/activeIds` right away and injects a stylesheet that:
  - hides `[data-mydev-hidden]` cards with `display: none !important`, and
  - while the ID set is still loading, temporarily hides post cards inside the feed container.
- The temporary rule is removed when the set arrives and existing cards have been processed. As a safety net, it is also removed after **1500 ms**, whatever happens. If the ID set never loads, the feed shows normally, so the extension fails open (FR-9).
- New cards are processed inside the MutationObserver callback, which runs as a microtask before the next paint.

### 8.3 Performance
- There is one MutationObserver, scoped to the feed container (not `document`). It processes only the added nodes and is disconnected on dispose.
- Each card is marked `data-mydev-processed` so it is never processed twice.
- Lookups use an in-memory `Set` (O(1)). Processing 100 newly added cards should take less than 5 ms on a mid-range laptop.

### 8.4 Client-side navigation
dev.to swaps page content without full reloads. The adapter detects route changes using `popstate`, `hashchange`, and a light observer on the main content root, then notifies the FeatureHost (§6.5).

---

## 9. Future-Proofing (design guidance only — not implemented in SPEC-01)

These points explain *why* parts of the design look the way they do. Nothing in this section is built in this phase.

1. **Server sync.**
   - Add a `RemoteMyDevStore` or `SyncEngine` in the background, behind the existing `MyDevStore` interface. Content scripts and features stay as they are.
   - Merge per record with last-write-wins on `updatedAt`. Tombstones (`deletedAt`) carry deletions to other devices.
   - `meta.installId` identifies the device.
   - The server origin is requested at runtime as an `optional_host_permissions` grant, so installs that don't use sync keep minimal permissions.
   - Auth tokens, when introduced, live only in the background, never in content scripts.
2. **More features.**
   - Each new feature is a folder under `src/features/<id>/` that implements `FeatureModule`, plus one line in the registry.
   - Features that need new data get their own storage namespace (`<id>:...`) and message types (`<id>/...`).
3. **Settings UI.** An options page will read and write the `settings` key, starting with per-feature `enabled` flags, through the background. The key exists now so it never needs a migration later.
4. **More surfaces.** Article pages and tag feeds will be supported by extending `Route` and the adapter. Features opt in through `matches(route)`.
5. **Protocol evolution.** The `v` field on messages and `schemaVersion` in storage allow changes that stay compatible with existing data and older content scripts.

---

## 10. Acceptance Criteria

| #     | Criterion | FR |
| ----- | --------- | -- |
| AC-1  | On `https://dev.to/`, a **myDEV** tab appears after the last native tab, both logged in and logged out. | FR-1 |
| AC-2  | Every post card in every native feed shows one unchecked tick button right after Bookmark (or at the end of the action row when there is no Bookmark button). Ads and billboards have none. | FR-2 |
| AC-3  | Checking a post hides it from the current feed straight away, and it appears at the top of myDEV. | FR-3, FR-5 |
| AC-4  | After a reload, the checked post appears in none of the native feeds, including posts that arrive later through infinite scroll. No flash is visible. | FR-4 |
| AC-5  | myDEV renders each saved post from its snapshot with title, link, author, tags, cover (if any), reading time and date. With no records, it shows the empty state. | FR-5 |
| AC-6  | Unchecking in myDEV removes the post from myDEV, and it can appear in native feeds again after a reload. | FR-6 |
| AC-7  | With two dev.to tabs open, checking a post in tab A removes it from tab B's feed, and adds it to tab B's myDEV view if that is open, without a reload. | FR-7 |
| AC-8  | `https://dev.to/#mydev` opens myDEV directly. Back returns to the earlier native feed, and choosing a native tab leaves myDEV. | FR-8 |
| AC-9  | If the selectors are broken on purpose, the extension makes no visible change, dev.to works normally, and a single console warning is logged. | FR-9 |
| AC-10 | The manifest requests only `storage` plus the `https://dev.to/*` content-script match. Lint finds no `innerHTML`-style sinks. A hand-crafted malformed record in storage is ignored. | SEC-1..5 |
| AC-11 | All of the above pass in current stable Chrome and Firefox. | — |
