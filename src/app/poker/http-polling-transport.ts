import type { PokerClientMessage, PokerServerMessage } from './poker-types';
import type {
    Transport,
    TransportConfig,
    TransportEventHandlers,
    TransportMode,
    TransportStatus,
} from './transport.types';

export class HttpPollingTransport implements Transport {
  readonly mode: TransportMode = 'http-polling';
  private _status: TransportStatus = 'disconnected';

  private clientId: string | null = null;
  private lastEventId: number = 0;
  private roomId: string = '';
  private pollingIntervalId: ReturnType<typeof setInterval> | null = null;
  private manualDisconnect = false;
  private lastJoin: { roomId: string; name: string; token?: string; fingerprint?: string } | null = null;

  private readonly config: Required<TransportConfig>;
  private readonly handlers: TransportEventHandlers;

  constructor(handlers: TransportEventHandlers, config: TransportConfig = {}) {
    this.handlers = handlers;
    this.config = {
      reconnectMaxAttempts: config.reconnectMaxAttempts ?? Infinity,
      reconnectBaseDelayMs: config.reconnectBaseDelayMs ?? 500,
      reconnectMaxDelayMs: config.reconnectMaxDelayMs ?? 10_000,
      pollingIntervalMs: config.pollingIntervalMs ?? 3_000,
      connectionTimeoutMs: config.connectionTimeoutMs ?? 10_000,
    };
  }

  private getStorageKey(suffix: string): string {
    return `bp_${suffix}_${this.roomId}`;
  }

  private restoreSessionState(roomId: string): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    this.clientId = localStorage.getItem(this.getStorageKey('clientId'));
    const lastEventIdStr = localStorage.getItem(this.getStorageKey('lastEventId'));
    if (lastEventIdStr) {
      const parsed = Number.parseInt(lastEventIdStr, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        this.lastEventId = parsed;
      }
    }
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
    this.lastJoin = { roomId, name, ...(token ? { token } : {}), ...(fingerprint ? { fingerprint } : {}) };

    // Try to restore previous session
    this.restoreSessionState(roomId);

    this.setStatus('connecting');

    try {
      // Send join action
      await this.sendAction({ type: 'join', roomId, name, ...(token ? { token } : {}), ...(fingerprint ? { fingerprint } : {}) });

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
    this.clearSessionStorage();
    this.clientId = null;
    this.lastEventId = 0;
    this.lastJoin = null;
    this.setStatus('disconnected');
  }

  private async sendAction(message: PokerClientMessage): Promise<void> {
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
      }
    } catch (error) {
      console.error('[HttpPollingTransport] Failed to send action:', error);
      this.handlers.onError(error instanceof Error ? error.message : 'Failed to send action');
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
          // Client session expired, try to reconnect
          console.warn('[HttpPollingTransport] Client session expired, reconnecting...');
          if (this.lastJoin) {
            this.setStatus('reconnecting');
            void this.connect(this.lastJoin.roomId, this.lastJoin.name, this.lastJoin.token, this.lastJoin.fingerprint);
          }
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      if (result.events && Array.isArray(result.events)) {
        for (const event of result.events) {
          if (event.id > this.lastEventId) {
            this.lastEventId = event.id;             this.saveLastEventId(this.lastEventId);          }
          if (event.message) {
            this.handlers.onMessage(event.message as PokerServerMessage);
          }
        }
      }
    } catch (error) {
      console.error('[HttpPollingTransport] Polling error:', error);
      // Don't report every polling error, just log it
      // The next poll will retry
    }
  }
}
