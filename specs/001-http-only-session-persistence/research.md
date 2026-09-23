# Research: HTTP-Only Transport and Session Recovery

## Decision 1: Select HTTP-only before automatic transport negotiation

**Decision**: Read a documented browser-session flag before `PokerWsService` attempts WebRTC
or WebSocket. When enabled, instantiate only `HttpPollingTransport` and do not schedule
better-transport retries.

**Rationale**: HTTP polling already implements the required room actions and event stream.
Selecting it before negotiation directly addresses corporate networks that block WebSockets
and avoids unnecessary failed connection attempts.

**Alternatives considered**:

- Keep the current WebRTC → WebSocket → HTTP sequence: rejected because it still triggers
  blocked connections and violates the HTTP-only acceptance scenario.
- Add a new HTTP transport: rejected because the existing implementation already covers the
  required endpoints and state semantics.

## Decision 2: Use a versioned localStorage identity envelope

**Decision**: Store room-scoped recovery data in one versioned `localStorage` envelope that
contains the room identifier, client identifier, display name, fingerprint association, and
last event cursor. Keep the HTTP-only flag in `sessionStorage` and never treat either storage
area as authorization.

**Rationale**: `localStorage` is shared across same-origin tabs and windows, which is required
by the clarified feature scope. A single versioned record avoids races between separate
client-id and event-cursor keys and provides an explicit migration path from current keys.

**Alternatives considered**:

- Keep display name in `sessionStorage`: rejected because it is not shared across tabs/windows.
- Store all recovery data in `sessionStorage`: rejected because it is tab-scoped.
- Use IndexedDB: deferred because asynchronous transactions add complexity without a current
  data-volume requirement.
- Store a moderator boolean in the browser: rejected because moderator authorization must
  remain derived from server state.

## Decision 3: Coordinate same-browser contexts with one leader connection

**Decision**: Use `BroadcastChannel` as the primary same-browser coordination mechanism and
the `storage` event as a fallback. Elect one leader per room identity to own the live
transport and event cursor; follower contexts receive state and status broadcasts.

**Rationale**: Multiple independent polling loops sharing one cursor can overwrite progress
and cause duplicate or skipped events. A single leader removes that race while allowing
another context to take over after a heartbeat timeout.

**Alternatives considered**:

- Independent connections in every tab: rejected because it conflicts with the clarified
  shared identity requirement and creates cursor/session takeover races.
- SharedWorker: rejected for this iteration because browser support and test complexity add
  risk beyond the corporate HTTP-only objective.
- BroadcastChannel only: rejected because the storage-event fallback is needed for browser
  contexts where BroadcastChannel is unavailable or restricted.

## Decision 4: Add action identifiers and bounded server deduplication

**Decision**: Every mutating room action carries a client-generated `actionId`. The server
  records recently applied identifiers per room/session with a bounded TTL and treats a
  duplicate as a successful no-op.

**Rationale**: Vote and reveal overwrite state, but reset appends round history and is not
  safe to repeat. HTTP retries and reconnects require an explicit idempotency contract.

**Alternatives considered**:

- Rely on client-side retry suppression: rejected because clients can reload, race, or fail
  after the server applies an action.
- Deduplicate only reset: rejected because a uniform contract is safer and simplifies
  transport parity.
- Keep an unbounded action history: rejected because it risks memory growth in long-lived
  rooms.

## Decision 5: Preserve server-authoritative moderator recovery

**Decision**: Extend the existing fingerprint/client-id validation and owner reservation
  logic. Persist the owner reservation with room metadata when the persistence backend is
  available, while continuing to derive moderator status from `ownerId`.

**Rationale**: The existing `owner-reservation.ts` already prevents immediate ownership
  transfer during reconnect. Persisting its short-lived state prevents a restart from
  invalidating an otherwise valid moderator recovery path.

**Alternatives considered**:

- Promote the first reconnecting participant: rejected because it can transfer moderator
  control unexpectedly.
- Trust a client-side owner flag: rejected as forgeable and contrary to server authorization.
- Introduce accounts or a new identity provider: out of scope for the anonymous room product.

## Decision 6: Distinguish expired recovery from transient reconnecting

**Decision**: Add a `rejoin-required` recovery outcome when the server rejects or expires the
  stored room session. Preserve `reconnecting` for transient transport failures and provide
  a user-facing rejoin action without silently creating a replacement identity.

**Rationale**: The current HTTP 404 path reconnects silently, which can hide session loss and
  make moderator recovery ambiguous.

**Alternatives considered**:

- Always create a new participant after 404: rejected because it can duplicate identity and
  hide loss of moderator permissions.
- Treat every failure as terminal: rejected because temporary HTTP failures are recoverable.
