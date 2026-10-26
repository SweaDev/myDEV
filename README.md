# myDEV

A browser extension (Chrome and Firefox, Manifest V3) that adds a personal **myDEV** feed to the
[dev.to](https://dev.to) home page.

- Every post card in the home feeds gets a ✓ button next to the Bookmark button.
- Check it and the post disappears from the feed and is saved to **myDEV**, a new tab after the
  native feed tabs (also reachable at `https://dev.to/#mydev`).
- Posts that are in myDEV stay out of the feeds on every later load, including infinite scroll.
- Uncheck a post in myDEV to remove it from the list; it can show up in the feeds again.
- Everything is stored locally in the browser (`chrome.storage.local`). Nothing is sent anywhere.

The extension asks for one permission, `storage`, and only runs on `https://dev.to/*`.
The full design is in [`spec/SPEC-01.md`](spec/SPEC-01.md); the build plan is
[`spec/PLAN-01.md`](spec/PLAN-01.md); the security review is
[`spec/SECURITY-REVIEW-01.md`](spec/SECURITY-REVIEW-01.md).

## Prerequisites

- **Node.js 22 LTS** (`.nvmrc` says `22`).
- **pnpm**, via Corepack, which ships with Node:

  ```sh
  corepack enable
  ```

  `package.json` pins the exact pnpm version, so Corepack uses it automatically.

## Build

```sh
pnpm install
pnpm build            # both browsers  → dist/chrome and dist/firefox
pnpm build:chrome     # one browser
pnpm build:firefox
pnpm dev              # rebuild the scripts on change (manifests, CSS and icons are copied once)
```

`pnpm build` also checks the built manifests against the approved permission set and fails if they
ask for anything more.

## Load the extension

**Chrome / Edge / Brave**

1. Open `chrome://extensions` and turn on _Developer mode_.
2. Choose _Load unpacked_ and select the `dist/chrome` folder.

**Firefox** (142 or newer)

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose _Load Temporary Add-on…_ and select `dist/firefox/manifest.json`.

Then open <https://dev.to>. After a rebuild, use the reload button on the extension's card and refresh
the dev.to tab.

## Scripts

| Command                             | What it does                                         |
| ----------------------------------- | ---------------------------------------------------- |
| `pnpm test` / `pnpm test:watch`     | Unit and DOM tests (Vitest + jsdom)                  |
| `pnpm typecheck`                    | `tsc --noEmit`                                       |
| `pnpm lint`                         | ESLint, including the bans on HTML sinks and `eval`  |
| `pnpm format` / `pnpm format:check` | Prettier                                             |
| `pnpm lint:firefox`                 | `web-ext lint` on `dist/firefox`                     |
| `pnpm zip`                          | `dist/mydev-chrome.zip` and `dist/mydev-firefox.zip` |
| `pnpm audit:prod`                   | Audit of runtime dependencies (there are none)       |

## Project structure

```
manifests/            base.json + per-browser overrides, merged at build time
scripts/              build, manifest merge, manifest permission check
public/icons/         extension icons
src/
  core/               types, messages, validators, URL guard, safe DOM builder, logger
  storage/            MyDevStore interface, chrome.storage.local implementation, migrations
  background/         the only writer of storage; message router
  content/            bootstrap, feature host, content-side store client
  site/devto/         everything that knows dev.to's markup: selectors, routes, card parser, adapter
  features/           feature modules and the registry (features/index.ts)
    mydev/            F-01: feed filter, tick buttons, myDEV tab and view
tests/
  unit/               tests, one file per module
  fixtures/devto/     saved dev.to HTML (cards, tab bars) the tests run against
  helpers/            chrome.* mock, fake store, fixture loaders
spec/                 SPEC, PLAN, TASKS and the security review
```

How it fits together: the **content script** (isolated world) finds cards and tabs through the
**site adapter** and shows the UI; it never writes storage. Every change goes to the **background** as
a validated message, and the background writes through the `MyDevStore` interface. A future sync
implementation sits behind that same interface.

If dev.to changes its markup, the fix belongs in `src/site/devto/selectors.ts` and the fixtures. When
the page no longer matches, the extension does nothing visible and logs one warning.

## Adding a feature

A feature is a self-contained module that plugs into the feature host (SPEC §6.5, §9).

1. Create `src/features/<id>/` and export a `FeatureModule`:

   ```ts
   import type { FeatureModule } from '../../core/types.ts';

   export const myFeature: FeatureModule = {
     id: 'my-feature',
     matches: (route) => route.kind === 'home',
     init(ctx) {
       // ctx.site: dev.to adapter   ctx.store: myDEV store client
       // ctx.log:  scoped logger    ctx.signal: aborted when the feature is disposed
     },
     dispose() {
       // remove every node, listener and observer init created
     },
   };
   ```

2. Register it with one line in `src/features/index.ts`.
3. Keep dev.to selectors out of the feature: add what you need to the site adapter instead.
4. Build UI only through `core/dom.ts` (no HTML strings) and give every node you create a
   `data-mydev…` attribute so cleanup is reliable.
5. If it needs data, use its own storage namespace (`<id>:…`) and message types (`<id>/…`) and add
   them to the validators. All writes go through the background.
6. Features can be switched off with `settings.features.<id>.enabled` in storage.
7. Add tests, including one that shows `dispose()` leaves nothing behind (see
   `tests/unit/mydev-feature.test.ts`).

## Status

This first version targets desktop Chrome and Firefox. Syncing across devices, an options page and a
button on article pages are not part of this version.
