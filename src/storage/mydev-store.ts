import type {
  ErrorCode,
  MyDevRecord,
  MyDevRecordInput,
  StoreChange,
  Unsubscribe,
} from '../core/types.ts';

/** Where myDEV records live. Local today; a synced implementation can sit behind the same interface. */
export interface MyDevStore {
  /** Active (not soft-deleted) records, newest `addedAt` first. */
  listActive(): Promise<MyDevRecord[]>;
  /** IDs of the active records, newest first. */
  activeIds(): Promise<string[]>;
  /** Any valid stored record for the ID, including a soft-deleted one. */
  get(postId: string): Promise<MyDevRecord | null>;
  /** Inserts, refreshes or revives a record. The store sets all timestamps. */
  add(input: MyDevRecordInput): Promise<MyDevRecord>;
  /** Soft-deletes the record. Does nothing if it isn't active. */
  remove(postId: string): Promise<void>;
  /** Called when records become active or inactive. */
  subscribe(cb: (change: StoreChange) => void): Unsubscribe;
}

export class StoreError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'StoreError';
    this.code = code;
  }
}
