import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startBackground } from '../../src/background/start.ts';
import {
  createStoreClient,
  StoreClientError,
  type DisposableStoreClient,
} from '../../src/content/store-client.ts';
import type { MyDevRecordInput, StoreChange } from '../../src/core/types.ts';
import { LocalMyDevStore } from '../../src/storage/local-mydev-store.ts';
import { itemKey } from '../../src/storage/schema.ts';
import { createChromeMock, type ChromeMock } from '../helpers/chrome-mock.ts';

const quietLog = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  warnOnce: vi.fn(),
};

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
let clock: number;
let clients: DisposableStoreClient[];
const newClient = () => {
  const client = createStoreClient(quietLog);
  clients.push(client);
  return client;
};
const collect = (client: DisposableStoreClient) => {
  const changes: StoreChange[] = [];
  client.onChange((change) => changes.push(change));
  return changes;
};
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
  mock = createChromeMock();
  mock.install();
  clock = 1;
  clients = [];
  vi.clearAllMocks();
  const { ready } = startBackground({
    store: new LocalMyDevStore({ now: () => clock++, log: quietLog }),
  });
  await ready;
});

afterEach(() => {
  for (const client of clients) client.dispose();
  mock.uninstall();
  vi.restoreAllMocks();
});

describe('ready / has', () => {
  it('loads the active IDs into a set', async () => {
    const seed = newClient();
    await seed.ready;
    await seed.add(input('1'));
    await seed.add(input('2'));
    await seed.remove('2');

    const client = newClient();
    expect(client.has('1')).toBe(false);
    await client.ready;
    expect(client.has('1')).toBe(true);
    expect(client.has('2')).toBe(false);
    expect(client.has('3')).toBe(false);
  });

  it('rejects ready when the background is unreachable', async () => {
    mock.messageListeners.clear();
    vi.spyOn(mock.chrome.runtime, 'sendMessage').mockRejectedValue(new Error('no background'));
    const client = newClient();
    await expect(client.ready).rejects.toMatchObject({ code: 'unavailable' });
    expect(client.has('1')).toBe(false);
  });

  it('keeps changes that arrive while the initial load is in flight', async () => {
    const seed = newClient();
    await seed.ready;
    await seed.add(input('1'));

    const client = newClient();
    // A newer record lands in storage before the load response is processed.
    await chrome.storage.local.set({
      [itemKey('9')]: { ...(mock.data.get(itemKey('1')) as object), postId: '9' },
    });
    await client.ready;
    expect(client.has('1')).toBe(true);
    expect(client.has('9')).toBe(true);
  });
});

describe('add / remove', () => {
  it('updates the set immediately and emits one change', async () => {
    const client = newClient();
    await client.ready;
    const changes = collect(client);
    await client.add(input('1'));
    await flush();
    expect(client.has('1')).toBe(true);
    expect(changes).toEqual([{ added: ['1'], removed: [] }]);

    await client.remove('1');
    await flush();
    expect(client.has('1')).toBe(false);
    expect(changes).toEqual([
      { added: ['1'], removed: [] },
      { added: [], removed: ['1'] },
    ]);
  });

  it('throws a StoreClientError with the background error code and leaves the set alone', async () => {
    const client = newClient();
    await client.ready;
    const bad = { ...input('1'), url: 'https://evil.com/x' };
    await expect(client.add(bad)).rejects.toBeInstanceOf(StoreClientError);
    await expect(client.add(bad)).rejects.toMatchObject({ code: 'invalid-request' });
    expect(client.has('1')).toBe(false);
  });

  it('throws unavailable when the background cannot be reached', async () => {
    const client = newClient();
    await client.ready;
    vi.spyOn(mock.chrome.runtime, 'sendMessage').mockRejectedValue(new Error('boom'));
    await expect(client.add(input('1'))).rejects.toMatchObject({ code: 'unavailable' });
    expect(client.has('1')).toBe(false);
  });
});

describe('list', () => {
  it('returns validated records, newest first', async () => {
    const client = newClient();
    await client.ready;
    await client.add(input('1'));
    await client.add(input('2'));
    const records = await client.list();
    expect(records.map((r) => r.postId)).toEqual(['2', '1']);
    expect(records[0]).toMatchObject({ title: 'Post 2', deletedAt: null, schemaVersion: 1 });
  });

  it('drops records that fail validation', async () => {
    const client = newClient();
    await client.ready;
    vi.spyOn(mock.chrome.runtime, 'sendMessage').mockResolvedValue({
      ok: true,
      data: [{ postId: '1', url: 'javascript:alert(1)' }, 'junk', null],
    });
    expect(await client.list()).toEqual([]);
  });
});

describe('changes from other tabs (storage.onChanged)', () => {
  it('adds and removes IDs and emits the diff', async () => {
    const mine = newClient();
    const other = newClient();
    await Promise.all([mine.ready, other.ready]);
    const seen = collect(mine);

    await other.add(input('5'));
    await flush();
    expect(mine.has('5')).toBe(true);
    expect(seen).toContainEqual({ added: ['5'], removed: [] });

    await other.remove('5');
    await flush();
    expect(mine.has('5')).toBe(false);
    expect(seen).toContainEqual({ added: [], removed: ['5'] });
  });

  it('does not emit twice for a change this client made itself', async () => {
    const client = newClient();
    await client.ready;
    const seen = collect(client);
    await client.add(input('1'));
    await flush();
    expect(seen).toHaveLength(1);
  });

  it('ignores meta/settings keys and malformed records', async () => {
    const client = newClient();
    await client.ready;
    const seen = collect(client);
    await chrome.storage.local.set({ meta: { a: 1 }, settings: { b: 2 } });
    await chrome.storage.local.set({ [itemKey('7')]: { postId: '7', title: 'junk' } });
    await flush();
    expect(client.has('7')).toBe(false);
    expect(seen).toEqual([]);
  });

  it('stops listening after dispose and isolates a throwing listener', async () => {
    const client = newClient();
    await client.ready;
    client.onChange(() => {
      throw new Error('listener bug');
    });
    const seen = collect(client);
    await client.add(input('1'));
    await flush();
    expect(seen).toHaveLength(1);
    expect(quietLog.error).toHaveBeenCalled();

    client.dispose();
    const writer = newClient();
    await writer.ready;
    await writer.add(input('2'));
    await flush();
    expect(client.has('2')).toBe(false);
  });
});

describe('onChange', () => {
  it('can be unsubscribed', async () => {
    const client = newClient();
    await client.ready;
    const cb = vi.fn();
    const stop = client.onChange(cb);
    stop();
    await client.add(input('1'));
    expect(cb).not.toHaveBeenCalled();
  });
});
