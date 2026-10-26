import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDevtoAdapter } from '../../src/site/devto/adapter.ts';
import { mountFixture, setUrl } from '../helpers/fixtures.ts';

const adapter = createDevtoAdapter();

beforeEach(() => {
  document.body.replaceChildren();
  setUrl('/');
});

describe('logged-out feed fixture', () => {
  beforeEach(() => mountFixture('logged-out/feed.html'));

  it('finds the feed container and the tab list', () => {
    expect(adapter.findFeedContainer()?.id).toBe('main-content');
    expect(adapter.findTabBar()?.matches('ul.crayons-navigation')).toBe(true);
  });

  it('finds every post card, featured first', () => {
    const cards = adapter.findPostCards(document.body);
    expect(cards.map((c) => adapter.getPostId(c))).toEqual([
      '4913784',
      '4917021',
      '4911807',
      '4915318',
    ]);
    expect(cards[0]?.classList.contains('crayons-story--featured')).toBe(true);
  });

  it('includes the root when it is itself a card, and finds nothing outside cards', () => {
    const [card] = adapter.findPostCards(document.body);
    expect(card && adapter.findPostCards(card)).toEqual([card]);
    expect(adapter.findPostCards(document.createElement('div'))).toEqual([]);
  });

  it('reports the active feed as the route', () => {
    expect(adapter.currentRoute()).toEqual({ kind: 'home', feed: 'relevant' });
  });

  it('puts the tick at the end of the save area when there is no Bookmark button', () => {
    const [card] = adapter.findPostCards(document.body);
    const anchor = card && adapter.findActionAnchor(card);
    expect(anchor?.parent.classList.contains('crayons-story__save')).toBe(true);
    expect(anchor?.after?.tagName).toBe('SMALL');
    expect(anchor?.after?.textContent).toContain('min read');
  });

  it('puts the tick right after a Bookmark button when there is one', () => {
    const [card] = adapter.findPostCards(document.body);
    const save = card?.querySelector('.crayons-story__save');
    const bookmark = document.createElement('button');
    bookmark.id = 'article-save-button-4913784';
    save?.append(bookmark, document.createElement('span'));
    const anchor = card && adapter.findActionAnchor(card);
    expect(anchor).toEqual({ parent: save, after: bookmark });
  });

  it('falls back to the action row, then to nothing', () => {
    const [card] = adapter.findPostCards(document.body);
    card?.querySelector('.crayons-story__save')?.remove();
    expect(
      card && adapter.findActionAnchor(card)?.parent.classList.contains('crayons-story__bottom'),
    ).toBe(true);
    card?.querySelector('.crayons-story__bottom')?.remove();
    expect(card && adapter.findActionAnchor(card)).toBeNull();
  });

  it('parses a card using the current feed as sourceFeed', () => {
    const [card] = adapter.findPostCards(document.body);
    expect(card && adapter.parseCard(card)).toMatchObject({
      postId: '4913784',
      sourceFeed: 'relevant',
    });
  });

  it('uses "unknown" as sourceFeed outside the home feeds and in the myDEV view', () => {
    const [card] = adapter.findPostCards(document.body);
    setUrl('/t/javascript');
    expect(card && adapter.parseCard(card)?.sourceFeed).toBe('unknown');
    setUrl('/#mydev');
    expect(card && adapter.parseCard(card)?.sourceFeed).toBe('unknown');
  });

  it('hides and unhides a card with a reversible attribute', () => {
    const [card] = adapter.findPostCards(document.body);
    if (!card) throw new Error('no card');
    adapter.hideCard(card);
    expect(card.hasAttribute('data-mydev-hidden')).toBe(true);
    adapter.unhideCard(card);
    expect(card.hasAttribute('data-mydev-hidden')).toBe(false);
  });

  it('notifies about route changes and stops on unsubscribe', async () => {
    const cb = vi.fn();
    const stop = adapter.onRouteChange(cb);
    setUrl('/#mydev');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cb).toHaveBeenCalledWith({ kind: 'home', feed: 'mydev' });
    stop();
  });
});

describe('non-post blocks', () => {
  it('are never post cards', () => {
    mountFixture('logged-out/non-post-synthetic.html');
    expect(adapter.findPostCards(document.body)).toEqual([]);
    for (const el of document.body.children) {
      expect(adapter.isPostCard(el)).toBe(false);
      expect(adapter.getPostId(el)).toBeNull();
    }
  });
});

describe('logged-in tab bar fixture', () => {
  it('finds the pill tab list and reports the highlighted feed', () => {
    mountFixture('logged-in/tab-bar.html', true);
    expect(adapter.findTabBar()?.classList.contains('feed-pill-nav')).toBe(true);
    expect(adapter.currentRoute()).toEqual({ kind: 'home', feed: 'discover' });
  });
});

