# Architecture overview

**Owner:** Maintainers · **Last reviewed:** 2026-11-07

PPTS is a server-rendered modular monolith. It intentionally avoids microservices until scaling or ownership boundaries justify them.

```text
Browser
  │ local HTTP / production TLS
  ▼
Reverse proxy / managed edge (production)
  │ request limits, TLS, rate controls
  ▼
Next.js application ─────► OIDC identity provider
  │                         (local Keycloak; managed IdP in production)
  ├────► PostgreSQL
  ├────► private object storage + scanner (future)
  └────► centralized logs, metrics, alerts (production)
```

## Trust boundaries

1. Browser input is untrusted, including hidden fields, identifiers, headers, and filenames.
2. Identity-provider claims are accepted only after issuer, audience, signature, expiry, nonce, and state validation.
3. Authorization occurs inside every service operation. UI visibility and layouts are not controls.
4. PostgreSQL enforces relational and concurrency invariants as defense in depth.
5. Documents cross a private quarantine/scanning boundary before authorized availability; scanner or integrity uncertainty fails closed.
6. CI artifacts and dependencies cross the software supply-chain boundary and require verification.

## Modules

Modules are added through complete vertical slices, not empty abstractions:

- `identity`: immutable OIDC mapping and sessions
- `authorization`: roles and resource/project scope
- `audit`: sanitized security/business event persistence
- `mutations`: shared exact-Origin, content-type, and bounded-body HTTP boundary
- `time-tracking`: presence and transactional time-entry state machine
- `projects`: scoped project metadata, membership, and plain-text journal administration
- `documents`: bounded upload parsing, private storage, format/integrity validation, scanning lifecycle, scoped download/delete
- `people`, `catalog`, `reports`, and `corrections`: protected parity workflows

A module owns its domain rules and exposes narrow service functions. Database access remains server-only. Server Components call services directly; route handlers are reserved for browser/external HTTP needs.

## Deployment

The local stack contains a production-built app, an application PostgreSQL database, a one-shot migration job, and an idempotent one-shot synthetic business-catalog seed, plus Keycloak, a separate Keycloak PostgreSQL database, a one-shot realm reconciliation job, and an isolated ClamAV/document worker with private named-volume storage. Startup orders migration → catalog seed → app, and the app also waits for identity reconciliation. The catalog seed creates no users, memberships, presence, or time entries. Database networks are internal; browser-facing app and identity ports bind only to loopback. The app runs as an unprivileged user with a read-only filesystem and dropped capabilities.

Production will use managed TLS, PostgreSQL, OIDC, secret storage, backups, and centralized telemetry. Local Compose demonstrates operability, not production resilience.

## Data principles

- UUID identifiers, UTC `timestamptz`, foreign keys, explicit deletion behavior.
- One open time entry per user via a partial unique index.
- Clock and presence commands use actor-scoped UUID receipts with canonical payload fingerprints and 24-hour retention; receipt, state, and audit commit atomically.
- Application sessions have absolute/idle expiry, explicit maintenance cleanup, and a transactionally enforced five-active-session cap per user.
- Acting identity always comes from the session.
- Archive business entities; retain time/audit information under an approved policy.
- Collect the minimum PII. Legacy home address, birthday, and personal phone fields are excluded until purpose and retention are approved.

## UI principles

The “Clarity” visual language uses generous space, quiet hierarchy, layered surfaces, open fonts, and restrained motion. It is legally distinct from platform interfaces and does not use Apple trademarks, SF Pro, SF Symbols, proprietary assets, or replicated layouts. WCAG 2.2 AA is the acceptance target.
