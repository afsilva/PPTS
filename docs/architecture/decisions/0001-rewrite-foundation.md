# ADR 0001: Rewrite foundation

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

The Perl CGI application has valuable workflows but systemic injection, authorization, file-handling, integrity, dependency, and operational risks. A mechanical port would preserve unsafe boundaries.

## Decision

Build a clean TypeScript modular monolith with Next.js, PostgreSQL, Prisma, OIDC, private object storage when needed, and Docker Compose for local use. Apply OWASP Top 10:2025 and verify release controls against ASVS 5.0 Level 2. Implement by vertical slice, starting with identity/authorization/audit and transactional time tracking.

## Consequences

- We gain simple deployment, relational transactions, typed boundaries, and centralized policies.
- We must explicitly test Next.js server/client and caching boundaries.
- Local Compose is not claimed as production parity.
- Microservices, Kubernetes, public APIs, reporting, and documents are deferred.
- The original GPL-2.0-or-later license may affect copied/derived material. No legacy code is copied into this foundation; public-release licensing still requires an owner decision.
