import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkManifest } from '../../scripts/check-manifest.ts';
import { mergeManifest } from '../../scripts/merge-manifest.ts';

const read = (path: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, '../..', path), 'utf8'));
const base = read('manifests/base.json');

const good = () => mergeManifest(base, read('manifests/chrome.json')) as Record<string, unknown>;
const goodFirefox = () =>
  mergeManifest(base, read('manifests/firefox.json')) as Record<string, unknown>;

// Loosely typed on purpose: these tests poke arbitrary shapes into a manifest.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;

/** A copy of the good manifest with `change` applied. */
const mutated = (change: (m: Loose) => void) => {
  const m = structuredClone(good()) as Loose;
  change(m);
  return checkManifest(m);
};

describe('checkManifest', () => {
  it('accepts the real Chrome and Firefox manifests', () => {
    expect(checkManifest(good())).toEqual([]);
    expect(checkManifest(goodFirefox())).toEqual([]);
  });

  it.each([
    'tabs',
    'scripting',
    'cookies',
    'webRequest',
    'unlimitedStorage',
    '<all_urls>',
    'activeTab',
  ])('rejects the extra permission %s', (permission) => {
    expect(mutated((m) => m.permissions.push(permission)).join()).toMatch(/permissions/);
  });

  it('rejects missing or non-array permissions', () => {
    expect(mutated((m) => delete m.permissions)).not.toEqual([]);
    expect(mutated((m) => (m.permissions = 'storage'))).not.toEqual([]);
    expect(mutated((m) => (m.permissions = []))).not.toEqual([]);
  });

  it.each([
    'host_permissions',
    'optional_permissions',
    'optional_host_permissions',
    'web_accessible_resources',
    'externally_connectable',
    'commands',
    'omnibox',
    'devtools_page',
    'chrome_url_overrides',
  ])('rejects the key %s', (key) => {
    expect(mutated((m) => (m[key] = []))).toEqual([expect.stringContaining(`"${key}"`)]);
  });

  it('rejects widened or extra content script matches', () => {
    expect(mutated((m) => (m.content_scripts[0].matches = ['https://*/*']))).not.toEqual([]);
    expect(mutated((m) => (m.content_scripts[0].matches = ['<all_urls>']))).not.toEqual([]);
    expect(
      mutated(
        (m) => (m.content_scripts[0].matches = ['https://dev.to/*', 'https://example.com/*']),
      ),
    ).not.toEqual([]);
    expect(mutated((m) => (m.content_scripts[0].matches = ['http://dev.to/*']))).not.toEqual([]);
    expect(mutated((m) => (m.content_scripts[0].matches = ['https://*.dev.to/*']))).not.toEqual([]);
  });

  it('rejects a content script that runs in the main world or in all frames', () => {
    expect(mutated((m) => (m.content_scripts[0].world = 'MAIN')).join()).toMatch(/ISOLATED/);
    expect(mutated((m) => (m.content_scripts[0].all_frames = true)).join()).toMatch(/all_frames/);
    expect(mutated((m) => (m.content_scripts[0].match_about_blank = true))).not.toEqual([]);
  });

  it('accepts an explicit ISOLATED world', () => {
    expect(mutated((m) => (m.content_scripts[0].world = 'ISOLATED'))).toEqual([]);
  });

  it('rejects a different run_at or a second content script that is not locked down', () => {
    expect(mutated((m) => (m.content_scripts[0].run_at = 'document_idle'))).not.toEqual([]);
    expect(
      mutated((m) => m.content_scripts.push({ matches: ['https://evil.com/*'], js: ['x.js'] })),
    ).not.toEqual([]);
    expect(mutated((m) => (m.content_scripts = []))).not.toEqual([]);
  });

  it('requires the strict CSP exactly', () => {
    expect(mutated((m) => delete m.content_security_policy)).not.toEqual([]);
    expect(
      mutated(
        (m) =>
          (m.content_security_policy.extension_pages =
            "script-src 'self' 'unsafe-eval'; object-src 'self'"),
      ),
    ).not.toEqual([]);
    expect(
      mutated(
        (m) =>
          (m.content_security_policy.extension_pages =
            "script-src 'self' https://cdn.example.com; object-src 'self'"),
      ),
    ).not.toEqual([]);
    expect(mutated((m) => (m.content_security_policy.sandbox = "script-src 'self'"))).not.toEqual(
      [],
    );
  });

  it('requires MV3 and a background', () => {
    expect(mutated((m) => (m.manifest_version = 2))).not.toEqual([]);
    expect(mutated((m) => delete m.background)).not.toEqual([]);
    expect(mutated((m) => (m.background = {}))).not.toEqual([]);
  });

  it('rejects non-objects', () => {
    expect(checkManifest(null)).not.toEqual([]);
    expect(checkManifest([])).not.toEqual([]);
    expect(checkManifest('x')).not.toEqual([]);
  });
});
