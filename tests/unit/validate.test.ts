import { describe, expect, it } from 'vitest';
import {
  isMeta,
  isMyDevRecord,
  isMyDevRecordInput,
  isRequest,
  isSettings,
  parseRequest,
} from '../../src/core/validate.ts';

const input = () => ({
  postId: '1234567',
  url: 'https://dev.to/someone/a-post-1abc',
  title: 'A post',
  author: {
    name: 'Some One',
    username: 'some_one',
    avatarUrl: 'https://media2.dev.to/avatar.png',
  },
  tags: ['javascript', 'webdev'],
  coverImageUrl: 'https://media2.dev.to/cover.png',
  readingTimeMinutes: 4,
  publishedAt: '2026-10-01T12:00:00Z',
  sourceFeed: 'discover',
});

const record = () => ({
  ...input(),
  addedAt: 1000,
  updatedAt: 2000,
  deletedAt: null,
  schemaVersion: 1,
});

// Applies `change` to a fresh valid input and returns the validator result.
const withInput = (change: (value: Record<string, unknown>) => void) => {
  const value: Record<string, unknown> = input();
  change(value);
  return isMyDevRecordInput(value);
};

describe('isMyDevRecordInput', () => {
  it('accepts a valid input and returns an equal copy', () => {
    expect(isMyDevRecordInput(input())).toEqual(input());
  });

  it('strips unknown fields, including forged timestamps', () => {
    const result = isMyDevRecordInput({ ...input(), addedAt: 1, deletedAt: 2, extra: 'x' });
    expect(result).toEqual(input());
    expect(result).not.toHaveProperty('addedAt');
  });

  it('trims strings', () => {
    expect(withInput((v) => (v.title = '  Hello  '))?.title).toBe('Hello');
  });

  it.each([undefined, null, 'x', 5, [], () => 1])('rejects non-object %j', (raw) => {
    expect(isMyDevRecordInput(raw)).toBeNull();
  });

  describe('postId', () => {
    it.each(['', 'abc', '12a', '-1', '1.5', ' ', '1'.repeat(21)])('rejects %j', (postId) => {
      expect(withInput((v) => (v.postId = postId))).toBeNull();
    });
    it('rejects numbers and missing values', () => {
      expect(withInput((v) => (v.postId = 123))).toBeNull();
      expect(withInput((v) => delete v.postId)).toBeNull();
    });
  });

  describe('url', () => {
    it.each([
      'javascript:alert(1)',
      'http://dev.to/x',
      'https://evil.com/x',
      'https://dev.to.evil.com/x',
      '/relative',
      '',
    ])('rejects %j', (url) => {
      expect(withInput((v) => (v.url = url))).toBeNull();
    });
    it('rejects a missing url', () => {
      expect(withInput((v) => delete v.url)).toBeNull();
    });
  });

  describe('title', () => {
    it('rejects empty, blank, too long and non-string titles', () => {
      expect(withInput((v) => (v.title = ''))).toBeNull();
      expect(withInput((v) => (v.title = '   '))).toBeNull();
      expect(withInput((v) => (v.title = 'a'.repeat(301)))).toBeNull();
      expect(withInput((v) => (v.title = 5))).toBeNull();
    });
    it('accepts the length bounds', () => {
      expect(withInput((v) => (v.title = 'a'))).not.toBeNull();
      expect(withInput((v) => (v.title = 'a'.repeat(300)))).not.toBeNull();
    });
    it('keeps markup as plain text', () => {
      const title = '<img src=x onerror=alert(1)>';
      expect(withInput((v) => (v.title = title))?.title).toBe(title);
    });
  });

  describe('author', () => {
    it('rejects a missing or non-object author', () => {
      expect(withInput((v) => delete v.author)).toBeNull();
      expect(withInput((v) => (v.author = 'x'))).toBeNull();
    });
    it('rejects bad names', () => {
      expect(withInput((v) => (v.author = { ...input().author, name: '' }))).toBeNull();
      expect(
        withInput((v) => (v.author = { ...input().author, name: 'a'.repeat(121) })),
      ).toBeNull();
    });
    it.each(['', 'has space', 'dash-name', 'a'.repeat(61), 'émile'])(
      'rejects username %j',
      (username) => {
        expect(withInput((v) => (v.author = { ...input().author, username }))).toBeNull();
      },
    );
    it('turns a bad avatar URL into null instead of rejecting', () => {
      const result = withInput(
        (v) => (v.author = { ...input().author, avatarUrl: 'javascript:1' }),
      );
      expect(result?.author.avatarUrl).toBeNull();
    });
    it('accepts a missing avatar', () => {
      const result = withInput((v) => (v.author = { name: 'A', username: 'a' }));
      expect(result?.author.avatarUrl).toBeNull();
    });
  });

  describe('tags', () => {
    it('accepts empty and 10 tags, rejects 11', () => {
      expect(withInput((v) => (v.tags = []))?.tags).toEqual([]);
      expect(
        withInput((v) => (v.tags = Array.from({ length: 10 }, (_, i) => `t${i}`))),
      ).not.toBeNull();
      expect(withInput((v) => (v.tags = Array.from({ length: 11 }, (_, i) => `t${i}`)))).toBeNull();
    });
    it.each(['JS', 'with-dash', 'with space', '', 'a'.repeat(41), 5])('rejects tag %j', (tag) => {
      expect(withInput((v) => (v.tags = ['ok', tag]))).toBeNull();
    });
    it('rejects non-arrays', () => {
      expect(withInput((v) => (v.tags = 'js'))).toBeNull();
      expect(withInput((v) => delete v.tags)).toBeNull();
    });
  });

  describe('coverImageUrl', () => {
    it('is optional', () => {
      expect(withInput((v) => delete v.coverImageUrl)?.coverImageUrl).toBeNull();
      expect(withInput((v) => (v.coverImageUrl = null))?.coverImageUrl).toBeNull();
    });
    it('turns a disallowed URL into null instead of rejecting', () => {
      expect(
        withInput((v) => (v.coverImageUrl = 'https://evil.com/x.png'))?.coverImageUrl,
      ).toBeNull();
      expect(
        withInput((v) => (v.coverImageUrl = 'data:image/png;base64,AA'))?.coverImageUrl,
      ).toBeNull();
    });
  });

  describe('readingTimeMinutes', () => {
    it('is optional and accepts 0 to 600', () => {
      expect(withInput((v) => delete v.readingTimeMinutes)?.readingTimeMinutes).toBeNull();
      expect(withInput((v) => (v.readingTimeMinutes = 0))?.readingTimeMinutes).toBe(0);
      expect(withInput((v) => (v.readingTimeMinutes = 600))?.readingTimeMinutes).toBe(600);
    });
    it.each([-1, 601, 1.5, NaN, Infinity, '4'])('rejects %j', (value) => {
      expect(withInput((v) => (v.readingTimeMinutes = value))).toBeNull();
    });
  });

  describe('publishedAt', () => {
    it('is optional', () => {
      expect(withInput((v) => delete v.publishedAt)?.publishedAt).toBeNull();
    });
    it.each(['2026-10-01', '2026-10-01T12:00:00Z', '2026-10-01T12:00:00.123+02:00'])(
      'accepts %j',
      (value) => {
        expect(withInput((v) => (v.publishedAt = value))?.publishedAt).toBe(value);
      },
    );
    it.each(['yesterday', '2026-13-45', '10/01/2026', '2026-10-01<script>', 5])(
      'rejects %j',
      (value) => {
        expect(withInput((v) => (v.publishedAt = value))).toBeNull();
      },
    );
  });

  describe('sourceFeed', () => {
    it.each(['discover', 'following', 'curated', 'latest', 'unknown'])('accepts %j', (feed) => {
      expect(withInput((v) => (v.sourceFeed = feed))?.sourceFeed).toBe(feed);
    });
    it('rejects anything else and a missing value', () => {
      expect(withInput((v) => (v.sourceFeed = 'mydev'))).toBeNull();
      expect(withInput((v) => delete v.sourceFeed)).toBeNull();
    });
  });

  it('ignores inherited properties', () => {
    const proto = { postId: '1' };
    const value = Object.create(proto) as Record<string, unknown>;
    expect(isMyDevRecordInput(value)).toBeNull();
  });
});

