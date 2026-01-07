import { describe, expect, it } from 'vitest';

import { isTokenAllowed } from './room-token';

describe('isTokenAllowed', () => {
  it('should allow missing token when allowMissing=true', () => {
    expect(isTokenAllowed({ roomToken: 't', allowMissing: true })).toBe(true);
  });

  it('should deny missing token when allowMissing=false', () => {
    expect(isTokenAllowed({ roomToken: 't', allowMissing: false })).toBe(false);
  });

  it('should allow matching token', () => {
    expect(isTokenAllowed({ roomToken: 't', providedToken: 't', allowMissing: false })).toBe(true);
  });

  it('should deny mismatching token', () => {
    expect(isTokenAllowed({ roomToken: 't', providedToken: 'x', allowMissing: true })).toBe(false);
  });
});
