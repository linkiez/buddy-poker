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
  | ({ type: 'state' } & PokerRoomViewState)
  | { type: 'webrtc-peer-list'; peers: Array<{ peerId: string; shouldInitiate: boolean }> }
  | { type: 'webrtc-peer-joined'; peerId: string; shouldInitiate: boolean }
  | { type: 'webrtc-peer-left'; peerId: string }
  | { type: 'webrtc-offer'; fromPeerId: string; offer: RTCSessionDescriptionInit }
  | { type: 'webrtc-answer'; fromPeerId: string; answer: RTCSessionDescriptionInit }
  | { type: 'webrtc-ice-candidate'; fromPeerId: string; candidate: RTCIceCandidateInit };

export type PokerClientMessage =
  | { type: 'join'; roomId: string; name: string; token?: string }
  | { type: 'vote'; roomId: string; value: string }
  | { type: 'reveal'; roomId: string }
  | { type: 'reset'; roomId: string }
  | { type: 'webrtc-join'; roomId: string; token?: string }
  | { type: 'webrtc-offer'; roomId: string; targetPeerId: string; offer: RTCSessionDescriptionInit }
  | { type: 'webrtc-answer'; roomId: string; targetPeerId: string; answer: RTCSessionDescriptionInit }
  | { type: 'webrtc-ice-candidate'; roomId: string; targetPeerId: string; candidate: RTCIceCandidateInit };
