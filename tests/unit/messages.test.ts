import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { send } from '../../src/core/messages.ts';
import { createChromeMock, type ChromeMock } from '../helpers/chrome-mock.ts';

let mock: ChromeMock;

beforeEach(() => {
  mock = createChromeMock();
  mock.install();
});

afterEach(() => {
  mock.uninstall();
  vi.useRealTimers();
});

describe('send', () => {
  it('returns the background response', async () => {
    mock.chrome.runtime.onMessage.addListener((_message, _sender, sendResponse) => {
      sendResponse({ ok: true, data: ['1', '2'] });
    });
    const response = await send({ v: 1, type: 'mydev/activeIds' });
    expect(response).toEqual({ ok: true, data: ['1', '2'] });
  });

  it('supports asynchronous responses', async () => {
    mock.chrome.runtime.onMessage.addListener((_message, _sender, sendResponse) => {
      setTimeout(() => sendResponse({ ok: true, data: [] }), 5);
      return true;
    });
    expect(await send({ v: 1, type: 'mydev/list' })).toEqual({ ok: true, data: [] });
  });

  it('passes the request through unchanged', async () => {
    const seen = vi.fn();
    mock.chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      seen(message);
      sendResponse({ ok: true, data: null });
    });
    await send({ v: 1, type: 'mydev/remove', postId: '42' });
    expect(seen).toHaveBeenCalledWith({ v: 1, type: 'mydev/remove', postId: '42' });
  });

  it('passes through error responses', async () => {
    mock.chrome.runtime.onMessage.addListener((_message, _sender, sendResponse) => {
      sendResponse({ ok: false, error: { code: 'invalid-request', message: 'nope' } });
    });
    expect(await send({ v: 1, type: 'mydev/remove', postId: '1' })).toEqual({
      ok: false,
      error: { code: 'invalid-request', message: 'nope' },
    });
  });

  it('retries once when the receiving end is missing, then succeeds', async () => {
    // The background "wakes up" while the first attempt is failing.
    setTimeout(() => {
      mock.chrome.runtime.onMessage.addListener((_message, _sender, sendResponse) => {
        sendResponse({ ok: true, data: ['7'] });
      });
    }, 0);
    const response = await send({ v: 1, type: 'mydev/activeIds' }, { retryDelayMs: 20 });
    expect(response).toEqual({ ok: true, data: ['7'] });
  });

  it('retries only once, then returns an unavailable failure instead of throwing', async () => {
    const spy = vi.spyOn(mock.chrome.runtime, 'sendMessage');
    const response = await send({ v: 1, type: 'mydev/list' }, { retryDelayMs: 1 });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe('unavailable');
      expect(response.error.message).toMatch(/receiving end does not exist/i);
    }
  });

  it('does not retry unrelated errors', async () => {
    const spy = vi.spyOn(mock.chrome.runtime, 'sendMessage').mockRejectedValue(new Error('boom'));
    const response = await send({ v: 1, type: 'mydev/list' }, { retryDelayMs: 1 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(response).toEqual({ ok: false, error: { code: 'unavailable', message: 'boom' } });
  });

  it.each([undefined, null, 'ok', 42, {}, { ok: 'yes' }])(
    'treats a malformed reply (%j) as unavailable',
    async (reply) => {
      mock.chrome.runtime.onMessage.addListener((_message, _sender, sendResponse) => {
        sendResponse(reply);
      });
      const response = await send({ v: 1, type: 'mydev/list' });
      expect(response.ok).toBe(false);
      if (!response.ok) expect(response.error.code).toBe('unavailable');
    },
  );
});
