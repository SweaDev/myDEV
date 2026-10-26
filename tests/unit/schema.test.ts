import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  defaultSettings,
  isItemKey,
  itemKey,
  postIdFromKey,
} from '../../src/storage/schema.ts';
import { isSettings } from '../../src/core/validate.ts';

describe('storage schema', () => {
  it('builds and parses item keys', () => {
    expect(itemKey('123')).toBe('mydev:item:123');
    expect(isItemKey('mydev:item:123')).toBe(true);
    expect(isItemKey('meta')).toBe(false);
    expect(postIdFromKey('mydev:item:123')).toBe('123');
    expect(postIdFromKey('settings')).toBeNull();
  });

  it('defaults to schema version 1 and a valid settings object with mydev enabled', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
    expect(isSettings(defaultSettings())).toEqual({ features: { mydev: { enabled: true } } });
  });

  it('returns a fresh settings object each time', () => {
    expect(defaultSettings()).not.toBe(defaultSettings());
  });
});
