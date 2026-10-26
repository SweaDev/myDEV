import { describe, expect, it } from 'vitest';
import { mergeManifest } from '../../scripts/merge-manifest.ts';

describe('mergeManifest', () => {
  it('merges nested objects and keeps untouched base keys', () => {
    const base = { name: 'a', permissions: ['storage'], csp: { pages: 'x', other: 'y' } };
    const merged = mergeManifest(base, { csp: { pages: 'z' }, background: { scripts: ['b.js'] } });
    expect(merged).toEqual({
      name: 'a',
      permissions: ['storage'],
      csp: { pages: 'z', other: 'y' },
      background: { scripts: ['b.js'] },
    });
  });

  it('replaces arrays instead of concatenating them', () => {
    expect(mergeManifest({ list: [1, 2] }, { list: [3] })).toEqual({ list: [3] });
  });

  it('does not mutate its inputs', () => {
    const base = { a: { b: 1 } };
    mergeManifest(base, { a: { c: 2 } });
    expect(base).toEqual({ a: { b: 1 } });
  });
});
