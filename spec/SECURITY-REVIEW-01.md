# SECURITY-REVIEW-01 — Self-review against SPEC-01 §7

| Field    | Value                                                          |
| -------- | -------------------------------------------------------------- |
| Reviewed | `main` at T-701 (all of M0–M6 implemented)                     |
| Scope    | Source in `src/`, manifests, built bundles in `dist/`, dev tooling |
| Method   | Automated checks (below) plus reading every module that touches page data or storage |

## Checks run

| Check | Result |
| ----- | ------ |
| `pnpm build` runs `scripts/check-manifest.ts` on both built manifests (the checker is also unit-tested against each kind of violation) | pass |
| `pnpm lint` (`no-unsanitized`, `no-eval`, `no-implied-eval`, `no-new-func`, bans on `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`) | pass, 0 problems |
| `pnpm lint:firefox` (`web-ext lint` on `dist/firefox`) | 0 errors, 0 warnings, 0 notices |
| `grep` of `src/` for HTML sinks, `eval`, `new Function`, string timers | none |
| `grep` of `src/` for `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, cookies, `localStorage`/`sessionStorage`/IndexedDB, `postMessage`, script injection, `world:`, `chrome.scripting` | none |
| `grep` of built `content.js` / `background.js` (Chrome and Firefox) for the same sinks | none |
| `dependencies` in `package.json` | none (no runtime dependencies) |
| `pnpm audit --prod` | no known vulnerabilities |
| `pnpm audit` (all, including dev tooling) | 1 high finding in a dev-only transitive dependency, see *Findings* |

## Requirement by requirement

| ID | Verdict | Evidence |
| -- | ------- | -------- |
| SEC-1 Least privilege | Met | Built manifests allow only the keys in `check-manifest.ts`; `permissions` is exactly `["storage"]`; the one content script matches exactly `https://dev.to/*`, `run_at: document_start`, no `all_frames`, no `world` override; no `host_permissions`, `optional_*`, `web_accessible_resources` or `externally_connectable`. The build fails otherwise (verified by adding `tabs`). |
| SEC-2 No remote code | Met | All code is bundled (no third-party code in the bundles). No `eval`, `new Function` or remote script anywhere. CSP is exactly `script-src 'self'; object-src 'self'` and is enforced by the manifest check. |
| SEC-3 Safe DOM construction | Met | No HTML sink in `src/` or the bundles. All UI goes through `core/dom.ts` (tag allowlist, attribute allowlist, `textContent`, `href`/`src` only from the URL guard). The only direct DOM creation outside `dom.ts` is the pre-filter `<style>`, whose text is a constant generated from `selectors.ts`, and the cloned dev.to tab, whose text nodes are replaced with a constant label and whose SVG/img/script/style children are removed. |
| SEC-4 URL guard | Met | `safeLinkUrl` (https, host exactly `dev.to`, no credentials or port) and `safeImageUrl` (`media2.dev.to`, the S3 origin). Applied when parsing cards, validating records, and again when rendering the myDEV view; `dom.ts` re-checks at run time and refuses anything else. `rel="noopener noreferrer"` is added to every link. Tests cover look-alike hosts, `javascript:`, `data:`, userinfo and ports. The image allowlist comes from markup observed on the live site and should be revisited when T-402 captures logged-in cards. |
| SEC-5 Validation at every boundary | Met | Requests are validated in the background (`parseRequest`); stored records are validated on every read (store, content `list()`, `storage.onChanged` diffs); settings and meta are validated (`isSettings`, `isMeta`). Unknown fields are stripped; invalid data is dropped, never partly used. |
| SEC-6 Sender verification | Met | `isAllowedSender` requires `sender.id === chrome.runtime.id` and a `sender.url` that is a `https://dev.to/` page or one of the extension's own pages; checked before the message is parsed. `sender.url` is set by the browser, not by the page. |
| SEC-7 Isolated world only | Met | The content script runs in the isolated world (enforced by the manifest check) and nothing is injected into the page's JS context. It never reads page globals. It does listen for `popstate`/`hashchange`, which page code could dispatch synthetically; the handlers ignore the event payload and recompute the route from `location` and the DOM, so a forged event can at worst trigger a harmless re-check. |
| SEC-8 No sensitive data | Met | No cookies, tokens, form fields or user data are read. The only page state read is the public `data-user-status` attribute on `<body>` (to know which layout is shown) and public post metadata in feed cards. The content script reads `chrome.storage.local` (settings) but only the background writes it. |
| SEC-9 No telemetry | Met | No network APIs in `src/` or the bundles; logging goes to the local console only; the Firefox manifest declares `data_collection_permissions: none`. |
| SEC-10 Dependencies | Met, with one dev-tooling finding | No runtime dependencies; dev dependencies pinned by the committed `pnpm-lock.yaml`. `pnpm audit:prod` is clean. |

## Findings

| # | Severity | Finding | Status |
| - | -------- | ------- | ------ |
| 1 | High (dev tooling only) | `pnpm audit` reports GHSA-86w9-cpqp-85rv in `node-forge@1.4.0`, reached through `web-ext > @devicefarmer/adbkit`. No patched version exists. | **Accepted, not fixed.** `web-ext` is only used for `lint:firefox` and `zip`; the ADB code path that uses `node-forge` is never run; the package is not in any shipped file (no `node-forge` in the bundles; `pnpm audit --prod` is clean). Options if you want it gone: replace `web-ext` with `addons-linter` plus a plain zip step, or pin an override once a patched `node-forge` is released. |

No other findings. Nothing in the extension's own code needed fixing as a result of this review.

## Residual notes (not defects)

- Hiding a native card uses an attribute and CSS; dev.to keeps its own DOM. If dev.to ever reuses a card element for a different post, the filter re-checks it (it stores the post ID in `data-mydev-processed`), but it does not watch attribute changes on cards.
- The logged-in card markup has not been captured yet (T-402). The URL guard, image allowlist and card parser were verified only against logged-out markup.
