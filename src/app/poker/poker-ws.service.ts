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
import { WebRtcTransport } from './webrtc-transport';

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
  private roomSize = 0; // Track room size for P2P eligibility

  private lastJoin: { roomId: string; name: string; token?: string } | null = null;
  private wsRetryTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private wsRetryIntervalMs = 60_000; // Try to return to better transport every 60 seconds

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

    // Try WebRTC first (if room size <= 8), then WebSocket, then HTTP
    if (!this.transport || this.shouldTryBetterTransport()) {
      this.tryBestTransport();
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

        // If WebRTC failed, fallback to WebSocket
        if (
          this.currentMode === 'webrtc' &&
          status === 'disconnected' &&
          this.transport?.hasConnectionFailed?.()
        ) {
          console.warn('[PokerWsService] WebRTC failed, switching to WebSocket');
          this.switchToWebSocket();
        }

        // If WebSocket failed to connect after attempts, fallback to HTTP
        if (
          this.currentMode === 'websocket' &&
          status === 'disconnected' &&
          this.transport?.hasConnectionFailed?.()
        ) {
          console.warn('[PokerWsService] WebSocket failed, switching to HTTP polling');
          this.switchToHttpPolling();
        }

        // Schedule retry to better transport if we're in a fallback mode and connected
        if ((this.currentMode === 'http-polling' || this.currentMode === 'websocket') && status === 'connected') {
          this.scheduleBetterTransportRetry();
        }
      },
      onMessage: (message: PokerServerMessage) => {
        this.handleMessage(message);
      },
      onError: (error: string) => {
        // Log all errors to console for debugging
        console.error('[PokerWsService] Transport error:', error);

        // When we're in fallback mode, suppress errors from previous transport attempts
        if (this.currentMode === 'http-polling' || this.currentMode === 'websocket') {
          const normalizedError = (error || '').toLowerCase();
          if (normalizedError.includes('webrtc') || normalizedError.includes('websocket') || normalizedError.includes('web socket')) {
            return;
          }
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
        this.roomSize = state.participants.length;
        this.stateSubject.next(state);
      }
    }
  }

  private switchToWebRtc(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    console.log('[PokerWsService] Switching to WebRTC transport');
    
    const oldTransport = this.transport;
    oldTransport?.disconnect();

    this.transport = new WebRtcTransport();
    (this.transport as WebRtcTransport).setHandlers(this.createTransportHandlers());
    this.currentMode = 'webrtc';
    this.modeSubject.next('webrtc');

    // Reconnect if we had a previous session
    if (this.lastJoin) {
      this.transport.connect(
        this.lastJoin.roomId,
        this.lastJoin.name,
        this.lastJoin.token
      );
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

  private scheduleBetterTransportRetry(): void {
    this.clearWsRetryTimeout();

    this.wsRetryTimeoutId = setTimeout(() => {
      if (this.lastJoin && this.shouldTryBetterTransport()) {
        console.log('[PokerWsService] Attempting to switch to better transport...');
        this.tryBestTransport();
      }
    }, this.wsRetryIntervalMs);
  }

  private shouldTryBetterTransport(): boolean {
    // If we're in WebRTC and room is still eligible, stay
    if (this.currentMode === 'webrtc' && this.isRoomEligibleForP2P()) {
      return false;
    }

    // If we're in WebSocket and room is not P2P-eligible, stay
    if (this.currentMode === 'websocket' && !this.isRoomEligibleForP2P()) {
      return false;
    }

    // If we're in HTTP and room is not P2P-eligible, try WebSocket
    if (this.currentMode === 'http-polling' && !this.isRoomEligibleForP2P()) {
      return true;
    }

    // Otherwise, try better transport
    return true;
  }

  private isRoomEligibleForP2P(): boolean {
    return this.roomSize > 0 && this.roomSize <= 8;
  }

  private tryBestTransport(): void {
    // Try WebRTC if room is eligible
    if (this.isRoomEligibleForP2P() && this.isWebRtcSupported()) {
      this.switchToWebRtc();
    } else {
      // Otherwise try WebSocket
      this.switchToWebSocket();
    }
  }

  private isWebRtcSupported(): boolean {
    if (!isPlatformBrowser(this.platformId)) {
      return false;
    }

    return !!(
      window.RTCPeerConnection &&
      window.RTCSessionDescription &&
      window.RTCIceCandidate
    );
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
