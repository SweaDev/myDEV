import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../fixtures/devto');

export function fixtureHtml(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}

/** Replaces the document body with a fixture, parsed the way a browser would (no HTML sinks). */
export function mountFixture(path: string, loggedIn = false): void {
  const parsed = new DOMParser().parseFromString(fixtureHtml(path), 'text/html');
  document.body.replaceChildren(...parsed.body.childNodes);
  if (loggedIn) document.body.setAttribute('data-user-status', 'logged-in');
  else document.body.removeAttribute('data-user-status');
}

export function setUrl(url: string): void {
  window.history.pushState({}, '', url);
}
