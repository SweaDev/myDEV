/** Content-script bootstrap (SPEC §8.2): no-flash filtering that always fails open. */
import { createLogger } from '../core/logger.ts';
import { MARKER } from '../core/markers.ts';
import type { FeatureModule, Logger, SiteAdapter, StoreClient } from '../core/types.ts';
import { features as registry } from '../features/index.ts';
import { createDevtoAdapter } from '../site/devto/adapter.ts';
import { prefilterCss } from '../site/devto/prefilter.ts';
import { feedForPath } from '../site/devto/routes.ts';
import { createFeatureHost } from './feature-host.ts';
import { createStoreClient } from './store-client.ts';

/** Safety net: cards are never hidden for longer than this, whatever happens (SPEC §8.2). */
export const PREFILTER_TIMEOUT_MS = 1500;

export interface BootstrapOptions {
  store?: StoreClient;
  site?: SiteAdapter;
  features?: readonly FeatureModule[];
  timeoutMs?: number;
  log?: Logger;
}

export interface Bootstrap {
  /** Resolves once the features have started (or been skipped) and the pre-filter is gone. */
  ready: Promise<void>;
  stop(): void;
}

function domReady(): Promise<void> {
  if (document.readyState !== 'loading') return Promise.resolve();
  return new Promise((resolve) => {
    document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
  });
}

/**
 * Runs at `document_start`. On a home-feed URL it hides not-yet-handled cards straight away (so a
 * card that is in myDEV never paints), starts loading the ID set, and starts the features once the
 * DOM is ready. The pre-filter ends when the first filter pass is done, when loading fails, or after
 * `PREFILTER_TIMEOUT_MS`, whichever comes first.
 */
export function startBootstrap(options: BootstrapOptions = {}): Bootstrap {
  const log = options.log ?? createLogger('content');
  const root = document.documentElement;

  let style: HTMLStyleElement | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const endPrefilter = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    root.removeAttribute(MARKER.prefilter);
    style?.remove();
    style = null;
  };

  // The login state isn't readable yet, but whether this is a home-feed URL doesn't depend on it.
  if (feedForPath(window.location.pathname, false) !== null) {
    style = document.createElement('style');
    style.setAttribute(MARKER.owned, 'prefilter');
    style.textContent = prefilterCss();
    root.append(style);
    root.setAttribute(MARKER.prefilter, '');
    timer = setTimeout(endPrefilter, options.timeoutMs ?? PREFILTER_TIMEOUT_MS);
  }

  const store = options.store ?? createStoreClient();
  const site = options.site ?? createDevtoAdapter();
  let host: ReturnType<typeof createFeatureHost> | null = null;
  let stopped = false;

  const ready = (async () => {
    try {
      await domReady();
      if (stopped) return;

      // FR-9: on a home feed where nothing is recognisable, do nothing visible and say so once.
      if (site.currentRoute().kind === 'home' && !site.findFeedContainer() && !site.findTabBar()) {
        log.warnOnce(
          'nothing-recognised',
          "dev.to's feed markup was not recognised; myDEV is inactive on this page",
        );
        return;
      }

      host = createFeatureHost({ site, store, features: options.features ?? registry });
      await host.start();
    } catch (error) {
      log.error('bootstrap failed', error);
    } finally {
      endPrefilter();
    }
  })();

  return {
    ready,
    stop() {
      stopped = true;
      host?.stop();
      endPrefilter();
    },
  };
}
