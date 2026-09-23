export type OwnerReservation = {
  clientId: string;
  fingerprint: string;
  expiresAt: number;
};

export type OwnerReservationRoomLike = {
  ownerId: string | null;
  ownerReservation: OwnerReservation | null;
  participants: Map<string, unknown>;
};

export type OwnerRestoreRequest = {
  clientId: string;
  fingerprint: string | null;
  now: number;
};

export function reserveOwnerOnDisconnect(
  room: OwnerReservationRoomLike,
  input: {
    clientId: string;
    fingerprint: string | null;
    now: number;
    ttlMs: number;
  },
): void {
  if (room.ownerId !== input.clientId) {
    return;
  }

  if (input.fingerprint && input.ttlMs > 0) {
    room.ownerReservation = {
      clientId: input.clientId,
      fingerprint: input.fingerprint,
      expiresAt: input.now + input.ttlMs,
    };
    room.ownerId = input.clientId;
    return;
  }

  room.ownerReservation = null;
  room.ownerId = room.participants.keys().next().value ?? null;
}

export function restoreReservedOwner(
  room: OwnerReservationRoomLike,
  request: OwnerRestoreRequest | string,
): boolean {
  const normalizedRequest: OwnerRestoreRequest =
    typeof request === 'string'
      ? { clientId: request, fingerprint: null, now: Number.POSITIVE_INFINITY }
      : request;
  const reservation = room.ownerReservation;

  if (
    !reservation ||
    reservation.clientId !== normalizedRequest.clientId ||
    reservation.expiresAt <= normalizedRequest.now ||
    reservation.fingerprint !== normalizedRequest.fingerprint
  ) {
    if (reservation && reservation.expiresAt <= normalizedRequest.now) {
      releaseExpiredOwnerReservation(room, normalizedRequest.now);
    }
    return false;
  }

  room.ownerId = normalizedRequest.clientId;
  room.ownerReservation = null;
  return true;
}

export function releaseExpiredOwnerReservation(
  room: OwnerReservationRoomLike,
  now: number,
): boolean {
  if (!room.ownerReservation) {
    return false;
  }

  if (room.ownerReservation.expiresAt > now) {
    return false;
  }

  room.ownerReservation = null;
  room.ownerId = room.participants.keys().next().value ?? null;
  return true;
}
