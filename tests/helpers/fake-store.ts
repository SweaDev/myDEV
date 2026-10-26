import type {
  StoreChange,
  StoreClient,
  MyDevRecord,
  MyDevRecordInput,
} from '../../src/core/types.ts';

export interface FakeStore extends StoreClient {
  ids: Set<string>;
  added: MyDevRecordInput[];
  removed: string[];
  /** Simulates a change made elsewhere (another tab). */
  push(change: StoreChange): void;
  resolveReady(): void;
  rejectReady(error?: unknown): void;
  failNext: Error | null;
}

/** In-memory StoreClient for feature tests. `ready` is already resolved unless `deferred` is set. */
export function createFakeStore(initialIds: string[] = [], deferred = false): FakeStore {
  const listeners = new Set<(change: StoreChange) => void>();
  let resolveReady!: () => void;
  let rejectReady!: (error?: unknown) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  ready.catch(() => undefined);
  if (!deferred) resolveReady();

  const store: FakeStore = {
    ids: new Set(initialIds),
    added: [],
    removed: [],
    failNext: null,
    ready,
    has: (id) => store.ids.has(id),
    async add(record) {
      if (store.failNext) {
        const error = store.failNext;
        store.failNext = null;
        throw error;
      }
      store.added.push(record);
      store.ids.add(record.postId);
      store.push({ added: [record.postId], removed: [] });
    },
    async remove(postId) {
      if (store.failNext) {
        const error = store.failNext;
        store.failNext = null;
        throw error;
      }
      store.removed.push(postId);
      store.ids.delete(postId);
      store.push({ added: [], removed: [postId] });
    },
    async list(): Promise<MyDevRecord[]> {
      return [];
    },
    onChange(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    push(change) {
      for (const id of change.added) store.ids.add(id);
      for (const id of change.removed) store.ids.delete(id);
      for (const listener of [...listeners]) listener(change);
    },
    resolveReady,
    rejectReady,
  };
  return store;
}
