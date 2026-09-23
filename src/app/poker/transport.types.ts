import type { PokerClientMessage, PokerServerMessage } from './poker-types';

export type TransportStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'unavailable'
  | 'rejoin-required';

export type TransportMode = 'webrtc' | 'websocket' | 'http-polling';

export type RecoveryState =
  | 'connected'
  | 'connecting'
  | 'reconnecting'
  | 'unavailable'
  | 'rejoin-required';

export type ActionIdentifier = string;

export interface BrowserSessionEnvelope {
  schemaVersion: 1;
  roomId: string;
  clientId: string;
  name: string;
  fingerprint?: string;
  lastEventId: number;
  updatedAt: number;
}

export interface TransportPreference {
  httpOnly?: boolean;
}

export interface TransportConfig {
  reconnectMaxAttempts?: number;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  pollingIntervalMs?: number;
  connectionTimeoutMs?: number;
}

export interface TransportEventHandlers {
  onStatusChange: (status: TransportStatus) => void;
  onMessage: (message: PokerServerMessage) => void;
  onError: (error: string) => void;
}

export interface Transport {
  readonly mode: TransportMode;
  readonly status: TransportStatus;

  connect(roomId: string, name: string, token?: string, fingerprint?: string): void | Promise<void>;
  send(message: PokerClientMessage): void;
  disconnect(): void;
  hasConnectionFailed?(): boolean;
}
