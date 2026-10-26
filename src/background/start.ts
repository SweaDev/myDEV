import { createLogger } from '../core/logger.ts';
import { LocalMyDevStore } from '../storage/local-mydev-store.ts';
import { runMigrations } from '../storage/migrations.ts';
import type { MyDevStore } from '../storage/mydev-store.ts';
import { createRouter } from './router.ts';

export interface BackgroundOptions {
  store?: MyDevStore;
  init?: () => Promise<unknown>;
}

/**
 * Starts the background: migrations run first, and the message listener is registered immediately
 * (MV3 requires listeners to be added synchronously at startup) but holds each request until
 * initialisation has finished.
 */
export function startBackground(options: BackgroundOptions = {}): { ready: Promise<void> } {
  const log = createLogger('background');
  const router = createRouter(options.store ?? new LocalMyDevStore(), log);

  const ready = (options.init ?? runMigrations)().then(
    () => undefined,
    (error: unknown) => {
      log.error('initialisation failed', error);
      throw error;
    },
  );
  // Requests report the failure themselves; this just avoids an unhandled rejection.
  ready.catch(() => undefined);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    ready
      .then(() => router.handle(message, sender))
      .catch(
        () =>
          ({
            ok: false,
            error: { code: 'internal', message: 'Background failed to initialise' },
          }) as const,
      )
      .then(sendResponse);
    return true;
  });

  return { ready };
}
