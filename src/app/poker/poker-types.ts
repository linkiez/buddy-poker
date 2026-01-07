export type PokerParticipantView = {
  id: string;
  name: string;
  hasVoted: boolean;
  vote: string | null;
};

export type PokerRoomViewState = {
  roomId: string;
  ownerId: string | null;
  reveal: boolean;
  participants: PokerParticipantView[];
};

export type PokerServerMessage =
  | { type: 'joined'; clientId: string; roomId: string; token?: string }
  | { type: 'error'; message: string }
  | ({ type: 'state' } & PokerRoomViewState);

export type PokerClientMessage =
  | { type: 'join'; roomId: string; name: string; token?: string }
  | { type: 'vote'; roomId: string; value: string }
  | { type: 'reveal'; roomId: string }
  | { type: 'reset'; roomId: string };
