/** Content-side proxy for the background store (SPEC §6.2): synchronous `has()` over a live ID set. */
import { send } from '../core/messages.ts';
import { createLogger } from '../core/logger.ts';
import type {
  ErrorCode,
  Logger,
  MyDevRecord,
  MyDevRecordInput,
  Response,
  StoreChange,
  StoreClient,
  Unsubscribe,
} from '../core/types.ts';
import { isMyDevRecord } from '../core/validate.ts';
import { diffStorageChanges } from '../storage/changes.ts';

export class StoreClientError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'StoreClientError';
    this.code = code;
  }
}

export interface DisposableStoreClient extends StoreClient {
  /** Stops listening to storage changes. */
  dispose(): void;
}

const POST_ID = /^\d{1,20}$/;

function unwrap<T>(response: Response<T>): T {
  if (!response.ok) throw new StoreClientError(response.error.code, response.error.message);
  return response.data;
}

export function createStoreClient(
  log: Logger = createLogger('store-client'),
): DisposableStoreClient {
  const active = new Set<string>();
  const listeners = new Set<(change: StoreChange) => void>();

  let loaded = false;
  // Changes that arrive while the initial load is in flight are re-applied on top of its result.
  const pendingAdded = new Set<string>();
  const pendingRemoved = new Set<string>();

  const emit = (change: StoreChange) => {
    if (change.added.length === 0 && change.removed.length === 0) return;
    for (const listener of [...listeners]) {
      try {
        listener({ added: [...change.added], removed: [...change.removed] });
      } catch (error) {
        log.error('onChange listener failed', error);
      }
    }
  };

  /** Applies a diff to the set and returns only what actually changed. */
  const apply = (diff: StoreChange): StoreChange => {
    const result: StoreChange = { added: [], removed: [] };
    for (const id of diff.added) {
      if (!loaded) {
        pendingAdded.add(id);
        pendingRemoved.delete(id);
      }
      if (!active.has(id)) {
        active.add(id);
        result.added.push(id);
      }
    }
    for (const id of diff.removed) {
      if (!loaded) {
        pendingRemoved.add(id);
        pendingAdded.delete(id);
      }
      if (active.delete(id)) result.removed.push(id);
    }
    return result;
  };

  const onStorageChanged = (
    changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
    area: string,
  ) => {
    if (area !== 'local') return;
    emit(apply(diffStorageChanges(changes)));
  };
  chrome.storage.onChanged.addListener(onStorageChanged);

  const ready = (async () => {
    const ids = unwrap(await send({ v: 1, type: 'mydev/activeIds' }));
    const before = new Set(active);
    active.clear();
    for (const id of ids) if (POST_ID.test(id)) active.add(id);
    for (const id of pendingAdded) active.add(id);
    for (const id of pendingRemoved) active.delete(id);
    loaded = true;
    pendingAdded.clear();
    pendingRemoved.clear();
    // Anything the load changed relative to what listeners already saw.
    emit({
      added: [...active].filter((id) => !before.has(id)),
      removed: [...before].filter((id) => !active.has(id)),
    });
  })();
  // Callers decide what a failed load means; this just avoids an unhandled rejection.
  ready.catch((error: unknown) => log.warn('could not load the myDEV list', error));

  return {
    ready,
    has: (postId) => active.has(postId),

    async add(record: MyDevRecordInput) {
      unwrap(await send({ v: 1, type: 'mydev/add', record }));
      emit(apply({ added: [record.postId], removed: [] }));
    },

    async remove(postId: string) {
      unwrap(await send({ v: 1, type: 'mydev/remove', postId }));
      emit(apply({ added: [], removed: [postId] }));
    },

    async list(): Promise<MyDevRecord[]> {
      const raw = unwrap(await send({ v: 1, type: 'mydev/list' }));
      const records: MyDevRecord[] = [];
      for (const item of raw) {
        const record = isMyDevRecord(item);
        if (record) records.push(record);
        else log.warnOnce('invalid-list-record', 'ignoring an invalid record from the background');
      }
      return records;
    },

    onChange(cb): Unsubscribe {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },

    dispose() {
      chrome.storage.onChanged.removeListener(onStorageChanged);
      listeners.clear();
    },
  };
}
