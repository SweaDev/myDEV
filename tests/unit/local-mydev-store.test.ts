import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyDevRecordInput, StoreChange } from '../../src/core/types.ts';
import { diffStorageChanges } from '../../src/storage/changes.ts';
import { LocalMyDevStore } from '../../src/storage/local-mydev-store.ts';
import { StoreError } from '../../src/storage/mydev-store.ts';
import { itemKey } from '../../src/storage/schema.ts';
import { createChromeMock, type ChromeMock } from '../helpers/chrome-mock.ts';

const input = (postId: string, overrides: Partial<MyDevRecordInput> = {}): MyDevRecordInput => ({
  postId,
  url: `https://dev.to/someone/post-${postId}`,
  title: `Post ${postId}`,
  author: { name: 'Some One', username: 'someone', avatarUrl: null },
  tags: ['js'],
  coverImageUrl: null,
  readingTimeMinutes: 3,
  publishedAt: null,
  sourceFeed: 'discover',
  ...overrides,
});

const quietLog = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  warnOnce: vi.fn(),
};

let mock: ChromeMock;
let clock: number;
let store: LocalMyDevStore;

beforeEach(() => {
  mock = createChromeMock();
  mock.install();
  clock = 1000;
  vi.clearAllMocks();
  store = new LocalMyDevStore({ now: () => clock, log: quietLog });
});

afterEach(() => mock.uninstall());

describe('add', () => {
  it('inserts a record with store-set timestamps under mydev:item:<id>', async () => {
    const record = await store.add(input('1'));
    expect(record).toMatchObject({
      postId: '1',
      addedAt: 1000,
      updatedAt: 1000,
      deletedAt: null,
      schemaVersion: 1,
    });
    expect(mock.data.get(itemKey('1'))).toEqual(record);
  });

  it('ignores timestamps forged on the input', async () => {
    const forged = { ...input('1'), addedAt: 1, updatedAt: 2, deletedAt: 3, schemaVersion: 9 };
    const record = await store.add(forged as MyDevRecordInput);
    expect(record).toMatchObject({
      addedAt: 1000,
      updatedAt: 1000,
      deletedAt: null,
      schemaVersion: 1,
    });
  });

  it('keeps addedAt when an active record is added again, but refreshes the snapshot', async () => {
    await store.add(input('1'));
    clock = 2000;
    const record = await store.add(input('1', { title: 'Renamed' }));
    expect(record).toMatchObject({ title: 'Renamed', addedAt: 1000, updatedAt: 2000 });
  });

  it('rejects invalid input with an invalid-request StoreError and writes nothing', async () => {
    const bad = { ...input('1'), url: 'https://evil.com/x' };
    await expect(store.add(bad)).rejects.toMatchObject({ code: 'invalid-request' });
    expect(mock.data.size).toBe(0);
  });

  it('maps quota failures to quota-exceeded', async () => {
    vi.spyOn(mock.chrome.storage.local, 'set').mockRejectedValue(
      new Error('QUOTA_BYTES quota exceeded'),
    );
    const error = await store.add(input('1')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StoreError);
    expect(error).toMatchObject({ code: 'quota-exceeded' });
  });

  it('maps other storage failures to storage-error', async () => {
    vi.spyOn(mock.chrome.storage.local, 'set').mockRejectedValue(new Error('disk on fire'));
    await expect(store.add(input('1'))).rejects.toMatchObject({ code: 'storage-error' });
  });

  it('keeps concurrent adds of the same post consistent', async () => {
    await Promise.all([
      store.add(input('1', { title: 'A' })),
      store.add(input('1', { title: 'B' })),
    ]);
    expect((await store.get('1'))?.title).toBe('B');
    expect(await store.activeIds()).toEqual(['1']);
  });
});

describe('remove', () => {
  it('soft-deletes: keeps the snapshot, sets deletedAt and updatedAt', async () => {
    await store.add(input('1'));
    clock = 5000;
    await store.remove('1');
    expect(await store.get('1')).toMatchObject({
      title: 'Post 1',
      addedAt: 1000,
      updatedAt: 5000,
      deletedAt: 5000,
    });
    expect(await store.listActive()).toEqual([]);
    expect(await store.activeIds()).toEqual([]);
  });

  it('does nothing for unknown, invalid or already removed records', async () => {
    mock.data.set(itemKey('9'), { garbage: true });
    await store.add(input('1'));
    await store.remove('1');
    const listener = vi.fn();
    mock.chrome.storage.onChanged.addListener(listener);
    await store.remove('1');
    await store.remove('404');
    await store.remove('9');
    expect(listener).not.toHaveBeenCalled();
    expect(mock.data.get(itemKey('9'))).toEqual({ garbage: true });
  });
});

