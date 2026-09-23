import type { PokerClientMessage, PokerRoomViewState } from './poker-types';
import type { TransportStatus } from './transport.types';

type CrossTabEventTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>;
type CrossTabStorage = Pick<Storage, 'getItem' | 'setItem'>;

export type CrossTabMessage =
  | { type: 'leader-announce'; roomId: string; leaderId: string; sentAt: number }
  | {
      type: 'leader-heartbeat';
      roomId: string;
      leaderId: string;
      sentAt: number;
      cursor: number;
    }
  | { type: 'state'; roomId: string; leaderId: string; state: PokerRoomViewState }
  | { type: 'status'; roomId: string; leaderId: string; status: TransportStatus }
  | { type: 'action'; roomId: string; leaderId: string; action: PokerClientMessage }
  | { type: 'leader-release'; roomId: string; leaderId: string; sentAt: number };

export interface CrossTabChannel {
  onmessage: ((event: MessageEvent<CrossTabMessage>) => void) | null;
  postMessage(message: CrossTabMessage): void;
  close(): void;
}

export interface CrossTabCoordinatorOptions {
  channelFactory?: ((name: string) => CrossTabChannel) | null;
  eventTarget?: CrossTabEventTarget;
  storage?: CrossTabStorage;
  now?: () => number;
  tabId?: string;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  onState?: (state: PokerRoomViewState) => void;
  onStatus?: (status: TransportStatus) => void;
  onCursor?: (cursor: number) => void;
  onRoleChange?: (isLeader: boolean) => void;
  onAction?: (action: PokerClientMessage) => void;
}

const CHANNEL_PREFIX = 'bp_cross_tab_';
const DEFAULT_HEARTBEAT_INTERVAL_MS = 2_000;
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 6_000;

function normalizedRoomId(roomId: string): string {
  return roomId.trim();
}

function createTabId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getDefaultChannelFactory(): ((name: string) => CrossTabChannel) | undefined {
  if (typeof BroadcastChannel === 'undefined') {
    return undefined;
  }

  return (name) => new BroadcastChannel(name);
}

/**
 * Coordinates same-browser room contexts with one leader-owned transport.
 */
export class CrossTabCoordinator {
  private readonly roomId: string;
  private readonly channelName: string;
  private readonly channelFactory?: (name: string) => CrossTabChannel;
  private readonly eventTarget: CrossTabEventTarget | undefined;
  private readonly storage: CrossTabStorage | undefined;
  private readonly now: () => number;
  private readonly heartbeatIntervalMs: number;
  private readonly heartbeatTimeoutMs: number;
  private readonly onState?: (state: PokerRoomViewState) => void;
  private readonly onStatus?: (status: TransportStatus) => void;
  private readonly onCursor?: (cursor: number) => void;
  private readonly onRoleChange?: (isLeader: boolean) => void;
  private readonly onAction?: (action: PokerClientMessage) => void;
  private readonly tabId: string;
  private channel: CrossTabChannel | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private expiryTimer: ReturnType<typeof setInterval> | null = null;
  private storageListener: ((event: StorageEvent) => void) | null = null;
  private started = false;
  private leader = false;
  private leaderId: string | null = null;
  private leaderSeenAt = 0;
  private cursor = 0;

  constructor(roomId: string, options: CrossTabCoordinatorOptions = {}) {
    this.roomId = normalizedRoomId(roomId);
    this.channelName = `${CHANNEL_PREFIX}${this.roomId}`;
    this.channelFactory =
      options.channelFactory === undefined ? getDefaultChannelFactory() : options.channelFactory ?? undefined;
    this.eventTarget =
      options.eventTarget ??
      (typeof globalThis.addEventListener === 'function' ? globalThis : undefined);
    this.storage =
      options.storage ??
      (typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : undefined);
    this.now = options.now ?? Date.now;
    this.tabId = options.tabId ?? createTabId();
    this.heartbeatIntervalMs =
      options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS;
    this.onState = options.onState;
    this.onStatus = options.onStatus;
    this.onCursor = options.onCursor;
    this.onRoleChange = options.onRoleChange;
    this.onAction = options.onAction;
  }

  /** Starts coordination and participates in leader election. */
  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.channel = this.channelFactory?.(this.channelName) ?? null;
    if (this.channel) {
      this.channel.onmessage = (event) => this.receive(event.data);
    } else {
      this.installStorageFallback();
      this.discoverStoredLeader();
    }

