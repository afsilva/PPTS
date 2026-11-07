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
5. Documents will cross a quarantine/scanning boundary before authorized availability.
6. CI artifacts and dependencies cross the software supply-chain boundary and require verification.

## Modules

Modules are added through complete vertical slices, not empty abstractions:

- `identity`: immutable OIDC mapping and sessions
- `authorization`: roles and resource/project scope
- `audit`: append-only security/business events
- `time-tracking`: presence and transactional time-entry state machine
- later: people, clients, projects, reports, notes, documents

A module owns its domain rules and exposes narrow service functions. Database access remains server-only. Server Components call services directly; route handlers are reserved for browser/external HTTP needs.

## Deployment

The local stack contains a production-built app, an application PostgreSQL database and one-shot migration job, plus Keycloak, a separate Keycloak PostgreSQL database, and a one-shot realm reconciliation job. Database networks are internal; browser-facing app and identity ports bind only to loopback. The app runs as an unprivileged user with a read-only filesystem and dropped capabilities.

Production will use managed TLS, PostgreSQL, OIDC, secret storage, backups, and centralized telemetry. Local Compose demonstrates operability, not production resilience.

## Data principles

- UUID identifiers, UTC `timestamptz`, foreign keys, explicit deletion behavior.
- One open time entry per user via a partial unique index.
- Acting identity always comes from the session.
- Archive business entities; retain time/audit information under an approved policy.
- Collect the minimum PII. Legacy home address, birthday, and personal phone fields are excluded until purpose and retention are approved.

## UI principles

The “Clarity” visual language uses generous space, quiet hierarchy, layered surfaces, open fonts, and restrained motion. It is legally distinct from platform interfaces and does not use Apple trademarks, SF Pro, SF Symbols, proprietary assets, or replicated layouts. WCAG 2.2 AA is the acceptance target.
