# Feature Specification: HTTP-Only Transport and Session Recovery

**Feature Branch**: `001-http-only-session-persistence`

**Created**: 2026-09-23

**Status**: Draft

**Input**: User description: "hoje o projeto apresenta problemas em ambiente corporativos com
websockets bloqueado, essas spec deve criar feature flag de http only e resolver problemas de
persistencia de sessao de usuario e moderador quando a pagina 'e recarregada"

## Clarifications

### Session 2026-09-23

- Q: A configuração HTTP-only deve ser aplicada globalmente ao ambiente, por sala, ou
  escolhida pelo usuário? → A: Flag por session storage.
- Q: A recuperação da identidade precisa funcionar apenas após recarregar a mesma aba, ou
  também ao abrir a mesma sala em outra aba do navegador? → A: Mesma identidade entre abas e
  janelas do mesmo navegador.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Use a room when WebSocket is unavailable (Priority: P1)

As a participant in a corporate network, I want the room to operate through HTTP only so that
firewalls or network policies blocking WebSocket connections do not prevent me from joining,
voting, or receiving room updates.

**Why this priority**: A blocked WebSocket currently prevents the core product experience for
an important deployment environment.

**Independent Test**: Enable HTTP-only mode, join a room with multiple participants, submit
votes, reveal results, and reset the round while confirming that all participants observe the
same state.

**Acceptance Scenarios**:

1. **Given** HTTP-only mode is enabled, **When** a participant opens a room link, **Then**
   the participant joins without attempting a WebSocket connection.
2. **Given** HTTP-only mode is enabled and a participant submits a valid vote, **When** the
   room processes the action, **Then** every active participant receives the updated state.
3. **Given** HTTP-only mode is enabled, **When** the moderator reveals or resets a round,
   **Then** the same moderator permissions and room behavior apply as in the default mode.
4. **Given** HTTP-only mode is disabled, **When** WebSocket is available, **Then** the
   existing preferred transport behavior remains unchanged.

---

### User Story 2 - Recover participant identity after reload (Priority: P1)

As a participant, I want to reload the page without becoming a new participant so that my
display name, room membership, and current voting state remain associated with me.

**Why this priority**: Reloads are normal browser behavior and currently cause session loss
that disrupts active planning sessions.

**Independent Test**: Join a room, set a participant identity, vote, reload the page, and
verify that the same participant is restored without creating a duplicate participant.

**Acceptance Scenarios**:

1. **Given** a participant is in an active room, **When** the participant reloads the page,
   **Then** the room reconnects that participant using the same identity and room context.
2. **Given** a participant has already voted, **When** the page is reloaded before reveal,
   **Then** the participant's vote remains associated with that participant and is not counted
   as a second vote.
3. **Given** the saved participant session is invalid or expired, **When** the participant
   returns to the room, **Then** the application explains that rejoining is required and does
   not silently impersonate another participant.

---

### User Story 3 - Preserve moderator ownership after reload (Priority: P1)

As the room moderator, I want to reload the page without losing moderator controls so that I
can continue revealing and resetting rounds without transferring ownership unexpectedly.

**Why this priority**: Losing moderator ownership can block the room's primary workflow and
requires participants to recreate the room.

**Independent Test**: Create a room, reload the moderator page before and after a vote, and
verify that only the original moderator retains reveal and reset controls.

**Acceptance Scenarios**:

1. **Given** a participant created the room and is its moderator, **When** that participant
   reloads the page, **Then** the same participant remains the moderator.
2. **Given** the moderator reloads while other participants remain connected, **When** the
   moderator reconnects, **Then** no second participant is promoted solely because of the
   reload.
3. **Given** a non-moderator reloads the page, **When** the participant reconnects, **Then**
   the participant does not receive moderator permissions.
4. **Given** the moderator session cannot be safely restored, **When** the moderator returns,
   **Then** the application requires an explicit, safe recovery path rather than assigning
   ownership based only on arrival order.

### End-to-End Test Plan (Playwright)

The feature MUST include an isolated Playwright suite covering the complete browser
experience. Tests MUST use fresh browser contexts unless a scenario explicitly validates
shared identity between tabs or windows. Each test MUST create or obtain its own room, clean
up its contexts, and assert user-visible state as well as relevant network behavior.

