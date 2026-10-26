import { describe, expect, it, vi } from 'vitest';
import { el, svg } from '../../src/core/dom.ts';
import { safeImageUrl, safeLinkUrl, type SafeUrl } from '../../src/core/url-guard.ts';

const asSafe = (value: string) => value as SafeUrl;

describe('el', () => {
  it('builds elements with text, attributes and children', () => {
    const node = el('div', {
      attrs: { class: 'card', 'data-mydev': 'x', 'aria-pressed': false },
      children: [el('span', { text: 'hi' }), null, false, undefined],
    });
    expect(node.tagName).toBe('DIV');
    expect(node.getAttribute('class')).toBe('card');
    expect(node.getAttribute('data-mydev')).toBe('x');
    expect(node.getAttribute('aria-pressed')).toBe('false');
    expect(node.children).toHaveLength(1);
    expect(node.firstElementChild?.textContent).toBe('hi');
  });

  it('keeps hostile strings inert', () => {
    const payload = '<img src=x onerror=alert(1)><script>alert(1)</script>';
    const node = el('p', { text: payload, attrs: { title: payload, alt: '" onmouseover="x' } });
    expect(node.children).toHaveLength(0);
    expect(node.textContent).toBe(payload);
    expect(node.getAttribute('title')).toBe(payload);
    expect(node.hasAttribute('onmouseover')).toBe(false);
  });

  it.each(['onclick', 'onerror', 'style', 'srcdoc', 'formaction', 'data-other', 'xlink:href'])(
    'refuses attribute %s',
    (name) => {
      expect(() => el('div', { attrs: { [name]: 'x' } })).toThrow(/not allowed/);
    },
  );

  it.each(['script', 'iframe', 'object', 'embed', 'style', 'link', 'form', 'input', 'svg'])(
    'refuses tag %s',
    (tag) => {
      expect(() => el(tag)).toThrow(/not allowed/);
    },
  );

  describe('href', () => {
    it('accepts guard-approved links and adds rel', () => {
      const href = safeLinkUrl('https://dev.to/a/b');
      expect(href).not.toBeNull();
      const node = el('a', { attrs: { href } });
      expect(node.getAttribute('href')).toBe('https://dev.to/a/b');
      expect(node.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it.each([
      'javascript:alert(1)',
      'https://evil.com/',
      'https://dev.to.evil.com/',
      'http://dev.to/',
      '/relative',
      '',
    ])('refuses raw string %j', (raw) => {
      expect(() => el('a', { attrs: { href: asSafe(raw) } })).toThrow(/unsafe href/);
    });

    it('refuses a string that only looks normalised', () => {
      expect(() => el('a', { attrs: { href: asSafe('https://DEV.TO/x') } })).toThrow();
    });
  });

  describe('src', () => {
    it('accepts guard-approved images', () => {
      const src = safeImageUrl('https://media2.dev.to/x.png');
      expect(el('img', { attrs: { src, alt: '' } }).getAttribute('src')).toBe(
        'https://media2.dev.to/x.png',
      );
    });

    it.each(['javascript:alert(1)', 'data:image/png;base64,AA', 'https://evil.com/x.png'])(
      'refuses %j',
      (raw) => {
        expect(() => el('img', { attrs: { src: asSafe(raw) } })).toThrow(/unsafe src/);
      },
    );
  });

  it('serialises booleans: aria as strings, others present/absent', () => {
    const node = el('button', {
      attrs: { 'aria-busy': true, 'aria-pressed': false, class: false },
    });
    expect(node.getAttribute('aria-busy')).toBe('true');
    expect(node.getAttribute('aria-pressed')).toBe('false');
    expect(node.hasAttribute('class')).toBe(false);
  });

  it('skips null and undefined attributes', () => {
    expect(el('div', { attrs: { id: undefined, class: null } }).attributes).toHaveLength(0);
  });

  it('attaches listeners and removes them on abort', () => {
    const handler = vi.fn();
    const controller = new AbortController();
    const node = el('button', { on: { click: handler }, signal: controller.signal });
    node.click();
    expect(handler).toHaveBeenCalledTimes(1);
    controller.abort();
    node.click();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('svg', () => {
  it('creates elements in the SVG namespace', () => {
    const root = svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, [
      svg('path', { d: 'M5 12l5 5L20 7', fill: 'none', stroke: 'currentColor' }),
    ]);
    expect(root.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(root.firstElementChild?.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(root.getAttribute('viewBox')).toBe('0 0 24 24');
  });

  it.each(['script', 'foreignObject', 'use', 'animate'])('refuses tag %s', (tag) => {
    expect(() => svg(tag)).toThrow(/not allowed/);
  });

  it.each(['onload', 'href', 'style', 'xlink:href'])('refuses attribute %s', (name) => {
    expect(() => svg('svg', { [name]: 'x' })).toThrow(/not allowed/);
  });
});
