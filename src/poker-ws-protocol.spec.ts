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
});
