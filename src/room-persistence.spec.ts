import { describe, expect, it, vi } from 'vitest';

import {
    buildRoomPersistenceKey,
    createInMemoryRoomPersistence,
    type PersistedRoomState,
} from './room-persistence';

describe('buildRoomPersistenceKey', () => {
  it('should prefix the room id', () => {
    expect(buildRoomPersistenceKey({ keyPrefix: 'buddy:', roomId: 'abc' })).toBe('buddy:abc');
  });
});

describe('createInMemoryRoomPersistence', () => {
  it('should store and retrieve room state', async () => {
    const persistence = createInMemoryRoomPersistence();

    const state: PersistedRoomState = { token: 't', rounds: [] };
    await persistence.set('room-1', state, { ttlSeconds: 60 });

    await expect(persistence.get('room-1')).resolves.toEqual(state);
  });

  it('should expire keys when ttlSeconds elapsed', async () => {
    let t = 1_000;
    const now = vi.fn(() => t);

    const persistence = createInMemoryRoomPersistence({ now });

    await persistence.set('room-1', { token: 't', rounds: [] }, { ttlSeconds: 10 });
    expect(await persistence.get('room-1')).not.toBeNull();

    t += 10_001;
    expect(await persistence.get('room-1')).toBeNull();
  });

  it('should delete a room', async () => {
    const persistence = createInMemoryRoomPersistence();

    await persistence.set('room-1', { token: 't', rounds: [] });
    await persistence.delete('room-1');

    expect(await persistence.get('room-1')).toBeNull();
  });
});
