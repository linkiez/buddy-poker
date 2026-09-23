---

description: "Task list for HTTP-only transport and session recovery"
---

# Tasks: HTTP-Only Transport and Session Recovery

**Input**: Design documents from `specs/001-http-only-session-persistence/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/`, and `quickstart.md`

**Testing**: Tests are included because the specification explicitly requires complete
Playwright coverage and the project constitution requires test-first implementation.

**Implementation rule**: For each behavior, write the focused test first, verify that it
fails for the intended reason, then implement the smallest change that makes it pass.

## Phase 1: Setup

**Purpose**: Prepare the existing Angular/Vitest/Playwright test surfaces without changing
runtime behavior.

- [X] T001 [P] Configure Playwright trace, screenshot, video, timeout, and test-server settings in `playwright.config.ts`
- [X] T002 [P] Add shared Playwright room, participant, moderator, and network-interception fixtures in `e2e/http-only-session-recovery.spec.ts`

---

## Phase 2: Foundational

**Purpose**: Implement shared contracts and primitives required by all user stories.

**⚠️ CRITICAL**: Complete this phase before starting any user-story implementation.

- [X] T003 [P] Define typed transport preference, recovery state, action identifier, and session-envelope contracts in `src/app/poker/transport.types.ts` and `src/app/poker/poker-types.ts`
- [X] T004 [P] Add failing unit tests for bounded action-id deduplication, TTL expiry, and duplicate no-op behavior in `src/room-action-idempotency.spec.ts`
- [X] T005 Implement bounded action-id deduplication with explicit TTL and capacity behavior in `src/room-action-idempotency.ts`
- [X] T006 [P] Add failing browser-session tests for schema validation, room matching, name length, legacy-key migration, and invalid-storage cleanup in `src/app/poker/browser-session.spec.ts`
- [X] T007 Implement the versioned room-scoped browser-session envelope and legacy storage migration in `src/app/poker/browser-session.ts`
- [X] T008 [P] Add failing cross-tab coordination tests for leader election, heartbeat expiry, follower state delivery, cursor ownership, and leader release in `src/app/poker/cross-tab-coordinator.spec.ts`
- [X] T009 Implement the BroadcastChannel-first and storage-event-fallback coordinator in `src/app/poker/cross-tab-coordinator.ts`
- [X] T010 [P] Add failing persistence tests for owner/session recovery fields, backward-compatible room state, and TTL cleanup in `src/room-persistence.spec.ts`
- [X] T011 Extend persisted room state and the in-memory persistence implementation for short-lived owner/session recovery data in `src/room-persistence.ts`
- [X] T012 Extend Redis room persistence serialization, deserialization, and expiry handling for owner/session recovery data in `src/redis-room-persistence.ts` and `src/redis-room-persistence.spec.ts`

**Checkpoint**: Shared storage, tab coordination, action idempotency, and persistence
contracts are typed, tested, and ready for story implementation.

---

## Phase 3: User Story 1 - Use a Room When WebSocket Is Unavailable (Priority: P1) 🎯 MVP

**Goal**: Allow a room to complete the normal join, vote, reveal, and reset lifecycle using
HTTP only, while preserving automatic transport fallback when the flag is absent or disabled.

**Independent Test**: Run `PW-001` through `PW-003` from `spec.md`; HTTP-only mode must never
attempt WebRTC/WebSocket, and automatic mode must continue to work when WebSocket is blocked.

### Tests for User Story 1

- [X] T013 [P] [US1] Add failing transport-selection tests for session-storage HTTP-only mode, default automatic mode, and disabled/invalid flag values in `src/app/poker/poker-ws.service.spec.ts`
- [X] T014 [P] [US1] Add failing HTTP polling tests for action identifiers, ordered event cursors, reconnect status, and rejoin-required responses in `src/app/poker/http-polling-transport.spec.ts`
- [X] T015 [P] [US1] Add failing protocol compatibility tests for optional action identifiers and equivalent HTTP/WebSocket room actions in `src/poker-ws-protocol.spec.ts`
- [ ] T016 [P] [US1] Add failing server integration tests for HTTP-only join, vote, reveal, reset, session validation, duplicate action responses, and public endpoint rate-limit preservation in `src/server.spec.ts`

### Implementation for User Story 1

