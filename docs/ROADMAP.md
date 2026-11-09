# Roadmap

## Milestone 0 — Repository foundation (completed)

- Reproducible Next.js/TypeScript application and hardened container
- PostgreSQL/Prisma schema with relational constraints
- Local Compose deployment and health endpoints
- Responsive, accessible dashboard foundation and design tokens
- Security headers, dependency/action-pin audit, CI, and living documentation

## Milestone 1 — Secure time-tracking vertical slice (current)

### Implemented authentication baseline

- Local Keycloak OIDC Authorization Code flow with PKCE, state, nonce, and reconciled brute-force lockout controls
- Immutable issuer/subject user mapping and fail-closed role provisioning
- Revocable server-side sessions with absolute and idle expiry, a five-active-session cap, and scheduled inactive-session/replay-receipt cleanup
- Origin-protected application logout and provider SSO termination
- Sanitized authentication audit events
- Separate application/identity databases and idempotent realm reconciliation

### Implemented business slice

- Pure deny-by-default capability policy and session-derived acting identity
- Database-backed limited status board, current timer, personal recent time, and organization-timezone day/Monday-week totals with DST-aware clipping
- `OFF_DUTY`, `AVAILABLE`, and `WORKING` presence semantics
- Transactional own clock-in, clock-out, and atomic project/work-code switching
- Actor-scoped UUID replay receipts for clock/presence commands, with canonical SHA-256 payload fingerprints, mismatch rejection, 24-hour retention, and explicit cleanup
- Active user/client/project/work-code validation and fail-closed project membership
- Narrow administrator and database-scoped project-manager membership assignment/update with positive, negative, inactive-actor, HTTP, and OIDC E2E tests
- Per-user row serialization, Serializable transactions, and PostgreSQL one-open-entry enforcement
- Atomic success audit events and sanitized best-effort failure audit events
- Bounded validated form bodies and exact-Origin protection on cookie-authenticated mutations
- Idempotent synthetic business-catalog seed without fake users or identity-derived membership grants
- Unit, real-PostgreSQL integration/concurrency, browser-facing OIDC/business E2E, and isolated PostgreSQL logical backup/restore smoke coverage
- Real OIDC manager identity proving scoped report UI/CSV, managed-project update, out-of-scope denial without side effects, and logout

### Remaining before the vertical slice is complete

- Production-IdP sandbox and production HTTPS/MFA validation
- Remaining authorization-matrix work outside the shipped time/project/report/document slice, including explicit auditor document-grant policy and lifecycle administration
- Production-edge distributed rate limits and audit retention/export/alerting; production deployment must monitor the scheduled cleanup worker
- Production business-owner approval and reconciliation of the configured organization timezone; UTC remains the safe local default

## Milestone 2 — Core administration

Client, project-status, project, and work-code creation/editing plus archive/state controls are implemented and exercised through durable real-Chromium acceptance. Identity-independent people/contact profiles, administrator-controlled one-to-one links from active login accounts to employee profiles, full project metadata (including explicit contact clearing), scoped membership removal, and journal workflows are available. Keycloak role lifecycle/production synchronization, richer privacy policy, and complete lifecycle administration remain.

## Milestone 3 — Reports and corrections

Monthly reports now group accurate time by client, project, and immutable user identity, clipping intervals at configurable IANA organization-timezone boundaries with DST fixtures. Authorized CSV export shares report scope and neutralizes spreadsheet formulas. A checksum-bound synthetic fixture reconciles preserved ordinary legacy project/person totals and records intentional corrections for end-time-only month allocation, discarded whole days, and exact-60-minute carry. Administrators have a bounded, metadata-minimized read-only audit view. Legacy-parity time correction is complete: each authenticated non-auditor can immediately correct only their own completed entries, with ownership, overlap, interval, optimistic-concurrency, precision-preserving input, no-op protection, pagination, and audit controls. The original has no manager approval or cross-user correction workflow, so neither is planned for parity.

## Milestone 4 — Notes and documents (local parity implemented; production gate remains)

Plain-text project notes/journal and secure project-document outcomes are now usable. Uploads use generated keys, private quarantine/clean storage, a narrow signature-validated format allowlist, SHA-256 integrity, a separate fail-closed ClamAV worker, project count/byte quotas, idempotent submission IDs, retention checks, scoped attachment downloads, audited deletion/purge, and a functional project UI. Quarantined, failed, infected, and deleting files cannot be downloaded.

Production enablement remains gated on owner-approved formats/limits/retention/legal holds, independently credentialed encrypted object storage, scanner-definition freshness alerting, durable job leasing across replicas, ingress rate quotas, backup/restore reconciliation, and centralized immutable audit export. See ADR 0002 and `docs/operations/project-documents.md`.

## Milestone 5 — Migration and release

Repeatable legacy ETL, document manifests/hashes, reconciliation, accessibility and ASVS L2 evidence, DAST, independent review, restore/rollback rehearsal, and production runbooks.

## Decision gates

Before completing Milestone 1: confirm single organization, production IdP, business timezone, availability/time semantics, manager scope, and time-correction rules. Before migrating PII or documents: approve purpose, access, formats, retention, and deletion policy.
