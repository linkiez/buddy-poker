import FingerprintJS from '@fingerprintjs/fingerprintjs';

let cachedFingerprint: string | null = null;

/**
 * Generates a unique browser fingerprint that identifies the device/browser.
 * The fingerprint is cached after the first generation to improve performance.
 *
 * @returns A promise that resolves to the fingerprint string
 */
export async function getBrowserFingerprint(): Promise<string> {
  const testFingerprint = (globalThis as { __TEST_FINGERPRINT?: string }).__TEST_FINGERPRINT;
  if (typeof testFingerprint === 'string' && testFingerprint.trim()) {
    return testFingerprint;
  }

  if (cachedFingerprint) {
    return cachedFingerprint;
  }

  const fp = await FingerprintJS.load();
  const result = await fp.get();
  cachedFingerprint = result.visitorId;

  return cachedFingerprint;
}
