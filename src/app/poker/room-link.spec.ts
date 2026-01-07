import { describe, expect, it } from 'vitest';

import { parseRoomInput } from './room-link';

describe('parseRoomInput', () => {
  it('should return empty roomId for empty input', () => {
    expect(parseRoomInput('   ')).toEqual({ roomId: '', token: null });
  });

  it('should parse a plain room id', () => {
    expect(parseRoomInput('scrumzada-abc123')).toEqual({ roomId: 'scrumzada-abc123', token: null });
  });

  it('should parse room id with token query', () => {
    expect(parseRoomInput('scrumzada-abc123?token=sekret')).toEqual({
      roomId: 'scrumzada-abc123',
      token: 'sekret',
    });
  });

  it('should parse a full URL', () => {
    expect(parseRoomInput('https://example.com/room/scrumzada-abc123?token=sekret')).toEqual({
      roomId: 'scrumzada-abc123',
      token: 'sekret',
    });
  });

  it('should parse a path-like input', () => {
    expect(parseRoomInput('/room/scrumzada-abc123?token=sekret')).toEqual({
      roomId: 'scrumzada-abc123',
      token: 'sekret',
    });
  });

  it('should parse /room/<id> without token', () => {
    expect(parseRoomInput('/room/scrumzada-abc123')).toEqual({
      roomId: 'scrumzada-abc123',
      token: null,
    });
  });

  it('should handle /room without an id segment', () => {
    expect(parseRoomInput('/room')).toEqual({
      roomId: '',
      token: null,
    });
  });

  it('should parse token-only input as empty room id', () => {
    expect(parseRoomInput('?token=sekret')).toEqual({
      roomId: '',
      token: 'sekret',
    });
  });

  it('should normalize empty token value to null', () => {
    expect(parseRoomInput('?token=')).toEqual({
      roomId: '',
      token: null,
    });
  });

  it('should normalize empty token to null', () => {
    expect(parseRoomInput('scrumzada-abc123?token=   ')).toEqual({
      roomId: 'scrumzada-abc123',
      token: null,
    });
  });

  it('should fallback to raw without /room segment when parsing as URL', () => {
    expect(parseRoomInput('https://example.com/not-room?token=sekret')).toEqual({
      roomId: 'https://example.com/not-room',
      token: 'sekret',
    });
  });

  it('should fallback to query parsing when URL parsing fails', () => {
    expect(parseRoomInput('http://localhost:99999?token=sekret')).toEqual({
      roomId: 'http://localhost:99999',
      token: 'sekret',
    });
  });

  it('should fallback to room id parsing when URL parsing fails and no query exists', () => {
    expect(parseRoomInput('http://localhost:99999')).toEqual({
      roomId: 'http://localhost:99999',
      token: null,
    });
  });

  it('should fallback to query parsing with token null when query has no token param', () => {
    expect(parseRoomInput('http://localhost:99999?x=1')).toEqual({
      roomId: 'http://localhost:99999',
      token: null,
    });
  });
});
