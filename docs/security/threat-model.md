# Threat model

**Owner:** Maintainers · **Last reviewed:** 2026-11-07 · **Method:** lightweight STRIDE + abuse cases

## Assets

Identity/session material, authorization assignments, employee PII, project/client data, time records, billing rates, project notes/documents, audit evidence, credentials, backups, and build artifacts.

## Actors

Employees, managers, administrators, auditors, unauthenticated attackers, compromised accounts, malicious insiders, and compromised dependencies/build systems.

## Primary abuse cases and controls

| Abuse case                             | Primary controls                                                                                                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change another worker's status/time    | Session-derived actor; resource policies; no actor form field; negative tests; audit                                                                                                            |
| Create overlapping/open entries        | Transaction and lock strategy; PostgreSQL partial unique index; idempotency; concurrency tests                                                                                                  |
| Inject SQL/script/content              | Prisma parameter binding; Zod allowlists/limits; React encoding; no raw HTML; CSP                                                                                                               |
| Traverse/delete/upload arbitrary files | No filesystem-derived client paths; random private object keys; membership checks; quarantine/scanning; CSRF/origin checks                                                                      |
| Steal or replay sessions               | Current local: validated OIDC, encrypted HttpOnly SameSite cookies, absolute/idle expiry, revocation, provider logout. Production: HTTPS Secure cookies, MFA, and approved key/session rotation |
| Abuse admin capability                 | Explicit policies, least privilege, reauthentication for sensitive changes, immutable audit, alerting                                                                                           |
| Expose PII via logs/reports            | Data minimization, field policy, redaction, retention, authorized exports, no sensitive telemetry                                                                                               |
| Poison dependencies/builds             | Lockfile, automated updates, SCA/SAST/secrets, protected reviews, pinned actions/images, SBOM/signing roadmap                                                                                   |
| Cause resource exhaustion              | Proxy body/time limits, rate limits, quotas, pagination, DB timeouts, bounded uploads                                                                                                           |
| Hide actions by altering audit events  | Append-only service, separate DB privileges and centralized export in production                                                                                                                |
| Fail open during DB/IdP/storage faults | Typed errors, generic responses, transactions, timeouts, deny on policy uncertainty, fault tests                                                                                                |

## Current residual risks

The foundation dashboard requires a validated local OIDC session but still displays mostly synthetic preview data and has no business-data mutations. Implemented controls include Authorization Code with PKCE, fail-closed role provisioning, revocable absolute/idle-expiring server-side sessions, exact-origin logout CSRF enforcement, RP-initiated provider logout, inactive-user denial, database-backed sessions, and sanitized authentication audit events. Remaining production blockers include dependency-aware readiness, route/resource authorization policy coverage, rate limiting, session cleanup and caps, durable audit export/alerting, production HTTPS/MFA/managed-secret integration, CI action pinning/release provenance, and complete business-flow tests. CSP temporarily permits inline style for chart rendering.

## Review triggers

Review this model for every authentication/authorization change, new external integration, PII field, upload format, public API, tenancy decision, deployment topology, or security incident—and at least every six months.
