# Transport Contract

## Transport Selection

The browser reads the per-session HTTP-only preference before transport creation.

| Preference | Allowed transport behavior |
|---|---|
| `httpOnly = true` | Create HTTP polling only; do not create WebRTC/WebSocket or schedule promotion retries |
| missing/invalid | Preserve current automatic order and WebSocket-to-HTTP fallback |

The preference is not an authorization signal.

## HTTP Actions

### `POST /api/poker/action`

The request carries JSON for one of these actions:

```json
{
  "type": "join",
  "roomId": "room-1",
  "name": "Participant",
  "token": "optional-room-token",
  "fingerprint": "optional-browser-signal",
  "clientId": "optional-previous-client-id"
}
```

Mutating actions additionally carry `actionId`:

```json
{
  "type": "reset",
  "roomId": "room-1",
  "actionId": "unique-action-id"
}
```

The `X-Client-Id` header identifies the current HTTP session for non-join actions. The
server validates room, token, fingerprint, client ID, ownership, and action ID before
mutating state.

Expected outcomes:

- `200`: action accepted or recognized as an idempotent duplicate.
- `400`: malformed or unsupported action.
- `401`: missing active client session.
- `403`: invalid room token, fingerprint conflict, or unauthorized moderator action.
- `404`: expired/unknown session; the client transitions to `rejoin-required`.

### `GET /api/poker/events`

Query parameters:

- `clientId`: active client session identifier.
- `lastEventId`: last event cursor processed by the leader.

The response contains ordered events after the cursor. Event IDs are monotonic for the
session and must not be written by follower tabs.

## Shared-Browser Coordination Contract

Contexts for the same room use a channel name derived from the normalized room ID.

Messages:

- `leader-announce`: leader ID, timestamp, and room ID.
- `leader-heartbeat`: leader liveness and current cursor.
- `state`: latest server room state for followers.
- `status`: connection/recovery status for followers.
- `leader-release`: voluntary handoff before context shutdown.

Only the elected leader may own a network transport and advance the shared event cursor.
Followers MUST be able to request a takeover after heartbeat expiry and MUST reuse the
persisted identity envelope when doing so.

## WebSocket Compatibility

WebSocket join and mutating messages use the same `clientId`, fingerprint, room token, and
`actionId` semantics as HTTP. Automatic mode remains backward compatible for clients that do
not send the new optional recovery fields; new mutating clients send `actionId` consistently.
