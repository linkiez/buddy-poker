import { describe, expect, it } from 'vitest';

import { parsePokerWsMessageFromClient } from './poker-ws-protocol';

describe('parsePokerWsMessageFromClient', () => {
  it('should return null for invalid JSON', () => {
    expect(parsePokerWsMessageFromClient('{')).toBeNull();
  });

  it('should return null for non-object JSON', () => {
    expect(parsePokerWsMessageFromClient('null')).toBeNull();
    expect(parsePokerWsMessageFromClient('123')).toBeNull();
    expect(parsePokerWsMessageFromClient('"x"')).toBeNull();
    expect(parsePokerWsMessageFromClient('[]')).toBeNull();
  });

  it('should return null when type is missing', () => {
    expect(parsePokerWsMessageFromClient(JSON.stringify({ roomId: 'r', name: 'n' }))).toBeNull();
  });

  it('should parse join message (without token)', () => {
    expect(parsePokerWsMessageFromClient(JSON.stringify({ type: 'join', roomId: 'r', name: 'n' }))).toEqual({
      type: 'join',
      roomId: 'r',
      name: 'n',
    });
  });

  it('should parse join message (with token)', () => {
    expect(
      parsePokerWsMessageFromClient(JSON.stringify({ type: 'join', roomId: 'r', name: 'n', token: 't' })),
    ).toEqual({
      type: 'join',
      roomId: 'r',
      name: 'n',
      token: 't',
    });
  });

  it('should ignore non-string token on join', () => {
    expect(
      parsePokerWsMessageFromClient(JSON.stringify({ type: 'join', roomId: 'r', name: 'n', token: 123 })),
    ).toEqual({
      type: 'join',
      roomId: 'r',
      name: 'n',
    });
  });

  it('should return null for invalid join payload', () => {
    expect(parsePokerWsMessageFromClient(JSON.stringify({ type: 'join', roomId: 1, name: 'n' }))).toBeNull();
    expect(parsePokerWsMessageFromClient(JSON.stringify({ type: 'join', roomId: 'r', name: 2 }))).toBeNull();
  });

  it('should parse vote message', () => {
    expect(parsePokerWsMessageFromClient(JSON.stringify({ type: 'vote', value: '5' }))).toEqual({
      type: 'vote',
      value: '5',
    });
  });

  it('should return null for invalid vote payload', () => {
    expect(parsePokerWsMessageFromClient(JSON.stringify({ type: 'vote', value: 5 }))).toBeNull();
  });

  it('should parse reveal/reset messages', () => {
    expect(parsePokerWsMessageFromClient(JSON.stringify({ type: 'reveal' }))).toEqual({ type: 'reveal' });
    expect(parsePokerWsMessageFromClient(JSON.stringify({ type: 'reset' }))).toEqual({ type: 'reset' });
  });

  it('should return null for unknown types', () => {
    expect(parsePokerWsMessageFromClient(JSON.stringify({ type: 'nope' }))).toBeNull();
  });

  it('should parse webrtc-join message (without token)', () => {
    expect(parsePokerWsMessageFromClient(JSON.stringify({ type: 'webrtc-join', roomId: 'r' }))).toEqual({
      type: 'webrtc-join',
      roomId: 'r',
    });
  });

  it('should parse webrtc-join message (with token)', () => {
    expect(
      parsePokerWsMessageFromClient(JSON.stringify({ type: 'webrtc-join', roomId: 'r', token: 't' })),
    ).toEqual({
      type: 'webrtc-join',
      roomId: 'r',
      token: 't',
    });
  });

  it('should ignore non-string token on webrtc-join', () => {
    expect(
      parsePokerWsMessageFromClient(JSON.stringify({ type: 'webrtc-join', roomId: 'r', token: 123 })),
    ).toEqual({
      type: 'webrtc-join',
      roomId: 'r',
    });
  });

  it('should return null for invalid webrtc-join payload', () => {
    expect(parsePokerWsMessageFromClient(JSON.stringify({ type: 'webrtc-join', roomId: 123 }))).toBeNull();
    expect(parsePokerWsMessageFromClient(JSON.stringify({ type: 'webrtc-join' }))).toBeNull();
  });

  it('should parse webrtc-offer message', () => {
    const offer = { type: 'offer', sdp: 'mock-sdp' };
    expect(
      parsePokerWsMessageFromClient(
        JSON.stringify({ type: 'webrtc-offer', roomId: 'r', targetPeerId: 'peer1', offer }),
      ),
    ).toEqual({
      type: 'webrtc-offer',
      roomId: 'r',
      targetPeerId: 'peer1',
      offer,
    });
  });

  it('should return null for invalid webrtc-offer payload', () => {
    const offer = { type: 'offer', sdp: 'mock-sdp' };
    expect(
      parsePokerWsMessageFromClient(JSON.stringify({ type: 'webrtc-offer', roomId: 123, targetPeerId: 'p', offer })),
    ).toBeNull();
    expect(
      parsePokerWsMessageFromClient(JSON.stringify({ type: 'webrtc-offer', roomId: 'r', targetPeerId: 123, offer })),
    ).toBeNull();
    expect(
      parsePokerWsMessageFromClient(JSON.stringify({ type: 'webrtc-offer', roomId: 'r', targetPeerId: 'p' })),
    ).toBeNull();
  });

  it('should parse webrtc-answer message', () => {
    const answer = { type: 'answer', sdp: 'mock-sdp' };
    expect(
      parsePokerWsMessageFromClient(
        JSON.stringify({ type: 'webrtc-answer', roomId: 'r', targetPeerId: 'peer1', answer }),
      ),
    ).toEqual({
      type: 'webrtc-answer',
      roomId: 'r',
      targetPeerId: 'peer1',
      answer,
    });
  });

  it('should return null for invalid webrtc-answer payload', () => {
    const answer = { type: 'answer', sdp: 'mock-sdp' };
    expect(
      parsePokerWsMessageFromClient(JSON.stringify({ type: 'webrtc-answer', roomId: 123, targetPeerId: 'p', answer })),
    ).toBeNull();
    expect(
      parsePokerWsMessageFromClient(JSON.stringify({ type: 'webrtc-answer', roomId: 'r', targetPeerId: 123, answer })),
    ).toBeNull();
    expect(
      parsePokerWsMessageFromClient(JSON.stringify({ type: 'webrtc-answer', roomId: 'r', targetPeerId: 'p' })),
    ).toBeNull();
  });

  it('should parse webrtc-ice-candidate message', () => {
    const candidate = { candidate: 'mock-candidate', sdpMid: '0', sdpMLineIndex: 0 };
    expect(
      parsePokerWsMessageFromClient(
        JSON.stringify({ type: 'webrtc-ice-candidate', roomId: 'r', targetPeerId: 'peer1', candidate }),
      ),
    ).toEqual({
      type: 'webrtc-ice-candidate',
      roomId: 'r',
      targetPeerId: 'peer1',
      candidate,
    });
  });

  it('should return null for invalid webrtc-ice-candidate payload', () => {
    const candidate = { candidate: 'mock-candidate', sdpMid: '0', sdpMLineIndex: 0 };
    expect(
      parsePokerWsMessageFromClient(
        JSON.stringify({ type: 'webrtc-ice-candidate', roomId: 123, targetPeerId: 'p', candidate }),
      ),
    ).toBeNull();
    expect(
      parsePokerWsMessageFromClient(
        JSON.stringify({ type: 'webrtc-ice-candidate', roomId: 'r', targetPeerId: 123, candidate }),
      ),
    ).toBeNull();
    expect(
      parsePokerWsMessageFromClient(JSON.stringify({ type: 'webrtc-ice-candidate', roomId: 'r', targetPeerId: 'p' })),
    ).toBeNull();
  });
});
