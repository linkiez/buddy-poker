import {
  buildRoomPersistenceKey,
  type PersistedRoomState,
  type RoomPersistence,
} from './room-persistence';

export type RedisClientLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: unknown): Promise<unknown>;
  del(key: string): Promise<number>;
};

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function parsePersistedRoomState(raw: string, now: () => number): PersistedRoomState | null {
  const parsed = safeJsonParse(raw);
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const token = (parsed as { token?: unknown }).token;
  const rounds = (parsed as { rounds?: unknown }).rounds;

  if (typeof token !== 'string') {
    return null;
  }

  if (!Array.isArray(rounds)) {
    return null;
  }

  const state: PersistedRoomState = {
    token,
    rounds: rounds as PersistedRoomState['rounds'],
  };

  const ownerReservation = (parsed as { ownerReservation?: unknown }).ownerReservation;
  if (isOwnerReservation(ownerReservation)) {
    state.ownerReservation = ownerReservation;
  }

  const sessions = (parsed as { sessions?: unknown }).sessions;
  if (Array.isArray(sessions)) {
    const validSessions = sessions.filter(isPersistedRoomSession);
    if (validSessions.length > 0) {
      state.sessions = validSessions;
    }
  }

  return removeExpiredRecoveryData(state, now());
}

export function createRedisRoomPersistenceFromClient(input: {
  client: RedisClientLike;
  keyPrefix: string;
  defaultTtlSeconds: number;
  now?: () => number;
}): RoomPersistence {
  const defaultTtlSeconds = Math.floor(input.defaultTtlSeconds);
  const now = input.now ?? (() => Date.now());

  return {
    async get(roomId: string) {
      const key = buildRoomPersistenceKey({ keyPrefix: input.keyPrefix, roomId });
      const value = await input.client.get(key);
      if (!value) {
        return null;
      }

      return parsePersistedRoomState(value, now);
    },

    async set(roomId: string, state: PersistedRoomState, ttl) {
      const key = buildRoomPersistenceKey({ keyPrefix: input.keyPrefix, roomId });

      const ttlSecondsRaw = ttl?.ttlSeconds;
      const ttlSeconds =
        typeof ttlSecondsRaw === 'number' && Number.isFinite(ttlSecondsRaw) && ttlSecondsRaw > 0
          ? Math.floor(ttlSecondsRaw)
          : defaultTtlSeconds;

      const payload = JSON.stringify(state);

      await input.client.set(key, payload, { EX: ttlSeconds });
    },

    async delete(roomId: string) {
      const key = buildRoomPersistenceKey({ keyPrefix: input.keyPrefix, roomId });
      await input.client.del(key);
    },
  };
}

function isOwnerReservation(value: unknown): value is NonNullable<PersistedRoomState['ownerReservation']> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['clientId'] === 'string' &&
    typeof candidate['fingerprint'] === 'string' &&
    typeof candidate['expiresAt'] === 'number' &&
    Number.isFinite(candidate['expiresAt'])
  );
}

function isPersistedRoomSession(value: unknown): value is NonNullable<PersistedRoomState['sessions']>[number] {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['clientId'] === 'string' &&
    typeof candidate['name'] === 'string' &&
    (typeof candidate['fingerprint'] === 'string' || candidate['fingerprint'] === null || candidate['fingerprint'] === undefined) &&
    (typeof candidate['vote'] === 'string' || candidate['vote'] === null || candidate['vote'] === undefined) &&
    typeof candidate['lastSeenAt'] === 'number' &&
    Number.isFinite(candidate['lastSeenAt']) &&
    typeof candidate['expiresAt'] === 'number' &&
    Number.isFinite(candidate['expiresAt'])
  );
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

export function createLazyRedisClientRoomPersistence(input: {
  redisUrl: string;
  redisPassword?: string;
  keyPrefix: string;
  defaultTtlSeconds: number;
}): RoomPersistence {
  let clientPromise: Promise<RedisClientLike> | null = null;

  async function getClient(): Promise<RedisClientLike> {
    clientPromise ??= (async () => {
      const { createClient } = await import('redis');

      const redisPassword = input.redisPassword?.trim();
      const client = redisPassword
        ? createClient({ url: input.redisUrl, password: redisPassword })
        : createClient({ url: input.redisUrl });
      await client.connect();
      return client as unknown as RedisClientLike;
    })();

    return clientPromise;
  }

  const base = createRedisRoomPersistenceFromClient({
    client: {
      async get(key) {
        const client = await getClient();
        return client.get(key);
      },
      async set(key, value, options) {
        const client = await getClient();
        return client.set(key, value, options);
      },
      async del(key) {
        const client = await getClient();
        return client.del(key);
      },
    },
    keyPrefix: input.keyPrefix,
    defaultTtlSeconds: input.defaultTtlSeconds,
  });

  return base;
}
