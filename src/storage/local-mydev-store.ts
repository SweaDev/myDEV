import { createLogger } from '../core/logger.ts';
import type {
  Logger,
  MyDevRecord,
  MyDevRecordInput,
  StoreChange,
  Unsubscribe,
} from '../core/types.ts';
import { SCHEMA_VERSION } from '../core/types.ts';
import { isMyDevRecord, isMyDevRecordInput } from '../core/validate.ts';
import { diffStorageChanges } from './changes.ts';
import { StoreError, type MyDevStore } from './mydev-store.ts';
import { ITEM_PREFIX, isItemKey, itemKey, postIdFromKey } from './schema.ts';

export interface LocalMyDevStoreOptions {
  now?: () => number;
  log?: Logger;
}

/** `chrome.storage.local` implementation: one key per record (`mydev:item:<postId>`). */
export class LocalMyDevStore implements MyDevStore {
  readonly #now: () => number;
  readonly #log: Logger;
  /** Writes run one at a time so read-modify-write sequences can't interleave. */
  #queue: Promise<unknown> = Promise.resolve();

  constructor(options: LocalMyDevStoreOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#log = options.log ?? createLogger('store');
  }

  async listActive(): Promise<MyDevRecord[]> {
    const all = await chrome.storage.local.get(null);
    const records: MyDevRecord[] = [];
    for (const [key, value] of Object.entries(all)) {
      if (!isItemKey(key)) continue;
      const record = isMyDevRecord(value);
      if (!record || record.postId !== postIdFromKey(key)) {
        this.#log.warnOnce(`invalid:${key}`, `ignoring invalid stored record ${key}`);
        continue;
      }
      if (record.deletedAt === null) records.push(record);
    }
    return records.sort(
      (a, b) =>
        b.addedAt - a.addedAt || b.updatedAt - a.updatedAt || a.postId.localeCompare(b.postId),
    );
  }

  async activeIds(): Promise<string[]> {
    return (await this.listActive()).map((record) => record.postId);
  }

  async get(postId: string): Promise<MyDevRecord | null> {
    const key = itemKey(postId);
    const stored = await chrome.storage.local.get(key);
    const record = isMyDevRecord(stored[key]);
    return record && record.postId === postId ? record : null;
  }

  add(raw: MyDevRecordInput): Promise<MyDevRecord> {
    const input = isMyDevRecordInput(raw);
    if (!input) return Promise.reject(new StoreError('invalid-request', 'invalid record'));

    return this.#serial(async () => {
      const existing = await this.get(input.postId);
      const now = this.#now();
      const record: MyDevRecord = {
        ...input,
        // Re-checking an active post keeps its place; reviving a removed one starts afresh.
        addedAt: existing && existing.deletedAt === null ? existing.addedAt : now,
        updatedAt: now,
        deletedAt: null,
        schemaVersion: SCHEMA_VERSION,
      };
      await this.#write(itemKey(input.postId), record);
      return record;
    });
  }

  remove(postId: string): Promise<void> {
    return this.#serial(async () => {
      const existing = await this.get(postId);
      if (!existing || existing.deletedAt !== null) return;
      const now = this.#now();
      await this.#write(itemKey(postId), { ...existing, deletedAt: now, updatedAt: now });
    });
  }

  subscribe(cb: (change: StoreChange) => void): Unsubscribe {
    const listener = (changes: Parameters<typeof diffStorageChanges>[0], area: string) => {
      if (area !== 'local') return;
      const change = diffStorageChanges(changes);
      if (change.added.length > 0 || change.removed.length > 0) cb(change);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }

  #serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(task, task);
    this.#queue = run.catch(() => undefined);
    return run;
  }

  async #write(key: string, record: MyDevRecord): Promise<void> {
    if (!key.startsWith(ITEM_PREFIX)) throw new StoreError('internal', `bad item key ${key}`);
    try {
      await chrome.storage.local.set({ [key]: record });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = /quota/i.test(message) ? 'quota-exceeded' : 'storage-error';
      throw new StoreError(code, message, { cause: error });
    }
  }
}