describe('isMyDevRecord', () => {
  it('accepts a valid active record', () => {
    expect(isMyDevRecord(record())).toEqual(record());
  });

  it('accepts a soft-deleted record', () => {
    expect(isMyDevRecord({ ...record(), deletedAt: 3000 })?.deletedAt).toBe(3000);
  });

  it.each([
    ['missing addedAt', { addedAt: undefined }],
    ['negative addedAt', { addedAt: -1 }],
    ['fractional updatedAt', { updatedAt: 1.5 }],
    ['string updatedAt', { updatedAt: '2' }],
    ['undefined deletedAt', { deletedAt: undefined }],
    ['string deletedAt', { deletedAt: 'x' }],
    ['wrong schemaVersion', { schemaVersion: 2 }],
    ['missing schemaVersion', { schemaVersion: undefined }],
  ])('rejects %s', (_name, change) => {
    expect(isMyDevRecord({ ...record(), ...change })).toBeNull();
  });

  it('rejects an invalid snapshot', () => {
    expect(isMyDevRecord({ ...record(), url: 'https://evil.com' })).toBeNull();
  });
});

describe('isMeta', () => {
  const meta = { schemaVersion: 1, installId: '3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b' };
  it('accepts valid meta and strips extras', () => {
    expect(isMeta({ ...meta, extra: 1 })).toEqual(meta);
  });
  it.each([
    { ...meta, schemaVersion: 0 },
    { ...meta, schemaVersion: 1.5 },
    { ...meta, schemaVersion: '1' },
    { ...meta, installId: 'not-a-uuid' },
    { schemaVersion: 1 },
    null,
    'x',
  ])('rejects %j', (raw) => {
    expect(isMeta(raw)).toBeNull();
  });
});

