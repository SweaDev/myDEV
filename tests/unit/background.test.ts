import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startBackground } from '../../src/background/start.ts';
import { send } from '../../src/core/messages.ts';
import type { MyDevRecordInput } from '../../src/core/types.ts';
import { META_KEY } from '../../src/storage/schema.ts';
import { createChromeMock, type ChromeMock } from '../helpers/chrome-mock.ts';

const record: MyDevRecordInput = {
  postId: '1',
  url: 'https://dev.to/someone/post-1',
  title: 'Post 1',
  author: { name: 'Some One', username: 'someone', avatarUrl: null },
  tags: [],
  coverImageUrl: null,
  readingTimeMinutes: null,
  publishedAt: null,
  sourceFeed: 'discover',
};

let mock: ChromeMock;

beforeEach(() => {
  mock = createChromeMock();
  mock.install();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  mock.uninstall();
  vi.restoreAllMocks();
});

describe('startBackground', () => {
  it('initialises storage and serves requests end to end', async () => {
    const { ready } = startBackground();
    await ready;
    expect(mock.data.has(META_KEY)).toBe(true);

    expect(await send({ v: 1, type: 'mydev/add', record })).toEqual({ ok: true, data: null });
    expect(await send({ v: 1, type: 'mydev/activeIds' })).toEqual({ ok: true, data: ['1'] });
  });

  it('answers a request sent before initialisation completes', async () => {
    let finishInit!: () => void;
    const init = new Promise<void>((resolve) => (finishInit = resolve));
    startBackground({ init: () => init });

    const pending = send({ v: 1, type: 'mydev/activeIds' });
    let settled = false;
    void pending.then(() => (settled = true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);

    finishInit();
    expect(await pending).toEqual({ ok: true, data: [] });
  });

  it('answers with an internal error if initialisation fails', async () => {
    const { ready } = startBackground({ init: () => Promise.reject(new Error('boom')) });
    await expect(ready).rejects.toThrow('boom');
    const response = await send({ v: 1, type: 'mydev/list' });
    expect(response).toMatchObject({ ok: false, error: { code: 'internal' } });
  });

  it('rejects messages from foreign senders', async () => {
    const { ready } = startBackground();
    await ready;
    const response = await mock.sendFrom(
      { v: 1, type: 'mydev/list' },
      { id: 'other-extension', url: 'https://dev.to/' },
    );
    expect(response).toMatchObject({ ok: false, error: { code: 'forbidden-sender' } });
  });
});
