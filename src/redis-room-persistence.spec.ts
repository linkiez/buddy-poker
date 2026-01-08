import { describe, expect, it, vi } from 'vitest';

import {
    createLazyRedisClientRoomPersistence,
    createRedisRoomPersistenceFromClient,
    type RedisClientLike,
} from './redis-room-persistence';

const redisMocks = vi.hoisted(() => {
  const client = {
    connect: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  };

  const createClient = vi.fn(() => client);

  return { client, createClient };
});

vi.mock('redis', () => ({
  createClient: redisMocks.createClient,
}));

describe('createRedisRoomPersistenceFromClient', () => {
  it('should set and get state using the key prefix', async () => {
    const store = new Map<string, string>();
    const setCalls: Array<{ key: string; value: string; options: unknown }> = [];

    const client: RedisClientLike = {
      async get(key: string) {
        return store.get(key) ?? null;
      },
      async set(key: string, value: string, options?: unknown) {
        store.set(key, value);
        setCalls.push({ key, value, options });
        return 'OK';
      },
      async del(key: string) {
        store.delete(key);
        return 1;
      },
    };

    const persistence = createRedisRoomPersistenceFromClient({
      client,
      keyPrefix: 'buddy:room:',
      defaultTtlSeconds: 60,
    });

    await persistence.set('abc', { token: 't', rounds: [] });

    expect(await persistence.get('abc')).toEqual({ token: 't', rounds: [] });
    expect(setCalls[0]?.key).toBe('buddy:room:abc');
  });

  it('should set default ttl when ttl is not provided', async () => {
    const client: RedisClientLike = {
      async get() {
        return null;
      },
      async set(_key: string, _value: string, options?: unknown) {
        expect(options).toEqual({ EX: 60 });
        return 'OK';
      },
      async del() {
        return 1;
      },
    };

    const persistence = createRedisRoomPersistenceFromClient({
      client,
      keyPrefix: 'buddy:room:',
      defaultTtlSeconds: 60,
    });

    await persistence.set('abc', { token: 't', rounds: [] });
  });

  it('should prefer a valid ttlSeconds override (floored)', async () => {
    const set = vi.fn().mockResolvedValue('OK');

    const client: RedisClientLike = {
      async get() {
        return null;
      },
      set,
      async del() {
        return 1;
      },
    };

    const persistence = createRedisRoomPersistenceFromClient({
      client,
      keyPrefix: 'buddy:room:',
      defaultTtlSeconds: 60,
    });

    await persistence.set('abc', { token: 't', rounds: [] }, { ttlSeconds: 10.9 });
    expect(set).toHaveBeenCalledWith('buddy:room:abc', expect.any(String), { EX: 10 });
  });

  it('should fallback to default ttl when ttlSeconds is invalid', async () => {
    const set = vi.fn().mockResolvedValue('OK');

    const client: RedisClientLike = {
      async get() {
        return null;
      },
      set,
      async del() {
        return 1;
      },
    };

    const persistence = createRedisRoomPersistenceFromClient({
      client,
      keyPrefix: 'buddy:room:',
      defaultTtlSeconds: 60,
    });

    await persistence.set('abc', { token: 't', rounds: [] }, { ttlSeconds: 0 });
    expect(set).toHaveBeenCalledWith('buddy:room:abc', expect.any(String), { EX: 60 });
  });

  it('should delete using the key prefix', async () => {
    const del = vi.fn().mockResolvedValue(1);

    const client: RedisClientLike = {
      async get() {
        return null;
      },
      async set() {
        return 'OK';
      },
      del,
    };

    const persistence = createRedisRoomPersistenceFromClient({
      client,
      keyPrefix: 'buddy:room:',
      defaultTtlSeconds: 60,
    });

    await persistence.delete('abc');
    expect(del).toHaveBeenCalledWith('buddy:room:abc');
  });

  it('should return null for invalid json payload', async () => {
    const client: RedisClientLike = {
      async get() {
        return '{not-json';
      },
      async set() {
        return 'OK';
      },
      async del() {
        return 1;
      },
    };

    const persistence = createRedisRoomPersistenceFromClient({
      client,
      keyPrefix: 'buddy:room:',
      defaultTtlSeconds: 60,
    });

    expect(await persistence.get('abc')).toBeNull();
  });

  it('should return null when redis has no value', async () => {
    const client: RedisClientLike = {
      async get() {
        return null;
      },
      async set() {
        return 'OK';
      },
      async del() {
        return 1;
      },
    };

    const persistence = createRedisRoomPersistenceFromClient({
      client,
      keyPrefix: 'buddy:room:',
      defaultTtlSeconds: 60,
    });

    expect(await persistence.get('abc')).toBeNull();
  });

  it('should return null when redis returns an empty string', async () => {
    const client: RedisClientLike = {
      async get() {
        return '';
      },
      async set() {
        return 'OK';
      },
      async del() {
        return 1;
      },
    };

    const persistence = createRedisRoomPersistenceFromClient({
      client,
      keyPrefix: 'buddy:room:',
      defaultTtlSeconds: 60,
    });

    expect(await persistence.get('abc')).toBeNull();
  });

  it('should return null when payload is not an object', async () => {
    const client: RedisClientLike = {
      async get() {
        return '123';
      },
      async set() {
        return 'OK';
      },
      async del() {
        return 1;
      },
    };

    const persistence = createRedisRoomPersistenceFromClient({
      client,
      keyPrefix: 'buddy:room:',
      defaultTtlSeconds: 60,
    });

    expect(await persistence.get('abc')).toBeNull();
  });

  it('should return null when payload is JSON null', async () => {
    const client: RedisClientLike = {
      async get() {
        return 'null';
      },
      async set() {
        return 'OK';
      },
      async del() {
        return 1;
      },
    };

    const persistence = createRedisRoomPersistenceFromClient({
      client,
      keyPrefix: 'buddy:room:',
      defaultTtlSeconds: 60,
    });

    expect(await persistence.get('abc')).toBeNull();
  });

  it('should return null when token is not a string', async () => {
    const client: RedisClientLike = {
      async get() {
        return JSON.stringify({ token: 123, rounds: [] });
      },
      async set() {
        return 'OK';
      },
      async del() {
        return 1;
      },
    };

    const persistence = createRedisRoomPersistenceFromClient({
      client,
      keyPrefix: 'buddy:room:',
      defaultTtlSeconds: 60,
    });

    expect(await persistence.get('abc')).toBeNull();
  });

  it('should return null when rounds is not an array', async () => {
    const client: RedisClientLike = {
      async get() {
        return JSON.stringify({ token: 't', rounds: {} });
      },
      async set() {
        return 'OK';
      },
      async del() {
        return 1;
      },
    };

    const persistence = createRedisRoomPersistenceFromClient({
      client,
      keyPrefix: 'buddy:room:',
      defaultTtlSeconds: 60,
    });

    expect(await persistence.get('abc')).toBeNull();
  });
});

