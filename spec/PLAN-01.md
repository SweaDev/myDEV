# PLAN-01 — Implementation Plan for SPEC-01 ("myDEV" Feed)

| Field     | Value                            |
| --------- | -------------------------------- |
| Plan ID   | PLAN-01                          |
| Implements| [SPEC-01.md](./SPEC-01.md)       |
| Status    | Draft                            |
| Tasks     | [TASKS-01.md](./TASKS-01.md)     |

This plan covers **only** what SPEC-01 requires. Sync, an options page and other features are out of scope. The structure below simply leaves room for them, as described in SPEC-01 §9.

---

## 1. Project Layout

```
dev-seen/
├─ manifests/
│  ├─ base.json            # shared MV3 manifest fields
│  ├─ chrome.json          # background.service_worker
│  └─ firefox.json         # background.scripts, browser_specific_settings.gecko
├─ scripts/
│  └─ build.ts             # runs Vite per entry, merges manifests, copies assets
├─ src/
│  ├─ core/
│  │  ├─ types.ts          # MyDevRecord, MyDevRecordInput, Route, FeedKind, ErrorCode
│  │  ├─ messages.ts       # Request/Response unions + send helper
│  │  ├─ validate.ts       # hand-written type guards (records, messages, settings)
│  │  ├─ url-guard.ts      # https + host allowlist (links vs. images)
│  │  ├─ dom.ts            # safe element builder (no HTML string sinks)
│  │  └─ logger.ts         # prefixed, rate-limited console logger
│  ├─ storage/
│  │  ├─ mydev-store.ts     # MyDevStore interface
│  │  ├─ local-mydev-store.ts
│  │  ├─ schema.ts         # keys, schemaVersion, defaults
│  │  └─ migrations.ts     # ordered migration runner (v1 baseline)
│  ├─ background/
│  │  └─ index.ts          # init meta + migrations, MessageRouter
│  ├─ content/
│  │  ├─ index.ts          # bootstrap @ document_start
│  │  ├─ feature-host.ts   # lifecycle, error isolation, route switching
│  │  └─ store-client.ts   # message proxy + live active-ID Set
│  ├─ site/devto/
│  │  ├─ selectors.ts      # ALL dev.to selectors / constants
│  │  ├─ routes.ts         # URL → Route, route-change detection
│  │  ├─ parse-card.ts     # card Element → MyDevRecordInput | null
│  │  └─ adapter.ts        # SiteAdapter implementation
│  └─ features/
│     ├─ index.ts          # static registry
│     └─ mydev/
│        ├─ index.ts       # FeatureModule wiring
│        ├─ feed-filter.ts
│        ├─ check-button.ts
│        ├─ mydev-tab.ts
│        ├─ mydev-view.ts
│        ├─ icons.ts       # bundled SVG built via dom.ts (createElementNS)
│        └─ mydev.css
├─ tests/
│  ├─ fixtures/devto/      # saved, trimmed HTML of feed, cards, tab bar, ads
│  ├─ helpers/chrome-mock.ts
│  └─ unit/…               # mirrors src/
├─ spec/
├─ package.json, tsconfig.json, vite.config.ts, vitest.config.ts
├─ eslint.config.js, .prettierrc
└─ README.md
```

---

## 2. Milestones

Each milestone ends with green `pnpm lint`, `pnpm typecheck` and `pnpm test`.

### M0 — Scaffold

- Package manager: **pnpm**. Set `"packageManager": "pnpm@<current 10.x>"` in `package.json` (Corepack), commit `pnpm-lock.yaml`, and add `engines.node` for the current LTS. Use `pnpm install --frozen-lockfile` in CI.
- `package.json` scripts: `dev` (watch build), `build`, `build:chrome`, `build:firefox`, `lint`, `typecheck`, `test`, `zip`.
- Dev dependencies: `typescript`, `vite`, `vitest`, `jsdom`, `@types/chrome`, `eslint`, `typescript-eslint`, `eslint-plugin-no-unsanitized`, `prettier`, and `web-ext` for Firefox runs and linting. No runtime dependencies (SEC-10).
- `tsconfig`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, target ES2022.
- `scripts/build.ts`:
  - Build `content/index.ts` as a **single IIFE file**, because MV3 content scripts can't be ES modules.
  - Build `background/index.ts` as an ES module for Chrome (`"type": "module"` service worker) and as a classic script for Firefox (`background.scripts`).
  - Copy `mydev.css` and declare it in `content_scripts.css`.
  - Deep-merge `manifests/base.json` with the browser override, writing to `dist/chrome/` and `dist/firefox/`.
