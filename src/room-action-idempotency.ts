export type RoomActionIdempotencyOptions = {
  ttlMs?: number;
  capacity?: number;
  now?: () => number;
};

export type RoomActionExecution<T> = {
  duplicate: boolean;
  result: T;
};

type ActionRecord<T> = {
  expiresAt: number;
  result: T;
};

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CAPACITY = 100;

/**
 * Stores recently applied room actions and makes retries safe to repeat.
 */
export class RoomActionIdempotency {
  private readonly records = new Map<string, ActionRecord<unknown>>();
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly capacity: number;

  public constructor(options: RoomActionIdempotencyOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.ttlMs = normalizePositiveInteger(options.ttlMs, DEFAULT_TTL_MS);
    this.capacity = normalizePositiveInteger(options.capacity, DEFAULT_CAPACITY);
  }

  public has(actionId: string): boolean {
    this.cleanup();
    return this.records.has(actionId);
  }

  public remember(actionId: string): void {
    this.cleanup();
    this.records.set(actionId, { expiresAt: this.now() + this.ttlMs, result: undefined });
    this.enforceCapacity();
  }

  public async execute<T>(
    actionId: string,
    action: () => T | Promise<T>,
  ): Promise<RoomActionExecution<T>> {
    this.cleanup();
    const existing = this.records.get(actionId);
    if (existing) {
      return { duplicate: true, result: existing.result as T };
    }

    const result = await action();
    this.records.set(actionId, { expiresAt: this.now() + this.ttlMs, result });
    this.enforceCapacity();
    return { duplicate: false, result };
  }

  private cleanup(): void {
    const timestamp = this.now();
    for (const [actionId, record] of this.records) {
      if (record.expiresAt <= timestamp) {
        this.records.delete(actionId);
      }
    }
  }

  private enforceCapacity(): void {
    while (this.records.size > this.capacity) {
      const oldestActionId = this.records.keys().next().value;
      if (typeof oldestActionId !== 'string') {
        return;
      }
      this.records.delete(oldestActionId);
    }
  }
}

export function createRoomActionIdempotency(
  options?: RoomActionIdempotencyOptions,
): RoomActionIdempotency {
  return new RoomActionIdempotency(options);
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}
