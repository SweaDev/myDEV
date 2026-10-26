# TASKS-01 — Task List for PLAN-01 (myDEV Feed)

| Field     | Value                          |
| --------- | ------------------------------ |
| Tasks ID  | TASKS-01                       |
| Plan      | [PLAN-01.md](./PLAN-01.md)     |
| Spec      | [SPEC-01.md](./SPEC-01.md)     |

---

## How to work this list (auto mode rules for Claude)

1. **Pick** the first unchecked task (`- [ ]`) from the top. Don't skip ahead, except past a 👤 task as described in rule 6.
2. **Read** the referenced SPEC/PLAN sections before writing code. SPEC-01 is the source of truth. If a task conflicts with SPEC-01, follow SPEC-01 and add a note under the task.
3. **Implement** only what the task asks. Keep changes scoped to that task.
4. **Verify.** Run every check listed under *Done when*. From T-003 onward, `pnpm lint`, `pnpm typecheck` and `pnpm test` must all pass before committing.
5. **Tick and commit:**
   - Change the task's `- [ ]` to `- [x]` in this file.
   - Stage the code changes and this file together, and make **one commit per task**.
   - Commit message: `T-XXX: <task title>`, then a short body describing what changed.
   - **Never push.** Never amend or rewrite earlier commits.
6. **👤 tasks need the human:** a logged-in browser, manual testing, or a decision. In auto mode:
   - Leave the box unchecked.
   - Add a line under it: `> Blocked: needs human — <what is needed>`.
   - Commit that note as `T-XXX: blocked (needs human)`.
   - Continue with the next task **only if** it doesn't depend on the blocked one (see *Depends on*). Otherwise stop and report.
7. **Stop and report** instead of guessing when:
   - a check fails and you can't fix it within the task's scope,
   - a requirement is ambiguous, or
   - dev.to markup contradicts the plan.
8. Don't add dependencies beyond those in PLAN-01 M0 without a note explaining why. Never add runtime dependencies (SEC-10).

Legend: 👤 needs the human · *Depends on* lists the tasks that must be done first, if not the previous one.

---

## M0 — Scaffold

- [x] **T-000: Commit spec documents**
  - Commit `spec/SPEC-01.md`, `spec/PLAN-01.md` and `spec/TASKS-01.md` as they stand.
  - Done when: `git log` shows the commit and the working tree is clean.

- [x] **T-001: Initialise the pnpm project**
  - Create `package.json` with `name: "mydev"`, `private: true`, `type: "module"`, `packageManager: "pnpm@<current 10.x>"` and `engines.node` (current LTS).
  - Add `.gitignore` (`node_modules/`, `dist/`, `coverage/`, `*.zip`), `.editorconfig` and `.nvmrc`.
  - Install the dev dependencies from PLAN-01 M0 with `pnpm add -D`, and commit `pnpm-lock.yaml`.
  - Done when: `pnpm install --frozen-lockfile` succeeds.

- [x] **T-002: TypeScript configuration**
  - Add `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, target ES2022, `lib` with DOM, and `types: ["chrome"]`.
  - Add a `typecheck` script (`tsc --noEmit`).
  - Add a placeholder `src/core/types.ts` so the project compiles.
  - Done when: `pnpm typecheck` passes.

- [x] **T-003: Lint, format and test tooling**
  - Add `eslint.config.js` (flat config) with `typescript-eslint` and `eslint-plugin-no-unsanitized` (`property` and `method` set to error).
  - Ban `eval`, `Function`, `innerHTML`, `outerHTML`, `insertAdjacentHTML` and `document.write` with `no-restricted-properties` / `no-restricted-syntax` (SEC-2, SEC-3).
  - Add `.prettierrc` and `vitest.config.ts` (jsdom environment).
  - Add scripts: `lint`, `format`, `test`, `test:watch`.
  - Add one sample test.
  - Done when: lint, typecheck and test all pass, and a scratch file using `el.innerHTML = x` fails lint (delete it before committing).

- [x] **T-004: Manifests**
  - Create `manifests/base.json` per PLAN-01 M0:
    - `name: "myDEV"`, `version`, `description`, `manifest_version: 3`, `permissions: ["storage"]`,
    - `content_scripts` with matches `https://dev.to/*`, `run_at: document_start`, `js` and `css`,
    - CSP `script-src 'self'; object-src 'self'`.
  - Create `manifests/chrome.json` (`background.service_worker`, `type: module`).
  - Create `manifests/firefox.json` (`background.scripts`, `browser_specific_settings.gecko.id`, `strict_min_version`).
  - Add placeholder icons (16/32/48/128) under `public/icons/`.
  - Done when: all three files are valid JSON and contain no permissions beyond SEC-1.