- Base manifest:
  - `name: "myDEV"`, `manifest_version: 3`, `permissions: ["storage"]`.
  - `content_scripts`: `matches: ["https://dev.to/*"]`, `run_at: "document_start"`, `js` and `css`.
  - CSP `script-src 'self'; object-src 'self'`. No other permissions (SEC-1, SEC-2).
- Firefox override: `browser_specific_settings.gecko.id` and `strict_min_version`.
- API usage: call the promise-based `chrome.*` API directly; both browsers support it in MV3, so no polyfill. Keep calls behind small wrappers in `core/` so a polyfill could be added later if ever needed.
- ESLint rules:
  - `no-unsanitized/property` and `no-unsanitized/method` set to error.
  - Ban `eval`, `Function`, `innerHTML`, `outerHTML`, `insertAdjacentHTML` and `document.write` with `no-restricted-properties` / `no-restricted-syntax` (SEC-3).

**Done when:** `pnpm build` produces loadable unpacked extensions for both browsers that do nothing yet.

### M1 — Core

- `types.ts`: the types from SPEC-01 §5.1 and §6.3–6.5.
- `validate.ts`:
  - Type guards `isMyDevRecord`, `isMyDevRecordInput`, `isRequest`, `isSettings`, `isMeta`, enforcing every length, regex and range from SPEC §5.1.
  - Strings are trimmed and normalised, and unknown extra fields are stripped.
- `url-guard.ts`:
  - `safeLinkUrl(raw)`: `https:` and host `dev.to` only.
  - `safeImageUrl(raw)`: `https:` and an image-host allowlist (filled in M4 from the real markup).
  - Both return `string | null`.
- `dom.ts`:
  - `el(tag, { attrs, text, children, on })` built on `createElement` and `textContent`.
  - `attrs` keys come from an allowlist (`class`, `id`, `href`, `src`, `alt`, `title`, `role`, `aria-*`, `data-mydev*`, `type`, `datetime`, `loading`, `rel`, `target`).
  - `href` and `src` must go through the URL guard; the builder refuses raw strings for them.
  - SVG helper using `createElementNS`.
- `logger.ts`: a `[mydev:<scope>]` prefix, levels, and a per-key rate limit.
- `messages.ts`: `send<Req>(req): Promise<Response>`, with a typed response per request type and one retry if the receiving end isn't there yet (SPEC §8.1).
- **Tests:** validators accept good data and reject each bad field; the URL guard rejects `javascript:`, `data:`, `http:`, look-alike hosts (`dev.to.evil.com`, `evil.com/dev.to`) and userinfo tricks; `dom.ts` never produces markup from strings.

### M2 — Storage

- `MyDevStore` interface: `listActive()`, `activeIds()`, `get(id)`, `add(input)`, `remove(id)`, `subscribe(cb)`.
- `LocalMyDevStore`:
  - Keys and lifecycle follow SPEC §5.2–5.3. `add` handles both insert and revive.
  - `listActive` reads with `get(null)`, filters by the `mydev:item:` prefix, validates every record, drops invalid ones with a log, and sorts by `addedAt` descending.
  - `subscribe` is built on `storage.onChanged`, filtered to `local` and to `mydev:item:` keys, and passes validated diffs to the callback.
- `schema.ts`: key builders, `CURRENT_SCHEMA_VERSION = 1`, default `settings`.
- `migrations.ts`: `runMigrations(fromVersion)` with an empty v1 list. It creates `meta` with `crypto.randomUUID()` when missing.
- **Tests:** use `helpers/chrome-mock.ts`, an in-memory `chrome.storage.local` with `onChanged`. Cover add, remove, revive, a malformed stored record being ignored, sort order, and timestamps being set only by the store.

### M3 — Background

- `background/index.ts`:
  - On load: `await runMigrations()`, then register `chrome.runtime.onMessage`. Requests that arrive before init finishes wait on an init promise.
  - Router:
    1. Check the sender (SPEC SEC-6): `sender.id === chrome.runtime.id`, and `sender.url` starts with `https://dev.to/` or is an extension URL.
    2. Validate with `isRequest`.
    3. Dispatch to the `MyDevStore` method and return `Response`.
    4. Catch every error and turn it into `{ ok: false }`.
  - Return `true` from the listener to keep async responses working in Chrome.
- **Tests:** the router rejects a foreign sender, an unknown type, a wrong `v` and an invalid payload, and returns the correct responses for valid requests.

### M4 — dev.to Site Adapter

