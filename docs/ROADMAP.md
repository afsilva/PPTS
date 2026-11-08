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
- Dependency-aware readiness
- Login rate limits, session caps/cleanup, and audit retention/export/alerting
- PostgreSQL backup/restore smoke test
- CI-backed real-PostgreSQL integration gate
- Organization timezone decision; current dashboard boundaries and labels are UTC

## Milestone 2 — Core administration

Complete people, clients, projects, statuses, work codes, and membership CRUD/lifecycle; archiving; privacy-aware profiles; and complete audit coverage. Milestone 1 includes only the narrow membership-assignment operation required to make clock authorization usable.

## Milestone 3 — Reports and corrections

Timezone-aware monthly reporting, CSV export, correction requests/approval, and reconciliation fixtures against the legacy application.

## Milestone 4 — Notes and documents

Plain-text project notes; private object storage with generated keys, quarantine, file validation, malware scanning, quotas, retention, and authorized downloads.

## Milestone 5 — Migration and release

Repeatable legacy ETL, document manifests/hashes, reconciliation, accessibility and ASVS L2 evidence, DAST, independent review, restore/rollback rehearsal, and production runbooks.

## Decision gates

Before completing Milestone 1: confirm single organization, production IdP, business timezone, availability/time semantics, manager scope, and time-correction rules. Before migrating PII or documents: approve purpose, access, formats, retention, and deletion policy.
