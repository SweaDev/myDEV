/** Loads feature modules for the current route and keeps their failures apart (SPEC §6.5). */
import { createLogger } from '../core/logger.ts';
import type {
  FeatureContext,
  FeatureModule,
  Logger,
  Route,
  Settings,
  SiteAdapter,
  StoreClient,
  Unsubscribe,
} from '../core/types.ts';
import { isSettings } from '../core/validate.ts';
import { SETTINGS_KEY } from '../storage/schema.ts';

export interface FeatureHostOptions {
  site: SiteAdapter;
  store: StoreClient;
  features: readonly FeatureModule[];
  /** Overridable for tests; defaults to reading `settings` from storage. */
  readSettings?: () => Promise<Settings | null>;
  makeLogger?: (scope: string) => Logger;
}

export interface FeatureHost {
  /** Starts the features for the current route. Resolves once their `init` calls have settled. */
  start(): Promise<void>;
  /** Disposes everything and stops following the route. */
  stop(): void;
}

/** Content scripts may read storage; only the background writes it. */
async function readStoredSettings(): Promise<Settings | null> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return isSettings(stored[SETTINGS_KEY]);
}

interface Running {
  controller: AbortController;
  feature: FeatureModule;
}

export function createFeatureHost(options: FeatureHostOptions): FeatureHost {
  const { site, store, features } = options;
  const makeLogger = options.makeLogger ?? createLogger;
  const log = makeLogger('host');
  const readSettings = options.readSettings ?? readStoredSettings;

  const running = new Map<string, Running>();
  /** Features that failed on this page load stay off until the next load. */
  const failed = new Set<string>();
  const pending = new Set<Promise<void>>();

  let settings: Settings | null = null;
  let stopRoutes: Unsubscribe | null = null;
  let stopped = false;

  /** A feature is on unless its flag says otherwise; missing settings mean everything is on. */
  const isEnabled = (id: string) => settings?.features[id]?.enabled !== false;

  const dispose = (id: string) => {
    const entry = running.get(id);
    if (!entry) return;
    running.delete(id);
    entry.controller.abort();
    try {
      entry.feature.dispose();
    } catch (error) {
      log.error(`feature "${id}" failed to dispose`, error);
    }
  };

  const fail = (id: string, error: unknown) => {
    log.error(`feature "${id}" failed and is off for this page`, error);
    failed.add(id);
    dispose(id);
  };

  const startFeature = (feature: FeatureModule) => {
    const controller = new AbortController();
    running.set(feature.id, { controller, feature });
    const ctx: FeatureContext = {
      site,
      store,
      log: makeLogger(feature.id),
      signal: controller.signal,
    };
    const done = (async () => {
      try {
        await feature.init(ctx);
      } catch (error) {
        fail(feature.id, error);
      }
    })();
    pending.add(done);
    void done.finally(() => pending.delete(done));
  };

  const reconcile = (route: Route) => {
    if (stopped) return;
    for (const feature of features) {
      const wanted =
        isEnabled(feature.id) && !failed.has(feature.id) && safeMatches(feature, route);
      const on = running.has(feature.id);
      if (on && !wanted) dispose(feature.id);
      else if (!on && wanted) startFeature(feature);
    }
  };

  const safeMatches = (feature: FeatureModule, route: Route): boolean => {
    try {
      return feature.matches(route);
    } catch (error) {
      fail(feature.id, error);
      return false;
    }
  };

  return {
    async start() {
      try {
        settings = await readSettings();
      } catch (error) {
        log.warn('could not read settings; using defaults', error);
      }
      if (stopped) return;
      reconcile(site.currentRoute());
      stopRoutes = site.onRouteChange(reconcile);
      await Promise.allSettled([...pending]);
    },

    stop() {
      stopped = true;
      stopRoutes?.();
      stopRoutes = null;
      for (const id of [...running.keys()]) dispose(id);
    },
  };
}