describe('revive', () => {
  it('re-adding a removed post writes a fresh snapshot with a new addedAt', async () => {
    await store.add(input('1'));
    clock = 2000;
    await store.remove('1');
    clock = 3000;
    const record = await store.add(input('1', { title: 'Back again' }));
    expect(record).toMatchObject({
      title: 'Back again',
      addedAt: 3000,
      updatedAt: 3000,
      deletedAt: null,
    });
    expect(await store.activeIds()).toEqual(['1']);
  });
});

describe('listActive / get', () => {
  it('sorts by addedAt, newest first', async () => {
    for (const id of ['1', '2', '3']) {
      await store.add(input(id));
      clock += 100;
    }
    expect(await store.activeIds()).toEqual(['3', '2', '1']);
    expect((await store.listActive()).map((r) => r.title)).toEqual(['Post 3', 'Post 2', 'Post 1']);
  });

  it('breaks addedAt ties deterministically', async () => {
    await store.add(input('2'));
    await store.add(input('1'));
    expect(await store.activeIds()).toEqual(['1', '2']);
  });

  it('ignores malformed records and records stored under the wrong key', async () => {
    await store.add(input('1'));
    mock.data.set(itemKey('2'), { postId: '2', title: 'missing everything else' });
    mock.data.set(itemKey('3'), { ...(mock.data.get(itemKey('1')) as object), postId: '99' });
    mock.data.set(itemKey('4'), 'not even an object');
    mock.data.set('unrelated', { a: 1 });
    expect(await store.activeIds()).toEqual(['1']);
    expect(await store.get('2')).toBeNull();
    expect(await store.get('3')).toBeNull();
    expect(quietLog.warnOnce).toHaveBeenCalledWith(
      expect.stringContaining('invalid:'),
      expect.any(String),
    );
  });

  it('returns null for a missing record', async () => {
    expect(await store.get('404')).toBeNull();
  });

  it('never returns hostile stored URLs as links', async () => {
    await store.add(input('1'));
    const stored = mock.data.get(itemKey('1')) as Record<string, unknown>;
    mock.data.set(itemKey('1'), { ...stored, url: 'javascript:alert(1)' });
    expect(await store.listActive()).toEqual([]);
  });
});

describe('subscribe', () => {
  const collect = () => {
    const changes: StoreChange[] = [];
    const unsubscribe = store.subscribe((change) => changes.push(change));
    return { changes, unsubscribe };
  };

  it('reports records becoming active and inactive', async () => {
    const { changes } = collect();
    await store.add(input('1'));
    await store.remove('1');
    await store.add(input('1'));
    expect(changes).toEqual([
      { added: ['1'], removed: [] },
      { added: [], removed: ['1'] },
      { added: ['1'], removed: [] },
    ]);
  });

  it('stays quiet when an active record is only refreshed', async () => {
    await store.add(input('1'));
    const { changes } = collect();
    await store.add(input('1', { title: 'Renamed' }));
    expect(changes).toEqual([]);
  });

  it('ignores meta, settings and other keys, and treats invalid values as inactive', async () => {
    const { changes } = collect();
    await chrome.storage.local.set({ meta: { x: 1 }, settings: { y: 2 } });
    await chrome.storage.local.set({ [itemKey('5')]: { postId: '5' } });
    expect(changes).toEqual([]);
  });

  it('stops after unsubscribe', async () => {
    const { changes, unsubscribe } = collect();
    unsubscribe();
    await store.add(input('1'));
    expect(changes).toEqual([]);
  });
});

describe('diffStorageChanges', () => {
  it('reports a hard-deleted active record as removed', async () => {
    const record = await store.add(input('1'));
    expect(diffStorageChanges({ [itemKey('1')]: { oldValue: record } })).toEqual({
      added: [],
      removed: ['1'],
    });
  });
});