describe('when dev.to markup does not match (FR-9)', () => {
  it('returns null/false/[] everywhere and never throws', () => {
    mountFixture('logged-out/feed.html');
    const [card] = adapter.findPostCards(document.body);
    if (!card) throw new Error('no card');
    // Simulate a redesign: every class and data attribute the adapter relies on disappears.
    for (const el of [document.body, ...document.body.querySelectorAll('*')]) {
      el.removeAttribute('class');
      el.removeAttribute('id');
      el.removeAttribute('data-feed-content-id');
      el.removeAttribute('aria-label');
    }
    expect(adapter.findFeedContainer()).toBeNull();
    expect(adapter.findTabBar()).toBeNull();
    expect(adapter.findPostCards(document.body)).toEqual([]);
    expect(adapter.isPostCard(card)).toBe(false);
    expect(adapter.getPostId(card)).toBeNull();
    expect(adapter.findActionAnchor(card)).toBeNull();
    expect(adapter.parseCard(card)).toBeNull();
    expect(adapter.currentRoute()).toEqual({ kind: 'home', feed: 'relevant' });
    expect(() => adapter.hideCard(card)).not.toThrow();
  });

  it('survives an empty document', () => {
    expect(adapter.findFeedContainer()).toBeNull();
    expect(adapter.findTabBar()).toBeNull();
    expect(adapter.findPostCards(document)).toEqual([]);
  });

  it('survives hostile arguments', () => {
    const bad = null as unknown as Element;
    expect(adapter.isPostCard(bad)).toBe(false);
    expect(adapter.getPostId(bad)).toBeNull();
    expect(adapter.findActionAnchor(bad)).toBeNull();
    expect(adapter.parseCard(bad)).toBeNull();
    expect(() => adapter.hideCard(bad)).not.toThrow();
    expect(() => adapter.unhideCard(bad)).not.toThrow();
    expect(adapter.findPostCards(bad as unknown as ParentNode)).toEqual([]);
  });
});

describe('tabs', () => {
  it('lists the native tabs of each layout, excluding the logged-in dropdown', () => {
    mountFixture('logged-out/tab-bar.html');
    expect(adapter.findTabs().map((tab) => tab.getAttribute('href'))).toEqual([
      '/',
      '/latest',
      '/top/week',
    ]);
    mountFixture('logged-in/tab-bar.html', true);
    expect(adapter.findTabs().map((tab) => tab.getAttribute('data-feed-nav'))).toEqual([
      'discover',
      'following',
      'curated',
      'latest',
    ]);
    expect(adapter.findTabs().every((tab) => tab.matches('.feed-pill-nav a'))).toBe(true);
  });

  it('reads and writes the current marker', () => {
    mountFixture('logged-in/tab-bar.html', true);
    const [discover, following] = adapter.findTabs();
    if (!discover || !following) throw new Error('missing tabs');
    expect(adapter.isTabCurrent(discover)).toBe(true);
    expect(adapter.isTabCurrent(following)).toBe(false);
    adapter.setTabCurrent(discover, false);
    adapter.setTabCurrent(following, true);
    expect(adapter.isTabCurrent(discover)).toBe(false);
    expect(adapter.isTabCurrent(following)).toBe(true);
    expect(following.getAttribute('aria-current')).toBe('page');
    expect(discover.hasAttribute('aria-current')).toBe(false);
  });

  it.each([
    ['logged-out/tab-bar.html', false],
    ['logged-in/tab-bar.html', true],
  ])('creates a tab modelled on the last native tab (%s)', (fixture, loggedIn) => {
    mountFixture(fixture, loggedIn);
    const created = adapter.createTab('myDEV', '#mydev');
    if (!created) throw new Error('no tab created');
    const { item, link } = created;
    expect(link.getAttribute('href')).toBe('#mydev');
    expect(link.textContent?.replace(/\s+/g, ' ').trim()).toMatch(/^myDEV( myDEV)?$/);
    expect(link.classList.contains('crayons-navigation__item')).toBe(true);
    expect(link.hasAttribute('data-feed-nav')).toBe(false);
    expect(link.hasAttribute('aria-current')).toBe(false);
    expect(link.classList.contains('crayons-navigation__item--current')).toBe(false);
    expect(item.querySelector('svg, img')).toBeNull();
    expect(item.querySelectorAll('[id]')).toHaveLength(0);
    expect(item.isConnected).toBe(false);
    // The template keeps its own markup.
    expect(adapter.findTabs().at(-1)?.textContent).not.toContain('myDEV');
  });

  it('gives the created tab no way to trigger dev.to tab behaviour', () => {
    mountFixture('logged-in/tab-bar.html', true);
    const created = adapter.createTab('myDEV', '#mydev');
    expect(created?.link.hasAttribute('data-feed-nav')).toBe(false);
    expect(created?.link.getAttribute('data-text')).toBeNull();
  });

  it('returns null / [] when there is no tab bar', () => {
    expect(adapter.findTabs()).toEqual([]);
    expect(adapter.createTab('myDEV', '#mydev')).toBeNull();
  });
});

describe('feed region', () => {
  it('logged out: hides everything in the main column except the tab bar header', () => {
    mountFixture('logged-out/feed.html');
    const region = adapter.findFeedRegion();
    expect(region).not.toBeNull();
    const nav = document.querySelector('nav');
    expect(region?.hide.some((el) => el.contains(nav))).toBe(false);
    expect(region?.hide.map((el) => el.id || el.className.split(' ')[0])).toEqual([
      'crayons-story',
      'article-index-podcast-div',
      'substories',
    ]);
    expect(region?.mount.parent.id).toBe('main-content');
    expect(region?.mount.before).toBe(region?.hide[0]);
  });

  it('logged in: hides the Preact feed mount point only', () => {
    document.body.setAttribute('data-user-status', 'logged-in');
    const main = document.createElement('main');
    main.id = 'main-content';
    const feed = document.createElement('div');
    feed.id = 'homepage-feed';
    main.append(feed);
    document.body.append(main);
    const region = adapter.findFeedRegion();
    expect(region?.hide).toEqual([feed]);
    expect(region?.mount).toEqual({ parent: main, before: feed });
  });

  it('is null without a feed', () => {
    expect(adapter.findFeedRegion()).toBeNull();
  });
});
