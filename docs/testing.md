# Testing strategy

## Required gates

`npm run verify` enforces the 72-hour package-age/no-deprecation/no-non-registry-source policy, rejects every known vulnerability across production and development dependencies, and checks formatting, lint, type safety, Prisma generation, unit tests, and the production build. CI runs the supply-chain and audit gates before executing package lifecycle/build code and runs the unit suite.

`npm run test:integration` is a separate real-PostgreSQL gate. It requires `DATABASE_URL` for an empty or test-only migrated database. The local release workflow runs it through the internal Compose database network; CI automation for this database-backed gate remains pending. Do not interpret a passing `npm run verify` alone as concurrency evidence.

## Test layers and current evidence

- **Unit:** `time-state.test.ts` covers pure transitions, message normalization, duration, and boundary clipping. `authorization-policy.test.ts` covers positive and negative capability decisions, including manager project scope. Authentication crypto, role provisioning, and redirect validation have separate unit suites.
- **Integration:** `time-tracking.test.ts` executes production services against PostgreSQL and covers simultaneous clock-in, atomic switch, clock-out consistency, availability/clock races, and unassigned-project denial. `project-membership.test.ts` covers administrator/scoped-manager assignment; employee/unscoped-manager denial; inactive/archived target rejection; and sanitized failure audits.
- **E2E:** `scripts/e2e-oidc.sh` exercises OIDC administrator/employee login, response minimization, logout Origin rejection, application/provider revocation, disabled-user denial, administrator clock-in/switch/out, unassigned employee denial, administrator membership assignment, employee clock-in/out after assignment, employee administration denial, foreign-Origin rejection, database invariants, and authentication/business audit persistence.
- **Security:** every shipped authorization capability requires allow and deny cases; SAST/SCA/secrets, DAST on staging, and header/CSP checks remain broader release work.
- **Accessibility:** automated checks plus keyboard, screen reader, 200% zoom, 320 CSS-pixel reflow, contrast, forced colors, and reduced motion.
- **Operations:** production container health, backup/restore into clean PostgreSQL, migration failure/rollback procedure.

## Remaining coverage

Explicit manager-scoped HTTP/E2E behavior, cross-user time/report authorization, retry/idempotency behavior, migration upgrade fixtures, fault injection, and future correction/reporting capabilities are not yet complete. The organization timezone is unresolved, so current day/week tests use UTC boundaries.
