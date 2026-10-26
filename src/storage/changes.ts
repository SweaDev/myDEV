import type { StoreChange } from '../core/types.ts';
import { isMyDevRecord } from '../core/validate.ts';
import { postIdFromKey } from './schema.ts';

type RawChanges = Record<string, { oldValue?: unknown; newValue?: unknown }>;

const isActive = (value: unknown, postId: string): boolean => {
  const record = isMyDevRecord(value);
  return record !== null && record.postId === postId && record.deletedAt === null;
};

/**
 * Turns a raw `storage.onChanged` payload into the post IDs that became active or inactive.
 * Values are validated, so malformed data never counts as active. Shared by the store (background)
 * and the content-side StoreClient.
 */
export function diffStorageChanges(changes: RawChanges): StoreChange {
  const result: StoreChange = { added: [], removed: [] };
  for (const [key, change] of Object.entries(changes)) {
    const postId = postIdFromKey(key);
    if (postId === null) continue;
    const was = isActive(change.oldValue, postId);
    const now = isActive(change.newValue, postId);
    if (!was && now) result.added.push(postId);
    if (was && !now) result.removed.push(postId);
  }
  return result;
}
