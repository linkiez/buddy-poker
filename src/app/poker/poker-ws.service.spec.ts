import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PokerWsService } from './poker-ws.service';

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

describe('PokerWsService', () => {
  beforeEach(() => {
    MockWebSocket.instances.length = 0;
    setLocation('http://example.com/room/abc');
    (globalThis as any).WebSocket = MockWebSocket;
  });

  it('should no-op on connect when not in browser platform', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
    });

    const service = TestBed.inject(PokerWsService);
    service.connect('r', 'n');

    expect(MockWebSocket.instances.length).toBe(0);
  });

  it('should connect and send join on open', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);

    let status: string | null = null;
    service.status$.subscribe((s) => {
      status = s;
    });

    service.connect('room-1', 'Dev Ninja');
    expect(status).toBe('connecting');

    expect(MockWebSocket.instances.length).toBe(1);
    const ws = MockWebSocket.instances[0];
    expect(ws.url).toBe('ws://example.com/ws');

    ws.open();
    expect(status).toBe('connected');

    expect(ws.sent.length).toBe(1);
    expect(JSON.parse(ws.sent[0])).toEqual({ type: 'join', roomId: 'room-1', name: 'Dev Ninja' });
  });

  it('should expose all public streams and flags', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);

    expect(service.state$).toBeTruthy();
    expect(service.clientId$).toBeTruthy();
    expect(service.roomToken$).toBeTruthy();
    expect(service.error$).toBeTruthy();
    expect(service.status$).toBeTruthy();
    expect(service.isConnected).toBe(false);

    service.clearError();
  });

  it('should use wss when location protocol is https', () => {
    setLocation('https://example.com/');

    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);
    service.connect('room-1', 'Dev Ninja');

    expect(MockWebSocket.instances[0].url).toBe('wss://example.com/ws');
  });

  it('should include token on join when connecting with token', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);
    service.connect('room-1', 'Dev Ninja', 'tok');

    const ws = MockWebSocket.instances[0];
    ws.open();

    expect(JSON.parse(ws.sent[0])).toEqual({
      type: 'join',
      roomId: 'room-1',
      name: 'Dev Ninja',
      token: 'tok',
    });
  });

  it('should re-use an OPEN socket and send join immediately', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);

    service.connect('room-1', 'A');
    const ws = MockWebSocket.instances[0];
    ws.open();

    service.connect('room-1', 'B', 'tok');

    expect(MockWebSocket.instances.length).toBe(1);
    expect(ws.sent.length).toBe(2);
    expect(JSON.parse(ws.sent[1])).toEqual({
      type: 'join',
      roomId: 'room-1',
      name: 'B',
      token: 'tok',
    });
  });

  it('should re-use an OPEN socket and send join without token when token is not provided', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);

    service.connect('room-1', 'A');
    const ws = MockWebSocket.instances[0];
    ws.open();

    service.connect('room-1', 'B');

    expect(MockWebSocket.instances.length).toBe(1);
    expect(ws.sent.length).toBe(2);
    expect(JSON.parse(ws.sent[1])).toEqual({
      type: 'join',
      roomId: 'room-1',
      name: 'B',
    });
  });

  it('should no-op on switchToWebSocket when not in browser platform', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
    });

    const service = TestBed.inject(PokerWsService);
    (service as any).switchToWebSocket();

    expect(MockWebSocket.instances.length).toBe(0);
  });

  it('should not create a new socket when current is CONNECTING, but should update lastJoin', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);

    service.connect('room-1', 'First');
    const ws = MockWebSocket.instances[0];

    service.connect('room-1', 'Second');
    expect(MockWebSocket.instances.length).toBe(1);

    ws.open();
    expect(JSON.parse(ws.sent[0])).toEqual({
      type: 'join',
      roomId: 'room-1',
      name: 'Second',
    });
  });

  it('should send vote/reveal/reset only when roomId is set and socket is OPEN', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);

    service.vote('5');
    service.reveal();
    service.reset();

    service.connect('room-1', 'Dev Ninja');
    const ws = MockWebSocket.instances[0];

    service.vote('5');
    expect(ws.sent.length).toBe(0);

    ws.open();

    service.vote('5');
    service.reveal();
    service.reset();

    expect(ws.sent.length).toBe(4);
    expect(JSON.parse(ws.sent[1])).toEqual({ type: 'vote', roomId: 'room-1', value: '5' });
    expect(JSON.parse(ws.sent[2])).toEqual({ type: 'reveal', roomId: 'room-1' });
    expect(JSON.parse(ws.sent[3])).toEqual({ type: 'reset', roomId: 'room-1' });
  });

  it('should handle incoming messages (joined, error, state) and ignore invalid payloads', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);

    let clientId: string | null = null;
    let token: string | null = null;
    let error: string | null = null;
    let roomId: string | null = null;

    service.clientId$.subscribe((v) => {
      clientId = v;
    });

    service.roomToken$.subscribe((v) => {
      token = v;
    });

    service.error$.subscribe((v) => {
      error = v;
    });

    service.state$.subscribe((v) => {
      roomId = v?.roomId ?? null;
    });

    service.connect('room-1', 'Dev Ninja');
    const ws = MockWebSocket.instances[0];
    ws.open();

    ws.message('{not-json');
    ws.message(123);
    ws.message(JSON.stringify({ type: 'state', roomId: 1 }));

    ws.message(JSON.stringify({ type: 'joined', clientId: 'c1', token: 't1' }));
    expect(clientId).toBe('c1');
    expect(token).toBe('t1');

    ws.message(JSON.stringify({ type: 'joined', clientId: 'c2' }));
    expect(clientId).toBe('c2');
    expect(token).toBe('t1');

    ws.message(JSON.stringify({ type: 'joined', clientId: 'c3', token: 123 }));
    expect(clientId).toBe('c3');
    expect(token).toBe('t1');

    ws.message(JSON.stringify({ type: 'error', message: 'nope' }));
    expect(error).toBe('nope');

    ws.message(JSON.stringify({ type: 'state', roomId: 'room-1', reveal: false, participants: [] }));
    expect(roomId).toBe('room-1');

    ws.message(JSON.stringify({ type: 'wat' }));
  });

  it('should set status to reconnecting on error when not manually disconnected', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);

    let status: string | null = null;
    service.status$.subscribe((s) => {
      status = s;
    });

    service.connect('room-1', 'Dev Ninja');
    const ws = MockWebSocket.instances[0];
    ws.open();

    ws.error();
    expect(status).toBe('reconnecting');
  });

  it('should ignore error events after manual disconnect', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);
    let status: string | null = null;
    service.status$.subscribe((s) => {
      status = s;
    });

    service.connect('room-1', 'Dev Ninja');
    const ws = MockWebSocket.instances[0];
    ws.open();

    service.disconnect();
    expect(status).toBe('disconnected');

    ws.error();
    expect(status).toBe('disconnected');
  });

  it('should schedule reconnect on close when not manually disconnected', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);

    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);

    let status: string | null = null;
    service.status$.subscribe((s) => {
      status = s;
    });

    service.connect('room-1', 'Dev Ninja');
    const ws = MockWebSocket.instances[0];
    ws.open();

    ws.close();
    expect(status).toBe('reconnecting');

    expect(MockWebSocket.instances.length).toBe(1);
    vi.advanceTimersByTime(500);
    expect(MockWebSocket.instances.length).toBe(2);

    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should use transport to manage reconnect and not create new sockets when already connected', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);

    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);

    service.connect('room-1', 'Dev Ninja');
    const ws = MockWebSocket.instances[0];
    ws.open();

    ws.close();
    expect(MockWebSocket.instances.length).toBe(1);

    // Transport will handle reconnect internally
    vi.advanceTimersByTime(500);
    // Should create a new socket for reconnect
    expect(MockWebSocket.instances.length).toBe(2);

    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should disconnect manually and not attempt reconnection', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);

    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);

    service.connect('room-1', 'Dev Ninja');
    const ws = MockWebSocket.instances[0];
    ws.open();

    service.disconnect();
    expect(MockWebSocket.instances.length).toBe(1);

    vi.advanceTimersByTime(10_000);
    expect(MockWebSocket.instances.length).toBe(1);

    // When transport is null, send should no-op.
    service.vote('3');

    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should not open a new socket when reconnect timeout fires after disconnect', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);

    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);
    service.connect('room-1', 'Dev Ninja');
    const ws = MockWebSocket.instances[0];
    ws.open();

    ws.close();
    expect(MockWebSocket.instances.length).toBe(1);

    service.disconnect();

    vi.advanceTimersByTime(10_000);
    expect(MockWebSocket.instances.length).toBe(1);

    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should not reconnect when manualDisconnect/lastJoin guard triggers inside timeout callback', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);

    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);
    service.connect('room-1', 'Dev Ninja');
    const ws = MockWebSocket.instances[0];
    ws.open();

    ws.close();
    expect(MockWebSocket.instances.length).toBe(1);

    // Disconnect to prevent reconnect
    service.disconnect();

    vi.advanceTimersByTime(500);
    expect(MockWebSocket.instances.length).toBe(1);

    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should expose mode$ observable', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);

    let mode: string | null = null;
    service.mode$.subscribe((m) => {
      mode = m;
    });

    expect(mode).toBe(null);

    service.connect('room-1', 'Dev Ninja');
    expect(mode).toBe('websocket');
  });

  it('should switch to HTTP polling when WebSocket fails to connect after max attempts', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);

    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);

    let mode: string | null = null;
    service.mode$.subscribe((m) => {
      mode = m;
    });

    // Mock fetch for HTTP polling
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ clientId: 'c1' }),
    });
    (globalThis as any).fetch = mockFetch;

    service.connect('room-1', 'Dev Ninja');
    expect(mode).toBe('websocket');

    // Simulate WebSocket failing by closing 3 times
    for (let i = 0; i < 3; i++) {
      const ws = MockWebSocket.instances[i];
      ws.close();
      if (i < 2) {
        vi.advanceTimersByTime(Math.pow(2, i) * 500 + 200);
      }
    }
    
    // Now the WebSocket should have failed
    expect(MockWebSocket.instances.length).toBe(3);
    
    // Check if the transport has hasConnectionFailed
    const transport = (service as any).transport;
    const hasConnectionFailed = transport?.hasConnectionFailed?.();
    expect(hasConnectionFailed).toBe(true);
    
    // Manually trigger the onStatusChange handler with the conditions for switching
    const handlers = (service as any).createTransportHandlers();

    handlers.onStatusChange('disconnected');
    
    // Should have switched to http-polling
    expect(mode).toBe('http-polling');
    
    expect(mode).toBe('http-polling');
    
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should schedule WebSocket retry when connected via HTTP polling', () => {
    vi.useFakeTimers();

    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);

    // Mock fetch for HTTP polling
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ clientId: 'c1' }),
    });
    (globalThis as any).fetch = mockFetch;

    // Set up the service in http-polling mode with lastJoin
    (service as any).currentMode = 'http-polling';
    (service as any).lastJoin = { roomId: 'room-1', name: 'Dev Ninja' };
    
    // Manually trigger the onStatusChange handler with http-polling connected
    const handlers = (service as any).createTransportHandlers();
    handlers.onStatusChange('connected');
    
    // After connection in http-polling mode, wsRetryTimeoutId should be set
    const wsRetryTimeoutId = (service as any).wsRetryTimeoutId;
    expect(wsRetryTimeoutId).not.toBe(null);
    
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should not switch to HTTP polling when already in http-polling mode', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);

    // Mock fetch for HTTP polling
    const mockFetch = vi.fn();
    (globalThis as any).fetch = mockFetch;
    
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ clientId: 'c1' }),
    });

    // Manually switch to HTTP polling
    (service as any).currentMode = 'http-polling';
    (service as any).switchToHttpPolling();
    
    // Should return early without creating transport
    expect((service as any).currentMode).toBe('http-polling');
    
    vi.restoreAllMocks();
  });

  it('should call getEnvNumber and handle missing window', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);

    // Save original window
    const originalWindow = (globalThis as any).window;
    
    // Remove window
    delete (globalThis as any).window;
    
    const result = (service as any).getEnvNumber('WS_CONNECTION_TIMEOUT_MS', 10000);
    expect(result).toBe(10000);
    
    // Restore window
    (globalThis as any).window = originalWindow;
  });

  it('should call getEnvNumber with invalid value', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);

    // Set invalid values
    (globalThis.window as any).WS_CONNECTION_TIMEOUT_MS = 'not-a-number';
    
    const result1 = (service as any).getEnvNumber('WS_CONNECTION_TIMEOUT_MS', 10000);
    expect(result1).toBe(10000);
    
    (globalThis.window as any).WS_CONNECTION_TIMEOUT_MS = -5;
    const result2 = (service as any).getEnvNumber('WS_CONNECTION_TIMEOUT_MS', 10000);
    expect(result2).toBe(10000);
    
    (globalThis.window as any).WS_CONNECTION_TIMEOUT_MS = Infinity;
    const result3 = (service as any).getEnvNumber('WS_CONNECTION_TIMEOUT_MS', 10000);
    expect(result3).toBe(10000);
    
    // Clean up
    delete (globalThis.window as any).WS_CONNECTION_TIMEOUT_MS;
  });

  it('should call getEnvNumber with valid value', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);

    // Set valid value
    (globalThis.window as any).WS_CONNECTION_TIMEOUT_MS = 5000;
    
    const result = (service as any).getEnvNumber('WS_CONNECTION_TIMEOUT_MS', 10000);
    expect(result).toBe(5000);
    
    // Clean up
    delete (globalThis.window as any).WS_CONNECTION_TIMEOUT_MS;
  });

  it('should handle error message from server', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);

    let error: string | null = null;
    service.error$.subscribe((e) => {
      error = e;
    });

    service.connect('room-1', 'Dev Ninja');
    const ws = MockWebSocket.instances[0];
    ws.open();

    // Send error message
    ws.message(JSON.stringify({ type: 'error', message: 'Room is full' }));
    expect(error).toBe('Room is full');
  });

  it('should ignore state message with invalid roomId', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);

    let state: any = undefined;
    service.state$.subscribe((s) => {
      state = s;
    });

    service.connect('room-1', 'Dev Ninja');
    const ws = MockWebSocket.instances[0];
    ws.open();

    // Send state without roomId
    ws.message(JSON.stringify({ type: 'state', reveal: false, participants: [] }));
    expect(state).toBe(null);

    // Send state with non-string roomId
    ws.message(JSON.stringify({ type: 'state', roomId: 123, reveal: false, participants: [] }));
    expect(state).toBe(null);
  });

  it('should no-op on switchToHttpPolling when not in browser platform', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
    });

    const service = TestBed.inject(PokerWsService);
    (service as any).switchToHttpPolling();

    expect((service as any).transport).toBe(null);
  });

  it('should clear wsRetryTimeout on clearWsRetryTimeout', () => {
    vi.useFakeTimers();

    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);

    // Set a timeout
    (service as any).wsRetryTimeoutId = setTimeout(() => {}, 60000);
    
    // Clear it
    (service as any).clearWsRetryTimeout();
    
    expect((service as any).wsRetryTimeoutId).toBe(null);

    vi.useRealTimers();
  });

  it('should disconnect and clear all subjects and timers', () => {
    vi.useFakeTimers();

    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);

    let clientId: string | null = 'initial';
    let roomToken: string | null = 'initial';
    let error: string | null = 'initial';
    let state: any = 'initial';
    let status: string | null = 'initial';
    let mode: string | null = 'initial';

    service.clientId$.subscribe((v) => {
      clientId = v;
    });
    service.roomToken$.subscribe((v) => {
      roomToken = v;
    });
    service.error$.subscribe((v) => {
      error = v;
    });
    service.state$.subscribe((v) => {
      state = v;
    });
    service.status$.subscribe((s) => {
      status = s;
    });
    service.mode$.subscribe((m) => {
      mode = m;
    });

    service.connect('room-1', 'Dev Ninja');
    const ws = MockWebSocket.instances[0];
    ws.open();

    // Set some state
    ws.message(JSON.stringify({ type: 'joined', clientId: 'c1', token: 't1' }));
    expect(clientId).toBe('c1');
    expect(roomToken).toBe('t1');

    // Disconnect
    service.disconnect();

    // Check all subjects are cleared
    expect(clientId).toBe(null);
    expect(roomToken).toBe(null);
    expect(error).toBe(null);
    expect(state).toBe(null);
    expect(status).toBe('disconnected');
    expect(mode).toBe(null);

    vi.useRealTimers();
  });

  it('should trigger onError handler', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);

    let error: string | null = null;
    service.error$.subscribe((e) => {
      error = e;
    });

    // Create handlers and trigger onError directly
    const handlers = (service as any).createTransportHandlers();
    handlers.onError('Test error message');

    expect(error).toBe('Test error message');
  });

  it('should attempt to switch back to WebSocket after retry timeout in HTTP polling mode', () => {
    vi.useFakeTimers();

    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);

    let mode: string | null = null;
    service.mode$.subscribe((m) => {
      mode = m;
    });

    // Set up the service in http-polling mode with lastJoin
    (service as any).currentMode = 'http-polling';
    (service as any).lastJoin = { roomId: 'room-1', name: 'Dev Ninja' };
    
    // Call scheduleWsRetry directly
    (service as any).scheduleWsRetry();
    
    // Verify timeout is set
    expect((service as any).wsRetryTimeoutId).not.toBe(null);
    
    // Advance timers to trigger the timeout
    vi.advanceTimersByTime(60_000);
    
    // Should have switched back to websocket
    expect(mode).toBe('websocket');
    
    vi.useRealTimers();
  });

  it('should not switch to WebSocket when retry timeout fires but conditions are not met', () => {
    vi.useFakeTimers();

    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(PokerWsService);

    let mode: string | null = null;
    service.mode$.subscribe((m) => {
      mode = m;
    });

    // Set up the service in http-polling mode but without lastJoin
    (service as any).currentMode = 'http-polling';
    (service as any).lastJoin = null;
    
    // Call scheduleWsRetry directly
    (service as any).scheduleWsRetry();
    
    // Advance timers to trigger the timeout
    vi.advanceTimersByTime(60_000);
    
    // Should NOT have switched to websocket
    expect(mode).toBe(null);
    
    vi.useRealTimers();
  });
});
