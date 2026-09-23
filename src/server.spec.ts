import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from './server';

describe('HTTP poker server contract', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Test server did not expose a TCP address');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('supports HTTP join, idempotent vote, ordered events, and moderator actions', async () => {
    const roomId = `integration-${Date.now()}`;
    const join = await postAction({
      type: 'join',
      roomId,
      name: 'Moderator',
    });
    expect(join.response.status).toBe(200);
    expect(join.body['clientId']).toEqual(expect.any(String));
    expect((join.body['message'] as { token?: unknown }).token).toEqual(expect.any(String));

    const clientId = join.body['clientId'] as string;
    const token = (join.body['message'] as { token: string }).token;
    const vote = await postAction(
      { type: 'vote', roomId, value: '5', actionId: 'vote-1' },
      clientId,
    );
    expect(vote.response.status).toBe(200);

    const duplicate = await postAction(
      { type: 'vote', roomId, value: '8', actionId: 'vote-1' },
      clientId,
    );
    expect(duplicate.response.status).toBe(200);
    expect(duplicate.body['duplicate']).toBe(true);

    const events = await fetch(`${baseUrl}/api/poker/events?clientId=${clientId}&lastEventId=0`);
    expect(events.status).toBe(200);
    expect((await events.json()).events.length).toBeGreaterThan(0);

    const reveal = await postAction(
      { type: 'reveal', roomId, actionId: 'reveal-1' },
      clientId,
    );
    expect(reveal.response.status).toBe(200);

    const invalidToken = await postAction({
      type: 'join',
      roomId,
      name: 'Intruder',
      token: 'invalid-token',
    });
    expect(invalidToken.response.status).toBe(403);

    expect(token).toBeTruthy();
  });

  it('rejects a non-moderator reveal while allowing participant recovery', async () => {
    const roomId = `recovery-${Date.now()}`;
    const moderator = await postAction({ type: 'join', roomId, name: 'Moderator' });
    const token = (moderator.body['message'] as { token: string }).token;
    const participant = await postAction({
      type: 'join',
      roomId,
      name: 'Participant',
      token,
      fingerprint: 'participant-fingerprint',
    });
    const participantId = participant.body['clientId'] as string;

    const rejected = await postAction(
      { type: 'reveal', roomId, actionId: 'participant-reveal' },
      participantId,
    );
    expect(rejected.response.status).toBe(403);

    const recovered = await postAction({
      type: 'join',
      roomId,
      name: 'Participant',
      token,
      fingerprint: 'participant-fingerprint',
      clientId: participantId,
    });
    expect(recovered.response.status).toBe(200);
    expect(recovered.body['clientId']).toBe(participantId);

    const mismatchedFingerprint = await postAction({
      type: 'join',
      roomId,
      name: 'Participant',
      fingerprint: 'different-fingerprint',
      clientId: participantId,
    });

    expect(mismatchedFingerprint.response.status).toBe(403);
  });

  it('allows HTTP reload recovery while the previous client session is still active', async () => {
    const roomId = `active-session-recovery-${Date.now()}`;
    const moderator = await postAction({ type: 'join', roomId, name: 'Moderator' });
    const token = (moderator.body['message'] as { token: string }).token;
    const participant = await postAction({
      type: 'join',
      roomId,
      name: 'Participant',
      token,
      fingerprint: 'active-session-fingerprint',
    });
    const participantId = participant.body['clientId'] as string;

    const recovered = await postAction({
      type: 'join',
      roomId,
      name: 'Participant',
      fingerprint: 'active-session-fingerprint',
      clientId: participantId,
    });

    expect(recovered.response.status).toBe(200);
    expect(recovered.body['clientId']).toBe(participantId);
  });

  it(
    'rate-limits repeated public HTTP action requests',
    async () => {
      const responses = await Promise.all(
        Array.from({ length: 121 }, () =>
          fetch(`${baseUrl}/api/poker/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'invalid' }),
          }),
        ),
      );

      expect(responses.at(-1)?.status).toBe(429);
      expect(responses.at(-1)?.headers.get('retry-after')).toBe('60');
    },
    20_000,
  );

  async function postAction(
    body: Record<string, string>,
    clientId?: string,
  ): Promise<{ response: Response; body: Record<string, unknown> }> {
    const response = await fetch(`${baseUrl}/api/poker/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(clientId ? { 'X-Client-Id': clientId } : {}),
      },
      body: JSON.stringify(body),
    });

    return {
      response,
      body: (await response.json()) as Record<string, unknown>,
    };
  }
});
