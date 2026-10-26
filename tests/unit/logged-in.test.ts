import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeatureContext } from '../../src/core/types.ts';
import { myDevFeature } from '../../src/features/mydev/index.ts';
import { createDevtoAdapter } from '../../src/site/devto/adapter.ts';
import { parseCard } from '../../src/site/devto/parse-card.ts';
import { prefilterCss } from '../../src/site/devto/prefilter.ts';
import { createFakeStore, type FakeStore } from '../helpers/fake-store.ts';
import { mountFixture, setUrl } from '../helpers/fixtures.ts';

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), warnOnce: vi.fn() };
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const site = createDevtoAdapter();

function card(fixture: string): Element {
  mountFixture(`logged-in/${fixture}.html`, true);
  const el = document.querySelector('.crayons-story');
  if (!el) throw new Error(`no card in ${fixture}`);
  return el;
}

const byId = (id: string) => document.querySelector(`[data-feed-content-id="${id}"]`) as Element;

describe('parseCard on logged-in cards (T-402)', () => {
  it('parses the featured card, including its cover image and the h3 title', () => {
    const result = parseCard(card('featured-card'), 'discover');
    expect(result).toMatchObject({
      postId: '4911807',
      url: 'https://dev.to/dj29/im-not-on-the-dev-team-i-still-debugged-their-missing-badges-from-public-code-and-my-first-test-18oo',
      title:
        "I'm Not on the DEV Team. I Still Debugged Their Missing Badges From Public Code. (And My First Test Was Wrong.)",
      author: { name: 'Dhruv Jani', username: 'dj29' },
      tags: ['opensource', 'ruby', 'rails', 'testing'],
      readingTimeMinutes: 6,
      publishedAt: '2026-10-24T18:12:54Z',
      sourceFeed: 'discover',
    });
    expect(result?.coverImageUrl).toContain('u93kz0lmzx5azbphc6x9');
    expect(result?.author.avatarUrl).toContain('profile_image%2F3743406');
  });

  it('parses a regular card; with no cover image the snapshot has none', () => {
    const result = parseCard(card('card'), 'following');
    expect(result).toMatchObject({
      postId: '4858037',
      title: 'is-kit Reached 100 Stars ⭐🎉 Here’s What Changed Since 50',
      author: { name: 'nyaomaru', username: 'nyaomaru' },
      tags: ['typescript', 'opensource', 'webdev', 'frontend'],
      readingTimeMinutes: 7,
      coverImageUrl: null,
    });
  });

  it('uses the person, not the organisation, for org posts', () => {
    const result = parseCard(card('card-org'), 'curated');
    expect(result?.author).toMatchObject({
      name: 'Randal L. Schwartz',
      username: 'randalschwartz',
    });
    expect(result?.author.avatarUrl).toContain('profile_image%2F121966');
    expect(result?.author.avatarUrl).not.toContain('organization');
    expect(result?.url).toBe(
      'https://dev.to/gde/926-steps-two-lobotomies-and-zero-nudges-flight-testing-the-commitment-machine-across-gemini-55ca',
    );
  });

  it('has no cover for a video embed', () => {
    const result = parseCard(card('card-video'), 'latest');
    expect(result?.postId).toBe('4904556');
    expect(result?.coverImageUrl).toBeNull();
  });

  it('resolves the site-relative URL of a paged story', () => {
    const result = parseCard(card('card-paged'), 'discover');
    expect(result).toMatchObject({
      postId: '4917361',
      url: 'https://dev.to/rudas/i-was-too-lazy-to-build-an-app-for-every-chore-so-i-built-jackapp-2e09',
      title: 'I was too lazy to build an app for every chore. So I built JackApp.',
      author: { name: 'Rupam Das', username: 'rudas' },
      readingTimeMinutes: 8,
      publishedAt: '2026-10-26T06:50:00Z',
    });
    expect(result?.tags).toEqual(['devchallenge', 'hf26challenge', 'gemma', 'android']);
  });
});