1. **Investigate the live markup first** in both browsers, logged in and logged out. Record in `selectors.ts`, with a comment on each:
   - the feed container and how infinite scroll appends pages,
   - post card root and how to tell it apart from ads, billboards and widgets,
   - where the numeric post ID lives (attribute or element `id` pattern),
   - the Bookmark button and its action row,
   - title link, author name, username and avatar, tags, cover image, reading time, publish `<time>`,
   - the feed tab bar, the active-tab class and `aria-current`, and the URL for each feed (Discover, Following, Curated, Latest),
   - how dev.to performs client-side navigation (affects `routes.ts`),
   - image CDN hosts (fills the URL-guard image allowlist).
2. **Save trimmed HTML fixtures** under `tests/fixtures/devto/`: a feed page, a featured card, a normal card, a card with no cover, a logged-out card, an ad or billboard, and the tab bar for each feed.
3. **Implement:**
   - `routes.ts`: `parseRoute(url)` → `Route`; `onRouteChange` using `popstate`, `hashchange` and an observer on the main content root, de-duplicated.
   - `parse-card.ts`: builds a `MyDevRecordInput` from a card. Every field goes through the validators and URL guard. It returns `null` if a required field is missing.
   - `adapter.ts`: the `SiteAdapter` from SPEC §6.4, returning `null` on any miss and never throwing. `hideCard` sets `data-mydev-hidden`, which is reversible.
- **Tests:** parse each fixture and check the snapshots; ads give `isPostCard === false`; a mutated fixture with selectors removed gives `null` everywhere without throwing; route parsing works for every feed URL plus `#mydev`.

### M5 — F-01 myDEV Feature

Each module gets `ctx` (site, store, log, signal) and cleans up on `signal` abort.

- **`store-client.ts`** (content side):
  - `ready` promise that loads `mydev/activeIds` into a `Set`.
  - Proxies `add`, `remove` and `list` through messages.
  - Updates the `Set` from `storage.onChanged`, validating the records, and emits a `change` event.
- **`content/index.ts` bootstrap (`document_start`):**
  1. Inject the pre-filter style that temporarily hides post cards in the feed container (SPEC §8.2).
  2. Start `store.ready`.
  3. When the DOM is ready, start the FeatureHost.
  4. Remove the pre-filter once the first pass completes, or after 1500 ms, whichever comes first.
- **`feed-filter.ts`:**
  - First pass over existing cards, then one MutationObserver on the feed container watching only added nodes.
  - For each card: skip if it has `data-mydev-processed`; get the ID; hide it if the ID is in the Set; mark it processed.
  - On a store `change` with newly added IDs, hide the matching cards already on screen (FR-7).
  - Only on native-feed routes.
- **`check-button.ts`:**
  - For each processed, visible post card, find the action anchor and insert the button right after Bookmark (FR-2).
  - On click: set busy → `parseCard` → `store.add` → `hideCard` on success, or an inline error and reset on failure (FR-3).
  - Use one delegated click listener on the feed container instead of a listener per button.
- **`mydev-tab.ts`:**
  - Clone the structure and classes of a native tab, without copying any `href` or handlers, and append it to the tab bar (FR-1).
  - Clicking it calls `history.pushState` to `#mydev` and activates the myDEV view. A `hashchange` or `popstate` away from `#mydev` deactivates it.
  - Clicking a native tab clears `#mydev` and lets dev.to handle the click.
  - While myDEV is active, move the active styling and `aria-current` from the native tab to the myDEV tab, and restore them on exit (FR-8).
- **`mydev-view.ts`:**
  - While active, hide the native feed container with an attribute (not removal) and insert a sibling `<section data-mydev="mydev-view">`.
  - Render `store.list()` with `dom.ts`, one card per record, using dev.to's look through its CSS variables. Each card has a checked tick button, and there is an empty state (FR-5).
  - Uncheck → `store.remove` → remove the card, and show the empty state if the list is now empty (FR-6).
  - Re-render on store `change` (FR-7).
  - On exit, remove the section and restore the feed.
- **`mydev.css`:** button, tab and view styles using dev.to CSS variables with fallbacks; focus ring; `[data-mydev-hidden]{display:none!important}`.
- **`icons.ts`:** outline and filled check SVGs built with `createElementNS`.
- **Tests (jsdom + fixtures + chrome mock):**
  - The filter hides known IDs on the first pass and on appended nodes.
  - Each card gets exactly one button and ads get none.
  - A check flow success hides the card; a failure keeps it and shows the error.
  - The myDEV view renders records, sorts them, shows the empty state, and handles uncheck.
  - A cross-tab `onChanged` event hides cards already on screen.
  - Hostile record values (`<img onerror>` in the title, `javascript:` URLs) render as inert text or are dropped.

