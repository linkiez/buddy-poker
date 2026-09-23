# Data Model: HTTP-Only Transport and Session Recovery

## BrowserSessionEnvelope

Represents the browser's recoverable identity for one room.

| Field | Type | Required | Rules |
|---|---|---:|---|
| `schemaVersion` | positive integer | yes | Current version is `1`; unknown versions are ignored safely |
| `roomId` | normalized string | yes | Must match the current route room |
| `clientId` | string | yes | Opaque server-issued identifier; never grants permissions by itself |
| `name` | string | yes | Trimmed, non-empty, maximum 32 characters |
| `fingerprint` | string | no | Browser signal revalidated by the server |
| `lastEventId` | non-negative integer | yes | Monotonic cursor owned by the elected leader |
| `updatedAt` | timestamp | yes | Used for stale-session cleanup and leader diagnostics |

The envelope is stored in room-scoped `localStorage`. It is recovery metadata, not an
authentication credential. Invalid, mismatched, or stale envelopes MUST be discarded or
rejoined through the explicit recovery path.

## TransportPreference

Represents the per-browser-session transport choice.

| Field | Type | Required | Rules |
|---|---|---:|---|
| `httpOnly` | boolean | no | Missing or invalid values mean automatic mode |

The preference is stored in `sessionStorage` and affects transport selection only. It MUST
never be used to infer room membership, participant identity, or moderator ownership.

## RoomParticipantSession

Represents server-side membership in an active room.

| Field | Type | Required | Rules |
|---|---|---:|---|
| `clientId` | string | yes | Unique within the room |
| `roomId` | string | yes | Normalized room identifier |
| `name` | string | yes | Server-normalized participant name |
| `fingerprint` | string or null | no | Used with client ID for recovery validation |
| `vote` | string or null | yes | Preserved across valid reload recovery before reveal |
| `lastSeenAt` | timestamp | yes | Updated by active transport/session use |
| `actionIds` | bounded set | yes | Recently applied mutation identifiers |

## OwnerReservation

Represents temporary moderator recovery authority after disconnect.

| Field | Type | Required | Rules |
|---|---|---:|---|
| `clientId` | string | yes | Must match the former owner |
| `fingerprint` | string | yes | Must match the reconnecting browser signal |
| `expiresAt` | timestamp | yes | Expired reservations cannot restore ownership |

The server may restore ownership only when the reservation, client ID, fingerprint, room
token/session, and participant membership all validate. Expiration follows the existing
reservation policy and must produce a rejoin-required outcome rather than a client-side owner
claim.

## RoomAction

Represents a mutating operation sent through either transport.

| Field | Type | Required | Rules |
|---|---|---:|---|
| `type` | `vote`, `reveal`, or `reset` | yes | Existing room action types |
| `roomId` | string | yes | Must match the active session |
| `actionId` | opaque string | yes | Unique for one logical client action |
| `value` | string | vote only | Existing vote validation and length limits apply |

The server records an accepted `actionId` before or atomically with the state mutation. A
duplicate action returns success without applying the mutation again.

## RecoveryState

User-visible state values:

- `connected`: active transport and valid room session.
- `connecting`: initial connection in progress.
- `reconnecting`: transient transport failure with retry possible.
- `unavailable`: transport or server cannot currently deliver updates.
- `rejoin-required`: stored session is invalid, expired, or rejected and explicit rejoin is
  required.

## Relationships and Lifecycle

1. A room link identifies a room and optional token; the browser envelope identifies a prior
   participant session for that room.
2. A valid join attaches the browser envelope to a server participant session.
3. A leader owns the active transport and broadcasts state to same-browser followers.
4. A valid owner disconnect creates or refreshes `OwnerReservation`.
5. A valid owner reconnect restores ownership; an expired reservation cannot be restored.
6. Room expiry removes participant/session recovery data together with the room.
