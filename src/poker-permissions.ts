export type ModeratorAction = 'reveal' | 'reset';

type ModeratorGuardOk = { ok: true };

type ModeratorGuardError = {
  ok: false;
  message: string;
};

export type ModeratorGuardResult = ModeratorGuardOk | ModeratorGuardError;

export function getModeratorGuardErrorMessage(action: ModeratorAction): string {
  switch (action) {
    case 'reveal':
      return 'Apenas o moderador pode revelar os votos.';
    case 'reset':
      return 'Apenas o moderador pode resetar a rodada.';
  }
}

export function assertModeratorAction(input: {
  ownerId: string | null;
  clientId: string;
  ownerFingerprint?: string | null;
  clientFingerprint?: string | null;
  action: ModeratorAction;
}): ModeratorGuardResult {
  if (
    input.ownerId !== input.clientId ||
    (input.ownerFingerprint !== undefined &&
      input.clientFingerprint !== input.ownerFingerprint)
  ) {
    return { ok: false, message: getModeratorGuardErrorMessage(input.action) };
  }

  return { ok: true };
}
