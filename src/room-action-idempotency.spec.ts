import { describe, expect, it } from 'vitest';

import { createRoomActionIdempotency } from './room-action-idempotency';

describe('createRoomActionIdempotency', () => {
  it('treats a repeated action id as a duplicate no-op', async () => {
    const deduplicator = createRoomActionIdempotency();
    let executions = 0;

    await expect(
      deduplicator.execute('action-1', async () => {
        executions += 1;
        return 'applied';
      }),
    ).resolves.toEqual({ duplicate: false, result: 'applied' });

    await expect(
      deduplicator.execute('action-1', async () => {
        executions += 1;
        return 'should-not-run';
      }),
    ).resolves.toEqual({ duplicate: true, result: 'applied' });

    expect(executions).toBe(1);
  });

  it('expires remembered action ids after the configured ttl', async () => {
    let now = 1_000;
    const deduplicator = createRoomActionIdempotency({ now: () => now, ttlMs: 100 });

    await deduplicator.execute('action-1', () => 'first');
    now += 101;

    await expect(deduplicator.execute('action-1', () => 'second')).resolves.toEqual({
      duplicate: false,
      result: 'second',
    });
  });

  it('evicts the oldest action when capacity is exceeded', async () => {
    const deduplicator = createRoomActionIdempotency({ capacity: 2 });

    await deduplicator.execute('action-1', () => 1);
    await deduplicator.execute('action-2', () => 2);
    await deduplicator.execute('action-3', () => 3);

    expect(deduplicator.has('action-1')).toBe(false);
    expect(deduplicator.has('action-2')).toBe(true);
    expect(deduplicator.has('action-3')).toBe(true);
  });
});
