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
});
