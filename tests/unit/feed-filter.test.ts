import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeatureContext } from '../../src/core/types.ts';
import { startFeedFilter } from '../../src/features/mydev/feed-filter.ts';
import { createDevtoAdapter } from '../../src/site/devto/adapter.ts';
import { createFakeStore, type FakeStore } from '../helpers/fake-store.ts';
import { mountFixture, fixtureHtml } from '../helpers/fixtures.ts';

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), warnOnce: vi.fn() };
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const site = createDevtoAdapter();

let controller: AbortController;

function ctx(store: FakeStore): FeatureContext {
  return { site, store, log, signal: controller.signal };
}

const card = (id: string) => document.querySelector(`[data-feed-content-id="${id}"]`);
const hidden = (id: string) => card(id)?.hasAttribute('data-mydev-hidden');
const processed = (id: string) => card(id)?.getAttribute('data-mydev-processed');

/** Appends a card cloned from the fixture with a different post ID, like infinite scroll does. */
function appendCard(id: string): Element {
  const parsed = new DOMParser().parseFromString(fixtureHtml('logged-out/card.html'), 'text/html');
  const next = parsed.body.querySelector('.crayons-story');
  if (!next) throw new Error('fixture has no card');
  next.setAttribute('data-feed-content-id', id);
  document.querySelector('#substories')?.append(next);
  return next;
}

beforeEach(() => {
  vi.clearAllMocks();
  controller = new AbortController();
  mountFixture('logged-out/feed.html');
});

describe('first pass', () => {
  it('hides cards whose post is in myDEV and leaves the rest', async () => {
    const started = await startFeedFilter(ctx(createFakeStore(['4917021', '4913784'])));
    expect(started).toBe(true);
    expect(hidden('4917021')).toBe(true);
    expect(hidden('4913784')).toBe(true);
    expect(hidden('4911807')).toBe(false);
    expect(hidden('4915318')).toBe(false);
  });

  it('marks every card as processed with its post ID', async () => {
    await startFeedFilter(ctx(createFakeStore()));
    expect(['4913784', '4917021', '4911807', '4915318'].map(processed)).toEqual([
      '4913784',
      '4917021',
      '4911807',
      '4915318',
    ]);
  });

  it('waits for the ID set before touching anything', async () => {
    const store = createFakeStore(['4917021'], true);
    const pending = startFeedFilter(ctx(store));
    await flush();
    expect(processed('4917021')).toBeNull();
    expect(hidden('4917021')).toBe(false);
    store.resolveReady();
    expect(await pending).toBe(true);
    expect(hidden('4917021')).toBe(true);
  });

  it('fails open when the ID set cannot be loaded', async () => {
    const store = createFakeStore(['4917021'], true);
    const pending = startFeedFilter(ctx(store));
    store.rejectReady(new Error('boom'));
    expect(await pending).toBe(false);
    expect(hidden('4917021')).toBe(false);
    expect(processed('4917021')).toBeNull();
  });

  it('fails open and warns once when there is no feed container', async () => {
    document.body.replaceChildren();
    expect(await startFeedFilter(ctx(createFakeStore(['1'])))).toBe(false);
    expect(log.warnOnce).toHaveBeenCalledWith('no-feed-container', expect.any(String));
  });

  it('does nothing if aborted while waiting', async () => {
    const store = createFakeStore(['4917021'], true);
    const pending = startFeedFilter(ctx(store));
    controller.abort();
    store.resolveReady();
    expect(await pending).toBe(false);
    expect(hidden('4917021')).toBe(false);
  });
});

describe('cards added later (infinite scroll)', () => {
  it('hides new cards that are in myDEV and marks the others', async () => {
    await startFeedFilter(ctx(createFakeStore(['555'])));
    const hide = appendCard('555');
    const keep = appendCard('556');
    await flush();
    expect(hide.hasAttribute('data-mydev-hidden')).toBe(true);
    expect(keep.hasAttribute('data-mydev-hidden')).toBe(false);
    expect(keep.getAttribute('data-mydev-processed')).toBe('556');
  });

  it('finds cards nested inside an added wrapper', async () => {
    await startFeedFilter(ctx(createFakeStore(['777'])));
    const wrapper = document.createElement('div');
    wrapper.append(
      ...new DOMParser().parseFromString(fixtureHtml('logged-out/card.html'), 'text/html').body
        .childNodes,
    );
    wrapper.querySelector('.crayons-story')?.setAttribute('data-feed-content-id', '777');
    document.querySelector('#substories')?.append(wrapper);
    await flush();
    expect(hidden('777')).toBe(true);
  });

  it('ignores non-post nodes and text', async () => {
    await startFeedFilter(ctx(createFakeStore(['1'])));
    document.querySelector('#substories')?.append('text', document.createElement('div'));
    await flush();
    expect(document.querySelectorAll('[data-mydev-hidden]')).toHaveLength(0);
  });

  it('does not process a card twice', async () => {
    const store = createFakeStore();
    await startFeedFilter(ctx(store));
    const spy = vi.spyOn(site, 'hideCard');
    // Re-attaching the same node triggers the observer again.
    const first = card('4917021');
    if (!first) throw new Error('no card');
    first.parentElement?.append(first);
    await flush();
    store.ids.add('4917021');
    first.parentElement?.append(first);
    await flush();
    expect(spy).not.toHaveBeenCalled();
    expect(hidden('4917021')).toBe(false);
  });

  it('reprocesses a card element the page reuses for another post', async () => {
    const store = createFakeStore(['4917021']);
    await startFeedFilter(ctx(store));
    expect(hidden('4917021')).toBe(true);
    const reused = card('4917021');
    if (!reused) throw new Error('no card');
    reused.setAttribute('data-feed-content-id', '999');
    reused.parentElement?.append(reused);
    await flush();
    expect(reused.getAttribute('data-mydev-processed')).toBe('999');
    expect(reused.hasAttribute('data-mydev-hidden')).toBe(false);
  });
});

describe('changes from another tab', () => {
  it('hides cards already on screen when a post is added elsewhere', async () => {
    const store = createFakeStore();
    await startFeedFilter(ctx(store));
    expect(hidden('4911807')).toBe(false);
    store.push({ added: ['4911807'], removed: [] });
    expect(hidden('4911807')).toBe(true);
    expect(hidden('4915318')).toBe(false);
  });

  it('does not re-insert or unhide anything when a post is removed elsewhere', async () => {
    const store = createFakeStore(['4917021']);
    await startFeedFilter(ctx(store));
    store.push({ added: [], removed: ['4917021'] });
    expect(hidden('4917021')).toBe(true);
  });

  it('hides a card that arrives after the post was added elsewhere', async () => {
    const store = createFakeStore();
    await startFeedFilter(ctx(store));
    store.push({ added: ['888'], removed: [] });
    const next = appendCard('888');
    await flush();
    expect(next.hasAttribute('data-mydev-hidden')).toBe(true);
  });
});

describe('cleanup on abort', () => {
  it('stops observing and listening, and removes its markers', async () => {
    const store = createFakeStore(['4917021']);
    await startFeedFilter(ctx(store));
    controller.abort();
    expect(document.querySelectorAll('[data-mydev-hidden], [data-mydev-processed]')).toHaveLength(
      0,
    );

    const late = appendCard('4917021');
    store.push({ added: ['4911807'], removed: [] });
    await flush();
    expect(late.hasAttribute('data-mydev-hidden')).toBe(false);
    expect(late.hasAttribute('data-mydev-processed')).toBe(false);
    expect(hidden('4911807')).toBe(false);
  });
});
