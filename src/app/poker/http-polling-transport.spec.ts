import { afterEach, describe, expect, it, vi } from 'vitest';

import { saveBrowserSession } from './browser-session';
import { HttpPollingTransport } from './http-polling-transport';

describe('HttpPollingTransport', () => {
  let persistedRoomId: string | null = null;

  afterEach(() => {
    localStorage.removeItem('bp_session_room-1');
    if (persistedRoomId) {
      localStorage.removeItem(`bp_session_${persistedRoomId}`);
      localStorage.removeItem(`bp_clientId_${persistedRoomId}`);
      localStorage.removeItem(`bp_lastEventId_${persistedRoomId}`);
      persistedRoomId = null;
    }
    vi.restoreAllMocks();
  });

  it('sends action identifiers and preserves the browser session envelope', async () => {
    const messages: unknown[] = [];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        clientId: 'client-1',
        message: { type: 'joined', clientId: 'client-1', roomId: 'room-1' },
      }),
    } as Response);
    const transport = new HttpPollingTransport({
      onStatusChange: () => undefined,
      onMessage: (message) => messages.push(message),
      onError: () => undefined,
    });

    await transport.connect('room-1', 'Alice', undefined, 'fingerprint-1');
    transport.send({ type: 'vote', roomId: 'room-1', value: '5', actionId: 'vote-1' });
    await Promise.resolve();

    const voteCall = fetchMock.mock.calls.find((call) => String(call[1]?.body).includes('"vote"'));
    expect(voteCall).toBeDefined();
    expect(JSON.parse(String(voteCall?.[1]?.body))).toMatchObject({
      type: 'vote',
      actionId: 'vote-1',
    });
    expect(messages).toContainEqual({ type: 'joined', clientId: 'client-1', roomId: 'room-1' });
    transport.disconnect();
  });

  it('exposes rejoin-required when the polling session returns 404', async () => {
    const statuses: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Session not found',
    } as Response);
    const transport = new HttpPollingTransport({
      onStatusChange: (status) => statuses.push(status),
      onMessage: () => undefined,
      onError: () => undefined,
    });

    await transport.connect('room-1', 'Alice');

    expect(statuses).toContain('rejoin-required');
    expect(transport.status).toBe('rejoin-required');
    transport.disconnect();
  });

  it('reuses the persisted fingerprint when reconnecting a browser session', async () => {
    persistedRoomId = `persisted-room-${Date.now()}`;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        clientId: 'client-1',
        message: { type: 'joined', clientId: 'client-1', roomId: 'room-1' },
      }),
    } as Response);
    saveBrowserSession({
      schemaVersion: 1,
      roomId: persistedRoomId,
      clientId: 'client-1',
      name: 'Alice',
      fingerprint: 'persisted-fingerprint',
      lastEventId: 0,
      updatedAt: Date.now(),
    });
    const transport = new HttpPollingTransport({
      onStatusChange: () => undefined,
      onMessage: () => undefined,
      onError: () => undefined,
    });

    await transport.connect(persistedRoomId, 'Alice', undefined, 'new-runtime-fingerprint');

    const joinCall = fetchMock.mock.calls.find((call) => String(call[1]?.body).includes('"join"'));
    expect(JSON.parse(String(joinCall?.[1]?.body))).toMatchObject({
      clientId: 'client-1',
      fingerprint: 'persisted-fingerprint',
    });
    transport.disconnect();
  });
});