describe('createLazyRedisClientRoomPersistence', () => {
  it('should connect once and delegate methods', async () => {
    redisMocks.client.get.mockResolvedValueOnce(JSON.stringify({ token: 't', rounds: [] }));
    redisMocks.client.set.mockResolvedValueOnce('OK');
    redisMocks.client.del.mockResolvedValueOnce(1);

    const persistence = createLazyRedisClientRoomPersistence({
      redisUrl: 'redis://localhost:6379',
      keyPrefix: 'buddy:room:',
      defaultTtlSeconds: 60,
    });

    await expect(persistence.get('abc')).resolves.toEqual({ token: 't', rounds: [] });
    await persistence.set('abc', { token: 't', rounds: [] });
    await persistence.delete('abc');

    expect(redisMocks.createClient).toHaveBeenCalledTimes(1);
    expect(redisMocks.client.connect).toHaveBeenCalledTimes(1);
    expect(redisMocks.client.get).toHaveBeenCalledTimes(1);
    expect(redisMocks.client.set).toHaveBeenCalledTimes(1);
    expect(redisMocks.client.del).toHaveBeenCalledTimes(1);
  });

  it('should pass password to redis client when provided', async () => {
    redisMocks.client.get.mockResolvedValueOnce(JSON.stringify({ token: 't', rounds: [] }));

    const persistence = createLazyRedisClientRoomPersistence({
      redisUrl: 'redis://localhost:6379',
      redisPassword: 'secret',
      keyPrefix: 'buddy:room:',
      defaultTtlSeconds: 60,
    });

    await expect(persistence.get('abc')).resolves.toEqual({ token: 't', rounds: [] });

    expect(redisMocks.createClient).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'redis://localhost:6379', password: 'secret' }),
    );
  });
});
