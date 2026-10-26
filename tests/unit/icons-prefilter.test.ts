import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkIcon } from '../../src/features/mydev/icons.ts';
import { prefilterCss } from '../../src/site/devto/prefilter.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

describe('checkIcon', () => {
  it('renders an SVG element in the SVG namespace, hidden from assistive tech', () => {
    const icon = checkIcon(false);
    expect(icon.namespaceURI).toBe(SVG_NS);
    expect(icon.tagName.toLowerCase()).toBe('svg');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(icon.querySelector('circle')?.namespaceURI).toBe(SVG_NS);
    expect(icon.querySelector('path')?.getAttribute('d')).toMatch(/^M/);
  });

  it('differs between unchecked and checked', () => {
    expect(checkIcon(false).classList.contains('mydev-icon--checked')).toBe(false);
    expect(checkIcon(true).classList.contains('mydev-icon--checked')).toBe(true);
  });

  it('returns a fresh node each time', () => {
    expect(checkIcon(false)).not.toBe(checkIcon(false));
  });
});

describe('prefilterCss', () => {
  const css = prefilterCss();

  it('hides unprocessed cards while the prefilter flag is on <html>', () => {
    expect(css).toContain('html[data-mydev-prefilter]');
    expect(css).toContain(':not([data-mydev-processed])');
    expect(css).toContain('.crayons-story[data-feed-content-id]');
    expect(css).toContain('visibility: hidden !important');
  });

  it('covers both feed containers', () => {
    expect(css).toContain('#homepage-feed');
    expect(css).toContain('#main-content');
  });

  it('is a single well-formed rule', () => {
    expect(css.match(/\{/g)).toHaveLength(1);
    expect(css.match(/\}/g)).toHaveLength(1);
  });
});

describe('mydev.css', () => {
  const css = readFileSync(
    resolve(import.meta.dirname, '../../src/features/mydev/mydev.css'),
    'utf8',
  );

  it('hides marked cards and the native feed', () => {
    expect(css).toMatch(/\[data-mydev-hidden\]\s*\{\s*display:\s*none\s*!important/);
    expect(css).toMatch(/\[data-mydev-feed-hidden\]\s*\{\s*display:\s*none\s*!important/);
  });

  it('styles every button state and the focus ring', () => {
    expect(css).toContain('.mydev-tick:hover');
    expect(css).toContain('.mydev-tick:focus-visible');
    expect(css).toContain(".mydev-tick[aria-pressed='true']");
    expect(css).toContain(".mydev-tick[aria-busy='true']");
  });

  it('uses dev.to theme variables, always with a fallback', () => {
    const uses = css.match(/var\(--[a-z0-9-]+(?!,)\)/g) ?? [];
    expect(uses).toEqual([]);
    expect(css).toContain('var(--card-bg');
    expect(css).toContain('var(--accent-brand');
  });

  it('contains no dev.to selectors (those live in src/site/devto)', () => {
    expect(css).not.toMatch(/crayons-|#homepage-feed|#main-content|data-feed/);
  });
});
