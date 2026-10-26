import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRouter, isAllowedSender, type Router } from '../../src/background/router.ts';
import type { MyDevRecordInput } from '../../src/core/types.ts';
import { LocalMyDevStore } from '../../src/storage/local-mydev-store.ts';
import { StoreError, type MyDevStore } from '../../src/storage/mydev-store.ts';
import { createChromeMock, EXTENSION_ID, type ChromeMock } from '../helpers/chrome-mock.ts';

const quietLog = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  warnOnce: vi.fn(),
};
const devto = { id: EXTENSION_ID, url: 'https://dev.to/' };

const input = (postId: string): MyDevRecordInput => ({
  postId,
  url: `https://dev.to/someone/post-${postId}`,
  title: `Post ${postId}`,
  author: { name: 'Some One', username: 'someone', avatarUrl: null },
  tags: [],
  coverImageUrl: null,
  readingTimeMinutes: null,
  publishedAt: null,
  sourceFeed: 'latest',
});

let mock: ChromeMock;
let router: Router;
let clock: number;

beforeEach(() => {
  mock = createChromeMock();
  mock.install();
  clock = 1;
  vi.clearAllMocks();
  router = createRouter(new LocalMyDevStore({ now: () => clock++, log: quietLog }), quietLog);
});

afterEach(() => mock.uninstall());

describe('isAllowedSender', () => {
  it.each([
    [{ id: EXTENSION_ID, url: 'https://dev.to/' }, true],
    [{ id: EXTENSION_ID, url: 'https://dev.to/t/javascript?x=1#y' }, true],
    [{ id: EXTENSION_ID, url: `chrome-extension://${EXTENSION_ID}/options.html` }, true],
    [{ id: 'other-extension', url: 'https://dev.to/' }, false],
    [{ url: 'https://dev.to/' }, false],
    [{ id: EXTENSION_ID }, false],
    [{ id: EXTENSION_ID, url: 'https://evil.com/' }, false],
    [{ id: EXTENSION_ID, url: 'https://dev.to.evil.com/' }, false],
    [{ id: EXTENSION_ID, url: 'http://dev.to/' }, false],
    [{ id: EXTENSION_ID, url: 'chrome-extension://someone-else/page.html' }, false],
    [undefined, false],
  ])('%j → %s', (sender, allowed) => {
    expect(isAllowedSender(sender)).toBe(allowed);
  });
});

describe('createRouter rejections', () => {
  it('rejects a foreign sender before looking at the message', async () => {
    const store = { listActive: vi.fn() } as unknown as MyDevStore;
    const response = await createRouter(store, quietLog).handle(
      { v: 1, type: 'mydev/list' },
      { id: 'other-extension', url: 'https://dev.to/' },
    );
    expect(response).toEqual({
      ok: false,
      error: { code: 'forbidden-sender', message: 'Sender not allowed' },
    });
    expect(store.listActive).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown type', { v: 1, type: 'mydev/nuke' }, 'unknown-type'],
    ['wrong version', { v: 2, type: 'mydev/list' }, 'unsupported-version'],
    ['missing version', { type: 'mydev/list' }, 'unsupported-version'],
    ['bad remove payload', { v: 1, type: 'mydev/remove', postId: '../x' }, 'invalid-request'],
    ['bad add payload', { v: 1, type: 'mydev/add', record: { postId: '1' } }, 'invalid-request'],
    [
      'hostile url in add',
      { v: 1, type: 'mydev/add', record: { ...input('1'), url: 'javascript:1' } },
      'invalid-request',
    ],
    ['non-object', 'hello', 'invalid-request'],
    ['null', null, 'invalid-request'],
  ])('rejects %s', async (_name, message, code) => {
    const response = await router.handle(message, devto);
    expect(response).toMatchObject({ ok: false, error: { code } });
  });

  it('writes nothing for rejected requests', async () => {
    await router.handle({ v: 1, type: 'mydev/add', record: { postId: '1' } }, devto);
    expect(mock.data.size).toBe(0);
  });
});

describe('createRouter dispatch', () => {
  it('adds, lists, lists active IDs and removes', async () => {
    expect(await router.handle({ v: 1, type: 'mydev/add', record: input('1') }, devto)).toEqual({
      ok: true,
      data: null,
    });
    await router.handle({ v: 1, type: 'mydev/add', record: input('2') }, devto);

    expect(await router.handle({ v: 1, type: 'mydev/activeIds' }, devto)).toEqual({
      ok: true,
      data: ['2', '1'],
    });
    const list = await router.handle({ v: 1, type: 'mydev/list' }, devto);
    expect(list.ok && (list.data as { postId: string }[]).map((r) => r.postId)).toEqual(['2', '1']);

    expect(await router.handle({ v: 1, type: 'mydev/remove', postId: '2' }, devto)).toEqual({
      ok: true,
      data: null,
    });
    expect(await router.handle({ v: 1, type: 'mydev/activeIds' }, devto)).toEqual({
      ok: true,
      data: ['1'],
    });
  });

  it('does not let a request forge timestamps', async () => {
    const forged = { ...input('1'), addedAt: 1, deletedAt: 2 };
    await router.handle({ v: 1, type: 'mydev/add', record: forged }, devto);
    const list = await router.handle({ v: 1, type: 'mydev/list' }, devto);
    expect(list.ok && (list.data as { deletedAt: unknown }[])[0]?.deletedAt).toBeNull();
  });

  it('turns StoreErrors into failures carrying their code', async () => {
    const store = {
      add: vi.fn().mockRejectedValue(new StoreError('quota-exceeded', 'full')),
    } as unknown as MyDevStore;
    const response = await createRouter(store, quietLog).handle(
      { v: 1, type: 'mydev/add', record: input('1') },
      devto,
    );
    expect(response).toEqual({ ok: false, error: { code: 'quota-exceeded', message: 'full' } });
  });

  it('hides unexpected error details behind an internal error', async () => {
    const store = {
      listActive: vi.fn().mockRejectedValue(new Error('secret stack detail')),
    } as unknown as MyDevStore;
    const response = await createRouter(store, quietLog).handle(
      { v: 1, type: 'mydev/list' },
      devto,
    );
    expect(response).toEqual({ ok: false, error: { code: 'internal', message: 'Internal error' } });
    expect(quietLog.error).toHaveBeenCalled();
  });
});