describe('isSettings', () => {
  it('accepts feature flags and strips extras', () => {
    expect(isSettings({ features: { mydev: { enabled: true, x: 1 } }, extra: 1 })).toEqual({
      features: { mydev: { enabled: true } },
    });
  });
  it('accepts no features', () => {
    expect(isSettings({ features: {} })).toEqual({ features: {} });
  });
  it.each([
    {},
    { features: [] },
    { features: { mydev: { enabled: 'yes' } } },
    { features: { mydev: true } },
    { features: { 'Bad Id': { enabled: true } } },
    { features: { __proto__x: { enabled: true } } },
    null,
  ])('rejects %j', (raw) => {
    expect(isSettings(raw)).toBeNull();
  });
});

describe('isRequest / parseRequest', () => {
  it('accepts each request type', () => {
    expect(isRequest({ v: 1, type: 'mydev/list' })).toEqual({ v: 1, type: 'mydev/list' });
    expect(isRequest({ v: 1, type: 'mydev/activeIds' })).toEqual({
      v: 1,
      type: 'mydev/activeIds',
    });
    expect(isRequest({ v: 1, type: 'mydev/remove', postId: '42' })).toEqual({
      v: 1,
      type: 'mydev/remove',
      postId: '42',
    });
    expect(isRequest({ v: 1, type: 'mydev/add', record: input() })).toEqual({
      v: 1,
      type: 'mydev/add',
      record: input(),
    });
  });

  it('strips forged timestamps from an add request', () => {
    const request = isRequest({
      v: 1,
      type: 'mydev/add',
      record: { ...input(), addedAt: 1, deletedAt: 2, schemaVersion: 9 },
    });
    expect(request).toEqual({ v: 1, type: 'mydev/add', record: input() });
  });

  it('reports why a request was rejected', () => {
    expect(parseRequest(null)).toEqual({ ok: false, code: 'invalid-request' });
    expect(parseRequest('x')).toEqual({ ok: false, code: 'invalid-request' });
    expect(parseRequest({ v: 2, type: 'mydev/list' })).toEqual({
      ok: false,
      code: 'unsupported-version',
    });
    expect(parseRequest({ type: 'mydev/list' })).toEqual({
      ok: false,
      code: 'unsupported-version',
    });
    expect(parseRequest({ v: 1, type: 'mydev/nope' })).toEqual({
      ok: false,
      code: 'unknown-type',
    });
    expect(parseRequest({ v: 1 })).toEqual({ ok: false, code: 'unknown-type' });
    expect(parseRequest({ v: 1, type: 'mydev/remove', postId: 'abc' })).toEqual({
      ok: false,
      code: 'invalid-request',
    });
    expect(parseRequest({ v: 1, type: 'mydev/add', record: { postId: '1' } })).toEqual({
      ok: false,
      code: 'invalid-request',
    });
    expect(isRequest({ v: 1, type: 'mydev/nope' })).toBeNull();
  });
});
