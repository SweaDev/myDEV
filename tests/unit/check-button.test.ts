import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeatureContext } from '../../src/core/types.ts';
import { createCheckButtons, createTickButton } from '../../src/features/mydev/check-button.ts';
import { startFeedFilter } from '../../src/features/mydev/feed-filter.ts';
import { createDevtoAdapter } from '../../src/site/devto/adapter.ts';
import { createFakeStore, type FakeStore } from '../helpers/fake-store.ts';
import { mountFixture } from '../helpers/fixtures.ts';

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), warnOnce: vi.fn() };
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const site = createDevtoAdapter();

let controller: AbortController;
let store: FakeStore;

const ticks = (root: ParentNode = document) => [
  ...root.querySelectorAll<HTMLElement>('button[data-mydev="tick"]'),
];
const card = (id: string) => document.querySelector(`[data-feed-content-id="${id}"]`) as Element;
const tickOf = (id: string) => ticks(card(id))[0] as HTMLElement;

/** Mounts the feed and starts filter + buttons the way the feature will. */
async function start(initialIds: string[] = []) {
  store = createFakeStore(initialIds);
  const ctx: FeatureContext = { site, store, log, signal: controller.signal };
  const buttons = createCheckButtons(ctx);
  await startFeedFilter(ctx, (c) => buttons.attach(c));
  return buttons;
}

beforeEach(() => {
  vi.clearAllMocks();
  controller = new AbortController();
  mountFixture('logged-out/feed.html');
});

afterEach(() => {
  controller.abort();
  vi.useRealTimers();
});

describe('createTickButton', () => {
  it('is a native, unchecked, labelled button', () => {
    const button = createTickButton(false);
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('Add to myDEV');
    expect(button.getAttribute('title')).toBe('Add to myDEV');
    expect(button.querySelector('svg')).not.toBeNull();
  });

  it('is labelled for removal when checked', () => {
    const button = createTickButton(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Remove from myDEV');
  });
});

describe('placement', () => {
  it('adds exactly one button to every visible post card', async () => {
    await start();
    expect(ticks()).toHaveLength(4);
    for (const id of ['4913784', '4917021', '4911807', '4915318']) {
      expect(ticks(card(id))).toHaveLength(1);
    }
  });

  it('puts the button at the end of the save area when there is no Bookmark button', async () => {
    await start();
    const save = card('4917021').querySelector('.crayons-story__save');
    expect(save?.lastElementChild).toBe(tickOf('4917021'));
    expect(save?.firstElementChild?.tagName).toBe('SMALL');
  });

  it('puts the button right after the Bookmark button when there is one', async () => {
    const withBookmark = card('4917021');
    const save = withBookmark.querySelector('.crayons-story__save');
    const bookmark = document.createElement('button');
    bookmark.id = 'article-save-button-4917021';
    const trailing = document.createElement('span');
    save?.append(bookmark, trailing);
    await start();
    expect(bookmark.nextElementSibling).toBe(tickOf('4917021'));
    expect(tickOf('4917021').nextElementSibling).toBe(trailing);
  });

  it('never adds a second button when a card is processed again', async () => {
    const buttons = await start();
    const target = card('4917021');
    buttons.attach(target);
    buttons.attach(target);
    expect(ticks(target)).toHaveLength(1);
  });

  it('skips cards already in myDEV and non-post blocks', async () => {
    await start(['4917021']);
    expect(ticks(card('4917021'))).toHaveLength(0);
    expect(ticks()).toHaveLength(3);

    mountFixture('logged-out/non-post-synthetic.html');
    const ctx: FeatureContext = { site, store, log, signal: controller.signal };
    const buttons = createCheckButtons(ctx);
    for (const el of document.body.children) buttons.attach(el);
    expect(ticks()).toHaveLength(0);
  });

  it('warns once and adds nothing when a card has no place for the button', async () => {
    const ctx: FeatureContext = { site, store: createFakeStore(), log, signal: controller.signal };
    const buttons = createCheckButtons(ctx);
    const bare = document.createElement('div');
    buttons.attach(bare);
    expect(ticks(bare)).toHaveLength(0);
    expect(log.warnOnce).toHaveBeenCalledWith('no-action-anchor', expect.any(String));
  });

  it('adds buttons to cards that arrive later', async () => {
    await start();
    const parsed = card('4917021').cloneNode(true) as Element;
    parsed.setAttribute('data-feed-content-id', '9001');
    parsed.querySelector('[data-mydev="tick"]')?.remove();
    document.querySelector('#substories')?.append(parsed);
    await flush();
    expect(ticks(parsed)).toHaveLength(1);
  });
});

describe('checking a post', () => {
  it('saves a snapshot, hides the card and checks the button', async () => {
    await start();
    const button = tickOf('4917021');
    button.click();
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(true);
    await flush();
    expect(store.added).toHaveLength(1);
    expect(store.added[0]).toMatchObject({
      postId: '4917021',
      title: '🐾 DEV Pet Corner #3: Show Us Your Pets!',
      sourceFeed: 'relevant',
    });
    expect(card('4917021').hasAttribute('data-mydev-hidden')).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.hasAttribute('aria-busy')).toBe(false);
    expect(button.hasAttribute('disabled')).toBe(false);
  });

  it('leaves other cards alone', async () => {
    await start();
    tickOf('4917021').click();
    await flush();
    expect(card('4911807').hasAttribute('data-mydev-hidden')).toBe(false);
    expect(store.has('4911807')).toBe(false);
  });

  it('ignores a second click while the save is in progress', async () => {
    await start();
    const button = tickOf('4917021');
    button.click();
    button.click();
    await flush();
    expect(store.added).toHaveLength(1);
  });

  it('is reachable and operable from the keyboard (native button: Enter/Space fire click)', async () => {
    await start();
    const button = tickOf('4917021');
    button.focus();
    expect(document.activeElement).toBe(button);
    expect(button.tabIndex).toBe(0);
    expect(button.getAttribute('type')).toBe('button');
    button.click(); // what the browser dispatches for Enter or Space on a focused button
    await flush();
    expect(store.added).toHaveLength(1);
  });

  it('works when the click lands on the icon inside the button', async () => {
    await start();
    tickOf('4917021')
      .querySelector('svg')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(store.added).toHaveLength(1);
  });

  it('does not react to clicks elsewhere in the card', async () => {
    await start();
    card('4917021')
      .querySelector('h2')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(store.added).toHaveLength(0);
  });
});