    this.becomeLeader();
    this.broadcast({ type: 'leader-announce', roomId: this.roomId, leaderId: this.tabId, sentAt: this.now() });
    this.startTimers();
  }

  /** Stops coordination and optionally performs a voluntary leadership handoff. */
  stop(options: { release?: boolean } = {}): void {
    if (!this.started) {
      return;
    }

    if (options.release !== false && this.leader) {
      this.release();
    }

    this.started = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.expiryTimer) {
      clearInterval(this.expiryTimer);
      this.expiryTimer = null;
    }
    if (this.storageListener) {
      this.eventTarget?.removeEventListener('storage', this.storageListener);
      this.storageListener = null;
    }
    this.channel?.close();
    this.channel = null;
    this.setLeader(false);
    this.leaderId = null;
  }

  /** Returns whether this context owns the network transport. */
  isLeader(): boolean {
    return this.leader;
  }

  /** Returns the latest event cursor owned by the elected leader. */
  getCursor(): number {
    return this.cursor;
  }

  /** Updates and broadcasts the event cursor when called by the leader. */
  setCursor(cursor: number): boolean {
    if (!this.leader || !Number.isSafeInteger(cursor) || cursor < 0) {
      return false;
    }

    this.cursor = cursor;
    this.broadcastHeartbeat();
    return true;
  }

  /** Takes over after a leader has been released or its heartbeat has expired. */
  takeOver(): boolean {
    if (!this.started || this.leader) {
      return this.leader;
    }

    if (this.leaderId && this.now() - this.leaderSeenAt <= this.heartbeatTimeoutMs) {
      return false;
    }

    this.leaderId = null;
    this.leaderSeenAt = 0;
    this.becomeLeader();
    return this.leader;
  }

  /** Publishes server state to follower contexts. */
  publishState(state: PokerRoomViewState): boolean {
    if (!this.leader) {
      return false;
    }

    this.broadcast({ type: 'state', roomId: this.roomId, leaderId: this.tabId, state });
    return true;
  }

  /** Publishes connection or recovery status to follower contexts. */
  publishStatus(status: TransportStatus): boolean {
    if (!this.leader) {
      return false;
    }

    this.broadcast({ type: 'status', roomId: this.roomId, leaderId: this.tabId, status });
    return true;
  }

  /** Sends a mutating room action from a follower to the elected leader. */
  publishAction(action: PokerClientMessage): boolean {
    if (!this.started || this.leader) {
      return false;
    }

    this.broadcast({ type: 'action', roomId: this.roomId, leaderId: this.tabId, action });
    return true;
  }

  /** Voluntarily releases leadership so another context can take over. */
  release(): void {
    if (!this.leader) {
      return;
    }

    this.broadcast({
      type: 'leader-release',
      roomId: this.roomId,
      leaderId: this.tabId,
      sentAt: this.now(),
    });
    this.setLeader(false);
    this.leaderId = null;
    this.leaderSeenAt = 0;
  }

  private startTimers(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.leader) {
        this.broadcastHeartbeat();
      }
    }, this.heartbeatIntervalMs);
    this.expiryTimer = setInterval(() => this.expireLeaderIfNeeded(), this.heartbeatIntervalMs);
  }

  private installStorageFallback(): void {
    if (!this.eventTarget) {
      return;
    }

    this.storageListener = (event) => {
      if (event.key !== this.channelName || !event.newValue) {
        return;
      }

      try {
        this.receive(JSON.parse(event.newValue) as CrossTabMessage);
      } catch {
        // Ignore malformed cross-tab payloads.
      }
    };
    this.eventTarget.addEventListener('storage', this.storageListener);
  }

  private discoverStoredLeader(): void {
    if (!this.storage) {
      return;
    }

    try {
      const raw = this.storage.getItem(this.channelName);
      if (!raw) {
        return;
      }

      const message = JSON.parse(raw) as CrossTabMessage;
      if (
        (message.type === 'leader-announce' || message.type === 'leader-heartbeat') &&
        this.now() - message.sentAt <= this.heartbeatTimeoutMs
      ) {
        this.receive(message);
      }
    } catch {
      // Ignore malformed or inaccessible storage data.
    }
  }

  private broadcast(message: CrossTabMessage): void {
    if (this.channel) {
      this.channel.postMessage(message);
      return;
    }

    try {
      this.storage?.setItem(this.channelName, JSON.stringify({ ...message, nonce: this.now() }));
    } catch {
      // Storage can be unavailable in private browsing or SSR environments.
    }
  }

  private broadcastHeartbeat(): void {
    this.broadcast({
      type: 'leader-heartbeat',
      roomId: this.roomId,
      leaderId: this.tabId,
      sentAt: this.now(),
      cursor: this.cursor,
    });
  }

  private receive(message: CrossTabMessage): void {
    if (!this.started || message.roomId !== this.roomId || message.leaderId === this.tabId) {
      return;
    }

    if (message.type === 'leader-release') {
      if (message.leaderId === this.leaderId) {
        this.leaderId = null;
        this.leaderSeenAt = 0;
        this.becomeLeader();
      }
      return;
    }

    if (message.type === 'leader-announce' || message.type === 'leader-heartbeat') {
      this.acceptLeader(message.leaderId, message.sentAt);
      if (message.type === 'leader-announce' && this.leader) {
        this.broadcastHeartbeat();
      }
      if (message.type === 'leader-heartbeat') {
        this.cursor = message.cursor;
        this.onCursor?.(message.cursor);
      }
      return;
    }

    if (message.type === 'action') {
      if (this.leader) {
        this.onAction?.(message.action);
      }
      return;
    }

    if (message.leaderId !== this.leaderId || this.leader) {
      return;
    }

    if (message.type === 'state') {
      this.onState?.(message.state);
    } else if (message.type === 'status') {
      this.onStatus?.(message.status);
    }
  }

  private acceptLeader(candidateId: string, seenAt: number): void {
    if (
      this.leaderId === null ||
      candidateId < this.leaderId ||
      (candidateId === this.leaderId && seenAt >= this.leaderSeenAt)
    ) {
      this.leaderId = candidateId;
      this.leaderSeenAt = seenAt;
      if (this.leader && candidateId !== this.tabId) {
        this.setLeader(false);
      }
    }
  }

  private expireLeaderIfNeeded(): void {
    if (this.leader || !this.leaderId || this.now() - this.leaderSeenAt <= this.heartbeatTimeoutMs) {
      return;
    }

    this.leaderId = null;
    this.leaderSeenAt = 0;
    this.becomeLeader();
  }

  private becomeLeader(): void {
    if (!this.started || this.leaderId !== null) {
      return;
    }

    this.leaderId = this.tabId;
    this.leaderSeenAt = this.now();
    this.setLeader(true);
    this.broadcastHeartbeat();
  }

  private setLeader(value: boolean): void {
    if (this.leader === value) {
      return;
    }

    this.leader = value;
    this.onRoleChange?.(value);
  }
}
