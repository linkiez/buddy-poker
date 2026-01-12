import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocketTransport } from './websocket-transport';
import type { TransportEventHandlers } from './transport.types';

type Listener = (event: any) => void;

class MockWebSocket {
  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSING = 2;
  public static readonly CLOSED = 3;

  public static readonly instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;

  private readonly listeners = new Map<string, Listener[]>();
  readonly sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.dispatch('close', {});
  }

  dispatch(type: string, event: any): void {
    const list = this.listeners.get(type) ?? [];
    for (const listener of list) {
      listener(event);
    }
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.dispatch('open', {});
  }

  message(data: unknown): void {
    this.dispatch('message', { data });
  }

  error(): void {
    this.dispatch('error', {});
  }
}

function setLocation(url: string): void {
  Object.defineProperty(globalThis, 'location', {
    value: new URL(url),
    configurable: true,
  });
}

describe('WebSocketTransport', () => {
  beforeEach(() => {
    MockWebSocket.instances.length = 0;
    setLocation('http://example.com/');
    (globalThis as any).WebSocket = MockWebSocket;
  });

  it('should connect and send join message', () => {
    const handlers: TransportEventHandlers = {
      onStatusChange: vi.fn(),
      onMessage: vi.fn(),
      onError: vi.fn(),
    };

    const transport = new WebSocketTransport(handlers);
    transport.connect('room-1', 'Test User');

    expect(MockWebSocket.instances.length).toBe(1);
    expect(handlers.onStatusChange).toHaveBeenCalledWith('connecting');

    const ws = MockWebSocket.instances[0];
    ws.open();

    expect(handlers.onStatusChange).toHaveBeenCalledWith('connected');
    expect(ws.sent.length).toBe(1);
    expect(JSON.parse(ws.sent[0])).toEqual({
      type: 'join',
      roomId: 'room-1',
      name: 'Test User',
    });
  });

  it('should include token in join message when provided', () => {
    const handlers: TransportEventHandlers = {
      onStatusChange: vi.fn(),
      onMessage: vi.fn(),
      onError: vi.fn(),
    };

    const transport = new WebSocketTransport(handlers);
    transport.connect('room-1', 'Test User', 'token123');

    const ws = MockWebSocket.instances[0];
    ws.open();

    expect(JSON.parse(ws.sent[0])).toEqual({
      type: 'join',
      roomId: 'room-1',
      name: 'Test User',
      token: 'token123',
    });
  });

  it('should handle incoming messages', () => {
    const handlers: TransportEventHandlers = {
      onStatusChange: vi.fn(),
      onMessage: vi.fn(),
      onError: vi.fn(),
    };

    const transport = new WebSocketTransport(handlers);
    transport.connect('room-1', 'Test User');

    const ws = MockWebSocket.instances[0];
    ws.open();

    const stateMessage = {
      type: 'state',
      roomId: 'room-1',
      ownerId: 'user1',
      reveal: false,
      participants: [],
    };

    ws.message(JSON.stringify(stateMessage));

    expect(handlers.onMessage).toHaveBeenCalledWith(stateMessage);
  });

  it('should send vote message', () => {
    const handlers: TransportEventHandlers = {
      onStatusChange: vi.fn(),
      onMessage: vi.fn(),
      onError: vi.fn(),
    };

    const transport = new WebSocketTransport(handlers);
    transport.connect('room-1', 'Test User');

    const ws = MockWebSocket.instances[0];
    ws.open();

    transport.send({ type: 'vote', roomId: 'room-1', value: '5' });

    expect(ws.sent.length).toBe(2); // join + vote
    expect(JSON.parse(ws.sent[1])).toEqual({
      type: 'vote',
      roomId: 'room-1',
      value: '5',
    });
  });

  it('should disconnect and clean up', () => {
    const handlers: TransportEventHandlers = {
      onStatusChange: vi.fn(),
      onMessage: vi.fn(),
      onError: vi.fn(),
    };

    const transport = new WebSocketTransport(handlers);
    transport.connect('room-1', 'Test User');

    const ws = MockWebSocket.instances[0];
    ws.open();

    transport.disconnect();

    expect(handlers.onStatusChange).toHaveBeenCalledWith('disconnected');
    expect(transport.status).toBe('disconnected');
  });

  it('should reconnect on close when not manually disconnected', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const handlers: TransportEventHandlers = {
      onStatusChange: vi.fn(),
      onMessage: vi.fn(),
      onError: vi.fn(),
    };

    const transport = new WebSocketTransport(handlers);
    transport.connect('room-1', 'Test User');

    const ws = MockWebSocket.instances[0];
    ws.open();

    ws.close();

    expect(handlers.onStatusChange).toHaveBeenCalledWith('reconnecting');

    vi.advanceTimersByTime(500);

    expect(MockWebSocket.instances.length).toBe(2);

    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should timeout and trigger error when connection takes too long', () => {
    vi.useFakeTimers();

    const handlers: TransportEventHandlers = {
      onStatusChange: vi.fn(),
      onMessage: vi.fn(),
      onError: vi.fn(),
    };

    const transport = new WebSocketTransport(handlers, {
      connectionTimeoutMs: 5000,
      reconnectMaxAttempts: 2,
    });

    transport.connect('room-1', 'Test User');

    const ws = MockWebSocket.instances[0];

    // Advance time past the timeout
    vi.advanceTimersByTime(5001);

    // Socket should be closed due to timeout
    expect(ws.readyState).toBe(MockWebSocket.CLOSED);

    vi.useRealTimers();
  });

  it('should use wss protocol when location is https', () => {
    setLocation('https://example.com/');

    const handlers: TransportEventHandlers = {
      onStatusChange: vi.fn(),
      onMessage: vi.fn(),
      onError: vi.fn(),
    };

    const transport = new WebSocketTransport(handlers);
    transport.connect('room-1', 'Test User');

    expect(MockWebSocket.instances[0].url).toBe('wss://example.com/ws');
  });
});