describe('failures (FR-3)', () => {
  it('keeps the card visible and the button unchecked, and shows an inline error', async () => {
    await start();
    store.failNext = Object.assign(new Error('full'), { code: 'quota-exceeded' });
    const button = tickOf('4917021');
    button.click();
    await flush();
    expect(card('4917021').hasAttribute('data-mydev-hidden')).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.hasAttribute('aria-busy')).toBe(false);
    const note = button.nextElementSibling;
    expect(note?.getAttribute('role')).toBe('status');
    expect(note?.textContent).toBe('Storage is full.');
  });

  it.each([
    ['unavailable', "Couldn't reach the extension. Try again."],
    ['storage-error', "Couldn't save. Try again."],
  ])('explains %s', async (code, message) => {
    await start();
    store.failNext = Object.assign(new Error('x'), { code });
    tickOf('4917021').click();
    await flush();
    expect(tickOf('4917021').nextElementSibling?.textContent).toBe(message);
  });

  it('shows the error for an unparseable card and saves nothing', async () => {
    await start();
    card('4917021').querySelector('h2 a')?.remove();
    tickOf('4917021').click();
    await flush();
    expect(store.added).toHaveLength(0);
    expect(card('4917021').hasAttribute('data-mydev-hidden')).toBe(false);
    expect(tickOf('4917021').nextElementSibling?.textContent).toBe("Couldn't read this post.");
  });

  it('removes the error by itself and can be retried', async () => {
    vi.useFakeTimers();
    await start();
    store.failNext = new Error('x');
    const button = tickOf('4917021');
    button.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(button.nextElementSibling?.getAttribute('role')).toBe('status');
    await vi.advanceTimersByTimeAsync(4100);
    expect(button.nextElementSibling).toBeNull();

    button.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.added).toHaveLength(1);
  });

  it('keeps a single error message at a time', async () => {
    await start();
    const button = tickOf('4917021');
    store.failNext = new Error('x');
    button.click();
    await flush();
    store.failNext = new Error('y');
    button.click();
    await flush();
    expect(card('4917021').querySelectorAll('[data-mydev="tick-error"]')).toHaveLength(1);
  });
});

describe('cleanup', () => {
  it('removes buttons, errors and the click handler on abort', async () => {
    await start();
    store.failNext = new Error('x');
    tickOf('4917021').click();
    await flush();
    const button = tickOf('4911807');
    controller.abort();
    expect(document.querySelectorAll('[data-mydev]')).toHaveLength(0);
    button.click();
    await flush();
    expect(store.added).toHaveLength(0);
  });
});
