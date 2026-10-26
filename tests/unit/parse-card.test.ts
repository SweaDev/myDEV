import { beforeEach, describe, expect, it } from 'vitest';
import { parseCard, postIdOf } from '../../src/site/devto/parse-card.ts';
import { mountFixture } from '../helpers/fixtures.ts';

const MEDIA = 'https://media2.dev.to/dynamic/image/width=';

function card(fixture: string): Element {
  mountFixture(`logged-out/${fixture}.html`);
  const el = document.querySelector('.crayons-story');
  if (!el) throw new Error(`no card in ${fixture}`);
  return el;
}

/** Applies `change` to a fresh copy of the normal card and parses it. */
function parseMutated(change: (card: Element) => void) {
  const el = card('card');
  change(el);
  return parseCard(el, 'latest');
}

beforeEach(() => document.body.replaceChildren());

describe('parseCard on real fixtures', () => {
  it('parses a normal card', () => {
    const result = parseCard(card('card'), 'relevant');
    expect(result).toMatchObject({
      postId: '4917021',
      url: 'https://dev.to/hemapriya_kanagala/dev-pet-corner-3-show-us-your-pets-35n',
      title: '🐾 DEV Pet Corner #3: Show Us Your Pets!',
      author: { name: 'Hemapriya Kanagala', username: 'hemapriya_kanagala' },
      tags: ['discuss', 'community', 'watercooler', 'pets'],
      readingTimeMinutes: 3,
      publishedAt: '2026-10-25T18:28:32Z',
      sourceFeed: 'relevant',
    });
    expect(result?.author.avatarUrl).toMatch(new RegExp(`^${MEDIA}90,height=90`));
    expect(result?.coverImageUrl).toMatch(new RegExp(`^${MEDIA}1000,height=420`));
  });

  it('parses the featured card', () => {
    const result = parseCard(card('featured-card'), 'discover');
    expect(result).toMatchObject({
      postId: '4913784',
      title: "I Earned a Seat at GitHub Universe. It'll Stay Empty, and That's Not Fair",
      author: { name: 'Giorgi Kobaidze', username: 'georgekobaidze' },
      tags: ['conference', 'github'],
      readingTimeMinutes: 3,
      sourceFeed: 'discover',
    });
    expect(result?.coverImageUrl).toContain('5ofbuqqo9pzzeizx3l7s');
  });

  it("does not leak the subscriber badge into the author's name", () => {
    expect(parseCard(card('card-subscriber'), 'top')?.author).toMatchObject({
      name: 'Dhruv Jani',
      username: 'dj29',
    });
  });

  it('parses a card without tags', () => {
    const result = parseCard(card('card-no-tags'), 'latest');
    expect(result?.tags).toEqual([]);
    expect(result?.postId).toBe('4915318');
  });

  it('records the feed it is given', () => {
    expect(parseCard(card('card'), 'unknown')?.sourceFeed).toBe('unknown');
  });

  it('produces a value the store accepts as-is', () => {
    const el = card('card');
    const first = parseCard(el, 'relevant');
    expect(first).not.toBeNull();
    expect(JSON.stringify(first)).not.toMatch(/<|javascript:/i);
  });
});

describe('postIdOf', () => {
  it('reads data-feed-content-id', () => {
    expect(postIdOf(card('card'))).toBe('4917021');
  });

  it.each(['', 'abc', '12 3', '-1', '1'.repeat(21)])('rejects %j', (id) => {
    const el = card('card');
    el.setAttribute('data-feed-content-id', id);
    expect(postIdOf(el)).toBeNull();
  });
});

