import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Route } from '../../src/core/types.ts';
import {
  activeTabFeed,
  feedForPath,
  onRouteChange,
  parseRoute,
  routesEqual,
} from '../../src/site/devto/routes.ts';
import { mountFixture, setUrl } from '../helpers/fixtures.ts';

const home = (feed: string): Route => ({ kind: 'home', feed }) as Route;
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  document.body.replaceChildren();
  document.body.removeAttribute('data-user-status');
  setUrl('/');
});

afterEach(() => vi.restoreAllMocks());

describe('feedForPath', () => {
  it.each([
    ['/', false, 'relevant'],
    ['/', true, 'discover'],
    ['', false, 'relevant'],
    ['/discover', true, 'discover'],
    ['/following', true, 'following'],
    ['/following/latest', true, 'following'],
    ['/curated', true, 'curated'],
    ['/latest', false, 'latest'],
    ['/latest', true, 'latest'],
    ['/latest_less_filtered', true, 'latest'],
    ['/top/week', false, 'top'],
    ['/top/month', true, 'top'],
    ['/top/year', true, 'top'],
    ['/top/infinity', true, 'top'],
    ['/discover/', true, 'discover'],
  ])('%s (loggedIn=%s) → %s', (path, loggedIn, feed) => {
    expect(feedForPath(path, loggedIn)).toBe(feed);
  });

  it.each([
    '/t/javascript',
    '/someone/a-post-1abc',
    '/top',
    '/top/decade',
    '/latest/extra',
    '/dashboard',
    '/readinglist',
    '/discoverx',
  ])('treats %s as not a home feed', (path) => {
    expect(feedForPath(path, true)).toBeNull();
    expect(feedForPath(path, false)).toBeNull();
  });
});

describe('parseRoute (URL only, no tab bar)', () => {
  it('maps feed URLs to home routes', () => {
    expect(parseRoute({ pathname: '/latest', hash: '' }, document)).toEqual(home('latest'));
    expect(parseRoute({ pathname: '/', hash: '' }, document)).toEqual(home('relevant'));
  });

  it('uses the login state for /', () => {
    document.body.setAttribute('data-user-status', 'logged-in');
    expect(parseRoute({ pathname: '/', hash: '' }, document)).toEqual(home('discover'));
  });

  it('returns other for non-home pages', () => {
    expect(parseRoute({ pathname: '/t/javascript', hash: '' }, document)).toEqual({
      kind: 'other',
    });
    expect(parseRoute({ pathname: '/a/post-1', hash: '#comments' }, document)).toEqual({
      kind: 'other',
    });
  });

  it('opens the myDEV view for #mydev on home-feed paths only', () => {
    expect(parseRoute({ pathname: '/', hash: '#mydev' }, document)).toEqual(home('mydev'));
    expect(parseRoute({ pathname: '/latest', hash: '#mydev' }, document)).toEqual(home('mydev'));
    expect(parseRoute({ pathname: '/a/post-1', hash: '#mydev' }, document)).toEqual({
      kind: 'other',
    });
    expect(parseRoute({ pathname: '/', hash: '#MYDEV' }, document)).toEqual(home('relevant'));
    expect(parseRoute({ pathname: '/', hash: '#other' }, document)).toEqual(home('relevant'));
  });
});

describe('activeTabFeed', () => {
  it('reads the logged-out tab bar (aria-current)', () => {
    mountFixture('logged-out/tab-bar.html');
    expect(activeTabFeed(document)).toBe('relevant');
  });

  it('reads the logged-out Top sub-navigation as top', () => {
    mountFixture('logged-out/tab-bar-top.html');
    expect(activeTabFeed(document)).toBe('top');
  });

  it('reads the logged-in pill tabs (data-feed-nav + current class)', () => {
    mountFixture('logged-in/tab-bar.html', true);
    expect(activeTabFeed(document)).toBe('discover');
  });

  it('follows the highlighted logged-in tab', () => {
    mountFixture('logged-in/tab-bar.html', true);
    const tabs = document.querySelectorAll('a[data-feed-nav]');
    tabs[0]?.classList.remove('crayons-navigation__item--current');
    tabs[3]?.classList.add('crayons-navigation__item--current');
    expect(activeTabFeed(document)).toBe('latest');
  });

  it('is null without a tab bar, without a highlighted tab, and for unknown tab values', () => {
    expect(activeTabFeed(document)).toBeNull();
    mountFixture('logged-in/tab-bar.html', true);
    document
      .querySelector('.crayons-navigation__item--current')
      ?.classList.remove('crayons-navigation__item--current');
    expect(activeTabFeed(document)).toBeNull();
    mountFixture('logged-in/tab-bar.html', true);
    document.querySelector('a[data-feed-nav]')?.setAttribute('data-feed-nav', 'bogus');
    expect(activeTabFeed(document)).toBeNull();
  });

  it('ignores the dropdown items of the logged-in tab bar', () => {
    mountFixture('logged-in/tab-bar.html', true);
    document
      .querySelector('.crayons-navigation__item--current')
      ?.classList.remove('crayons-navigation__item--current');
    document
      .querySelector('#feed-dropdown-menu a')
      ?.classList.add('crayons-navigation__item--current');
    expect(activeTabFeed(document)).toBeNull();
  });
});

