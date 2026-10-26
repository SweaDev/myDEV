import { describe, expect, it } from 'vitest';

describe('tooling', () => {
  it('runs tests in a jsdom environment', () => {
    expect(document.createElement('div').tagName).toBe('DIV');
  });
});
