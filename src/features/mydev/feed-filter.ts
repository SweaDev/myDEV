/** Hides native feed cards whose post is already in myDEV (FR-4, FR-7; SPEC §8.2–8.3). */
import { MARKER } from '../../core/markers.ts';
import type { FeatureContext } from '../../core/types.ts';

/**
 * Waits for the ID set, hides matching cards that are already on screen, then watches the feed
 * container for new ones with a single MutationObserver. Everything is undone when `ctx.signal`
 * aborts. Resolves `true` once the first pass is done and `false` if the filter could not start
 * (no feed container, ID set unavailable, or aborted first), so the caller can fail open.
 */
export async function startFeedFilter(ctx: FeatureContext): Promise<boolean> {
  const { site, store, log, signal } = ctx;

  try {
    await store.ready;
  } catch {
    log.warn('myDEV list unavailable; not filtering the feed');
    return false;
  }
  if (signal.aborted) return false;

  const container = site.findFeedContainer();
  if (!container) {
    log.warnOnce('no-feed-container', 'feed container not found; not filtering the feed');
    return false;
  }

  /** Marks a card with its post ID; reprocesses it if the page reuses the element for another post. */
  const process = (card: Element) => {
    const id = site.getPostId(card);
    if (id === null || card.getAttribute(MARKER.processed) === id) return;
    card.setAttribute(MARKER.processed, id);
    if (store.has(id)) site.hideCard(card);
    else if (card.hasAttribute(MARKER.hidden)) site.unhideCard(card);
  };

  const scan = (root: ParentNode) => {
    for (const card of site.findPostCards(root)) process(card);
  };

  scan(container);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) if (node instanceof Element) scan(node);
    }
  });
  observer.observe(container, { childList: true, subtree: true });

  // A post added in another tab disappears from feeds already on screen here.
  const stopListening = store.onChange(({ added }) => {
    if (added.length === 0) return;
    const ids = new Set(added);
    for (const card of site.findPostCards(container)) {
      const id = site.getPostId(card);
      if (id !== null && ids.has(id)) site.hideCard(card);
    }
  });

  signal.addEventListener(
    'abort',
    () => {
      observer.disconnect();
      stopListening();
      for (const card of site.findPostCards(container)) {
        if (card.hasAttribute(MARKER.processed)) {
          card.removeAttribute(MARKER.processed);
          site.unhideCard(card);
        }
      }
    },
    { once: true },
  );
  return true;
}
