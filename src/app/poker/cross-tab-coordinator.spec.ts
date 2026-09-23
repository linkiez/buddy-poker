import { describe, expect, it, vi } from 'vitest';

import {
  CrossTabCoordinator,
  type CrossTabCoordinatorOptions,
  type CrossTabMessage,
} from './cross-tab-coordinator';

class FakeBroadcastChannel {
  static channels = new Map<string, Set<FakeBroadcastChannel>>();
  onmessage: ((event: MessageEvent<CrossTabMessage>) => void) | null = null;
  readonly name: string;

  constructor(name: string) {
    this.name = name;
    const peers = FakeBroadcastChannel.channels.get(name) ?? new Set();
    peers.add(this);
    FakeBroadcastChannel.channels.set(name, peers);
  }

  postMessage(message: CrossTabMessage): void {
    for (const peer of FakeBroadcastChannel.channels.get(this.name) ?? []) {
      if (peer !== this) {
        peer.onmessage?.({ data: message } as MessageEvent<CrossTabMessage>);
      }
    }
  }

  close(): void {
    FakeBroadcastChannel.channels.get(this.name)?.delete(this);
  }
}

class FakeEventTarget {
  private readonly listeners = new Set<(event: StorageEvent) => void>();

  addEventListener(_type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.add(listener as (event: StorageEvent) => void);
  }

  removeEventListener(_type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.delete(listener as (event: StorageEvent) => void);
  }

  dispatch(event: StorageEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

function createOptions(
  overrides: Partial<CrossTabCoordinatorOptions> = {},
): CrossTabCoordinatorOptions {
  return {
    channelFactory: (name: string) => new FakeBroadcastChannel(name),
    tabId: overrides.tabId ?? crypto.randomUUID(),
    heartbeatIntervalMs: 10,
    heartbeatTimeoutMs: 30,
    ...overrides,
  };
}

describe('CrossTabCoordinator', () => {
  it('elects one leader and delivers leader state to followers', () => {
    const followerState = vi.fn();
    const first = new CrossTabCoordinator('room-1', createOptions({ tabId: 'b' }));
    const second = new CrossTabCoordinator(
      'room-1',
      createOptions({ tabId: 'a' }),
    );
    const third = new CrossTabCoordinator(
      'room-1',
      createOptions({ tabId: 'c', onState: followerState }),
    );

    first.start();
    second.start();
    third.start();
    second.publishState({
      roomId: 'room-1',
      ownerId: null,
      reveal: false,
      participants: [],
    });

    expect(second.isLeader()).toBe(true);
    expect(first.isLeader()).toBe(false);
    expect(followerState).toHaveBeenCalledOnce();
    first.stop();
    second.stop();
    third.stop();
  });

  it('expires a silent leader and allows a follower to take over', () => {
    vi.useFakeTimers();
    const leader = new CrossTabCoordinator('room-1', createOptions({ tabId: 'a' }));
    const follower = new CrossTabCoordinator('room-1', createOptions({ tabId: 'b' }));

    leader.start();
    follower.start();
    expect(follower.isLeader()).toBe(false);

    leader.stop({ release: false });
    vi.advanceTimersByTime(41);

    expect(follower.isLeader()).toBe(true);
    follower.stop();
    vi.useRealTimers();
  });

  it('keeps cursor ownership with the leader and broadcasts cursor updates', () => {
    const leaderCursor = vi.fn();
    const leader = new CrossTabCoordinator('room-1', createOptions({ tabId: 'a' }));
    const follower = new CrossTabCoordinator(
      'room-1',
      createOptions({ tabId: 'b', onCursor: leaderCursor }),
    );

    leader.start();
    follower.start();
    leader.setCursor(12);

    expect(leader.getCursor()).toBe(12);
    expect(follower.getCursor()).toBe(12);
    expect(follower.setCursor(20)).toBe(false);
    expect(leaderCursor).toHaveBeenCalledWith(12);
    leader.stop();
    follower.stop();
  });

  it('releases leadership and lets another tab take over', () => {
    const leader = new CrossTabCoordinator('room-1', createOptions({ tabId: 'a' }));
    const follower = new CrossTabCoordinator('room-1', createOptions({ tabId: 'b' }));

    leader.start();
    follower.start();
    leader.release();

    expect(follower.isLeader()).toBe(true);
    expect(leader.isLeader()).toBe(false);
    leader.stop();
    follower.stop();
  });

  it('uses storage events when BroadcastChannel is unavailable', () => {
    const eventTarget = new FakeEventTarget();
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
        eventTarget.dispatch({ key, newValue: value } as StorageEvent);
      },
    };
    const onStatus = vi.fn();
    const leader = new CrossTabCoordinator(
      'room-1',
      createOptions({ channelFactory: null, eventTarget, storage, tabId: 'a' }),
    );
    const follower = new CrossTabCoordinator(
      'room-1',
      createOptions({ channelFactory: null, eventTarget, storage, tabId: 'b', onStatus }),
    );

    leader.start();
    follower.start();
    leader.publishStatus('connected');

    expect(onStatus).toHaveBeenCalledWith('connected');
    leader.stop();
    follower.stop();
  });
});
