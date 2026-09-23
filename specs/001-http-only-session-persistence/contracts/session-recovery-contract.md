# Session Recovery Contract

## Server Authority

The server is the only authority for participant membership and moderator permissions.
Client storage, transport preference, tab leadership, and UI state cannot grant ownership.

## Recovery Outcomes

| Condition | Server/client outcome |
|---|---|
| Valid client ID and fingerprint, inactive prior session | Reuse participant and preserve vote |
| Valid owner reservation and matching identity | Reuse participant and restore moderator |
| Same identity already active in another context | Coordinate/handoff or reject takeover with a safe message |
| Invalid fingerprint or copied client ID | Reject with a session-conflict response |
| Expired room or owner reservation | Return rejoin-required; do not silently promote the returning user |
| Temporary HTTP failure | Keep reconnecting state and retry without replacing identity |

## Identity Storage

The browser stores one versioned room envelope in `localStorage`. Legacy room-scoped client
ID and event-cursor keys are read once for migration and then consolidated. Display name is
stored in the same envelope so same-browser contexts use the same participant identity.

The HTTP-only flag remains in `sessionStorage` and is never copied into the identity envelope.

## Moderator Recovery

Moderator recovery requires all of:

1. The participant belongs to the requested room.
2. The stored client ID matches the server participant or owner reservation.
3. The fingerprint matches when fingerprint validation is enabled.
4. The room token/session is valid.
5. The owner reservation has not expired.

If any requirement fails, the server rejects restoration and the UI offers explicit rejoin
guidance.

## Idempotency

Every vote, reveal, and reset has one `actionId` per logical user action. Repeating an
already accepted `actionId` returns a success-shaped response without repeating the state
mutation. A different `actionId` is a new action and remains subject to normal permissions
and room-state rules.
