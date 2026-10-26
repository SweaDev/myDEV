/**
 * In-memory stand-in for the parts of `chrome.*` the extension uses: `runtime.sendMessage` /
 * `onMessage`, `storage.local` and `storage.onChanged`. Messages and stored values are
 * structured-cloned like the real APIs do.
 */

export interface MockSender {
  id: string;
  url?: string;
}

type MessageListener = (
  message: unknown,
  sender: MockSender,
  sendResponse: (response?: unknown) => void,
) => boolean | void;

type Changes = Record<string, { oldValue?: unknown; newValue?: unknown }>;
type ChangeListener = (changes: Changes, areaName: string) => void;

export const EXTENSION_ID = 'mock-extension-id';
export const DEVTO_SENDER: MockSender = { id: EXTENSION_ID, url: 'https://dev.to/' };

export function createChromeMock(defaultSender: MockSender = DEVTO_SENDER) {
  const data = new Map<string, unknown>();
  const messageListeners = new Set<MessageListener>();
  const changeListeners = new Set<ChangeListener>();

  const clone = <T>(value: T): T => (value === undefined ? value : structuredClone(value));

  function emitChanges(changes: Changes): void {
    if (Object.keys(changes).length === 0) return;
    for (const listener of [...changeListeners]) listener(clone(changes), 'local');
  }

  const local = {
    async get(keys?: string | string[] | Record<string, unknown> | null) {
      const result: Record<string, unknown> = {};
      if (keys === null || keys === undefined) {
        for (const [key, value] of data) result[key] = clone(value);
      } else if (typeof keys === 'string') {
        if (data.has(keys)) result[keys] = clone(data.get(keys));
      } else if (Array.isArray(keys)) {
        for (const key of keys) if (data.has(key)) result[key] = clone(data.get(key));
      } else {
        for (const [key, fallback] of Object.entries(keys)) {
          result[key] = clone(data.has(key) ? data.get(key) : fallback);
        }
      }
      return result;
    },
    async set(items: Record<string, unknown>) {
      const changes: Changes = {};
      for (const [key, value] of Object.entries(items)) {
        changes[key] = { oldValue: clone(data.get(key)), newValue: clone(value) };
        data.set(key, clone(value));
      }
      emitChanges(changes);
    },
    async remove(keys: string | string[]) {
      const changes: Changes = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (!data.has(key)) continue;
        changes[key] = { oldValue: clone(data.get(key)) };
        data.delete(key);
      }
      emitChanges(changes);
    },
    async clear() {
      const changes: Changes = {};
      for (const [key, value] of data) changes[key] = { oldValue: clone(value) };
      data.clear();
      emitChanges(changes);
    },
  };

  async function sendMessage(message: unknown, sender: MockSender = defaultSender) {
    if (messageListeners.size === 0) {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    }
    const payload = clone(message);
    return new Promise<unknown>((resolve) => {
      let answered = false;
      const respond = (response?: unknown) => {
        if (answered) return;
        answered = true;
        resolve(clone(response));
      };
      let willRespondLater = false;
      for (const listener of [...messageListeners]) {
        if (listener(payload, { ...sender }, respond) === true) willRespondLater = true;
      }
      if (!answered && !willRespondLater) resolve(undefined);
    });
  }

  const chromeMock = {
    runtime: {
      id: EXTENSION_ID,
      sendMessage,
      onMessage: {
        addListener: (listener: MessageListener) => void messageListeners.add(listener),
        removeListener: (listener: MessageListener) => void messageListeners.delete(listener),
        hasListener: (listener: MessageListener) => messageListeners.has(listener),
      },
    },
    storage: {
      local,
      onChanged: {
        addListener: (listener: ChangeListener) => void changeListeners.add(listener),
        removeListener: (listener: ChangeListener) => void changeListeners.delete(listener),
        hasListener: (listener: ChangeListener) => changeListeners.has(listener),
      },
    },
  };

  return {
    chrome: chromeMock,
    /** Inspect or seed storage directly (no change events). */
    data,
    messageListeners,
    changeListeners,
    /** Sends a message as a specific sender, e.g. a foreign extension or a non-dev.to page. */
    sendFrom: sendMessage,
    install(): void {
      (globalThis as unknown as { chrome: unknown }).chrome = chromeMock;
    },
    uninstall(): void {
      delete (globalThis as { chrome?: unknown }).chrome;
    },
  };
}

export type ChromeMock = ReturnType<typeof createChromeMock>;
