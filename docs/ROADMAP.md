# Roadmap

## Milestone 0 — Repository foundation (current)

- Reproducible Next.js/TypeScript application and hardened container
- PostgreSQL/Prisma schema with relational constraints
- Local Compose deployment and health endpoints
- Responsive, accessible dashboard preview and design tokens
- Security headers, dependency audit, CI, and living documentation

## Milestone 1 — Secure time-tracking vertical slice

- OIDC Authorization Code + PKCE using a local identity provider and production-IdP sandbox
- Immutable issuer/subject user mapping and secure server-side sessions
- Employee and administrator policies with negative authorization tests
- Database-backed dashboard, project membership, and personal time history
- Transactional clock-in, clock-out, and project/work-code switching
- Idempotency and concurrency tests proving one open entry per user
- Append-only audit events and database-aware readiness
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

Before Milestone 1: confirm single organization, IdP, business timezone, availability/time semantics, manager scope, and time-correction rules. Before migrating PII or documents: approve purpose, access, formats, retention, and deletion policy.
