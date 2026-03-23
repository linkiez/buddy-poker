import { describe, expect, it } from 'vitest';

import {
  releaseExpiredOwnerReservation,
  reserveOwnerOnDisconnect,
  restoreReservedOwner,
  type OwnerReservationRoomLike,
} from './owner-reservation';

describe('owner-reservation', () => {
  function createRoom(): OwnerReservationRoomLike {
    return {
      ownerId: 'owner-1',
      ownerReservation: null,
      participants: new Map<string, unknown>([
        ['peer-1', {}],
        ['peer-2', {}],
      ]),
    };
  }

  it('should reserve the owner when disconnecting with fingerprint and remaining participants', () => {
    const room = createRoom();

    reserveOwnerOnDisconnect(room, {
      clientId: 'owner-1',
      fingerprint: 'fp-owner',
      now: 100,
      ttlMs: 30_000,
    });

    expect(room.ownerId).toBe('owner-1');
    expect(room.ownerReservation).toEqual({
      clientId: 'owner-1',
      fingerprint: 'fp-owner',
      expiresAt: 30_100,
    });
  });

  it('should transfer ownership immediately when there is no fingerprint', () => {
    const room = createRoom();

    reserveOwnerOnDisconnect(room, {
      clientId: 'owner-1',
      fingerprint: null,
      now: 100,
      ttlMs: 30_000,
    });

    expect(room.ownerReservation).toBeNull();
    expect(room.ownerId).toBe('peer-1');
  });

  it('should restore reserved ownership when the same client rejoins', () => {
    const room = createRoom();
    room.ownerId = 'owner-1';
    room.ownerReservation = {
      clientId: 'owner-1',
      fingerprint: 'fp-owner',
      expiresAt: 30_100,
    };

    expect(restoreReservedOwner(room, 'owner-1')).toBe(true);
    expect(room.ownerReservation).toBeNull();
    expect(room.ownerId).toBe('owner-1');
  });

  it('should release expired reservation and transfer ownership to next participant', () => {
    const room = createRoom();
    room.ownerReservation = {
      clientId: 'owner-1',
      fingerprint: 'fp-owner',
      expiresAt: 200,
    };

    expect(releaseExpiredOwnerReservation(room, 201)).toBe(true);
    expect(room.ownerReservation).toBeNull();
    expect(room.ownerId).toBe('peer-1');
  });
});
