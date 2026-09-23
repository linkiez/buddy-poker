import type { PokerRoundHistoryEntry } from './round-history';

export type PersistedRoomState = {
  token: string;
  rounds: PokerRoundHistoryEntry[];
  ownerReservation?: PersistedOwnerReservation;
  sessions?: PersistedRoomSession[];
};

export type PersistedOwnerReservation = {
  clientId: string;
  fingerprint: string;
  expiresAt: number;
};

export type PersistedRoomSession = {
  clientId: string;
  name: string;
  fingerprint?: string | null;
  vote?: string | null;
  lastSeenAt: number;
  expiresAt: number;
};

export type RoomPersistenceTtl = {
  ttlSeconds?: number;
};

export type RoomPersistence = {
  get(roomId: string): Promise<PersistedRoomState | null>;
  set(roomId: string, state: PersistedRoomState, ttl?: RoomPersistenceTtl): Promise<void>;
  delete(roomId: string): Promise<void>;
};

export function buildRoomPersistenceKey(input: { keyPrefix: string; roomId: string }): string {
  return `${input.keyPrefix}${input.roomId}`;
}

type InMemoryEntry = {
  state: PersistedRoomState;
  expiresAtMs: number | null;
};

export function createInMemoryRoomPersistence(options?: {
  now?: () => number;
}): RoomPersistence {
  const now = options?.now ?? (() => Date.now());
  const entries = new Map<string, InMemoryEntry>();

  function isExpired(entry: InMemoryEntry): boolean {
    return entry.expiresAtMs !== null && now() > entry.expiresAtMs;
  }

  return {
    async get(roomId: string) {
      const entry = entries.get(roomId);
      if (!entry) {
        return null;
      }

      if (isExpired(entry)) {
        entries.delete(roomId);
        return null;
      }

      const state = removeExpiredRecoveryData(entry.state, now());
      entries.set(roomId, { ...entry, state });
      return state;
    },

    async set(roomId: string, state: PersistedRoomState, ttl?: RoomPersistenceTtl) {
      const ttlSeconds = ttl?.ttlSeconds;
      const expiresAtMs =
        typeof ttlSeconds === 'number' && Number.isFinite(ttlSeconds) && ttlSeconds > 0
          ? now() + ttlSeconds * 1000
          : null;

      entries.set(roomId, { state, expiresAtMs });
    },

    async delete(roomId: string) {
      entries.delete(roomId);
    },
  };
}

function removeExpiredRecoveryData(state: PersistedRoomState, timestamp: number): PersistedRoomState {
  const ownerReservation =
    state.ownerReservation && state.ownerReservation.expiresAt > timestamp
      ? state.ownerReservation
      : undefined;
  const sessions = state.sessions?.filter((session) => session.expiresAt > timestamp);
  const result = { ...state };

  if (ownerReservation) {
    result.ownerReservation = ownerReservation;
  } else {
    delete result.ownerReservation;
  }
  if (sessions && sessions.length > 0) {
    result.sessions = sessions;
  } else if (state.sessions) {
    delete result.sessions;
  }

  return result;
}
