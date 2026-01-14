export type PokerWsMessageFromClient =
  | { type: 'join'; roomId: string; name: string; token?: string; fingerprint?: string }
  | { type: 'vote'; value: string }
  | { type: 'reveal' }
  | { type: 'reset' }
  | { type: 'webrtc-join'; roomId: string; token?: string }
  | { type: 'webrtc-offer'; roomId: string; targetPeerId: string; offer: RTCSessionDescriptionInit }
  | { type: 'webrtc-answer'; roomId: string; targetPeerId: string; answer: RTCSessionDescriptionInit }
  | { type: 'webrtc-ice-candidate'; roomId: string; targetPeerId: string; candidate: RTCIceCandidateInit };

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
      const fingerprint = msg['fingerprint'];

      if (typeof roomId !== 'string' || typeof name !== 'string') {
        return null;
      }

      return {
        type: 'join',
        roomId,
        name,
        ...(typeof token === 'string' ? { token } : {}),
        ...(typeof fingerprint === 'string' ? { fingerprint } : {}),
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

    case 'webrtc-join': {
      const roomId = msg['roomId'];
      const token = msg['token'];

      if (typeof roomId !== 'string') {
        return null;
      }

      return {
        type: 'webrtc-join',
        roomId,
        ...(typeof token === 'string' ? { token } : {}),
      };
    }

    case 'webrtc-offer': {
      const roomId = msg['roomId'];
      const targetPeerId = msg['targetPeerId'];
      const offer = msg['offer'];

      if (typeof roomId !== 'string' || typeof targetPeerId !== 'string' || !offer) {
        return null;
      }

      return {
        type: 'webrtc-offer',
        roomId,
        targetPeerId,
        offer: offer as RTCSessionDescriptionInit,
      };
    }

    case 'webrtc-answer': {
      const roomId = msg['roomId'];
      const targetPeerId = msg['targetPeerId'];
      const answer = msg['answer'];

      if (typeof roomId !== 'string' || typeof targetPeerId !== 'string' || !answer) {
        return null;
      }

      return {
        type: 'webrtc-answer',
        roomId,
        targetPeerId,
        answer: answer as RTCSessionDescriptionInit,
      };
    }

    case 'webrtc-ice-candidate': {
      const roomId = msg['roomId'];
      const targetPeerId = msg['targetPeerId'];
      const candidate = msg['candidate'];

      if (typeof roomId !== 'string' || typeof targetPeerId !== 'string' || !candidate) {
        return null;
      }

      return {
        type: 'webrtc-ice-candidate',
        roomId,
        targetPeerId,
        candidate: candidate as RTCIceCandidateInit,
      };
    }

    default:
      return null;
  }
}
