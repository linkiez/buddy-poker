import type { PokerClientMessage, PokerServerMessage } from './poker-types';
import {
    clearBrowserSession,
    getBrowserSession,
    migrateLegacyBrowserSession,
    saveBrowserSession as writeBrowserSession,
} from './browser-session';
import type {
    Transport,
    TransportConfig,
    TransportEventHandlers,
    TransportMode,
    TransportStatus,
} from './transport.types';

type HttpPollingTransportConfig = TransportConfig & {
  initialEventId?: number;
  onEventCursor?: (eventId: number) => void;
};

export class HttpPollingTransport implements Transport {
  readonly mode: TransportMode = 'http-polling';
  private _status: TransportStatus = 'disconnected';

  private clientId: string | null = null;
  private lastEventId: number = 0;
  private roomId: string = '';
  private pollingIntervalId: ReturnType<typeof setInterval> | null = null;
  private manualDisconnect = false;
  private lastJoin: { roomId: string; name: string; token?: string; fingerprint?: string } | null = null;

  private readonly config: Required<TransportConfig> & {
    initialEventId: number;
    onEventCursor: (eventId: number) => void;
  };
  private readonly handlers: TransportEventHandlers;

  constructor(handlers: TransportEventHandlers, config: HttpPollingTransportConfig = {}) {
    this.handlers = handlers;
    this.config = {
      reconnectMaxAttempts: config.reconnectMaxAttempts ?? Infinity,
      reconnectBaseDelayMs: config.reconnectBaseDelayMs ?? 500,
      reconnectMaxDelayMs: config.reconnectMaxDelayMs ?? 10_000,
      pollingIntervalMs: config.pollingIntervalMs ?? 3_000,
      connectionTimeoutMs: config.connectionTimeoutMs ?? 10_000,
      initialEventId: config.initialEventId ?? 0,
      onEventCursor: config.onEventCursor ?? (() => undefined),
    };
  }

  private getStorageKey(suffix: string): string {
    return `bp_${suffix}_${this.roomId}`;
  }

  private restoreSessionState(roomId: string): void {
    const session = getBrowserSession(roomId) ?? migrateLegacyBrowserSession(roomId);
    if (session) {
      this.clientId = session.clientId;
      this.lastEventId = session.lastEventId;
      return;
    }

    if (typeof localStorage !== 'undefined') {
      this.clientId = localStorage.getItem(this.getStorageKey('clientId'));
    }
  }

  private persistBrowserSession(): void {
    if (!this.clientId || !this.lastJoin) {
      return;
    }

    writeBrowserSession({
      schemaVersion: 1,
      roomId: this.roomId,
      clientId: this.clientId,
      name: this.lastJoin.name,
      ...(this.lastJoin.fingerprint ? { fingerprint: this.lastJoin.fingerprint } : {}),
      lastEventId: this.lastEventId,
      updatedAt: Date.now(),
    });
  }

  private saveClientId(clientId: string): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(this.getStorageKey('clientId'), clientId);
  }

  private saveLastEventId(eventId: number): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(this.getStorageKey('lastEventId'), eventId.toString());
    this.persistBrowserSession();
  }

  private clearSessionStorage(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.removeItem(this.getStorageKey('clientId'));
    localStorage.removeItem(this.getStorageKey('lastEventId'));
  }

  get status(): TransportStatus {
    return this._status;
  }

  private setStatus(status: TransportStatus): void {
    if (this._status !== status) {
      this._status = status;
      this.handlers.onStatusChange(status);
    }
  }

  async connect(roomId: string, name: string, token?: string, fingerprint?: string): Promise<void> {
    this.manualDisconnect = false;
    this.roomId = roomId;
    this.lastEventId = this.config.initialEventId;
    this.lastJoin = { roomId, name, ...(token ? { token } : {}), ...(fingerprint ? { fingerprint } : {}) };

    // Try to restore previous session
    this.restoreSessionState(roomId);

    this.setStatus('connecting');

    try {
      // Send join action
      const joined = await this.sendAction({ type: 'join', roomId, name, ...(token ? { token } : {}), ...(fingerprint ? { fingerprint } : {}), ...(this.clientId ? { clientId: this.clientId } : {}) });
      if (!joined) {
        if (this._status !== 'rejoin-required') {
          this.setStatus('unavailable');
        }
        return;
      }

      this.setStatus('connected');
      this.startPolling();
    } catch (error) {
      console.error('[HttpPollingTransport] Failed to connect:', error);
      this.handlers.onError('Failed to connect via HTTP');
      this.setStatus('disconnected');
    }
  }

  send(message: PokerClientMessage): void {
    if (this._status !== 'connected') {
      return;
    }

    void this.sendAction(message);
  }

  disconnect(): void {
    this.manualDisconnect = true;
    this.stopPolling();
    this.clientId = null;
    this.lastEventId = 0;
    this.lastJoin = null;
    this.setStatus('disconnected');
  }

  private async sendAction(message: PokerClientMessage): Promise<boolean> {
    const url = '/api/poker/action';

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.clientId ? { 'X-Client-Id': this.clientId } : {}),
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 404) {
          this.stopPolling();
          clearBrowserSession(this.roomId);
          this.setStatus('rejoin-required');
        }
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      // Handle immediate response
      if (result.message) {
        this.handlers.onMessage(result.message as PokerServerMessage);
      }

      // Store client ID from join response
      if (result.clientId && typeof result.clientId === 'string') {
        this.clientId = result.clientId;
        this.saveClientId(result.clientId);
        this.persistBrowserSession();
      }
      return true;
    } catch (error) {
      console.error('[HttpPollingTransport] Failed to send action:', error);
      this.handlers.onError(error instanceof Error ? error.message : 'Failed to send action');
      return false;
    }
  }

  private startPolling(): void {
    this.stopPolling();

    this.pollingIntervalId = setInterval(() => {
      void this.poll();
    }, this.config.pollingIntervalMs);

    // Poll immediately
    void this.poll();
  }

  private stopPolling(): void {
    if (this.pollingIntervalId) {
      clearInterval(this.pollingIntervalId);
      this.pollingIntervalId = null;
    }
  }

  private async poll(): Promise<void> {
    if (this.manualDisconnect || !this.clientId) {
      return;
    }

    const url = `/api/poker/events?clientId=${encodeURIComponent(this.clientId)}&lastEventId=${this.lastEventId}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.warn('[HttpPollingTransport] Client session expired; rejoin required');
          this.stopPolling();
          clearBrowserSession(this.roomId);
          this.setStatus('rejoin-required');
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      if (this._status === 'unavailable') {
        this.setStatus('connected');
      }

      const result = await response.json();

      if (result.events && Array.isArray(result.events)) {
        for (const event of result.events) {
          if (event.id > this.lastEventId) {
            this.lastEventId = event.id;
            this.saveLastEventId(this.lastEventId);
            this.config.onEventCursor(this.lastEventId);
          }
          if (event.message) {
            this.handlers.onMessage(event.message as PokerServerMessage);
          }
        }
      }
    } catch (error) {
      console.error('[HttpPollingTransport] Polling error:', error);
      if (!this.manualDisconnect && this._status !== 'rejoin-required') {
        this.setStatus('unavailable');
      }
    }
  }
}
