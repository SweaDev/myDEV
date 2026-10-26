import { describe, expect, it, vi } from 'vitest';
import { createChromeMock } from '../helpers/chrome-mock.ts';

describe('chrome mock storage', () => {
  it('stores, reads, clones and removes values', async () => {
    const { chrome } = createChromeMock();
    const value = { a: [1] };
    await chrome.storage.local.set({ k: value });
    value.a.push(2);
    expect(await chrome.storage.local.get('k')).toEqual({ k: { a: [1] } });
    expect(await chrome.storage.local.get(['k', 'missing'])).toEqual({ k: { a: [1] } });
    expect(await chrome.storage.local.get({ missing: 5 })).toEqual({ missing: 5 });
    expect(Object.keys(await chrome.storage.local.get(null))).toEqual(['k']);
    await chrome.storage.local.remove('k');
    expect(await chrome.storage.local.get(null)).toEqual({});
  });

  it('emits onChanged with old and new values', async () => {
    const { chrome } = createChromeMock();
    const listener = vi.fn();
    chrome.storage.onChanged.addListener(listener);
    await chrome.storage.local.set({ k: 1 });
    await chrome.storage.local.set({ k: 2 });
    await chrome.storage.local.remove('k');
    expect(listener.mock.calls).toEqual([
      [{ k: { oldValue: undefined, newValue: 1 } }, 'local'],
      [{ k: { oldValue: 1, newValue: 2 } }, 'local'],
      [{ k: { oldValue: 2 } }, 'local'],
    ]);
  });
});
