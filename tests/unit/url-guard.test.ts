import { describe, expect, it } from 'vitest';
import { IMAGE_HOSTS, safeImageUrl, safeLinkUrl } from '../../src/core/url-guard.ts';

const hostile = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'http://dev.to/post',
  'https://dev.to.evil.com/post',
  'https://evil.com/dev.to',
  'https://evil.com/?https://dev.to/',
  'https://notdev.to/post',
  'https://user@evil.com/',
  'https://dev.to@evil.com/',
  'https://user:pass@dev.to/',
  'https://dev.to:8443/post',
  '//dev.to/post',
  '/relative/path',
  'dev.to/post',
  '',
];

describe('safeLinkUrl', () => {
  it('accepts https dev.to URLs and returns the normalised href', () => {
    expect(safeLinkUrl('https://dev.to/someone/a-post-1abc')).toBe(
      'https://dev.to/someone/a-post-1abc',
    );
    expect(safeLinkUrl('https://DEV.TO/x?y=1#z')).toBe('https://dev.to/x?y=1#z');
  });

  it.each(hostile)('rejects %j', (raw) => {
    expect(safeLinkUrl(raw)).toBeNull();
  });

  it('rejects subdomains of dev.to', () => {
    expect(safeLinkUrl('https://media2.dev.to/x.png')).toBeNull();
  });

  it.each([undefined, null, 42, {}, [], true])('rejects non-string input %j', (raw) => {
    expect(safeLinkUrl(raw)).toBeNull();
  });

  it('rejects absurdly long input', () => {
    expect(safeLinkUrl(`https://dev.to/${'a'.repeat(3000)}`)).toBeNull();
  });
});

describe('safeImageUrl', () => {
  it('accepts https URLs on allowlisted image hosts', () => {
    for (const host of IMAGE_HOSTS) {
      expect(safeImageUrl(`https://${host}/a/b.png`)).toBe(`https://${host}/a/b.png`);
    }
  });

  it.each([
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'http://media2.dev.to/a.png',
    'https://user@media2.dev.to/a.png',
    'https://media2.dev.to:8443/a.png',
    '//media2.dev.to/a.png',
    '/a.png',
    '',
  ])('rejects %j', (raw) => {
    expect(safeImageUrl(raw)).toBeNull();
  });

  it('rejects look-alike hosts and non-strings', () => {
    expect(safeImageUrl('https://media2.dev.to.evil.com/a.png')).toBeNull();
    expect(safeImageUrl('https://evil.com/media2.dev.to/a.png')).toBeNull();
    expect(safeImageUrl(undefined)).toBeNull();
    expect(safeImageUrl(5)).toBeNull();
  });
});
