export type RateLimiter = {
  allow(): boolean;
};

export type CreateRateLimiterOptions = {
  maxEvents: number;
  windowMs: number;
  now?: () => number;
};

export function createRateLimiter(options: CreateRateLimiterOptions): RateLimiter {
  const maxEvents = Math.floor(options.maxEvents);
  const windowMs = Math.floor(options.windowMs);
  const now = options.now ?? (() => Date.now());

  if (!Number.isFinite(maxEvents) || maxEvents <= 0) {
    throw new TypeError('maxEvents must be a positive integer');
  }

  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new TypeError('windowMs must be a positive integer');
  }

  let windowStartMs = now();
  let usedInWindow = 0;

  return {
    allow(): boolean {
      const currentMs = now();

      if (currentMs - windowStartMs >= windowMs) {
        windowStartMs = currentMs;
        usedInWindow = 0;
      }

      if (usedInWindow >= maxEvents) {
        return false;
      }

      usedInWindow += 1;
      return true;
    },
  };
}
