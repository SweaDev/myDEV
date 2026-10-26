import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeatureContext, MyDevRecord } from '../../src/core/types.ts';
import { createMyDevTab } from '../../src/features/mydev/mydev-tab.ts';
import { EMPTY_TEXT, buildCard, createMyDevView } from '../../src/features/mydev/mydev-view.ts';
import { createDevtoAdapter } from '../../src/site/devto/adapter.ts';
import { createFakeStore, type FakeStore } from '../helpers/fake-store.ts';
import { mountFixture, setUrl } from '../helpers/fixtures.ts';

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), warnOnce: vi.fn() };
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const site = createDevtoAdapter();

const record = (postId: string, overrides: Partial<MyDevRecord> = {}): MyDevRecord => ({
  postId,
  url: `https://dev.to/someone/post-${postId}`,
  title: `Post ${postId}`,
  author: {
    name: 'Some One',
    username: 'someone',
    avatarUrl: 'https://media2.dev.to/dynamic/image/width=90/avatar.png',
  },
  tags: ['js', 'webdev'],
  coverImageUrl: 'https://media2.dev.to/dynamic/image/width=1000/cover.png',
  readingTimeMinutes: 4,
  publishedAt: '2026-10-24T18:12:54Z',
  sourceFeed: 'latest',
  addedAt: Number(postId),
  updatedAt: Number(postId),
  deletedAt: null,
  schemaVersion: 1,
  ...overrides,
});

let controller: AbortController;
let store: FakeStore;

async function openView(records: MyDevRecord[] = [], fixture = 'logged-out/feed.html') {
  mountFixture(fixture, fixture.startsWith('logged-in'));
  store = createFakeStore();
  store.records = records;
  const ctx: FeatureContext = { site, store, log, signal: controller.signal };
  const tab = createMyDevTab(ctx);
  createMyDevView(ctx, tab);
  setUrl('/#mydev');
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  await flush();
  return tab;
}

const view = () => document.querySelector<HTMLElement>('[data-mydev="view"]');
const cards = () => [...document.querySelectorAll<HTMLElement>('[data-mydev="card"]')];
const titles = () => cards().map((c) => c.querySelector('h2')?.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  controller = new AbortController();
  setUrl('/');
});

afterEach(() => {
  controller.abort();
  document.body.replaceChildren();
});

describe('opening and closing', () => {
  it('shows nothing until myDEV is the active tab', async () => {
    mountFixture('logged-out/feed.html');
    store = createFakeStore();
    const ctx: FeatureContext = { site, store, log, signal: controller.signal };
    createMyDevView(ctx, createMyDevTab(ctx));
    await flush();
    expect(view()).toBeNull();
    expect(document.querySelectorAll('[data-mydev-feed-hidden]')).toHaveLength(0);
  });

  it('hides the native feed (not the tab bar) and mounts the view in its place', async () => {
    await openView([record('1')]);
    const main = document.querySelector('#main-content');
    expect(view()?.parentElement).toBe(main);
    expect(document.querySelector('#substories')?.hasAttribute('data-mydev-feed-hidden')).toBe(
      true,
    );
    expect(
      document.querySelector('.crayons-story--featured')?.hasAttribute('data-mydev-feed-hidden'),
    ).toBe(true);
    expect(document.querySelector('nav')?.closest('[data-mydev-feed-hidden]')).toBeNull();
    // The view sits where the first native feed element was.
    expect(view()?.nextElementSibling?.classList.contains('crayons-story--featured')).toBe(true);
  });

  it('removes the view and restores the feed when leaving', async () => {
    await openView([record('1')]);
    setUrl('/');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flush();
    expect(view()).toBeNull();
    expect(document.querySelectorAll('[data-mydev-feed-hidden]')).toHaveLength(0);
  });

  it('opens straight away on a deep link', async () => {
    setUrl('/#mydev');
    mountFixture('logged-out/feed.html');
    store = createFakeStore();
    store.records = [record('1')];
    const ctx: FeatureContext = { site, store, log, signal: controller.signal };
    createMyDevView(ctx, createMyDevTab(ctx));
    await flush();
    expect(titles()).toEqual(['Post 1']);
  });

  it('warns once and leaves the page alone when there is no feed region', async () => {
    mountFixture('logged-out/tab-bar.html');
    store = createFakeStore();
    const ctx: FeatureContext = { site, store, log, signal: controller.signal };
    createMyDevView(ctx, createMyDevTab(ctx));
    setUrl('/#mydev');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flush();
    expect(view()).toBeNull();
    expect(log.warnOnce).toHaveBeenCalledWith('no-feed-region', expect.any(String));
  });

  it('works with the logged-in layout (feed mount point)', async () => {
    document.body.setAttribute('data-user-status', 'logged-in');
    mountFixture('logged-in/tab-bar.html', true);
    const main = document.createElement('main');
    main.id = 'main-content';
    main.append(...document.body.childNodes);
    const feed = document.createElement('div');
    feed.id = 'homepage-feed';
    main.append(feed);
    document.body.append(main);
    store = createFakeStore();
    store.records = [record('1')];
    const ctx: FeatureContext = { site, store, log, signal: controller.signal };
    createMyDevView(ctx, createMyDevTab(ctx));
    setUrl('/#mydev');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flush();
    expect(feed.hasAttribute('data-mydev-feed-hidden')).toBe(true);
    expect(view()?.nextElementSibling).toBe(feed);
    expect(titles()).toEqual(['Post 1']);
  });
});