describe('adapter on the logged-in feed', () => {
  beforeEach(() => {
    setUrl('/discover');
    mountFixture('logged-in/feed.html', true);
  });

  it('finds the rendered feed container, the pill tab list and the route', () => {
    expect(site.findFeedContainer()?.id).toBe('rendered-article-feed');
    expect(site.findTabBar()?.classList.contains('feed-pill-nav')).toBe(true);
    expect(site.currentRoute()).toEqual({ kind: 'home', feed: 'discover' });
  });

  it('finds first-page and paged cards', () => {
    const ids = site.findPostCards(document.body).map((c) => site.getPostId(c));
    expect(ids).toEqual(['4911807', '4858037', '4901412', '4904556', '4917361']);
  });

  it('puts the tick right after the Bookmark button, for both Bookmark variants', () => {
    const regular = site.findActionAnchor(byId('4858037'));
    expect(regular?.after?.id).toBe('article-save-button-4858037');
    expect(regular?.parent.classList.contains('crayons-story__save')).toBe(true);
    const paged = site.findActionAnchor(byId('4917361'));
    expect(paged?.after?.classList.contains('bookmark-button')).toBe(true);
  });

  it('hides only the feed, not the quick-post form or the tab bar, in the myDEV view', () => {
    const region = site.findFeedRegion();
    expect(region?.hide.map((el) => el.id)).toEqual(['rendered-article-feed']);
    expect(region?.mount.parent.id).toBe('main-content');
    expect(region?.mount.before?.id).toBe('rendered-article-feed');
  });

  it('parses a card using the highlighted tab as the source feed', () => {
    expect(site.parseCard(byId('4858037'))?.sourceFeed).toBe('discover');
  });

  it('includes the rendered feed in the pre-filter rule', () => {
    expect(prefilterCss()).toContain('#rendered-article-feed .crayons-story[data-feed-content-id]');
  });
});

describe('myDEV feature on the logged-in feed', () => {
  let controller: AbortController;
  let store: FakeStore;
  const ctx = (): FeatureContext => ({ site, store, log, signal: controller.signal });

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new AbortController();
    setUrl('/discover');
    mountFixture('logged-in/feed.html', true);
    store = createFakeStore(['4858037']);
  });

  afterEach(() => {
    myDevFeature.dispose();
    controller.abort();
    document.body.replaceChildren();
  });

  it('hides saved posts, adds one tick per remaining card after Bookmark, and adds the tab', async () => {
    await myDevFeature.init(ctx());
    expect(byId('4858037').hasAttribute('data-mydev-hidden')).toBe(true);
    const ticks = document.querySelectorAll('button[data-mydev="tick"]');
    expect(ticks).toHaveLength(4);
    const bookmark = byId('4911807').querySelector('#article-save-button-4911807');
    expect(bookmark?.nextElementSibling?.getAttribute('data-mydev')).toBe('tick');
    expect(
      byId('4917361')
        .querySelector('.bookmark-button')
        ?.nextElementSibling?.getAttribute('data-mydev'),
    ).toBe('tick');
    expect(document.querySelector('.feed-pill-nav > [data-mydev="tab"]')).not.toBeNull();
  });

  it("checking a post saves it without triggering dev.to's own card click", async () => {
    const cardClick = vi.fn();
    byId('4917361').addEventListener('click', cardClick);
    document.querySelector('#rendered-article-feed')?.addEventListener('click', cardClick);
    await myDevFeature.init(ctx());

    byId('4917361').querySelector<HTMLElement>('button[data-mydev="tick"]')?.click();
    await flush();
    expect(cardClick).not.toHaveBeenCalled();
    expect(store.added[0]).toMatchObject({ postId: '4917361', sourceFeed: 'discover' });
    expect(byId('4917361').hasAttribute('data-mydev-hidden')).toBe(true);
  });

  it('leaves clicks that are not on the tick to dev.to', async () => {
    const cardClick = vi.fn();
    byId('4911807').addEventListener('click', cardClick);
    await myDevFeature.init(ctx());
    byId('4911807')
      .querySelector('h3 a')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(cardClick).toHaveBeenCalledTimes(1);
  });

  it('shows the myDEV view in place of the rendered feed only', async () => {
    await myDevFeature.init(ctx());
    setUrl('/discover#mydev');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flush();
    expect(
      document.querySelector('#rendered-article-feed')?.hasAttribute('data-mydev-feed-hidden'),
    ).toBe(true);
    expect(
      document.querySelector('#main-status-form')?.closest('[data-mydev-feed-hidden]'),
    ).toBeNull();
    expect(document.querySelector('[data-mydev="view"]')?.nextElementSibling?.id).toBe(
      'rendered-article-feed',
    );
    expect(
      document
        .querySelector('.feed-pill-nav .crayons-navigation__item--current')
        ?.closest('[data-mydev="tab"]'),
    ).not.toBeNull();
  });
});
