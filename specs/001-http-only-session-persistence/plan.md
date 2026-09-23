# Implementation Plan: HTTP-Only Transport and Session Recovery

**Branch**: `001-http-only-session-persistence` | **Date**: 2026-09-23 | **Spec**:
`specs/001-http-only-session-persistence/spec.md`

**Input**: Feature specification from
`/specs/001-http-only-session-persistence/spec.md`

## Summary

Add a browser-session HTTP-only transport flag, consolidate room identity recovery into a
versioned room-scoped browser session envelope, and coordinate same-browser tabs/windows so
only one context owns the live transport connection. Extend the server contract with
server-authoritative session validation and action idempotency, while preserving the existing
WebSocket, WebRTC, HTTP polling, room token, fingerprint, and moderator reservation behavior.

The design prioritizes the existing HTTP polling path rather than introducing a new transport.
It removes transport-selection retries when HTTP-only is active, preserves the participant's
identity across reloads and same-browser contexts, and prevents duplicate reset/reveal/vote
effects when a request is retried.

## Technical Context

**Language/Version**: TypeScript 5.9, Angular 21, Node.js/Express 5

**Primary Dependencies**: Angular SSR, RxJS 7.8, `ws`, FingerprintJS, Redis client 5,
Playwright, Vitest

**Storage**: Browser `sessionStorage` for the HTTP-only preference; browser `localStorage`
for the room-scoped identity envelope and event cursor; optional Redis or in-memory server
room persistence for token, rounds, and owner recovery state

**Testing**: Vitest through Angular unit-test builder, existing unit/spec suites, coverage
gate, Playwright E2E, and a repeatable reliability runner for the measurable recovery criteria

**Target Platform**: Browser clients behind restrictive corporate networks and the existing
Node.js SSR server

**Project Type**: Angular SSR web application with an Express realtime backend

**Performance Goals**: HTTP-only rooms surface connection/recovery state within 3 seconds,
poll at the existing configured interval, and keep event processing bounded to the existing
per-client queue limit of 100 events

**Constraints**: HTTP-only mode MUST make no WebSocket or WebRTC attempt; server authorization
MUST remain authoritative; repeated mutating requests MUST be idempotent; existing automatic
transport behavior MUST remain compatible; production bundle budgets MUST remain within the
configured Angular limits

**Scale/Scope**: Existing anonymous rooms and room TTL behavior; same-browser tabs/windows
share one room identity; multi-device, account identity, and cross-browser recovery remain
out of scope

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Product simplicity and focus**: PASS. Reuses the existing HTTP polling transport and
  room actions instead of adding a second fallback protocol.
- **Contract-first realtime state**: PASS. WebSocket and HTTP actions retain the same domain
  semantics, and the design documents transport, session, and idempotency contracts.
- **Test-first and measurable quality**: PASS. Unit, integration, and E2E scenarios map to
  the feature acceptance criteria and existing coverage gates.
- **Secure, private, and resilient by default**: PASS. Browser storage is only a recovery
  hint; fingerprint, room token, server session validation, and moderator authorization
  remain authoritative.
- **Maintainable Angular and TypeScript**: PASS. Storage and tab coordination are isolated
  behind typed helpers and the existing transport abstraction.
- **Technology and runtime constraints**: PASS. No dependency or runtime replacement is
  required; current Yarn, Angular SSR, Express, WebSocket, HTTP, and Redis boundaries remain.

## Project Structure

### Documentation (this feature)

```text
specs/001-http-only-session-persistence/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── session-recovery-contract.md
│   └── transport-contract.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── poker/
│   │   ├── browser-session.ts              # Shared room identity envelope
│   │   ├── browser-session.spec.ts
│   │   ├── cross-tab-coordinator.ts       # Leader/follower coordination
│   │   ├── cross-tab-coordinator.spec.ts
│   │   ├── http-polling-transport.ts       # HTTP-only execution and recovery
│   │   ├── poker-ws.service.ts             # Transport selection and lifecycle
│   │   ├── poker-ws.service.spec.ts
│   │   ├── poker-types.ts                  # actionId and session contract types
│   │   └── transport.types.ts
│   └── room/
│       └── room.component.ts                # Recovery state and shared name handling
├── owner-reservation.ts                     # Server-authoritative moderator recovery
├── room-persistence.ts                      # Persisted owner/session recovery fields
├── redis-room-persistence.ts
├── server.ts                                # HTTP session validation and idempotency
├── poker-ws-protocol.ts
└── *.spec.ts                                # Protocol, persistence, and permission tests

e2e/
└── http-only-session-recovery.spec.ts       # End-to-end transport and reload flows

scripts/
└── e2e-reliability.mjs                      # Repeated E2E runs and SC-001..SC-003 metrics
```

**Structure Decision**: Keep the existing single Angular SSR application and Express server.
Add narrowly scoped browser-session and cross-tab helpers under the existing poker feature,
extend the existing server persistence/session modules, and add one focused E2E suite rather
than introducing a new module boundary or dependency.

## Complexity Tracking

No constitution violations require justification. The cross-tab coordinator and idempotency
record are necessary to satisfy explicit same-browser and duplicate-action requirements;
they are isolated helpers rather than broad architectural abstractions.

## Post-Design Constitution Check

- **Contract-first realtime state** remains satisfied because HTTP-only, automatic transport,
  session recovery, tab coordination, and idempotency are documented as shared contracts.
- **Security and privacy** remain satisfied because local browser data never grants ownership;
  server validation, room tokens, fingerprints, and moderator guards remain authoritative.
- **Test-first quality** remains satisfied because every new design element has a focused unit,
  integration, or E2E validation scenario in `quickstart.md`.
- **Simplicity and maintainability** remain satisfied because the design extends existing
  transports, persistence, and owner-reservation modules without a new runtime dependency.
- **No gate violations** were introduced by the Phase 1 design.
