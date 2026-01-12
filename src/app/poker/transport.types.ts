import type { PokerClientMessage, PokerServerMessage } from './poker-types';

export type TransportStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export type TransportMode = 'websocket' | 'http-polling';

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

  connect(roomId: string, name: string, token?: string): void;
  send(message: PokerClientMessage): void;
  disconnect(): void;
}