describe('rendering', () => {
  it('lists saved posts newest first', async () => {
    await openView([record('1'), record('3'), record('2')]);
    expect(titles()).toEqual(['Post 3', 'Post 2', 'Post 1']);
  });

  it('shows the snapshot fields', async () => {
    await openView([record('7')]);
    const card = cards()[0] as HTMLElement;
    const titleLink = card.querySelector<HTMLAnchorElement>('h2 a');
    expect(titleLink?.getAttribute('href')).toBe('https://dev.to/someone/post-7');
    expect(titleLink?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(card.textContent).toContain('Some One');
    expect(card.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-24T18:12:54Z');
    expect(card.querySelector('.mydev-card__avatar')?.getAttribute('src')).toContain('avatar.png');
    expect(card.querySelector('.mydev-card__cover')?.getAttribute('src')).toContain('cover.png');
    expect([...card.querySelectorAll('.mydev-card__tag')].map((a) => a.textContent)).toEqual([
      '#js',
      '#webdev',
    ]);
    expect(card.querySelector('.mydev-card__tag')?.getAttribute('href')).toBe(
      'https://dev.to/t/js',
    );
    expect(card.textContent).toContain('4 min read');
  });

  it('shows a checked tick button on every card', async () => {
    await openView([record('1'), record('2')]);
    const buttons = [
      ...document.querySelectorAll<HTMLElement>('[data-mydev="view"] button[data-mydev="tick"]'),
    ];
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button.getAttribute('aria-pressed')).toBe('true');
      expect(button.getAttribute('aria-label')).toBe('Remove from myDEV');
    }
  });

  it('omits parts that were not saved', async () => {
    await openView([
      record('1', {
        coverImageUrl: null,
        readingTimeMinutes: null,
        publishedAt: null,
        tags: [],
        author: { name: 'No Avatar', username: 'na', avatarUrl: null },
      }),
    ]);
    const card = cards()[0] as HTMLElement;
    expect(card.querySelector('.mydev-card__cover')).toBeNull();
    expect(card.querySelector('.mydev-card__avatar')).toBeNull();
    expect(card.querySelector('time')).toBeNull();
    expect(card.querySelector('.mydev-card__tags')).toBeNull();
    expect(card.textContent).not.toContain('min read');
    expect(card.querySelector('h2')?.textContent).toBe('Post 1');
  });

  it('shows the empty state when nothing is saved', async () => {
    await openView([]);
    expect(cards()).toHaveLength(0);
    expect(view()?.textContent).toBe(EMPTY_TEXT);
    expect(EMPTY_TEXT).toBe(
      'No posts in myDEV yet. Use the ✓ button on any post in the other feeds to move it here.',
    );
  });

  it('shows a message when the list cannot be loaded', async () => {
    mountFixture('logged-out/feed.html');
    store = createFakeStore();
    store.listError = new Error('boom');
    const ctx: FeatureContext = { site, store, log, signal: controller.signal };
    createMyDevView(ctx, createMyDevTab(ctx));
    setUrl('/#mydev');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flush();
    expect(view()?.textContent).toContain("Couldn't load");
  });
});

