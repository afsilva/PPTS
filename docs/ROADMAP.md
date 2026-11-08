# Roadmap

## Milestone 0 — Repository foundation (completed)

- Reproducible Next.js/TypeScript application and hardened container
- PostgreSQL/Prisma schema with relational constraints
- Local Compose deployment and health endpoints
- Responsive, accessible dashboard foundation and design tokens
- Security headers, dependency audit, CI, and living documentation

## Milestone 1 — Secure time-tracking vertical slice (current)

### Implemented authentication baseline

- Local Keycloak OIDC Authorization Code flow with PKCE, state, and nonce
- Immutable issuer/subject user mapping and fail-closed role provisioning
- Revocable server-side sessions with absolute and idle expiry
- Origin-protected application logout and provider SSO termination
- Sanitized authentication audit events
- Separate application/identity databases and idempotent realm reconciliation

### Implemented business slice

- Pure deny-by-default capability policy and session-derived acting identity
- Database-backed limited status board, current timer, personal recent time, and UTC day/week totals
- `OFF_DUTY`, `AVAILABLE`, and `WORKING` presence semantics
- Transactional own clock-in, clock-out, and atomic project/work-code switching
- Active user/client/project/work-code validation and fail-closed project membership
- Narrow administrator and project-manager membership assignment with positive and negative tests
- Per-user row serialization, Serializable transactions, and PostgreSQL one-open-entry enforcement
- Atomic success audit events and sanitized best-effort failure audit events
- Bounded validated form bodies and exact-Origin protection on cookie-authenticated mutations
- Idempotent synthetic business-catalog seed without fake users or identity-derived membership grants
- Unit, real-PostgreSQL integration/concurrency, and browser-facing OIDC/business E2E coverage

### Remaining before the vertical slice is complete

- Production-IdP sandbox and production HTTPS/MFA validation
- Remaining authorization-matrix capabilities and cross-user negative tests
- Explicit idempotency/retry contract for clock mutations
- Login rate limits, session caps/cleanup, and audit retention/export/alerting
- PostgreSQL backup/restore smoke test
- Dashboard day/week boundaries remain UTC; monthly reporting now uses configurable organization time

## Milestone 2 — Core administration

Client, project-status, project, and work-code creation/editing plus archive/state controls are implemented. Identity-independent people/contact profiles, administrator-controlled one-to-one links from active login accounts to employee profiles, full project metadata, scoped membership removal, and journal workflows are available. Keycloak role lifecycle/production synchronization, richer privacy policy, and complete lifecycle administration remain.

## Milestone 3 — Reports and corrections

Monthly reports now group accurate time by client, project, and immutable user identity, clipping intervals at configurable IANA organization-timezone boundaries with DST fixtures. Authorized CSV export shares report scope and neutralizes spreadsheet formulas. Administrators have a bounded, metadata-minimized read-only audit view. Legacy-parity time correction is complete: each authenticated non-auditor can immediately correct only their own completed entries, with ownership, overlap, interval, optimistic-concurrency, and audit controls. The original has no manager approval or cross-user correction workflow, so neither is planned for parity. Legacy report reconciliation fixtures remain.

## Milestone 4 — Notes and documents

Plain-text project notes; private object storage with generated keys, quarantine, file validation, malware scanning, quotas, retention, and authorized downloads.

## Milestone 5 — Migration and release

Repeatable legacy ETL, document manifests/hashes, reconciliation, accessibility and ASVS L2 evidence, DAST, independent review, restore/rollback rehearsal, and production runbooks.

## Decision gates

Before completing Milestone 1: confirm single organization, production IdP, business timezone, availability/time semantics, manager scope, and time-correction rules. Before migrating PII or documents: approve purpose, access, formats, retention, and deletion policy.