describe('parseRoute (with tab bar)', () => {
  it('prefers the highlighted tab over the URL', () => {
    mountFixture('logged-out/tab-bar.html');
    // Logged out, dev.to serves its normal page at /following; the highlighted tab is Relevant.
    expect(parseRoute({ pathname: '/following', hash: '' }, document)).toEqual(home('relevant'));
  });

  it('falls back to the URL when no tab is highlighted', () => {
    mountFixture('logged-in/tab-bar.html', true);
    document
      .querySelector('.crayons-navigation__item--current')
      ?.classList.remove('crayons-navigation__item--current');
    expect(parseRoute({ pathname: '/curated', hash: '' }, document)).toEqual(home('curated'));
  });

  it('still opens the myDEV view when a tab is highlighted', () => {
    mountFixture('logged-in/tab-bar.html', true);
    expect(parseRoute({ pathname: '/discover', hash: '#mydev' }, document)).toEqual(home('mydev'));
  });
});

describe('routesEqual', () => {
  it('compares kind and feed', () => {
    expect(routesEqual(home('latest'), home('latest'))).toBe(true);
    expect(routesEqual(home('latest'), home('top'))).toBe(false);
    expect(routesEqual({ kind: 'other' }, { kind: 'other' })).toBe(true);
    expect(routesEqual({ kind: 'other' }, home('latest'))).toBe(false);
  });
});

describe('onRouteChange', () => {
  it('fires once for a popstate that changes the route, not for repeats', async () => {
    setUrl('/latest');
    const cb = vi.fn();
    const stop = onRouteChange(cb);
    setUrl('/discover');
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flush();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(home('discover'));
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flush();
    expect(cb).toHaveBeenCalledTimes(1);
    stop();
  });

  it('reports hash changes into and out of the myDEV view', async () => {
    const cb = vi.fn();
    const stop = onRouteChange(cb);
    setUrl('/#mydev');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flush();
    setUrl('/');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flush();
    expect(cb.mock.calls.map(([route]) => route)).toEqual([home('mydev'), home('relevant')]);
    stop();
  });

  it('reports navigation to and from non-home pages', async () => {
    const cb = vi.fn();
    const stop = onRouteChange(cb);
    setUrl('/someone/a-post-1abc');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flush();
    expect(cb).toHaveBeenLastCalledWith({ kind: 'other' });
    stop();
  });

  it('detects dev.to soft navigation (pushState + tab highlight, no event)', async () => {
    mountFixture('logged-in/tab-bar.html', true);
    const main = document.createElement('main');
    main.id = 'main-content';
    main.append(...document.body.childNodes);
    document.body.append(main);
    setUrl('/discover');

    const cb = vi.fn();
    const stop = onRouteChange(cb);
    // What dev.to's tab click handler does: pushState, then move the highlight.
    setUrl('/following');
    document
      .querySelector('a[data-feed-nav="discover"]')
      ?.classList.remove('crayons-navigation__item--current');
    document
      .querySelector('a[data-feed-nav="following"]')
      ?.classList.add('crayons-navigation__item--current');
    await flush();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(home('following'));
    stop();
  });

  it('ignores unrelated mutations', async () => {
    mountFixture('logged-out/feed.html');
    const cb = vi.fn();
    const stop = onRouteChange(cb);
    document.querySelector('#substories')?.append(document.createElement('div'));
    await flush();
    expect(cb).not.toHaveBeenCalled();
    stop();
  });

  it('picks up a replaced content root', async () => {
    mountFixture('logged-in/tab-bar.html', true);
    const first = document.createElement('main');
    first.id = 'main-content';
    first.append(...document.body.childNodes);
    document.body.append(first);
    setUrl('/discover');
    const cb = vi.fn();
    const stop = onRouteChange(cb);

    const second = first.cloneNode(true) as HTMLElement;
    first.replaceWith(second);
    await flush();
    setUrl('/curated');
    second
      .querySelector('a[data-feed-nav="discover"]')
      ?.classList.remove('crayons-navigation__item--current');
    second
      .querySelector('a[data-feed-nav="curated"]')
      ?.classList.add('crayons-navigation__item--current');
    await flush();
    expect(cb).toHaveBeenLastCalledWith(home('curated'));
    stop();
  });

  it('stops after unsubscribe', async () => {
    const cb = vi.fn();
    const stop = onRouteChange(cb);
    stop();
    setUrl('/latest');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flush();
    expect(cb).not.toHaveBeenCalled();
  });
});