- [X] T017 [US1] Select HTTP polling before WebRTC/WebSocket negotiation and suppress better-transport retries when the session-storage HTTP-only flag is enabled in `src/app/poker/poker-ws.service.ts`
- [X] T018 [US1] Use the shared browser-session envelope, action identifiers, recovery states, and leader-owned event cursor in `src/app/poker/http-polling-transport.ts`
- [X] T019 [US1] Preserve action-identifier semantics and backward-compatible parsing for WebSocket messages in `src/poker-ws-protocol.ts`, `src/app/poker/websocket-transport.ts`, and `src/app/poker/webrtc-transport.ts`
- [X] T020 [US1] Validate action identifiers, apply bounded deduplication, return explicit HTTP recovery outcomes, and preserve rate-limit enforcement in `src/server.ts`
- [X] T021 [US1] Expose connected, reconnecting, unavailable, and rejoin-required states without changing the existing room DOM structure in `src/app/room/room.component.ts`
- [X] T022 [US1] Update transport and protocol behavior documentation, including the session-storage flag and automatic-mode compatibility, in `src/transport-fallback.doc.md` and `src/poker-ws-protocol.doc.md`

### Playwright coverage for User Story 1

- [X] T023 [US1] Implement tagged Playwright scenarios PW-001, PW-002, and PW-003 for HTTP-only join/lifecycle and automatic fallback in `e2e/http-only-session-recovery.spec.ts`

**Checkpoint**: US1 is independently usable and proves the MVP transport requirement.

---

## Phase 4: User Story 2 - Recover Participant Identity After Reload (Priority: P1)

**Goal**: Preserve participant identity, name, vote, event cursor, and safe recovery behavior
across reloads and same-browser tabs/windows.

**Independent Test**: Run `PW-004` and `PW-006` through `PW-013`; the participant remains one
identity, confirmed state is preserved, and invalid or repeated recovery actions are explicit
and non-duplicating.

### Tests for User Story 2

- [ ] T024 [P] [US2] Add failing participant recovery integration tests for valid reuse, stale-session takeover, fingerprint conflict, and explicit rejoin-required outcomes in `src/server.spec.ts`
- [X] T025 [P] [US2] Add failing room-component tests for recovery status, preserved name/vote display, safe rejoin action, and no duplicate participant rendering in `src/app/room/room.component.spec.ts`
- [X] T026 [P] [US2] Add failing Playwright scenarios PW-004, PW-008, PW-009, PW-010, PW-011, and PW-012 for reload, migration, invalid/expired recovery, temporary outage, and in-flight action recovery in `e2e/http-only-session-recovery.spec.ts`

### Implementation for User Story 2

- [X] T027 [US2] Reuse valid client sessions, reject conflicting fingerprints, distinguish transient failure from expired recovery, and expose explicit rejoin-required responses in `src/server.ts`
- [X] T028 [US2] Integrate browser-session envelope restoration, migration, invalidation, and recovery actions into `src/app/room/room.component.ts`
- [X] T029 [US2] Route one leader transport and follower state updates through the cross-tab coordinator in `src/app/poker/poker-ws.service.ts` and `src/app/room/room.component.ts`
- [X] T030 [US2] Preserve action identifiers and event cursors across reload/reconnect boundaries in `src/app/poker/http-polling-transport.ts` and `src/app/poker/browser-session.ts`
- [X] T031 [US2] Implement tagged Playwright scenarios PW-004, PW-006, PW-007, PW-008, PW-009, PW-010, PW-011, PW-012, and PW-013 in `e2e/http-only-session-recovery.spec.ts`

**Checkpoint**: US2 independently restores participants and same-browser coordination without
granting permissions from browser storage.

---

## Phase 5: User Story 3 - Preserve Moderator Ownership After Reload (Priority: P1)

**Goal**: Restore the original moderator safely after reload while preventing ownership
transfer, copied-session escalation, and unsafe room-token recovery.

**Independent Test**: Run `PW-005`, `PW-014`, and `PW-015`; the original moderator retains
controls only when server validation succeeds, and all invalid recovery attempts are rejected.

### Tests for User Story 3

