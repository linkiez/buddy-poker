<!--
Sync Impact Report
- Version change: unversioned scaffold -> 1.0.0
- Modified principles: none; the scaffold was replaced with the initial project-specific principles
- Added sections: Technology and Runtime Constraints; Development Workflow and Quality Gates
- Removed sections: none
- Follow-up TODOs: confirm the original ratification date
-->

# Buddy Poker Constitution

## Core Principles

### I. Product Simplicity and Focus
Every change MUST solve a user-visible planning-poker problem or directly support the
reliability, security, or operability of that experience. Contributors MUST prefer the
smallest coherent design, reuse existing platform and dependency capabilities, and reject
speculative abstractions or features without an identified product need. Rationale: a fast,
low-friction room experience is the product's primary value, and unnecessary complexity
increases failure modes and maintenance cost.

### II. Contract-First Realtime State
Room state, permissions, and transport behavior MUST be defined by explicit, documented
contracts before implementation. WebSocket messages and HTTP polling endpoints MUST preserve
the same domain semantics for joining, voting, revealing, and resetting; transport fallback
MUST NOT weaken authorization or produce divergent state transitions. Changes to shared
protocols, tokens, persistence behavior, or permission rules MUST update the corresponding
documentation and compatibility tests. Rationale: users must observe one consistent room
regardless of network conditions or transport selection.

### III. Test-First and Measurable Quality
New behavior and bug fixes MUST have a deterministic automated test that expresses the
expected behavior before production implementation is considered complete. Unit tests MUST
cover domain rules and protocol boundaries; integration or end-to-end tests MUST cover
cross-layer behavior and critical user flows. The required test suite MUST pass, and the
repository's configured 100% coverage gate MUST remain satisfied for its covered scope.
Rationale: realtime state transitions and fallback behavior are regression-prone and require
executable evidence rather than manual confidence.

### IV. Secure, Private, and Resilient by Default
All client-controlled room identifiers, tokens, actions, fingerprints, and request payloads
MUST be validated at trust boundaries. Authorization MUST be enforced on the server for
moderator actions, rate limits MUST protect public endpoints, and secrets MUST come from
runtime configuration rather than source control. Failure handling MUST avoid leaking private
room data and MUST preserve safe behavior during disconnects, malformed messages, Redis
outages, or transport changes. Rationale: shareable rooms are public entry points, so
security and graceful degradation are core functionality rather than optional hardening.

### V. Maintainable Angular and TypeScript
Application code MUST pass the repository's strict TypeScript and Angular template checks.
Angular components MUST preserve accessible, responsive UI behavior and MUST use the
project's established change-detection and reactive patterns consistently. Public domain
contracts and non-trivial functions MUST remain explicitly typed, cohesive, and documented
where their behavior is not self-evident. Contributors MUST avoid `any`, duplicated business
rules, silent error handling, and changes that bypass existing architectural boundaries.
Rationale: strict typing and consistent Angular structure reduce defects across the browser,
SSR, and server runtime surfaces.

## Technology and Runtime Constraints

The supported application stack is Angular SSR with Node.js and Express, TypeScript, RxJS,
PrimeNG, and a WebSocket server using the `ws` library. WebSocket is the preferred realtime
transport; HTTP polling is the required fallback. Redis persistence is optional and MUST NOT
make the application unusable when disabled unless a feature explicitly requires durable
storage. Development and release workflows MUST use the repository's declared Yarn
package-manager version and MUST preserve reproducible dependency resolution.

Production builds MUST respect the configured Angular bundle budgets. Runtime configuration
MUST be supplied through environment variables or documented browser configuration points;
credentials, tokens, and private deployment values MUST NOT be committed or logged.

## Development Workflow and Quality Gates

Each change MUST be traceable to a clear requirement and MUST keep directly related
documentation synchronized with behavior. Before review, contributors MUST run the smallest
relevant checks and, for cross-layer or release-impacting changes, the full applicable suite:

- `yarn test` MUST pass for unit and component behavior.
- `yarn test:coverage:check` MUST pass when domain logic, protocol, persistence, permissions,
  rate limiting, or transport behavior changes.
- `yarn e2e` MUST pass when user journeys, SSR serving, browser transport behavior, or
  deployment-facing configuration changes.
- `yarn build` MUST pass for production-facing code, routing, SSR, assets, or dependency
  changes.

Reviews MUST verify protocol compatibility, authorization, validation, error handling,
accessibility, performance budgets, and test coverage. Breaking changes MUST identify their
consumer impact, migration path, and release classification before merge.

## Governance

This constitution is the governing quality and architecture baseline for Buddy Poker. When
another practice conflicts with it, the stricter security, correctness, or compatibility
requirement applies unless an amendment explicitly changes this document.

Amendments MUST be proposed as a focused change to this file, explain the affected
principles and rationale, and include any required migration or documentation updates.
Changes MUST be reviewed against the project tests and quality gates before adoption. The
constitution version follows semantic versioning: MAJOR for incompatible removals or
redefinitions, MINOR for new principles or materially expanded obligations, and PATCH for
clarifications that do not change project obligations.

Every implementation plan, review, and release-impacting change MUST check compliance with
the applicable principles. Exceptions MUST be explicit, time-bounded, documented with their
risk and mitigation, and approved by the project maintainer. The constitution MUST be
reviewed whenever the runtime architecture, realtime protocol, persistence model, or quality
gates materially change.

**Version**: 1.0.0 | **Ratified**: TODO(RATIFICATION_DATE): confirm original adoption date | **Last Amended**: 2026-09-23
