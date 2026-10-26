import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runMigrations } from '../../src/storage/migrations.ts';
import { META_KEY, SETTINGS_KEY, defaultSettings } from '../../src/storage/schema.ts';
import { isMeta } from '../../src/core/validate.ts';
import { createChromeMock, type ChromeMock } from '../helpers/chrome-mock.ts';

const quietLog = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  warnOnce: vi.fn(),
};

let mock: ChromeMock;

beforeEach(() => {
  mock = createChromeMock();
  mock.install();
  vi.clearAllMocks();
});

afterEach(() => mock.uninstall());

describe('runMigrations', () => {
  it('creates meta with a UUID installId and default settings on first run', async () => {
    const meta = await runMigrations({ log: quietLog });
    expect(meta.schemaVersion).toBe(1);
    expect(isMeta(mock.data.get(META_KEY))).toEqual(meta);
    expect(mock.data.get(SETTINGS_KEY)).toEqual(defaultSettings());
  });

  it('is a no-op the second time', async () => {
    const first = await runMigrations({ log: quietLog });
    const listener = vi.fn();
    mock.chrome.storage.onChanged.addListener(listener);
    const second = await runMigrations({ log: quietLog });
    expect(second).toEqual(first);
    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps an existing installId', async () => {
    const installId = '3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b';
    mock.data.set(META_KEY, { schemaVersion: 1, installId });
    mock.data.set(SETTINGS_KEY, { features: { mydev: { enabled: false } } });
    const meta = await runMigrations({ log: quietLog });
    expect(meta.installId).toBe(installId);
    expect(mock.data.get(SETTINGS_KEY)).toEqual({ features: { mydev: { enabled: false } } });
  });

  it('recreates invalid meta and resets invalid settings, with a warning', async () => {
    mock.data.set(META_KEY, { schemaVersion: 'x' });
    mock.data.set(SETTINGS_KEY, { features: 'nope' });
    const meta = await runMigrations({ log: quietLog });
    expect(isMeta(meta)).toEqual(meta);
    expect(mock.data.get(SETTINGS_KEY)).toEqual(defaultSettings());
    expect(quietLog.warn).toHaveBeenCalledTimes(2);
  });

  it('applies ordered migrations and records each new version', async () => {
    mock.data.set(META_KEY, {
      schemaVersion: 1,
      installId: '3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b',
    });
    const order: string[] = [];
    const meta = await runMigrations({
      log: quietLog,
      targetVersion: 3,
      migrations: [
        { from: 2, to: 3, run: async () => void order.push('2->3') },
        { from: 1, to: 2, run: async () => void order.push('1->2') },
      ],
    });
    expect(order).toEqual(['1->2', '2->3']);
    expect(meta.schemaVersion).toBe(3);
    expect(isMeta(mock.data.get(META_KEY))?.schemaVersion).toBe(3);
  });

  it('throws when a needed migration is missing', async () => {
    mock.data.set(META_KEY, {
      schemaVersion: 1,
      installId: '3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b',
    });
    await expect(
      runMigrations({ log: quietLog, targetVersion: 2, migrations: [] }),
    ).rejects.toThrow(/no migration from storage schema v1/);
  });

  it('leaves data written by a newer version alone', async () => {
    const stored = { schemaVersion: 9, installId: '3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b' };
    mock.data.set(META_KEY, stored);
    const meta = await runMigrations({ log: quietLog });
    expect(meta.schemaVersion).toBe(9);
    expect(mock.data.get(META_KEY)).toEqual(stored);
    expect(quietLog.warn).toHaveBeenCalled();
  });
});