- [x] **T-005: Build script**
  - Write `scripts/build.ts`. It uses the Vite JS API per entry:
    - content as a single IIFE,
    - background as an ES module for Chrome and a classic script for Firefox,
    - deep-merges the manifests, and copies the CSS and icons,
    - writes `dist/chrome/` and `dist/firefox/`.
  - Add placeholder `src/content/index.ts`, `src/background/index.ts` and `src/features/mydev/mydev.css`.
  - Add scripts: `build`, `build:chrome`, `build:firefox`, `dev` (watch).
  - Add a unit test for the manifest merge function.
  - Done when: `pnpm build` produces both dist folders, each with a `manifest.json` that references only files that exist.

- [x] **T-006: Packaging and Firefox lint**
  - Add the `zip` script, which writes `dist/mydev-chrome.zip` and `dist/mydev-firefox.zip`.
  - Add `lint:firefox` (`web-ext lint -s dist/firefox`).
  - Done when: `pnpm build && pnpm zip && pnpm lint:firefox` succeeds with no errors.

- [ ] 👤 **T-007: Smoke-load the empty extension**
  - Load `dist/chrome` unpacked in Chrome and `dist/firefox` through `about:debugging`.
  - Done when: both load without errors on `https://dev.to/`.
  > Blocked: needs human — load `dist/chrome` (Chrome) and `dist/firefox` (about:debugging) and confirm no load errors.

---

## M1 — Core

- [x] **T-101: Core types** (SPEC §5.1, §6.3–6.5)
  - In `src/core/types.ts`, define:
    - `FeedKind`, `Route`, `MyDevRecord`, `MyDevRecordInput`,
    - `Meta`, `Settings`, `ErrorCode`,
    - the `FeatureModule` and `FeatureContext` interfaces,
    - `Unsubscribe`.
  - Done when: typecheck passes.

- [x] **T-102: URL guard** (SEC-4)
  - `src/core/url-guard.ts`: `safeLinkUrl` (https, host exactly `dev.to`) and `safeImageUrl` (https plus an allowlist constant, with a placeholder list until T-401).
  - Tests: accepts valid URLs; rejects `javascript:`, `data:`, `http:`, `dev.to.evil.com`, `evil.com/dev.to`, `https://user@evil.com`, relative URLs, and empty or non-string input.
  - Done when: tests pass.

- [x] **T-103: Validators** (SEC-5)
  - `src/core/validate.ts`: `isMyDevRecordInput`, `isMyDevRecord`, `isRequest`, `isMeta`, `isSettings`.
    - Enforce every rule in SPEC §5.1.
    - Trim strings and strip unknown fields; return a normalised copy or `null`.
    - URL fields go through the URL guard.
  - Tests cover each field's valid and invalid cases.
  - Done when: tests pass.

- [x] **T-104: Safe DOM builder** (SEC-3)
  - `src/core/dom.ts`:
    - `el(tag, opts)` with an allowlisted attribute setter. `href` and `src` accept only values returned by the URL guard; use a branded type.
    - `text` sets `textContent`.
    - `on` attaches listeners.
    - `svg()` helper using `createElementNS`.
  - Tests: hostile strings stay inert text; disallowed attributes (`onclick`, `style`, `srcdoc`) are refused; `href` refuses raw strings.
  - Done when: tests pass.

- [x] **T-105: Logger** (SPEC §8.1)
  - `src/core/logger.ts`: `createLogger(scope)` with the `[mydev:<scope>]` prefix, `debug/info/warn/error`, and `warnOnce(key)`/rate limiting.
  - Done when: tests pass.

- [x] **T-106: Message protocol** (SPEC §6.3)
  - `src/core/messages.ts`:
    - the `Request` / `Response` unions with `v: 1`, and a typed `ResponseFor<R>`,
    - `send(req)` with one retry when the receiving end doesn't exist.
  - Add `tests/helpers/chrome-mock.ts` with `runtime.sendMessage` / `onMessage`, `storage.local` and `onChanged`, all in memory.
  - Done when: tests for `send`, including the retry, pass.

---

## M2 — Storage

