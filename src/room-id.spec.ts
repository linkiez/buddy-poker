import { describe, expect, it } from 'vitest';

import { isValidRoomId } from './room-id';

describe('isValidRoomId', () => {
  it('accepts URL-safe room identifiers', () => {
    expect(isValidRoomId('scrumzada-abc123')).toBe(true);
    expect(isValidRoomId('Sala-123')).toBe(true);
  });

  it('rejects unsupported characters and invalid lengths', () => {
    expect(isValidRoomId('sala legal')).toBe(false);
    expect(isValidRoomId('sala_legal')).toBe(false);
    expect(isValidRoomId('a'.repeat(33))).toBe(false);
  });
});
