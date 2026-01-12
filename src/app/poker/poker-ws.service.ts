import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import type {
    PokerClientMessage,
    PokerRoomViewState,
    PokerServerMessage,
} from './poker-types';
import type { Transport, TransportEventHandlers, TransportStatus, TransportMode } from './transport.types';
import { WebSocketTransport } from './websocket-transport';
import { HttpPollingTransport } from './http-polling-transport';

type PokerWsConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

@Injectable({
  providedIn: 'root',
})
export class PokerWsService {
  private readonly platformId = inject(PLATFORM_ID);

  private transport: Transport | null = null;
  private clientId: string | null = null;
  private roomId: string | null = null;
  private roomToken: string | null = null;
  private currentMode: TransportMode | null = null;

  private lastJoin: { roomId: string; name: string; token?: string } | null = null;
  private wsRetryTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private wsRetryIntervalMs = 60_000; // Try to return to WebSocket every 60 seconds

  private readonly clientIdSubject = new BehaviorSubject<string | null>(null);
  private readonly roomTokenSubject = new BehaviorSubject<string | null>(null);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);
  private readonly statusSubject = new BehaviorSubject<PokerWsConnectionStatus>(
    'disconnected',
  );
  private readonly modeSubject = new BehaviorSubject<TransportMode | null>(null);

  private readonly stateSubject = new BehaviorSubject<PokerRoomViewState | null>(
    null,
  );

  get state$(): Observable<PokerRoomViewState | null> {
    return this.stateSubject.asObservable();
  }

  get clientId$(): Observable<string | null> {
    return this.clientIdSubject.asObservable();
  }

  get roomToken$(): Observable<string | null> {
    return this.roomTokenSubject.asObservable();
  }

  get error$(): Observable<string | null> {
    return this.errorSubject.asObservable();
  }

  get status$(): Observable<PokerWsConnectionStatus> {
    return this.statusSubject.asObservable();
  }

  get mode$(): Observable<TransportMode | null> {
    return this.modeSubject.asObservable();
  }

  clearError(): void {
    this.errorSubject.next(null);
  }

  get isConnected(): boolean {
    return this.transport?.status === 'connected';
  }

  connect(roomId: string, name: string, token?: string): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.roomId = roomId;
    this.lastJoin = { roomId, name, ...(token ? { token } : {}) };
    this.clearWsRetryTimeout();

    // Try WebSocket first
    if (!this.transport || this.currentMode !== 'websocket') {
      this.switchToWebSocket();
    }

    this.transport?.connect(roomId, name, token);
  }

  vote(value: string): void {
    if (!this.roomId) {
      return;
    }

    this.transport?.send({ type: 'vote', roomId: this.roomId, value });
  }

  reveal(): void {
    if (!this.roomId) {
      return;
    }

    this.transport?.send({ type: 'reveal', roomId: this.roomId });
  }

  reset(): void {
    if (!this.roomId) {
      return;
    }

    this.transport?.send({ type: 'reset', roomId: this.roomId });
  }

  disconnect(): void {
    this.clearWsRetryTimeout();
    this.transport?.disconnect();
    this.transport = null;
    this.clientId = null;
    this.roomId = null;
    this.roomToken = null;
    this.lastJoin = null;
    this.currentMode = null;
    this.stateSubject.next(null);
    this.clientIdSubject.next(null);
    this.roomTokenSubject.next(null);
    this.errorSubject.next(null);
    this.statusSubject.next('disconnected');
    this.modeSubject.next(null);
  }

  private createTransportHandlers(): TransportEventHandlers {
    return {
      onStatusChange: (status: TransportStatus) => {
        this.statusSubject.next(status);

        // If WebSocket failed to connect after attempts, fallback to HTTP
        if (
          this.currentMode === 'websocket' &&
          status === 'disconnected' &&
          this.transport?.hasConnectionFailed?.()
        ) {
          console.warn('[PokerWsService] WebSocket failed, switching to HTTP polling');
          this.switchToHttpPolling();
        }

        // Schedule retry to WebSocket if we're in HTTP mode and connected
        if (this.currentMode === 'http-polling' && status === 'connected') {
          this.scheduleWsRetry();
        }
      },
      onMessage: (message: PokerServerMessage) => {
        this.handleMessage(message);
      },
      onError: (error: string) => {
        // Log all errors to console for debugging
        console.error('[PokerWsService] Transport error:', error);
        
        // Don't show WebSocket errors in UI when we're in HTTP polling mode
        // or when we're currently using websocket transport (errors from websocket when in http mode)
        if (this.currentMode === 'http-polling') {
          // Only show errors that are from HTTP transport, not websocket
          // Since we're already in http-polling, websocket errors are expected
          return;
        }
        
        this.errorSubject.next(error);
      },
    };
  }

  private handleMessage(msg: PokerServerMessage): void {
    if (msg.type === 'joined' && typeof msg.clientId === 'string') {
      this.clientId = msg.clientId;
      this.clientIdSubject.next(msg.clientId);

      if (typeof (msg as { token?: unknown }).token === 'string') {
        this.roomToken = (msg as { token: string }).token;
        this.roomTokenSubject.next(this.roomToken);
      }
      return;
    }

    if (msg.type === 'error' && typeof msg.message === 'string') {
      this.errorSubject.next(msg.message);
      return;
    }

    if (msg.type === 'state') {
      const state = msg as PokerRoomViewState;
      if (typeof state.roomId === 'string') {
        this.stateSubject.next(state);
      }
    }
  }

  private switchToWebSocket(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    console.log('[PokerWsService] Switching to WebSocket transport');
    
    const oldTransport = this.transport;
    oldTransport?.disconnect();

    const config = this.getTransportConfig();
    this.transport = new WebSocketTransport(this.createTransportHandlers(), {
      ...config,
      reconnectMaxAttempts: 3, // Limit attempts before fallback
    });
    this.currentMode = 'websocket';
    this.modeSubject.next('websocket');

    // Reconnect if we had a previous session
    if (this.lastJoin) {
      this.transport.connect(
        this.lastJoin.roomId,
        this.lastJoin.name,
        this.lastJoin.token
      );
    }
  }

  private switchToHttpPolling(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    if (this.currentMode === 'http-polling') {
      return;
    }

    console.log('[PokerWsService] Switching to HTTP polling transport');
    
    const oldTransport = this.transport;
    oldTransport?.disconnect();

    const config = this.getTransportConfig();
    this.transport = new HttpPollingTransport(this.createTransportHandlers(), config);
    this.currentMode = 'http-polling';
    this.modeSubject.next('http-polling');

    // Reconnect if we had a previous session
    if (this.lastJoin) {
      this.transport.connect(
        this.lastJoin.roomId,
        this.lastJoin.name,
        this.lastJoin.token
      );
    }
  }

  private scheduleWsRetry(): void {
    this.clearWsRetryTimeout();

    this.wsRetryTimeoutId = setTimeout(() => {
      if (this.currentMode === 'http-polling' && this.lastJoin) {
        console.log('[PokerWsService] Attempting to switch back to WebSocket...');
        this.switchToWebSocket();
      }
    }, this.wsRetryIntervalMs);
  }

  private clearWsRetryTimeout(): void {
    if (this.wsRetryTimeoutId) {
      clearTimeout(this.wsRetryTimeoutId);
      this.wsRetryTimeoutId = null;
    }
  }

  private getTransportConfig() {
    const connectionTimeoutMs = this.getEnvNumber('WS_CONNECTION_TIMEOUT_MS', 5_000);
    const pollingIntervalMs = this.getEnvNumber('HTTP_POLLING_INTERVAL_MS', 1_500);
    const reconnectBaseDelayMs = this.getEnvNumber('WS_RECONNECT_BASE_DELAY_MS', 500);
    const reconnectMaxDelayMs = this.getEnvNumber('WS_RECONNECT_MAX_DELAY_MS', 10_000);

    return {
      connectionTimeoutMs,
      pollingIntervalMs,
      reconnectBaseDelayMs,
      reconnectMaxDelayMs,
    };
  }

  private getEnvNumber(key: string, defaultValue: number): number {
    if (typeof globalThis === 'undefined' || !globalThis.window) {
      return defaultValue;
    }

    const value = (globalThis.window as any)[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }

    return defaultValue;
  }
}
