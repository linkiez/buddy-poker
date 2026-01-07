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
  action: ModeratorAction;
}): ModeratorGuardResult {
  if (input.ownerId !== input.clientId) {
    return { ok: false, message: getModeratorGuardErrorMessage(input.action) };
  }

  return { ok: true };
}
