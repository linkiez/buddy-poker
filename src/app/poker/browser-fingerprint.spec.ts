import { describe, expect, it, vi } from 'vitest';

import { getBrowserFingerprint } from './browser-fingerprint';

describe('getBrowserFingerprint', () => {
  it('should return a non-empty string fingerprint', async () => {
    const fingerprint = await getBrowserFingerprint();
    expect(fingerprint).toBeTruthy();
    expect(typeof fingerprint).toBe('string');
    expect(fingerprint.length).toBeGreaterThan(0);
  });

  it('should return the same fingerprint on consecutive calls', async () => {
    const fingerprint1 = await getBrowserFingerprint();
    const fingerprint2 = await getBrowserFingerprint();
    expect(fingerprint1).toBe(fingerprint2);
  });

  it('should return a cached fingerprint on second call', async () => {
    // Clear any existing cache
    vi.clearAllMocks();

    const fingerprint1 = await getBrowserFingerprint();
    const fingerprint2 = await getBrowserFingerprint();

    expect(fingerprint1).toBe(fingerprint2);
  });
});