- [X] T032 [P] [US3] Add failing owner-reservation tests for valid reconnect, expiration, fingerprint mismatch, persistence reload, and no-arrival-order promotion in `src/owner-reservation.spec.ts`
- [ ] T033 [P] [US3] Add failing permission and server tests for copied client IDs, missing/invalid tokens, non-moderator actions, and safe moderator restoration in `src/poker-permissions.spec.ts` and `src/server.spec.ts`
- [X] T034 [P] [US3] Add failing Playwright scenarios PW-005, PW-014, and PW-015 for moderator reload, session conflict, and room-token protection in `e2e/http-only-session-recovery.spec.ts`

### Implementation for User Story 3

- [X] T035 [US3] Extend owner reservations with persisted short-lived recovery metadata while preserving client-id, fingerprint, and expiry validation in `src/owner-reservation.ts`, `src/room-persistence.ts`, and `src/redis-room-persistence.ts`
- [X] T036 [US3] Enforce server-authoritative moderator restoration and safe rejection for copied sessions, invalid tokens, and expired reservations in `src/server.ts` and `src/poker-permissions.ts`
- [X] T037 [US3] Preserve moderator controls and display explicit recovery guidance without trusting a client-side owner flag in `src/app/room/room.component.ts`
- [X] T038 [US3] Update moderator and permission documentation for reload recovery, token validation, and rejection behavior in `src/poker-permissions.doc.md` and `src/room-token.doc.md`
- [X] T039 [US3] Complete tagged Playwright scenarios PW-005, PW-014, and PW-015 in `e2e/http-only-session-recovery.spec.ts`

**Checkpoint**: All three P1 stories are independently testable and preserve server-side
authorization invariants.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Run the complete feature matrix, preserve documentation quality, and validate
regressions across automatic transport and production builds.

- [X] T040 [P] Implement Playwright scenario PW-016 and add stable `@http-only`, `@recovery`, `@moderator`, `@tabs`, `@handoff`, `@migration`, `@resilience`, and `@idempotency` tags in `e2e/http-only-session-recovery.spec.ts`
- [X] T041 [P] Document browser-session, cross-tab, idempotency, rate-limit, and recovery invariants in `src/transport-fallback.doc.md`, `src/poker-ws-protocol.doc.md`, `src/poker-permissions.doc.md`, and `src/room-token.doc.md`
- [X] T042 [P] Add accessibility assertions and maximum 3-second recovery-state assertions for connection/recovery status and moderator controls to `e2e/http-only-session-recovery.spec.ts`
- [X] T043 Run the focused unit and integration commands from `specs/001-http-only-session-persistence/quickstart.md` and fix regressions in `src/app/poker/*.spec.ts`, `src/server.spec.ts`, `src/owner-reservation.spec.ts`, `src/room-persistence.spec.ts`, and `src/poker-ws-protocol.spec.ts`
- [X] T044 Run `yarn test:coverage:check` and resolve coverage regressions in `src/room-action-idempotency.ts`, `src/app/poker/browser-session.ts`, `src/app/poker/cross-tab-coordinator.ts`, and transport/server modules
- [ ] T045 Run the complete Playwright matrix with trace, screenshot, and video failure artifacts using `E2E_PORT=4205 yarn e2e` and resolve failures in `e2e/http-only-session-recovery.spec.ts`
- [X] T046 [P] Add the repeatable 100-iteration reliability runner, JSON metrics, thresholds, and `e2e:reliability` package script in `scripts/e2e-reliability.mjs` and `package.json`
- [ ] T047 Run `E2E_PORT=4205 yarn e2e:reliability` and verify SC-001, SC-002, and SC-003 thresholds in `scripts/e2e-reliability.mjs`
- [X] T048 Run `yarn build` and verify Angular bundle budgets in `angular.json`, SSR startup through `src/main.server.ts`, and automatic transport compatibility in `playwright.config.ts` and `e2e/http-only-session-recovery.spec.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; T001 and T002 can run in parallel.
- **Foundational (Phase 2)**: Depends on Setup; T003-T012 block all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational and is the MVP increment.
- **User Story 2 (Phase 4)**: Depends on Foundational and the shared transport/action behavior
  established by US1; T024-T031 should follow T017-T021.
- **User Story 3 (Phase 5)**: Depends on Foundational and server/session behavior from US1/US2;
  T032-T039 should follow T020 and T027.
- **Polish (Phase 6)**: Depends on all desired user stories; T040-T048 are final validation.

### User Story Dependencies

```text
Setup
  -> Foundational
      -> US1 (HTTP-only transport and fallback)
          -> US2 (participant recovery and shared tabs)
              -> US3 (moderator recovery and authorization)
                  -> Polish
