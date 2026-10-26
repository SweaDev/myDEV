/** Storage layout for `chrome.storage.local` (SPEC §5.2). */
import { SCHEMA_VERSION, type Settings } from '../core/types.ts';

export const CURRENT_SCHEMA_VERSION = SCHEMA_VERSION;

export const META_KEY = 'meta';
export const SETTINGS_KEY = 'settings';
export const ITEM_PREFIX = 'mydev:item:';

export const itemKey = (postId: string): string => `${ITEM_PREFIX}${postId}`;

export const isItemKey = (key: string): boolean => key.startsWith(ITEM_PREFIX);

export const postIdFromKey = (key: string): string | null =>
  isItemKey(key) ? key.slice(ITEM_PREFIX.length) : null;

export const defaultSettings = (): Settings => ({ features: { mydev: { enabled: true } } });
