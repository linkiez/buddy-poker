import type { Request } from 'express';
import { createRateLimiter, type RateLimiter } from './rate-limit';

export type HttpRateLimitOptions = {
  maxEvents: number;
  windowMs: number;
  key?: (request: Request) => string;
  now?: () => number;
};

export type HttpRateLimiter = {
  allow(request: Request): boolean;
};

/**
 * Creates a bounded per-client HTTP request limiter.
 *
 * @param options - Request limit and client-key configuration.
 * @returns A limiter that tracks independent request windows per client.
 */
export function createHttpRateLimiter(options: HttpRateLimitOptions): HttpRateLimiter {
  const key = options.key ?? ((request: Request) => request.ip || 'unknown');
  const limiters = new Map<string, RateLimiter>();

  return {
    allow(request: Request): boolean {
      const clientKey = key(request);
      let limiter = limiters.get(clientKey);
      if (!limiter) {
        limiter = createRateLimiter(options);
        limiters.set(clientKey, limiter);
      }

      return limiter.allow();
    },
  };
}
