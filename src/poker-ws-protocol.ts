export type PokerWsMessageFromClient =
  | { type: 'join'; roomId: string; name: string; token?: string }
  | { type: 'vote'; value: string }
  | { type: 'reveal' }
  | { type: 'reset' };

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

export function parsePokerWsMessageFromClient(raw: string): PokerWsMessageFromClient | null {
  const parsed = safeJsonParse(raw);
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const msg = parsed as Record<string, unknown>;
  const type = msg['type'];

  switch (type) {
    case 'join': {
      const roomId = msg['roomId'];
      const name = msg['name'];
      const token = msg['token'];

      if (typeof roomId !== 'string' || typeof name !== 'string') {
        return null;
      }

      return {
        type: 'join',
        roomId,
        name,
        ...(typeof token === 'string' ? { token } : {}),
      };
    }

    case 'vote': {
      const value = msg['value'];
      if (typeof value !== 'string') {
        return null;
      }

      return { type: 'vote', value };
    }

    case 'reveal':
      return { type: 'reveal' };

    case 'reset':
      return { type: 'reset' };

    default:
      return null;
  }
}