### M6 — Feature Host & Registry

- `features/index.ts`: `export const features: FeatureModule[] = [myDevFeature]`.
- `feature-host.ts`:
  - Read `settings` through the store client (default: all enabled).
  - On the current route and on each route change, `dispose()` features that no longer match (aborting their `AbortController`) and `init()` those that now match.
  - Every call is wrapped in try/catch with logging, and a failing feature is disabled for this page load (SPEC §6.5).
- **Tests:** a throwing fake feature doesn't stop the others; a route switch disposes and re-inits; a disabled flag skips a feature.

### M7 — Hardening & Release Readiness

- **Security review against SEC-1..10:**
  - diff the built manifests against the expected permission set,
  - run `grep` and lint for HTML sinks,
  - run `web-ext lint` on `dist/firefox`,
  - run `pnpm audit`.
- **Fail-safe check (AC-9):** temporarily break `selectors.ts`, then confirm there's no visible change and a single warning.
- **Performance check (SPEC §8.3):** scroll a feed to 500+ cards with many IDs in myDEV. Profile the observer callback against the < 5 ms per 100 cards target, and confirm there are no long tasks or leaked observers after route changes.
- Write `README.md`: build, load unpacked in Chrome and Firefox, run tests, project structure, and how to add a feature module.
- `pnpm zip` creates `dist/mydev-chrome.zip` and `dist/mydev-firefox.zip`.

---

## 3. Testing Strategy

| Layer        | Tooling                    | Scope |
| ------------ | -------------------------- | ----- |
| Unit         | Vitest                     | validators, URL guard, DOM builder, store, migrations, router, route parsing |
| DOM / feature| Vitest + jsdom + fixtures + `chrome-mock` | adapter parsing, feed filter, check button, myDEV tab/view, feature host |
| Manual E2E   | Chrome + Firefox (unpacked; `web-ext run` for Firefox) | the checklist below |

**Manual E2E checklist** (each item maps to SPEC-01 §10):

1. Install in Chrome and Firefox and open `https://dev.to/` while logged in. The myDEV tab is present (AC-1).
2. In each native feed, every post shows one tick after Bookmark and ads show none (AC-2).
3. Check a post. It disappears, and myDEV shows it at the top (AC-3).
4. Reload, then visit all four feeds and scroll through several infinite-scroll pages. The post never appears and nothing flashes (AC-4).
5. myDEV cards show the snapshot fields. Remove everything and the empty state appears (AC-5).
6. Uncheck in myDEV. After a reload, the post can appear in native feeds again (AC-6).
7. With two tabs open, check in A and watch B update live (AC-7).
8. Open `https://dev.to/#mydev` directly, use Back, and switch to a native tab (AC-8).
9. Break the selectors on purpose: no visible change and one warning (AC-9).
10. Inspect the manifest, run lint, and seed a malformed record through DevTools; it is ignored (AC-10).
11. Repeat 1–8 logged out, and in dev.to's light and dark themes (AC-11).

---

## 4. Risks & Mitigations

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| dev.to changes its markup or class names | Buttons or filtering stop working | All selectors are in `selectors.ts`, guarded by fixture tests. The adapter fails soft (FR-9), so a fix touches one module. |
| dev.to client-side navigation not detected | Features don't re-init after navigation | Combine `popstate`, `hashchange` and a content-root observer, and dedupe on route equality. |
| Cards flash before the ID set loads | Poor UX (FR-4) | Hide only feed cards while loading, starting at `document_start`, with a fail-open 1500 ms timeout (SPEC §8.2). |
| Chrome MV3 service worker is asleep or restarting | First message fails | One retry in `messages.ts`. Requests wait on the background init promise. |
| Firefox MV3 differences (background type, gecko ID, `storage` behavior) | Build or runtime breaks on one browser | Per-browser manifest overrides, `web-ext lint`, and the manual E2E pass on both browsers. |
| Storage quota (10 MB) | Writes fail with very large lists | About 1 KB per record means roughly 10k posts. `add` surfaces a quota error inline (FR-3). |
| Our tab or view collides with dev.to's own handlers | Native tabs misbehave | Clone tab markup without handlers or `href`, hide the native feed instead of removing it, and remove every injected node on dispose. |

---

## 5. Definition of Done

- All milestones M0–M7 are complete, and `lint`, `typecheck` and `test` all pass.
- Every acceptance criterion AC-1 to AC-11 in SPEC-01 §10 has been checked by hand in current stable Chrome and Firefox.
- The built manifests contain only the permissions allowed by SEC-1.
- The README documents build, install, test and how to add a feature module.
