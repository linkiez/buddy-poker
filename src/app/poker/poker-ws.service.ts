import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import type {
    PokerClientMessage,
    PokerRoomViewState,
    PokerServerMessage,
} from './poker-types';

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

  private socket: WebSocket | null = null;
  private clientId: string | null = null;
  private roomId: string | null = null;
  private roomToken: string | null = null;

  private lastJoin: { roomId: string; name: string; token?: string } | null = null;
  private reconnectAttempts = 0;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private manualDisconnect = false;

  private readonly clientIdSubject = new BehaviorSubject<string | null>(null);
  private readonly roomTokenSubject = new BehaviorSubject<string | null>(null);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);
  private readonly statusSubject = new BehaviorSubject<PokerWsConnectionStatus>(
    'disconnected',
  );

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

  clearError(): void {
    this.errorSubject.next(null);
  }

  get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  connect(roomId: string, name: string, token?: string): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.manualDisconnect = false;
    this.roomId = roomId;
    this.lastJoin = { roomId, name, ...(token ? { token } : {}) };
    this.clearReconnectTimeout();

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.send({ type: 'join', roomId, name, ...(token ? { token } : {}) });
      return;
    }

    if (this.socket?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.openSocket({ mode: 'connecting' });
  }

  vote(value: string): void {
    if (!this.roomId) {
      return;
    }

    this.send({ type: 'vote', roomId: this.roomId, value });
  }

  reveal(): void {
    if (!this.roomId) {
      return;
    }

    this.send({ type: 'reveal', roomId: this.roomId });
  }

  reset(): void {
    if (!this.roomId) {
      return;
    }

    this.send({ type: 'reset', roomId: this.roomId });
  }

  disconnect(): void {
    this.manualDisconnect = true;
    this.clearReconnectTimeout();

    this.socket?.close();
    this.socket = null;
    this.clientId = null;
    this.roomId = null;
    this.roomToken = null;
    this.lastJoin = null;
    this.reconnectAttempts = 0;
    this.stateSubject.next(null);
    this.clientIdSubject.next(null);
    this.roomTokenSubject.next(null);
    this.errorSubject.next(null);
    this.statusSubject.next('disconnected');
  }

  private openSocket(options: { mode: 'connecting' | 'reconnecting' }): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const protocol = globalThis.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${globalThis.location.host}/ws`;

    this.statusSubject.next(options.mode);
    this.socket = new WebSocket(url);

    this.socket.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      this.statusSubject.next('connected');

      if (this.lastJoin) {
        this.send({
          type: 'join',
          roomId: this.lastJoin.roomId,
          name: this.lastJoin.name,
          ...(this.lastJoin.token ? { token: this.lastJoin.token } : {}),
        });
      }
    });

    this.socket.addEventListener('message', (event) => {
      const parsed = this.safeParse(event.data);
      if (!parsed) {
        return;
      }

      const msg = parsed as Partial<PokerServerMessage>;
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
    });

    this.socket.addEventListener('close', () => {
      this.socket = null;
      this.clientId = null;
      this.clientIdSubject.next(null);

      if (this.manualDisconnect) {
        this.statusSubject.next('disconnected');
        return;
      }

      this.statusSubject.next('reconnecting');
      this.scheduleReconnect();
    });

    this.socket.addEventListener('error', () => {
      if (this.manualDisconnect) {
        return;
      }
      this.statusSubject.next('reconnecting');
    });
  }

  private scheduleReconnect(): void {
    if (!this.lastJoin || this.manualDisconnect) {
      return;
    }

    this.clearReconnectTimeout();
    this.reconnectAttempts += 1;

    const maxDelayMs = 10_000;
    const baseDelayMs = 500;
    const exponentialDelayMs = baseDelayMs * Math.pow(2, this.reconnectAttempts - 1);
    const delayMs = Math.min(exponentialDelayMs, maxDelayMs);
    const jitterMs = Math.floor(Math.random() * 200);

    this.reconnectTimeoutId = setTimeout(() => {
      if (this.manualDisconnect || !this.lastJoin) {
        return;
      }
      if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) {
        return;
      }
      this.openSocket({ mode: 'reconnecting' });
    }, delayMs + jitterMs);
  }

  private clearReconnectTimeout(): void {
    if (!this.reconnectTimeoutId) {
      return;
    }

    clearTimeout(this.reconnectTimeoutId);
    this.reconnectTimeoutId = null;
  }

  private send(message: PokerClientMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify(message));
  }

  private safeParse(input: unknown): unknown {
    if (typeof input !== 'string') {
      return null;
    }

    try {
      return JSON.parse(input);
    } catch {
      return null;
    }
  }
}