describe('hostile records render inert (SEC-3, SEC-4)', () => {
  it('shows markup in text fields as text', async () => {
    const payload = '<img src=x onerror=alert(1)><script>alert(1)</script>';
    await openView([
      record('1', {
        title: payload,
        author: { name: payload, username: 'x', avatarUrl: null },
        coverImageUrl: null,
      }),
    ]);
    const card = cards()[0] as HTMLElement;
    expect(card.querySelector('h2')?.textContent).toBe(payload);
    expect(card.querySelectorAll('script, img[src="x"]')).toHaveLength(0);
    expect(card.querySelector('img')).toBeNull();
    expect(card.textContent).toContain(payload);
  });

  it('drops unsafe image URLs and skips cards whose link is unsafe', async () => {
    await openView([
      record('1', {
        coverImageUrl: 'https://evil.com/x.png',
        author: { name: 'A', username: 'a', avatarUrl: 'javascript:alert(1)' },
      }),
      record('2', { url: 'javascript:alert(1)' }),
      record('3', { url: 'https://evil.com/post' }),
    ]);
    expect(titles()).toEqual(['Post 1']);
    const card = cards()[0] as HTMLElement;
    expect(card.querySelector('img')).toBeNull();
    expect(log.warnOnce).toHaveBeenCalledTimes(2);
  });

  it('never builds a link from an unsafe tag', () => {
    const card = buildCard(record('1', { tags: ['ok', '"><script>'] }));
    expect(
      [...(card?.querySelectorAll('.mydev-card__tag') ?? [])].map((a) => a.textContent),
    ).toEqual(['#ok']);
  });
});

describe('unchecking (FR-6)', () => {
  it('removes the post and its card straight away', async () => {
    await openView([record('1'), record('2')]);
    const button = cards()[0]?.querySelector<HTMLElement>('button[data-mydev="tick"]');
    button?.click();
    expect(button?.getAttribute('aria-busy')).toBe('true');
    await flush();
    expect(store.removed).toEqual(['2']);
    expect(titles()).toEqual(['Post 1']);
  });

  it('shows the empty state after the last card is removed', async () => {
    await openView([record('1')]);
    cards()[0]?.querySelector<HTMLElement>('button[data-mydev="tick"]')?.click();
    await flush();
    expect(cards()).toHaveLength(0);
    expect(view()?.textContent).toBe(EMPTY_TEXT);
  });

  it('keeps the card and shows an inline error when removing fails', async () => {
    await openView([record('1')]);
    store.failNext = Object.assign(new Error('x'), { code: 'unavailable' });
    const button = cards()[0]?.querySelector<HTMLElement>('button[data-mydev="tick"]');
    button?.click();
    await flush();
    expect(titles()).toEqual(['Post 1']);
    expect(button?.hasAttribute('disabled')).toBe(false);
    expect(button?.nextElementSibling?.getAttribute('role')).toBe('status');
    expect(button?.nextElementSibling?.textContent).toContain('reach the extension');
  });

  it('ignores clicks that are not on a tick button', async () => {
    await openView([record('1')]);
    cards()[0]
      ?.querySelector('h2')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(store.removed).toEqual([]);
  });
});

describe('live updates (FR-7)', () => {
  it('re-renders when a post is added or removed elsewhere', async () => {
    await openView([record('1')]);
    store.records = [record('2'), record('1')];
    store.push({ added: ['2'], removed: [] });
    await flush();
    expect(titles()).toEqual(['Post 2', 'Post 1']);

    store.records = [record('2')];
    store.push({ added: [], removed: ['1'] });
    await flush();
    expect(titles()).toEqual(['Post 2']);
  });

  it('ignores store changes while closed', async () => {
    mountFixture('logged-out/feed.html');
    store = createFakeStore();
    const list = vi.spyOn(store, 'list');
    const ctx: FeatureContext = { site, store, log, signal: controller.signal };
    createMyDevView(ctx, createMyDevTab(ctx));
    store.push({ added: ['1'], removed: [] });
    await flush();
    expect(list).not.toHaveBeenCalled();
    expect(view()).toBeNull();
  });
});

describe('cleanup', () => {
  it('restores the page when the feature is disposed while open', async () => {
    await openView([record('1')]);
    controller.abort();
    expect(view()).toBeNull();
    expect(document.querySelectorAll('[data-mydev-feed-hidden]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-mydev]')).toHaveLength(0);
  });

  it('does not render a stale list that finishes after the view closed', async () => {
    mountFixture('logged-out/feed.html');
    store = createFakeStore();
    let release!: (records: MyDevRecord[]) => void;
    vi.spyOn(store, 'list').mockReturnValue(new Promise((resolve) => (release = resolve)));
    const ctx: FeatureContext = { site, store, log, signal: controller.signal };
    createMyDevView(ctx, createMyDevTab(ctx));
    setUrl('/#mydev');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flush();
    setUrl('/');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flush();
    release([record('1')]);
    await flush();
    expect(view()).toBeNull();
    expect(cards()).toHaveLength(0);
  });
});