- [x] **T-201: Storage schema** (SPEC §5.2)
  - `src/storage/schema.ts`: key builders (`itemKey(postId)`, `ITEM_PREFIX`, `META_KEY`, `SETTINGS_KEY`), `CURRENT_SCHEMA_VERSION = 1`, `DEFAULT_SETTINGS`.
  - Done when: typecheck passes.

- [x] **T-202: Migrations runner** (SPEC §5.4)
  - `src/storage/migrations.ts`: `runMigrations()` creates `meta` (with a `crypto.randomUUID()` `installId`) and default `settings` when they are missing, then applies ordered migrations (empty for v1).
  - Tests: first run creates meta and settings; a second run is a no-op; an existing `installId` is kept.
  - Done when: tests pass.

- [x] **T-203: MyDevStore interface and LocalMyDevStore** (SPEC §5.3)
  - `src/storage/mydev-store.ts`: the interface.
  - `src/storage/local-mydev-store.ts`:
    - `add` handles insert and revive, and is the only place that sets timestamps and `schemaVersion`.
    - `remove` soft-deletes.
    - `get`, `listActive` (validated, sorted by `addedAt` descending), `activeIds`.
    - `subscribe` uses `storage.onChanged` filtered to `local` and the item prefix.
  - Tests: add, remove, revive; malformed stored records are ignored; sort order; subscribe delivers validated changes.
  - Done when: tests pass.

---

## M3 — Background

- [x] **T-301: Background message router** (SPEC §6.3, SEC-6)
  - `src/background/router.ts`:
    1. Check the sender (`sender.id === chrome.runtime.id`, and the URL is `https://dev.to/...` or an extension URL).
    2. Validate with `isRequest`.
    3. Dispatch to `MyDevStore`, catching errors into `{ ok: false }`.
  - Tests: foreign sender, unknown type, wrong `v` and bad payload are all rejected; valid requests return the correct data.
  - Done when: tests pass.

- [x] **T-302: Background entry point**
  - `src/background/index.ts`: create the init promise (`runMigrations`), register `onMessage` (requests wait for init, and the listener returns `true` for async responses), and wire up `LocalMyDevStore`.
  - Done when: `pnpm build` passes, and a test using the chrome mock shows a request sent before init completes still gets a response.

---

## M4 — dev.to Site Adapter

- [x] **T-401: Investigate dev.to markup (logged out) and save fixtures**
  - Fetch the logged-out dev.to home page and feed tabs (WebFetch or curl; the logged-out tabs are Relevant, Latest, Top). Identify:
    - the feed container and how infinite-scroll pages append,
    - post card root and post ID location,
    - the Bookmark button and action row,
    - title, author, avatar, tags, cover, reading time and `<time>`,
    - tab bar markup, active-tab marker, and the URL of each feed (this becomes the route table in `selectors.ts`),
    - ad, billboard and widget markup,
    - image CDN hosts.
  - Write the findings as commented constants in `src/site/devto/selectors.ts`.
  - Fill the `safeImageUrl` allowlist.
  - Save trimmed HTML fixtures under `tests/fixtures/devto/`: feed page, featured card, normal card, card without cover, ad/billboard, and tab bar per feed.
  - Strip any personal data from the fixtures.
  - Done when: `selectors.ts` and the fixtures are committed with a short summary of findings at the top of `selectors.ts`.

- [ ] 👤 **T-402: Capture logged-in markup**
  - Using a logged-in browser, capture the logged-in feed tabs (expected Discover, Following, Curated, Latest) with their URLs, the Bookmark button and logged-in card differences, and add them to the route table and selectors.
  - Save logged-in fixtures (with personal data removed) to `tests/fixtures/devto/logged-in/`.
  - Done when: the human confirms, or provides HTML that Claude turns into fixtures.
  - *Depends on:* T-401. Not required for T-403 to T-405, which use logged-out fixtures and are revisited once this is done.
  > Blocked: needs human — logged-in feed cards are client-rendered, so view-source has none. In DevTools (Elements) on /discover, copy the outerHTML of one `.crayons-story` card (with its Bookmark button), plus the `#homepage-feed` opening tag; ideally also one from /following. Tab bar and routes are already captured from the supplied page source.

- [x] **T-403: Route parsing and change detection** (SPEC §8.4, FR-8)
  - `src/site/devto/routes.ts`:
    - `parseRoute(url)` → `Route` for every feed in the route table, `#mydev`, and other pages,
    - `onRouteChange(cb)` using `popstate`, `hashchange` and a content-root observer, de-duplicated on route equality.
  - Tests: each feed URL in the route table; `#mydev`; non-home pages give `other`; duplicate events produce a single callback.
  - Done when: tests pass.

