import { describe, expect, it } from 'vitest';

import { DEFAULT_DISCONNECT_TIMEOUT_MS, resolveDisconnectTimeoutMs } from './disconnect-timeout';

describe('disconnect-timeout', () => {
  it('should default to 20 minutes', () => {
    expect(DEFAULT_DISCONNECT_TIMEOUT_MS).toBe(20 * 60 * 1000);
  });

  it('should use the default when the value is missing or blank', () => {
    expect(resolveDisconnectTimeoutMs(undefined)).toBe(DEFAULT_DISCONNECT_TIMEOUT_MS);
    expect(resolveDisconnectTimeoutMs('')).toBe(DEFAULT_DISCONNECT_TIMEOUT_MS);
    expect(resolveDisconnectTimeoutMs('   ')).toBe(DEFAULT_DISCONNECT_TIMEOUT_MS);
  });

  it('should use the default when the value is not a positive number', () => {
    expect(resolveDisconnectTimeoutMs('abc')).toBe(DEFAULT_DISCONNECT_TIMEOUT_MS);
    expect(resolveDisconnectTimeoutMs('0')).toBe(DEFAULT_DISCONNECT_TIMEOUT_MS);
    expect(resolveDisconnectTimeoutMs('-5')).toBe(DEFAULT_DISCONNECT_TIMEOUT_MS);
    expect(resolveDisconnectTimeoutMs('Infinity')).toBe(DEFAULT_DISCONNECT_TIMEOUT_MS);
  });

  it('should accept a positive override and floor decimals', () => {
    expect(resolveDisconnectTimeoutMs('60000')).toBe(60_000);
    expect(resolveDisconnectTimeoutMs('1500.9')).toBe(1_500);
  });
});