| ID | Scenario | Setup and actions | Required assertions |
|---|---|---|---|
| PW-001 | HTTP-only join | Enable the HTTP-only flag in the browser session, open a room, and join as a participant | The participant reaches the room; no WebSocket or WebRTC connection attempt occurs; HTTP connection status becomes `connected` |
| PW-002 | HTTP-only round lifecycle | Open a moderator and participant context in HTTP-only mode; join, vote, reveal, and reset | Both contexts observe the same participant list, vote/reveal state, and new round; moderator controls remain available |
| PW-003 | Automatic fallback regression | Leave HTTP-only disabled and block WebSocket traffic for the test context | The room remains usable through the existing fallback; join, vote, reveal, and reset complete without a duplicate participant |
| PW-004 | Participant reload recovery | Join as a participant, record the visible identity, submit a vote, reload the page, and wait for recovery | The same identity is displayed exactly once; the vote remains associated with that participant; no duplicate participant appears |
| PW-005 | Moderator reload recovery | Create a room, join a second participant, reload the moderator before and after voting | The original moderator retains reveal and reset controls; the second participant never receives them |
| PW-006 | Shared identity in second tab | Open the same room in a second tab or page in the same browser context | Both pages show one shared participant identity; opening the second page does not add a second participant or transfer ownership |
| PW-007 | Leader handoff | Open two same-browser pages, close or suspend the active leader, and wait beyond the heartbeat threshold | The remaining page takes over communication, preserves the identity and event cursor, and continues receiving room updates once |
| PW-008 | Storage migration | Seed the legacy client-id, event-cursor, and display-name storage values before opening the room | The room recovers the legacy identity, consolidates it into the current envelope, and does not create a duplicate |
| PW-009 | Invalid recovery envelope | Corrupt or remove the room recovery envelope, then reload an active room | The UI shows `rejoin-required`, does not impersonate another participant, and offers an explicit rejoin action |
| PW-010 | Expired room recovery | Attempt to reload after the room has expired | The UI clearly states that the room is unavailable and does not silently create a replacement identity |
| PW-011 | Temporary HTTP outage | Abort or delay polling requests during an active room, then restore them | The UI exposes `reconnecting` or `unavailable`, preserves confirmed state, and returns to `connected` without duplicate events |
| PW-012 | In-flight action and reload | Submit a vote, reveal, or reset while forcing a page reload or request retry | The final action is applied once; reset creates one round-history entry and reveal does not duplicate state changes |
| PW-013 | Duplicate action request | Repeat one mutation with the same action identifier through the browser request boundary | The response is successful, the room state remains correct, and no duplicate side effect is visible |
| PW-014 | Session conflict protection | Reuse a copied or mismatched client session value with a different fingerprint or room | Access is rejected with a safe session-conflict/rejoin message; moderator ownership is unchanged |
| PW-015 | Room token protection | Open a room with a missing, malformed, or wrong-room token | The room rejects access with an actionable error and exposes no participant or moderator state |
| PW-016 | Transport preference scope | Enable HTTP-only in one browser session and open another independent session without the flag | The flagged session uses HTTP-only; the independent session keeps automatic transport behavior |

The Playwright suite MUST also verify that automatic mode remains backward compatible, that
failed recovery never grants moderator access, and that all tests emit trace, screenshot, and
video artifacts on failure. Network interception MUST be used only to simulate blocked or
failed transports; authorization and room state MUST be asserted through the rendered
application behavior.

For the measurable reliability criteria, the test harness MUST execute at least 100 isolated
participant and moderator recovery iterations. The run MUST report successful restorations,
duplicate identities, privilege-transfer failures, and failed iterations, and MUST fail when
participant or moderator restoration is below 99% or when HTTP-only lifecycle completion is
below 95%. Recovery-state assertions MUST use a maximum 3-second timeout for the expected
`reconnecting`, `unavailable`, or `rejoin-required` status.

---

### Edge Cases

- A user opens the same room in two tabs or windows of the same browser; the application MUST
  coordinate the shared identity and avoid duplicate identities or conflicting moderator
  ownership.
- A reload happens during an in-flight vote, reveal, or reset action; the final room state
  MUST be applied once and MUST NOT be duplicated.
- The browser has cleared or blocked local session storage; the application MUST provide a
  clear rejoin flow without exposing another participant's identity.
- The room token is missing, malformed, or belongs to a different room; access MUST be
  rejected with an actionable message.
- HTTP requests fail temporarily; the application MUST show reconnecting state and recover
  without losing already-confirmed room state.
- HTTP-only mode is enabled while a user has an existing WebSocket session; switching modes
  MUST not create two active identities in the same room.