- [x] **T-404: Card parser** (SPEC §5.1, SEC-4/5)
  - `src/site/devto/parse-card.ts`: `parseCard(card, sourceFeed)` → `MyDevRecordInput | null`, with every field going through the validators.
  - Tests against each fixture with snapshot assertions; a card missing a required field gives `null`; hostile attribute values are dropped.
  - Done when: tests pass.

- [x] **T-405: SiteAdapter implementation** (SPEC §6.4, FR-9)
  - `src/site/devto/adapter.ts` implements the `SiteAdapter` interface: `findFeedContainer`, `findTabBar`, `isPostCard`, `getPostId`, `findActionAnchor`, `parseCard`, `hideCard`/`unhideCard` (attribute-based) and route methods.
  - It never throws, and returns `null` on any miss.
  - Tests: ads give `isPostCard === false`; a fixture with the selectors broken gives `null` everywhere without throwing.
  - Done when: tests pass.

---

## M5 — F-01 myDEV Feature

- [x] **T-501: Content StoreClient** (SPEC §6.2)
  - `src/content/store-client.ts`:
    - a `ready` promise that loads `mydev/activeIds` into a `Set`,
    - a synchronous `has(id)`,
    - `add`, `remove` and `list` via `send`,
    - Set updates from `storage.onChanged` (validated), and `onChange(cb)` that emits added and removed IDs.
  - Tests use the chrome mock.
  - Done when: tests pass.

- [x] **T-502: Bundled icons and base CSS**
  - `src/features/mydev/icons.ts`: outline and filled check SVGs built through `dom.svg`.
  - `mydev.css`:
    - `[data-mydev-hidden]{display:none!important}`,
    - the pre-filter rule, scoped by a root attribute such as `html[data-mydev-prefilter]`,
    - tick button states (default, hover, focus ring, pressed, busy), tab and view styles,
    - all using dev.to CSS variables with fallbacks (SPEC §4).
  - Done when: lint and typecheck pass, and a test confirms the icons render as SVG elements.

- [x] **T-503: Feed filter** (FR-4, FR-7, SPEC §8.2–8.3)
  - `src/features/mydev/feed-filter.ts`:
    - a first pass over existing cards,
    - one MutationObserver on the feed container watching only added nodes,
    - `data-mydev-processed` marking,
    - hiding IDs in the Set, and hiding newly added IDs on `onChange`,
    - disconnecting on `signal` abort.
  - Tests: hides known IDs on the first pass and on appended nodes; doesn't process a card twice; cross-tab change hides cards already on screen; cleanup on abort.
  - Done when: tests pass.

- [x] **T-504: Tick button** (FR-2, FR-3, SPEC §4)
  - `src/features/mydev/check-button.ts`:
    - Insert one button after Bookmark, or at the end of the action row as a fallback, on each visible post card. No button on ads.
    - Use one delegated click handler.
    - Busy state → `parseCard` → `store.add` → `hideCard`. On failure, show an inline `role="status"` error that clears itself and restore the button.
    - `aria-pressed`, labels and title per SPEC §4.
  - Tests: one button per card; no button on ads; success and failure flows; keyboard activation; no duplicate buttons after the card is processed again.
  - Done when: tests pass.

- [x] **T-505: myDEV tab** (FR-1, FR-8)
  - `src/features/mydev/mydev-tab.ts`:
    - Clone the native tab structure without `href` or handlers and append it last.
    - Clicking it calls `pushState('#mydev')` and activates the view.
    - Leaving on `hashchange`/`popstate` or a native tab click clears the hash and deactivates the view.
    - Move and restore the active styling and `aria-current`.
  - Tests: the tab is appended once, logged in and logged out (fixtures); activation and deactivation; Back behavior; deep link `#mydev` on load.
  - Done when: tests pass.

- [x] **T-506: myDEV view** (FR-5, FR-6, FR-7)
  - `src/features/mydev/mydev-view.ts`:
    - Hide the native feed container with an attribute.
    - Insert `<section data-mydev="mydev-view">` and render `store.list()` through `dom.ts`, with the checked tick, the empty state text from SPEC §4, and cover and avatar only when present.
    - Uncheck → `store.remove` → remove the card, showing the empty state if the list is now empty.
    - Re-render on `onChange`, and restore everything on exit.
  - Tests: render order; snapshot fields shown; empty state; uncheck flow; hostile record values render inert; cleanup restores the native feed.
  - Done when: tests pass.

