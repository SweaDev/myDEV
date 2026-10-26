/** Typed content-script ↔ background messaging (SPEC §6.3). */
import type { ErrorCode, MyDevRecord, Request, Response } from './types.ts';

export type { Request, Response } from './types.ts';

/** The `data` each request type returns on success. */
export interface ResponseData {
  'mydev/add': null;
  'mydev/remove': null;
  'mydev/list': MyDevRecord[];
  'mydev/activeIds': string[];
}

export type ResponseFor<R extends Request> = Response<ResponseData[R['type']]>;

export interface SendOptions {
  /** Pause before the single retry. */
  retryDelayMs?: number;
}

const RETRYABLE =
  /receiving end does not exist|could not establish connection|message port closed/i;

const failure = (code: ErrorCode, message: string) =>
  ({ ok: false, error: { code, message } }) as const;

const isResponse = (value: unknown): value is Response<unknown> =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { ok?: unknown }).ok === 'boolean';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Sends a request to the background and never throws. If the receiving end is missing (for example
 * a Chrome service worker that is restarting) it retries once; after that it returns an
 * `unavailable` failure so callers can show the FR-3 inline error.
 */
export async function send<R extends Request>(
  request: R,
  options: SendOptions = {},
): Promise<ResponseFor<R>> {
  const retryDelayMs = options.retryDelayMs ?? 150;
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const reply: unknown = await chrome.runtime.sendMessage(request);
      if (!isResponse(reply))
        return failure('unavailable', 'No valid response from background') as ResponseFor<R>;
      return reply as ResponseFor<R>;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === 1 || !RETRYABLE.test(message)) break;
      await sleep(retryDelayMs);
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  return failure('unavailable', message) as ResponseFor<R>;
}