- The room expires while a page is being reloaded; the user MUST be told that the room is no
  longer available.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a per-browser-session feature flag, stored in session
  storage, that explicitly selects HTTP-only room communication for supported environments.
- **FR-002**: When HTTP-only mode is enabled, the system MUST use the existing room actions
  and event updates through HTTP without opening or retrying a WebSocket connection.
- **FR-003**: When HTTP-only mode is disabled, the system MUST preserve the current transport
  preference and MUST retain automatic fallback when WebSocket connectivity is unavailable.
- **FR-004**: The system MUST preserve a participant's room identity across a normal page reload
  and across additional tabs or windows of the same browser for the lifetime of the room
  session.
- **FR-005**: The system MUST preserve moderator ownership across a normal page reload when
  the moderator's saved session and room authorization are still valid.
- **FR-006**: The system MUST associate a reconnecting participant with the existing identity
  instead of creating a duplicate participant when the saved session is valid.
- **FR-006a**: The system MUST coordinate tabs and windows in the same browser so that opening
  the same room does not create competing participant identities or moderator claims.
- **FR-007**: The system MUST ensure that a participant cannot claim moderator permissions
  by modifying, copying, or omitting client-side session data.
- **FR-008**: The system MUST validate room, participant, and moderator session data before
  restoring access or permissions.
- **FR-009**: The system MUST make room actions idempotent across reconnect and reload
  boundaries so that a repeated request cannot duplicate a vote, reveal, or reset.
- **FR-010**: The system MUST expose connection state that distinguishes connected,
  reconnecting, unavailable, and rejoin-required outcomes in both transport modes.
- **FR-011**: The system MUST show a clear user-facing recovery message when a session cannot
  be restored, including the next action required to rejoin safely.
- **FR-012**: The system MUST document the feature flag, its default behavior, its supported
  configuration scopes, and its impact on transport selection.
- **FR-013**: The system MUST provide automated coverage for HTTP-only transport selection,
  automatic fallback, participant restoration, moderator restoration, shared-browser
  coordination, leader handoff, storage migration, invalid-session handling, transient HTTP
  failure, room-token rejection, transport-preference scope, duplicate action prevention, and
  public endpoint rate-limit preservation.

### Key Entities

- **Transport Mode**: The supported communication preference for a room session, including
  the default automatic mode and explicit HTTP-only mode.
- **Participant Session**: The validated association between a browser session, a room, a
  participant identity, and the participant's current room state.
- **Moderator Session**: The validated association that proves the room owner remains
  authorized to reveal and reset rounds after reconnecting.
- **Room Action**: A participant or moderator operation such as join, vote, reveal, or reset,
  with enough identity and sequencing information to prevent duplicate application.
- **Recovery State**: The user-visible state describing whether the room is connected,
  reconnecting, unavailable, or requires a safe rejoin.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a controlled environment where WebSocket connections are blocked, at least
  95% of test sessions complete room join, vote, reveal, and reset without manual workaround
  when HTTP-only mode is enabled.
- **SC-002**: At least 99% of valid participant page reloads during an active room restore the
  same participant identity without creating a duplicate participant.
- **SC-003**: At least 99% of valid moderator page reloads during an active room preserve
  moderator controls without transferring ownership to another participant.
- **SC-004**: No accepted room action is applied more than once during the reload and reconnect
  test suite.
- **SC-005**: A user receives a visible connection or recovery status within 3 seconds of a
  failed transport attempt and can identify the required next action without support.
- **SC-006**: Existing automatic transport mode continues to pass all current realtime
  acceptance tests with no measurable regression in room join or action completion.

## Assumptions

- The feature applies to the existing anonymous room experience and does not introduce
  account registration or a new identity provider.
- The feature flag is controlled by a documented browser-session configuration and defaults to
  the current automatic transport behavior.
- The browser-session feature flag selects transport only; it MUST NOT be treated as proof of
  participant identity, room membership, or moderator authorization.
- A participant's recoverable room identity is shared across tabs and windows of the same
  browser, while server-side validation remains authoritative for access and permissions.
- A valid session is retained only for the room's existing lifetime and is not intended to
  provide permanent identity across unrelated rooms.
- Server-side validation remains authoritative for participant identity, room membership, and
  moderator permissions.
- Existing room actions and event semantics remain the source of truth; this feature changes
  transport selection and recovery behavior rather than redefining poker rules.
- Multi-device identity synchronization, account recovery, and cross-browser identity
  portability are outside the scope of this feature.