- [x] **T-507: myDEV feature module wiring** (SPEC §6.5–6.6)
  - `src/features/mydev/index.ts` exports `myDevFeature: FeatureModule`:
    - `id: "mydev"`, with `matches` limited to home native-feed routes and `#mydev`,
    - `init` composes the filter, button, tab and view,
    - `dispose` cleans up everything through the `AbortSignal`.
  - Done when: a test shows init then dispose leaves no `[data-mydev]` nodes or observers behind.

---

## M6 — Feature Host & Bootstrap

- [x] **T-601: Feature registry and host** (SPEC §6.5)
  - `src/features/index.ts` holds the registry.
  - `src/content/feature-host.ts`:
    - reads settings (all enabled by default),
    - inits features that match the route and disposes those that stop matching on route change,
    - wraps each call in try/catch so a failing feature is disabled for the page.
  - Tests: a throwing fake feature doesn't affect others; route switch disposes and re-inits; a disabled flag skips the feature.
  - Done when: tests pass.

- [x] **T-602: Content bootstrap** (SPEC §8.2)
  - `src/content/index.ts`:
    1. At `document_start`, set the pre-filter attribute and start `store.ready`.
    2. On DOM ready, create the adapter and FeatureHost.
    3. Remove the pre-filter after the first filter pass or after 1500 ms, whichever is first (fail open).
    4. If the adapter finds nothing, `warnOnce` (FR-9).
  - Tests: the pre-filter is removed on success, on timeout, and when the store fails.
  - Done when: tests pass and `pnpm build` passes.

---

## M7 — Hardening & Release Readiness

- [x] **T-701: Security self-review** (SEC-1..10)
  - Add `scripts/check-manifest.ts` (run in `pnpm build`). It fails if the built manifests contain permissions, host permissions or keys outside the SEC-1 allowlist.
  - Run `pnpm lint`, `pnpm lint:firefox` and `pnpm audit`, and grep `src/` for HTML sinks and `eval`.
  - Record the results in `spec/SECURITY-REVIEW-01.md`.
  - Done when: all checks are clean, or every finding is fixed.

- [x] **T-702: README**
  - Add `README.md` covering:
    - what myDEV does,
    - prerequisites (Node LTS, pnpm via Corepack),
    - `pnpm install`, `build` and `dev`,
    - loading unpacked in Chrome and Firefox,
    - running tests, project structure, and how to add a feature module (SPEC §9.2).
  - Done when: a fresh clone following the README builds successfully.

- [ ] 👤 **T-703: Fail-safe check** (AC-9)
  - Build with `selectors.ts` broken on purpose. Confirm there is no visible change on dev.to and exactly one console warning, then revert.
  - Done when: the human confirms.
  > Blocked: needs human — in `src/site/devto/selectors.ts` break `FEED.containers`, `FEED.contentRoot` and `TABS.nav` (e.g. add `-broken` to each selector), run `pnpm build`, reload the extension, open dev.to and check there is no visible change and exactly one console warning ("feed markup was not recognised"); then revert. Breaking only `CARD.root` is a different case: the tab still appears, but no ticks.

- [ ] 👤 **T-704: Performance check** (SPEC §8.3)
  - Scroll to 500+ cards with many IDs in myDEV. Profile the observer callback (< 5 ms per 100 cards), and check there are no long tasks and no leaked observers after route changes.
  - Done when: the human confirms, or reports issues that become new tasks.
  > Blocked: needs human — needs a real browser with DevTools Performance: scroll a feed to 500+ cards with many IDs saved, profile the observer callback (< 5 ms per 100 cards), check for long tasks and that observers don't accumulate across route changes.

- [ ] 👤 **T-705: Manual end-to-end pass** (AC-1..AC-11)
  - Run the PLAN-01 §3 manual checklist in current stable Chrome and Firefox, logged in and logged out, in light and dark themes.
  - Done when: every acceptance criterion passes, and any failure is logged as a new task below.

- [ ] **T-706: Release build**
  - Bump the version to `0.1.0` in `manifests/base.json` and `package.json`.
  - Run `pnpm build && pnpm zip`.
  - Tick the PLAN-01 §5 Definition of Done items in a short note at the end of this file.
  - Done when: both zips are built, and the note is committed. **Do not push.**
  - *Depends on:* T-701 to T-705.

---

## Follow-up tasks

<!-- Add tasks discovered during implementation here, numbered T-9XX. -->
