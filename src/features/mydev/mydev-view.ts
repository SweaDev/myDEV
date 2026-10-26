/** The myDEV feed view (FR-5, FR-6, FR-7): saved posts as cards built from their snapshots. */
import { el } from '../../core/dom.ts';
import { MARKER } from '../../core/markers.ts';
import type { FeatureContext, MyDevRecord } from '../../core/types.ts';
import { safeImageUrl, safeLinkUrl } from '../../core/url-guard.ts';
import { isValidTag } from '../../core/validate.ts';
import {
  createTickButton,
  errorMessageFor,
  setTickBusy,
  showTickError,
  tickSelector,
} from './check-button.ts';
import type { MyDevTab } from './mydev-tab.ts';

const VIEW_ROLE = 'view';
const CARD_ROLE = 'card';
const EMPTY_ROLE = 'empty';
/** Carries the post ID on each card (allowed by dom.ts: `data-mydev*`). */
const POST_ATTR = 'data-mydev-post';

export const EMPTY_TEXT =
  'No posts in myDEV yet. Use the ✓ button on any post in the other feeds to move it here.';
const LOAD_ERROR_TEXT = "Couldn't load your myDEV posts. Try again later.";

function dateLabel(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** One card, built only from stored fields; every URL is re-checked by the guard. Null if unusable. */
export function buildCard(record: MyDevRecord): HTMLElement | null {
  const url = safeLinkUrl(record.url);
  if (!url) return null;
  const cover = safeImageUrl(record.coverImageUrl);
  const avatar = safeImageUrl(record.author.avatarUrl);
  const published = dateLabel(record.publishedAt);

  const tags = record.tags
    .filter(isValidTag)
    .map((tag) => ({ tag, href: safeLinkUrl(`https://dev.to/t/${tag}`) }))
    .filter(
      (entry): entry is { tag: string; href: NonNullable<typeof entry.href> } =>
        entry.href !== null,
    );

  return el('article', {
    attrs: { class: 'mydev-card', [MARKER.owned]: CARD_ROLE, [POST_ATTR]: record.postId },
    children: [
      cover &&
        el('a', {
          attrs: { href: url, title: record.title },
          children: [
            el('img', {
              attrs: { src: cover, alt: '', loading: 'lazy', class: 'mydev-card__cover' },
            }),
          ],
        }),
      el('div', {
        attrs: { class: 'mydev-card__body' },
        children: [
          el('div', {
            attrs: { class: 'mydev-card__meta' },
            children: [
              avatar &&
                el('img', {
                  attrs: { src: avatar, alt: '', loading: 'lazy', class: 'mydev-card__avatar' },
                }),
              el('span', { text: record.author.name }),
              published && record.publishedAt
                ? el('time', { text: published, attrs: { datetime: record.publishedAt } })
                : null,
            ],
          }),
          el('h2', {
            attrs: { class: 'mydev-card__title' },
            children: [el('a', { text: record.title, attrs: { href: url } })],
          }),
          tags.length > 0
            ? el('ul', {
                attrs: { class: 'mydev-card__tags' },
                children: tags.map(({ tag, href }) =>
                  el('li', {
                    children: [
                      el('a', { text: `#${tag}`, attrs: { href, class: 'mydev-card__tag' } }),
                    ],
                  }),
                ),
              })
            : null,
          el('div', {
            attrs: { class: 'mydev-card__footer' },
            children: [
              el('span', {
                text:
                  record.readingTimeMinutes !== null ? `${record.readingTimeMinutes} min read` : '',
              }),
              createTickButton(true),
            ],
          }),
        ],
      }),
    ],
  });
}

/**
 * Shows the myDEV list in place of the native feed while `tab` is active. The native feed elements
 * are hidden with an attribute (never removed) and the view is a sibling section; leaving, or
 * `ctx.signal` aborting, puts everything back.
 */
export function createMyDevView(ctx: FeatureContext, tab: MyDevTab): void {
  const { site, store, log, signal } = ctx;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  let section: HTMLElement | null = null;
  let hidden: Element[] = [];
  let renderSeq = 0;

  const showEmpty = () => {
    section?.replaceChildren(
      el('div', {
        text: EMPTY_TEXT,
        attrs: { class: 'mydev-empty', [MARKER.owned]: EMPTY_ROLE, role: 'status' },
      }),
    );
  };

  const render = async () => {
    const seq = ++renderSeq;
    let records: MyDevRecord[];
    try {
      records = await store.list();
    } catch (error) {
      if (seq !== renderSeq || !section) return;
      log.warn('could not load the myDEV list', error);
      section.replaceChildren(
        el('div', {
          text: LOAD_ERROR_TEXT,
          attrs: { class: 'mydev-empty', [MARKER.owned]: EMPTY_ROLE, role: 'status' },
        }),
      );
      return;
    }
    if (seq !== renderSeq || !section) return;

    const cards: HTMLElement[] = [];
    for (const record of [...records].sort((a, b) => b.addedAt - a.addedAt)) {
      const card = buildCard(record);
      if (card) cards.push(card);
      else
        log.warnOnce(`bad-record:${record.postId}`, 'skipping a saved post with an unusable URL');
    }
    if (cards.length === 0) showEmpty();
    else section.replaceChildren(...cards);
  };

  const onClick = async (event: Event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLElement>(tickSelector);
    const card = button?.closest<HTMLElement>(`[${MARKER.owned}="${CARD_ROLE}"]`);
    const postId = card?.getAttribute(POST_ATTR);
    if (!button || !card || !postId || button.hasAttribute('disabled')) return;

    setTickBusy(button, true);
    try {
      await store.remove(postId);
      card.remove();
      if (section && !section.querySelector(`[${MARKER.owned}="${CARD_ROLE}"]`)) showEmpty();
    } catch (error) {
      log.warn('could not remove the post', error);
      showTickError(button, errorMessageFor((error as { code?: unknown } | null)?.code), timers);
    } finally {
      if (button.isConnected) setTickBusy(button, false);
    }
  };

  const open = () => {
    if (section) return;
    const region = site.findFeedRegion();
    if (!region) {
      log.warnOnce('no-feed-region', 'feed region not found; cannot show the myDEV view');
      return;
    }
    hidden = region.hide;
    for (const node of hidden) node.setAttribute(MARKER.feedHidden, '');
    section = el('section', {
      attrs: { class: 'mydev-view', [MARKER.owned]: VIEW_ROLE, 'aria-label': 'myDEV' },
      on: { click: (event) => void onClick(event) },
      signal,
    });
    region.mount.parent.insertBefore(section, region.mount.before);
    void render();
  };

  const close = () => {
    renderSeq++;
    section?.remove();
    section = null;
    for (const node of hidden) node.removeAttribute(MARKER.feedHidden);
    hidden = [];
  };

  const stopTab = tab.onChange((active) => (active ? open() : close()));
  const stopStore = store.onChange(() => {
    if (section) void render();
  });
  if (tab.isActive()) open();

  signal.addEventListener(
    'abort',
    () => {
      stopTab();
      stopStore();
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      close();
    },
    { once: true },
  );
}
