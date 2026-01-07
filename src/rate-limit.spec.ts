import { describe, expect, it, vi } from 'vitest';

import { createRateLimiter } from './rate-limit';

describe('createRateLimiter', () => {
  it('should throw for invalid maxEvents', () => {
    expect(() => createRateLimiter({ maxEvents: 0, windowMs: 1000 })).toThrow(TypeError);
    expect(() => createRateLimiter({ maxEvents: Number.NaN, windowMs: 1000 })).toThrow(TypeError);
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
