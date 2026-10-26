/** Background message router (SPEC §6.3, SEC-5, SEC-6): verify sender → validate → dispatch. */
import { createLogger } from '../core/logger.ts';
import type { ErrorCode, Logger, Response } from '../core/types.ts';
import { parseRequest } from '../core/validate.ts';
import { StoreError, type MyDevStore } from '../storage/mydev-store.ts';

export interface RouterSender {
  id?: string | undefined;
  url?: string | undefined;
}

const DEVTO_PREFIX = 'https://dev.to/';

/** Only this extension's dev.to content scripts and its own pages may talk to the background. */
export function isAllowedSender(sender: RouterSender | undefined): boolean {
  if (!sender || sender.id !== chrome.runtime.id) return false;
  const url = sender.url;
  if (typeof url !== 'string') return false;
  return url.startsWith(DEVTO_PREFIX) || url.startsWith(chrome.runtime.getURL(''));
}

const fail = (code: ErrorCode, message: string): Response<never> => ({
  ok: false,
  error: { code, message },
});

const ok = <T>(data: T): Response<T> => ({ ok: true, data });

const REJECTION_MESSAGES: Partial<Record<ErrorCode, string>> = {
  'invalid-request': 'Invalid request',
  'unsupported-version': 'Unsupported protocol version',
  'unknown-type': 'Unknown request type',
};

export interface Router {
  handle(message: unknown, sender: RouterSender | undefined): Promise<Response<unknown>>;
}

export function createRouter(store: MyDevStore, log: Logger = createLogger('background')): Router {
  return {
    async handle(message, sender) {
      if (!isAllowedSender(sender)) {
        log.warn('rejected a message from a disallowed sender');
        return fail('forbidden-sender', 'Sender not allowed');
      }

      const parsed = parseRequest(message);
      if (!parsed.ok) {
        log.warn(`rejected a message: ${parsed.code}`);
        return fail(parsed.code, REJECTION_MESSAGES[parsed.code] ?? 'Rejected');
      }

      const request = parsed.request;
      try {
        switch (request.type) {
          case 'mydev/add':
            await store.add(request.record);
            return ok(null);
          case 'mydev/remove':
            await store.remove(request.postId);
            return ok(null);
          case 'mydev/list':
            return ok(await store.listActive());
          case 'mydev/activeIds':
            return ok(await store.activeIds());
        }
      } catch (error) {
        if (error instanceof StoreError) {
          log.warn(`${request.type} failed: ${error.code}`);
          return fail(error.code, error.message);
        }
        log.error(`${request.type} crashed`, error);
        return fail('internal', 'Internal error');
      }
    },
  };
}
