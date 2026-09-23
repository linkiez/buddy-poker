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

  it('should preserve optional owner and session recovery fields', async () => {
    let timestamp = 1_000;
    const persistence = createInMemoryRoomPersistence({ now: () => timestamp });
    const state: PersistedRoomState = {
      token: 't',
      rounds: [],
      ownerReservation: {
        clientId: 'client-1',
        fingerprint: 'fingerprint-1',
        expiresAt: 2_000,
      },
      sessions: [
        {
          clientId: 'client-1',
          name: 'Alice',
          fingerprint: 'fingerprint-1',
          lastSeenAt: 1_500,
          expiresAt: 2_500,
        },
      ],
    };

    await persistence.set('room-1', state);

    await expect(persistence.get('room-1')).resolves.toEqual(state);
  });

  it('should clean expired owner and session recovery fields without expiring the room', async () => {
    let timestamp = 1_000;
    const persistence = createInMemoryRoomPersistence({ now: () => timestamp });
    await persistence.set('room-1', {
      token: 't',
      rounds: [],
      ownerReservation: {
        clientId: 'expired-owner',
        fingerprint: 'fingerprint-1',
        expiresAt: 1_100,
      },
      sessions: [
        {
          clientId: 'expired-session',
          name: 'Expired',
          lastSeenAt: 1_000,
          expiresAt: 1_100,
        },
        {
          clientId: 'active-session',
          name: 'Active',
          lastSeenAt: 1_000,
          expiresAt: 2_000,
        },
      ],
    });

    timestamp = 1_101;

    await expect(persistence.get('room-1')).resolves.toEqual({
      token: 't',
      rounds: [],
      sessions: [
        {
          clientId: 'active-session',
          name: 'Active',
          lastSeenAt: 1_000,
          expiresAt: 2_000,
        },
      ],
    });
  });
});
