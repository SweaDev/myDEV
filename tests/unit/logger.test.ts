import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../src/core/logger.ts';

const makeSink = () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });

describe('createLogger', () => {
  it('prefixes every level with [mydev:<scope>]', () => {
    const sink = makeSink();
    const log = createLogger('mydev', { sink });
    log.debug('a', 1);
    log.info('b');
    log.warn('c');
    log.error('d', { x: 1 });
    expect(sink.debug).toHaveBeenCalledWith('[mydev:mydev]', 'a', 1);
    expect(sink.info).toHaveBeenCalledWith('[mydev:mydev]', 'b');
    expect(sink.warn).toHaveBeenCalledWith('[mydev:mydev]', 'c');
    expect(sink.error).toHaveBeenCalledWith('[mydev:mydev]', 'd', { x: 1 });
  });

  it('warnOnce logs a given key only once', () => {
    const sink = makeSink();
    const log = createLogger('site', { sink });
    log.warnOnce('missing-feed', 'feed container not found');
    log.warnOnce('missing-feed', 'feed container not found');
    log.warnOnce('missing-tabs', 'tab bar not found');
    expect(sink.warn).toHaveBeenCalledTimes(2);
  });

  it('keeps separate warnOnce state per logger', () => {
    const sink = makeSink();
    createLogger('a', { sink }).warnOnce('k', 'x');
    createLogger('b', { sink }).warnOnce('k', 'x');
    expect(sink.warn).toHaveBeenCalledTimes(2);
  });

  it('rate-limits warnings and says so once', () => {
    const sink = makeSink();
    const log = createLogger('x', { sink, now: () => 0, maxWarnings: 3, windowMs: 1000 });
    for (let i = 0; i < 10; i++) log.warn(`w${i}`);
    expect(sink.warn).toHaveBeenCalledTimes(4);
    expect(sink.warn).toHaveBeenLastCalledWith(
      '[mydev:x]',
      'further warnings suppressed for a while',
    );
  });

  it('allows warnings again after the window passes', () => {
    const sink = makeSink();
    let time = 0;
    const log = createLogger('x', { sink, now: () => time, maxWarnings: 1, windowMs: 1000 });
    log.warn('a');
    log.warn('b');
    time = 1000;
    log.warn('c');
    expect(sink.warn).toHaveBeenCalledWith('[mydev:x]', 'c');
  });

  it('does not rate-limit errors', () => {
    const sink = makeSink();
    const log = createLogger('x', { sink, maxWarnings: 1 });
    for (let i = 0; i < 5; i++) log.error('e');
    expect(sink.error).toHaveBeenCalledTimes(5);
  });
});
