import type {
  Transport,
  TransportConfig,
  TransportEventHandlers,
  TransportMode,
  TransportStatus,
} from './transport.types';
import type { PokerClientMessage, PokerServerMessage } from './poker-types';

export class WebSocketTransport implements Transport {
  readonly mode: TransportMode = 'websocket';
  private _status: TransportStatus = 'disconnected';

  private socket: WebSocket | null = null;
  private lastJoin: { roomId: string; name: string; token?: string } | null = null;
  private reconnectAttempts = 0;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private manualDisconnect = false;
  private connectionTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private connectionSucceeded = false;

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

  get status(): TransportStatus {
    return this._status;
  }

  private setStatus(status: TransportStatus): void {
    if (this._status !== status) {
      this._status = status;
      this.handlers.onStatusChange(status);
    }
  }

  connect(roomId: string, name: string, token?: string): void {
    this.manualDisconnect = false;
    this.lastJoin = { roomId, name, ...(token ? { token } : {}) };
    this.clearReconnectTimeout();
    this.clearConnectionTimeout();

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.send({ type: 'join', roomId, name, ...(token ? { token } : {}) });
      return;
    }

    if (this.socket?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.openSocket({ mode: 'connecting' });
  }

  send(message: PokerClientMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify(message));
  }

  disconnect(): void {
    this.manualDisconnect = true;
    this.clearReconnectTimeout();
    this.clearConnectionTimeout();

    this.socket?.close();
    this.socket = null;
    this.lastJoin = null;
    this.reconnectAttempts = 0;
    this.connectionSucceeded = false;
    this.setStatus('disconnected');
  }

  private openSocket(options: { mode: 'connecting' | 'reconnecting' }): void {
    const protocol = globalThis.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${globalThis.location.host}/ws`;

    this.setStatus(options.mode);
    this.socket = new WebSocket(url);
    this.connectionSucceeded = false;

    // Set connection timeout
    this.connectionTimeoutId = setTimeout(() => {
      if (!this.connectionSucceeded && this.socket?.readyState !== WebSocket.OPEN) {
        console.warn('[WebSocketTransport] Connection timeout');
        this.socket?.close();
      }
    }, this.config.connectionTimeoutMs);

    this.socket.addEventListener('open', () => {
      this.clearConnectionTimeout();
      this.connectionSucceeded = true;
      this.reconnectAttempts = 0;
      this.setStatus('connected');

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

      const msg = parsed as PokerServerMessage;
      this.handlers.onMessage(msg);
    });

    this.socket.addEventListener('close', () => {
      this.clearConnectionTimeout();
      this.socket = null;

      if (this.manualDisconnect) {
        this.setStatus('disconnected');
        return;
      }

      // Check if we exceeded max reconnect attempts
      if (this.reconnectAttempts >= this.config.reconnectMaxAttempts) {
        console.warn('[WebSocketTransport] Max reconnect attempts reached, giving up');
        this.handlers.onError('WebSocket connection failed after multiple attempts');
        this.setStatus('disconnected');
        return;
      }

      this.setStatus('reconnecting');
      this.scheduleReconnect();
    });

    this.socket.addEventListener('error', () => {
      this.clearConnectionTimeout();
      if (this.manualDisconnect) {
        return;
      }
      
      // If connection never succeeded, this is a connection failure
      if (!this.connectionSucceeded) {
        console.warn('[WebSocketTransport] Connection failed');
      }
      
      this.setStatus('reconnecting');
    });
  }

  private scheduleReconnect(): void {
    if (!this.lastJoin || this.manualDisconnect) {
      return;
    }

    this.clearReconnectTimeout();
    this.reconnectAttempts += 1;

    const exponentialDelayMs =
      this.config.reconnectBaseDelayMs * Math.pow(2, this.reconnectAttempts - 1);
    const delayMs = Math.min(exponentialDelayMs, this.config.reconnectMaxDelayMs);
    const jitterMs = Math.floor(Math.random() * 200);

    this.reconnectTimeoutId = setTimeout(() => {
      if (this.manualDisconnect || !this.lastJoin) {
        return;
      }
      if (
        this.socket?.readyState === WebSocket.OPEN ||
        this.socket?.readyState === WebSocket.CONNECTING
      ) {
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

  private clearConnectionTimeout(): void {
    if (!this.connectionTimeoutId) {
      return;
    }

    clearTimeout(this.connectionTimeoutId);
    this.connectionTimeoutId = null;
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

  hasConnectionFailed(): boolean {
    return (
      !this.connectionSucceeded &&
      this.reconnectAttempts >= this.config.reconnectMaxAttempts
    );
  }
}
