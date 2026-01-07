import { describe, expect, it } from 'vitest';

import { assertModeratorAction, getModeratorGuardErrorMessage } from './poker-permissions';

describe('poker-permissions', () => {
  it('should provide the correct error message for reveal', () => {
    expect(getModeratorGuardErrorMessage('reveal')).toBe('Apenas o moderador pode revelar os votos.');
  });

  it('should provide the correct error message for reset', () => {
    expect(getModeratorGuardErrorMessage('reset')).toBe('Apenas o moderador pode resetar a rodada.');
  });

  it('should allow moderator actions when ownerId equals clientId', () => {
    expect(
      assertModeratorAction({ ownerId: 'a', clientId: 'a', action: 'reveal' }),
    ).toEqual({ ok: true });
  });

  it('should block moderator actions when ownerId differs from clientId', () => {
    expect(assertModeratorAction({ ownerId: 'a', clientId: 'b', action: 'reveal' })).toEqual({
      ok: false,
      message: 'Apenas o moderador pode revelar os votos.',
    });
  });

  it('should block moderator actions when ownerId is null', () => {
    expect(assertModeratorAction({ ownerId: null, clientId: 'b', action: 'reset' })).toEqual({
      ok: false,
      message: 'Apenas o moderador pode resetar a rodada.',
    });
  });
});
