# Roadmap

## Milestone 0 — Repository foundation (completed)

- Reproducible Next.js/TypeScript application and hardened container
- PostgreSQL/Prisma schema with relational constraints
- Local Compose deployment and health endpoints
- Responsive, accessible dashboard preview and design tokens
- Security headers, dependency audit, CI, and living documentation

## Milestone 1 — Secure time-tracking vertical slice (current)

### Implemented local authentication baseline

- Local Keycloak OIDC Authorization Code flow with PKCE, state, and nonce
- Immutable issuer/subject user mapping and fail-closed role provisioning
- Revocable server-side sessions with absolute and idle expiry
- Origin-protected application logout and provider SSO termination
- Sanitized authentication audit events
- Separate application/identity databases and idempotent realm reconciliation

### Remaining before the vertical slice is complete

- Production-IdP sandbox and production HTTPS/MFA validation
- Deny-by-default employee/administrator resource policies with negative tests
- Database-backed dashboard, project membership, and personal time history
- Transactional clock-in, clock-out, and project/work-code switching
- Idempotency and concurrency tests proving one open entry per user
- Append-only business audit coverage and dependency-aware readiness
- Login rate limits, session caps/cleanup, and audit retention/alerting
- PostgreSQL backup/restore smoke test

## Milestone 2 — Core administration

People, clients, projects, statuses, work codes, memberships, archiving, privacy-aware profiles, and complete audit coverage.

## Milestone 3 — Reports and corrections

Timezone-aware monthly reporting, CSV export, correction requests/approval, and reconciliation fixtures against the legacy application.

## Milestone 4 — Notes and documents

Plain-text project notes; private object storage with generated keys, quarantine, file validation, malware scanning, quotas, retention, and authorized downloads.

## Milestone 5 — Migration and release

Repeatable legacy ETL, document manifests/hashes, reconciliation, accessibility and ASVS L2 evidence, DAST, independent review, restore/rollback rehearsal, and production runbooks.

## Decision gates

Before completing Milestone 1: confirm single organization, production IdP, business timezone, availability/time semantics, manager scope, and time-correction rules. Before migrating PII or documents: approve purpose, access, formats, retention, and deletion policy.
