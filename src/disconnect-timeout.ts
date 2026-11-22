/** Default time a disconnected participant keeps their seat and vote in a room. */
export const DEFAULT_DISCONNECT_TIMEOUT_MS = 20 * 60 * 1000;

/**
 * Resolves how long a disconnected participant stays in the room.
 *
 * @param raw - Raw `DISCONNECT_TIMEOUT_MS` environment value
 * @returns Positive integer milliseconds, or the 20-minute default when the value is missing or invalid
 */
export function resolveDisconnectTimeoutMs(raw: string | undefined): number {
  if (!raw?.trim()) {
    return DEFAULT_DISCONNECT_TIMEOUT_MS;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_DISCONNECT_TIMEOUT_MS;
  }

  return Math.floor(parsed);
}
