# Quickstart: HTTP-Only Transport and Session Recovery

## Prerequisites

- Node.js with Corepack enabled.
- Dependencies installed with the repository's declared Yarn version.
- Chrome/Chromium installed for Playwright E2E. The configuration automatically uses
  `/usr/bin/google-chrome`, `/usr/bin/google-chrome-stable`, `/usr/bin/chromium-browser`, or
  `/snap/bin/chromium`; set `PLAYWRIGHT_EXECUTABLE_PATH` for another location:

```bash
PLAYWRIGHT_EXECUTABLE_PATH=/path/to/chrome E2E_PORT=4205 yarn e2e
```

## Unit and Integration Validation

Run the focused suites after implementing the feature:

```bash
yarn test --include='src/app/poker/**/*.spec.ts'
yarn test --include='src/owner-reservation.spec.ts'
yarn test --include='src/room-persistence.spec.ts'
yarn test --include='src/poker-ws-protocol.spec.ts'
```

Then run the required quality gate:

```bash
yarn test:coverage:check
```

Expected result: transport selection, browser-session migration, cross-tab coordination,
session recovery, moderator reservation, and action idempotency tests pass without reducing
the configured coverage gate.

## HTTP-Only End-to-End Validation

Start the production SSR server on a test port through the Playwright configuration:

```bash
E2E_PORT=4205 yarn e2e --grep "@http-only"
```

The Playwright suite must include the scenarios listed in `spec.md` under
**End-to-End Test Plan (Playwright)**. Use these focused commands while implementing:

```bash
# HTTP-only transport and complete round lifecycle
E2E_PORT=4205 yarn e2e --grep "@http-only"

# participant and moderator recovery
E2E_PORT=4205 yarn e2e --grep "@recovery|@moderator"

# same-browser tabs, leader handoff, and storage migration
E2E_PORT=4205 yarn e2e --grep "@tabs|@handoff|@migration"

# invalid sessions, room/token failures, outages, and idempotency
E2E_PORT=4205 yarn e2e --grep "@resilience|@idempotency"

# full feature matrix with traces and failure artifacts
E2E_PORT=4205 yarn e2e --grep "@http-only|@recovery|@moderator|@tabs|@handoff|@migration|@resilience|@idempotency"

# reliability measurement for SC-001, SC-002, and SC-003
E2E_PORT=4205 yarn e2e:reliability
```

Every scenario must:

1. Use a fresh Playwright browser context unless the scenario explicitly requires shared tabs.
2. Create or obtain an isolated room and clean up all pages and contexts.
3. Assert rendered room state and permissions, not only network responses.
4. Capture trace, screenshot, and video artifacts when a test fails.
5. Avoid fixed sleeps; wait for explicit UI states, network completion, or event-driven
   conditions.
6. Use a maximum 3-second assertion timeout for expected `reconnecting`, `unavailable`, or
   `rejoin-required` states.

The complete suite must verify:

- HTTP-only mode never attempts WebSocket or WebRTC.
- Automatic mode still falls back when WebSocket is blocked.
- Participant identity, name, vote, event cursor, and moderator ownership survive reload.
- Same-browser tabs share one identity and recover through leader handoff.
- Legacy storage migrates without creating a duplicate participant.
- Invalid or expired recovery data produces `rejoin-required` without privilege escalation.
- Temporary HTTP failures recover without losing confirmed state or duplicating events.
- Repeating a mutation with the same `actionId` creates exactly one side effect.
- Wrong-room tokens and session conflicts are rejected safely.
- Public action and event endpoints preserve their existing rate-limit behavior.

The reliability command must execute at least 100 isolated participant and moderator recovery
iterations, report the success rate for HTTP-only lifecycle completion and both recovery
types, and fail below 95% for the lifecycle or below 99% for either recovery type.

## Full Regression Validation

```bash
yarn build
yarn test
yarn e2e
```

Expected result: automatic WebRTC/WebSocket behavior remains unchanged when HTTP-only is not
enabled, and the HTTP-only/reload scenarios pass with the same room permissions and state
semantics.
