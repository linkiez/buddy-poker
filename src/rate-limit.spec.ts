import { describe, expect, it, vi } from 'vitest';

import { createRateLimiter } from './rate-limit';
import { createHttpRateLimiter } from './http-rate-limit';

describe('createRateLimiter', () => {
  it('should throw for invalid maxEvents', () => {
    expect(() => createRateLimiter({ maxEvents: 0, windowMs: 1000 })).toThrow(TypeError);
    expect(() => createRateLimiter({ maxEvents: Number.NaN, windowMs: 1000 })).toThrow(TypeError);
  });

  describe('createHttpRateLimiter', () => {
    it('limits clients independently', () => {
      const limiter = createHttpRateLimiter({ maxEvents: 1, windowMs: 1_000 });
      const first = { ip: 'first' } as never;
      const second = { ip: 'second' } as never;

      expect(limiter.allow(first)).toBe(true);
      expect(limiter.allow(first)).toBe(false);
      expect(limiter.allow(second)).toBe(true);
    });

    it('supports a custom client key', () => {
      const limiter = createHttpRateLimiter({
        maxEvents: 1,
        windowMs: 1_000,
        key: (request) => String(request.headers['x-client-key'] ?? 'fallback'),
      });
      const first = { headers: { 'x-client-key': 'same' } } as never;
      const second = { headers: { 'x-client-key': 'same' } } as never;

      expect(limiter.allow(first)).toBe(true);
      expect(limiter.allow(second)).toBe(false);
    });

    it('uses an unknown key when the request has no client ip', () => {
      const limiter = createHttpRateLimiter({
        maxEvents: 1,
        windowMs: 1_000,
      });
      const first = {} as never;
      const second = {} as never;

      expect(limiter.allow(first)).toBe(true);
      expect(limiter.allow(second)).toBe(false);
    });
  });

  it('should throw for invalid windowMs', () => {
    expect(() => createRateLimiter({ maxEvents: 1, windowMs: 0 })).toThrow(TypeError);
    expect(() => createRateLimiter({ maxEvents: 1, windowMs: Number.NaN })).toThrow(TypeError);
  });

  it('should allow up to maxEvents within the window', () => {
    const now = vi.fn(() => 1_000);
    const limiter = createRateLimiter({ maxEvents: 3, windowMs: 1_000, now });

    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(false);
  });

  it('should reset the window after windowMs passes', () => {
    let t = 1_000;
    const now = vi.fn(() => t);
    const limiter = createRateLimiter({ maxEvents: 2, windowMs: 1_000, now });

    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(false);

    t += 1_001;

    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(false);
  });

  it('should reset when currentMs-windowStartMs equals windowMs', () => {
    let t = 1_000;
    const now = vi.fn(() => t);
    const limiter = createRateLimiter({ maxEvents: 1, windowMs: 1_000, now });

    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(false);

    t += 1_000;

    expect(limiter.allow()).toBe(true);
  });

  it('should use Date.now when now is not provided', () => {
    let t = 1_000;
    const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => t);

    const limiter = createRateLimiter({ maxEvents: 1, windowMs: 1_000 });

    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(false);

    t += 1_000;

    expect(limiter.allow()).toBe(true);

    dateNowSpy.mockRestore();
  });
});
