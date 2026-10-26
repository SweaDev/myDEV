/** Startup initialisation and ordered, idempotent schema migrations (SPEC §5.4). */
import { createLogger } from '../core/logger.ts';
import type { Logger, Meta } from '../core/types.ts';
import { isMeta, isSettings } from '../core/validate.ts';
import { CURRENT_SCHEMA_VERSION, META_KEY, SETTINGS_KEY, defaultSettings } from './schema.ts';

/** Upgrades storage from version `from` to `to`. Must be safe to run again after a crash. */
export interface Migration {
  from: number;
  to: number;
  run(): Promise<void>;
}

/** Ordered migrations. Version 1 is the baseline, so there are none yet. */
export const MIGRATIONS: readonly Migration[] = [];

export interface MigrationOptions {
  migrations?: readonly Migration[];
  targetVersion?: number;
  log?: Logger;
}

/**
 * Creates `meta` (with a random `installId`) and default `settings` when missing, then applies
 * migrations up to the current schema version. Running it again changes nothing.
 */
export async function runMigrations(options: MigrationOptions = {}): Promise<Meta> {
  const migrations = options.migrations ?? MIGRATIONS;
  const target = options.targetVersion ?? CURRENT_SCHEMA_VERSION;
  const log = options.log ?? createLogger('storage');

  const stored = await chrome.storage.local.get([META_KEY, SETTINGS_KEY]);

  let meta = isMeta(stored[META_KEY]);
  if (!meta) {
    if (stored[META_KEY] !== undefined) log.warn('stored meta is invalid; recreating it');
    meta = { schemaVersion: target, installId: crypto.randomUUID() };
    await chrome.storage.local.set({ [META_KEY]: meta });
  }

  if (!isSettings(stored[SETTINGS_KEY])) {
    if (stored[SETTINGS_KEY] !== undefined) log.warn('stored settings are invalid; resetting them');
    await chrome.storage.local.set({ [SETTINGS_KEY]: defaultSettings() });
  }

  if (meta.schemaVersion > target) {
    log.warn(
      `storage schema v${meta.schemaVersion} is newer than supported v${target}; leaving it as is`,
    );
    return meta;
  }

  while (meta.schemaVersion < target) {
    const from: number = meta.schemaVersion;
    const migration: Migration | undefined = migrations.find((m) => m.from === from);
    if (!migration) throw new Error(`no migration from storage schema v${from}`);
    await migration.run();
    meta = { ...meta, schemaVersion: migration.to };
    await chrome.storage.local.set({ [META_KEY]: meta });
  }

  return meta;
}
