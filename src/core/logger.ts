import type { Logger } from './types.ts';

type Sink = Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;

export interface LoggerOptions {
  sink?: Sink;
  now?: () => number;
  /** Warnings allowed per window before further ones are suppressed. */
  maxWarnings?: number;
  windowMs?: number;
}

/** Console logger prefixed `[mydev:<scope>]`. Warnings are rate-limited so a broken selector can't flood the console. */
export function createLogger(scope: string, options: LoggerOptions = {}): Logger {
  const sink = options.sink ?? console;
  const now = options.now ?? Date.now;
  const maxWarnings = options.maxWarnings ?? 10;
  const windowMs = options.windowMs ?? 60_000;
  const prefix = `[mydev:${scope}]`;

  const seenKeys = new Set<string>();
  let windowStart = -Infinity;
  let warningsInWindow = 0;
  let suppressedNotice = false;

  function warn(...args: unknown[]): void {
    const time = now();
    if (time - windowStart >= windowMs) {
      windowStart = time;
      warningsInWindow = 0;
      suppressedNotice = false;
    }
    if (warningsInWindow >= maxWarnings) {
      if (!suppressedNotice) {
        suppressedNotice = true;
        sink.warn(prefix, 'further warnings suppressed for a while');
      }
      return;
    }
    warningsInWindow += 1;
    sink.warn(prefix, ...args);
  }

  return {
    debug: (...args) => sink.debug(prefix, ...args),
    info: (...args) => sink.info(prefix, ...args),
    warn,
    error: (...args) => sink.error(prefix, ...args),
    warnOnce(key, ...args) {
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      warn(...args);
    },
  };
}