```

US1 is the suggested MVP. US2 depends on the transport and action contracts from US1 because
reload recovery must preserve the active transport session. US3 depends on the recovery
validation path from US2 because moderator restoration must distinguish valid recovery from
rejoin-required state.

### Parallel Opportunities

- T001-T002 can run in parallel.
- T003, T004, T006, T008, and T010 can start in parallel after setup; each implementation
  task follows its corresponding failing test.
- Within US1, T013-T016 can run in parallel before T017-T021.
- Within US2, T024-T026 can run in parallel after US1; T027-T030 then proceed in dependency
  order.
- Within US3, T032-T034 can run in parallel before T035-T038.
- T040-T042 and T046 can run in parallel before the sequential validation tasks T043-T045 and T047-T048.

## Parallel Execution Examples

### User Story 1

```text
Task T013: poker-ws.service transport-selection tests
Task T014: http-polling-transport recovery tests
Task T015: protocol compatibility tests
Task T016: server HTTP action tests
```

After those tests fail for the intended reasons:

```text
Task T017: transport selection
Task T018: HTTP polling integration
Task T019: protocol compatibility
Task T020: server validation and deduplication
```

### User Story 2

```text
Task T024: participant recovery server tests
Task T025: room component recovery tests
Task T026: Playwright reload and resilience tests
```

### User Story 3

```text
Task T032: owner reservation tests
Task T033: permissions and token tests
Task T034: Playwright moderator/security tests
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete US1, including PW-001 through PW-003.
3. Run the independent US1 validation and confirm HTTP-only mode avoids WebRTC/WebSocket.
4. Stop for a deploy/demo decision before starting recovery scope.

### Incremental Delivery

1. Add US2 for participant reload and same-browser recovery.
2. Add US3 for moderator ownership and invalid-session protection.
3. Complete Polish and run unit, coverage, Playwright, and build gates.
4. Each checkpoint must preserve the previous story's acceptance scenarios.

## Completion Criteria

- All tasks are checked only after implementation and its tests pass.
- All 16 Playwright scenarios from `spec.md` are implemented and tagged.
- `yarn test`, `yarn test:coverage:check`, `yarn e2e`, and `yarn build` pass as applicable.
- No task relies on client-side moderator state or bypasses documented server contracts.

## Phase 7: Convergence

- [X] T049 Add bounded rate limiting to the public HTTP action and events endpoints, with regression coverage for accepted and rejected requests, per Constitution IV and FR-013
- [X] T050 Wire `CrossTabCoordinator` into the production room transport lifecycle so one tab owns polling, followers receive state/status updates, event cursors remain leader-owned, and heartbeat expiry supports handoff per FR-006a, PW-006, PW-007, and the plan's leader-owned transport decision
- [X] T051 Persist, restore, expire, and validate participant session recovery records in the server room lifecycle and Redis/in-memory persistence path per FR-004, FR-006, and the plan's participant-session model
- [X] T052 Add direct server integration tests covering HTTP-only join/actions, session reuse and conflicts, moderator authorization, duplicate action identifiers, invalid tokens, and public endpoint rate limiting per Constitution III, FR-007, FR-009, FR-013, and T016/T024/T033
- [X] T053 Integrate the browser-session envelope and cross-tab recovery lifecycle into `RoomComponent`, replacing name-only recovery with validated room-scoped identity restoration and explicit safe rejoin handling per FR-004, FR-006a, FR-008, and FR-011
- [X] T054 Provision the Playwright Chromium runtime, execute the complete E2E matrix, and run the 100-iteration reliability checks to verify SC-001, SC-002, and SC-003 per T045/T047 (partial)

## Phase 8: Convergence

- [X] T055 Provision a reachable Playwright Chromium runtime, then execute T045 and T047 to validate all browser-based recovery, cross-tab, and reliability scenarios per SC-001, SC-002, and SC-003 (partial)

## Phase 9: Convergence

- [X] T056 Execute the pending Playwright matrix and 100-iteration reliability run in a CI or pre-provisioned Chromium environment, recording trace/video artifacts and SC-001..SC-003 metrics per Constitution III (partial)