describe('parseCard on damaged or hostile cards', () => {
  it('returns null when the post ID is missing or malformed', () => {
    expect(parseMutated((el) => el.removeAttribute('data-feed-content-id'))).toBeNull();
    expect(parseMutated((el) => el.setAttribute('data-feed-content-id', 'x'))).toBeNull();
  });

  it('returns null without a title link or title text', () => {
    expect(
      parseMutated((el) => el.querySelector('h2.crayons-story__title a')?.remove()),
    ).toBeNull();
    expect(
      parseMutated((el) => {
        const link = el.querySelector('h2.crayons-story__title a');
        if (link) link.textContent = '   ';
      }),
    ).toBeNull();
  });

  it.each(['javascript:alert(1)', 'https://evil.com/post', 'http://dev.to/post', ''])(
    'returns null when the post URL is %j',
    (href) => {
      expect(
        parseMutated((el) =>
          el.querySelector('h2.crayons-story__title a')?.setAttribute('href', href),
        ),
      ).toBeNull();
    },
  );

  it('resolves a site-relative post URL', () => {
    const result = parseMutated((el) =>
      el.querySelector('h2.crayons-story__title a')?.setAttribute('href', '/someone/a-post-1abc'),
    );
    expect(result?.url).toBe('https://dev.to/someone/a-post-1abc');
  });

  it('returns null without an author name or username', () => {
    expect(
      parseMutated((el) => el.querySelector('.crayons-story__secondary')?.remove()),
    ).toBeNull();
    expect(
      parseMutated((el) => el.querySelector('.crayons-story__author-pic a')?.remove()),
    ).toBeNull();
    expect(
      parseMutated((el) =>
        el.querySelector('.crayons-story__author-pic a')?.setAttribute('href', '/evil/../path'),
      ),
    ).toBeNull();
  });

  it('drops hostile or missing image URLs instead of failing', () => {
    const hostile = parseMutated((el) => {
      el.querySelector('.crayons-story__author-pic img')?.setAttribute(
        'src',
        'javascript:alert(1)',
      );
      el.querySelector('h2.crayons-story__title a')?.setAttribute(
        'data-preload-image',
        'https://evil.com/x.png',
      );
    });
    expect(hostile?.author.avatarUrl).toBeNull();
    expect(hostile?.coverImageUrl).toBeNull();

    const noCover = parseMutated((el) =>
      el.querySelector('h2.crayons-story__title a')?.removeAttribute('data-preload-image'),
    );
    expect(noCover?.coverImageUrl).toBeNull();
    expect(noCover?.title).toContain('DEV Pet Corner');
  });

  it("falls back to the featured card's cover <img>", () => {
    const el = card('featured-card');
    el.querySelector('h2.crayons-story__title a')?.removeAttribute('data-preload-image');
    expect(parseCard(el, 'relevant')?.coverImageUrl).toContain('5ofbuqqo9pzzeizx3l7s');
  });

  it('skips invalid tags, duplicates and caps at ten', () => {
    const result = parseMutated((el) => {
      const tags = el.querySelector('.crayons-story__tags');
      if (!tags) return;
      tags.replaceChildren();
      const hrefs = [
        '/t/ok',
        '/t/Bad-Tag',
        '/t/ok',
        '/other/x',
        '/t/<script>',
        ...Array.from({ length: 12 }, (_, i) => `/t/t${i}`),
      ];
      for (const href of hrefs) {
        const a = document.createElement('a');
        a.className = 'crayons-tag';
        a.setAttribute('href', href);
        tags.append(a);
      }
    });
    expect(result?.tags).toHaveLength(10);
    expect(result?.tags.slice(0, 3)).toEqual(['ok', 't0', 't1']);
  });

  it('treats missing or odd reading time and dates as null', () => {
    const none = parseMutated((el) => {
      el.querySelector('.crayons-story__save small')?.remove();
      el.querySelector('time')?.setAttribute('datetime', 'last tuesday');
    });
    expect(none?.readingTimeMinutes).toBeNull();
    expect(none?.publishedAt).toBeNull();
    const odd = parseMutated((el) => {
      const small = el.querySelector('.crayons-story__save small');
      if (small) small.textContent = '  12 MIN READ ';
    });
    expect(odd?.readingTimeMinutes).toBe(12);
  });

  it('keeps markup in text fields as inert text', () => {
    const title = '<img src=x onerror=alert(1)> hello';
    const result = parseMutated((el) => {
      const link = el.querySelector('h2.crayons-story__title a');
      if (link) link.textContent = title;
    });
    expect(result?.title).toBe(title);
  });

  it('never throws for odd input', () => {
    expect(parseCard(document.createElement('div'), 'latest')).toBeNull();
    expect(
      parseCard(document.createElementNS('http://www.w3.org/2000/svg', 'svg'), 'latest'),
    ).toBeNull();
  });
});
