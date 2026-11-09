# Testing strategy

## Non-negotiable regression rule

Every new or changed user action, HTTP route, exported business operation, domain rule, authorization decision, and defect fix must include retained automated regression coverage in the same change. A feature is not complete until its tests exist and pass.

Each action requires:

1. the expected success case;
2. relevant validation and state-boundary cases;
3. at least one denial/failure case;
4. explicit allowed and denied actors/resources for authorization behavior;
5. real PostgreSQL coverage for transactions, persistence, constraints, audits, migrations, or concurrency; and
6. E2E coverage when session/browser wiring, Origin/CSRF behavior, or a complete user journey changes.

Tests must verify both the intended stored/audited result and the absence of unauthorized side effects. Each defect should first be reproduced by a failing test when practicable; that test remains permanently after the fix.

## Enforced regression contract

`tests/regression-contract.json` inventories every `route.ts` action and shipped exported business action with durable test evidence. `npm run test:contract` verifies that:

- every application route is registered;
- every async business action exported by the projects/time-tracking modules is registered;
- each registered implementation and service export still exists;
- every action references at least one existing test/E2E assertion; and
- the referenced assertion remains in the evidence file.

Adding a route without updating this contract fails local verification and CI. The contract is a minimum coverage inventory, not a substitute for reviewing test quality. The pull-request template requires an explicit action-to-test table so reviewers can reject missing positive, negative, boundary, persistence, audit, or concurrency cases.

## Required gates

`npm run verify` enforces the 72-hour package-age/no-deprecation/no-non-registry-source policy, rejects every known vulnerability across production and development dependencies, and checks formatting, lint, type safety, Prisma generation, unit tests, the regression contract, and the production build.

CI has two required jobs:

- **verify:** supply-chain, vulnerability, format, lint, type, unit, regression-contract, production-build, and hardened-container gates;
- **integration:** starts digest-pinned PostgreSQL, applies the complete migration history to an empty database, then runs all real-database regression and concurrency tests.

For local execution, `npm run test:integration` requires `DATABASE_URL` for an empty or test-only migrated PostgreSQL database. Full-stack OIDC/business E2E remains a release and applicable-change gate because it requires the hardened local Compose topology.

## Test layers and current evidence

- **Unit:** `maintenance-policy.test.ts` covers the daily default, bounded schedule configuration, invalid-value rejection, and bounded retry delay. `maintenance-lifecycle.test.ts` prevents the scheduled process from exiting during its referenced sleep and proves prompt signal-driven shutdown. `document-validation.test.ts` covers filename/path/control/bidi rejection, narrow complete-file signatures, malformed/type-mismatched files, and injection-safe attachment headers. `authorization-policy.test.ts` includes scoped document read/write/delete and auditor write vetoes. `time-state.test.ts` covers pure transitions, message normalization, duration, and boundary clipping. `authorization-policy.test.ts` covers positive and negative capability decisions, including manager project scope. `mutation-form.test.ts` proves bounded decoding and streamed oversized-body rejection. Authentication crypto, role provisioning, and redirect validation have separate unit suites.
- **Integration:** `session-lifecycle.test.ts` proves concurrent login serialization, the five-active-session cap, stale-session revocation, and maintenance cleanup against PostgreSQL. `project-documents.test.ts` uses real PostgreSQL and private temporary storage to cover idempotent quarantine, scoped denial without side effects, stale inactive-member denial, unsupported formats, sanitized atomic audit, list scope, and audited purge tombstones. `time-tracking.test.ts` executes production services against PostgreSQL and covers simultaneous clock-in, atomic switch, clock-out consistency, availability/clock races, unassigned-project denial, exact clock-in/switch/clock-out/presence replay, changed-payload and cross-action key conflicts, one-success-audit guarantees, expired-receipt cleanup, and employee/manager/administrator foreign-correction denial. `project-membership.test.ts` covers administrator/scoped-manager assignment and removal; employee/unscoped-manager denial; inactive actors even with stale manager membership; inactive/archived targets; no unauthorized side effects; and sanitized failure audits. `parity-workflows.test.ts` rejects inactive managers across project read/log/update paths, while `reporting-audit.test.ts` proves active database-scoped manager visibility plus empty unscoped results and inactive-manager rejection.
- **E2E:** `scripts/e2e-oidc.sh` exercises OIDC administrator/manager/employee login, response minimization, logout Origin rejection, application/provider revocation, six-login session-cap eviction, reconciled Keycloak brute-force protection, disabled-user denial, manager-scoped report UI/CSV and project update, out-of-scope manager update denial without persistence, administrator clock-in/switch/out, unassigned employee denial, administrator membership assignment, employee clock-in/out and precision-preserving own-time correction after assignment, exact clock-in replay plus changed-payload conflict with one persisted entry/audit, employee administration denial, foreign-Origin rejection, database invariants, real ClamAV clean/EICAR outcomes, and authentication/business audit persistence. The current full-stack run passes 84 checks.
- **Security:** every shipped authorization capability requires allow and deny cases; SAST/SCA/secrets, DAST on staging, and header/CSP checks remain broader release work.
- **Accessibility:** automated checks plus keyboard, screen reader, 200% zoom, 320 CSS-pixel reflow, contrast, forced colors, and reduced motion.
- **Operations:** the Compose `maintenance` service runs both retention purges immediately and daily by default with bounded retry; its schedule/lifecycle policy has unit coverage and underlying deletions have PostgreSQL integration coverage. Runtime inspection verifies it remains alive after cleanup without restart churn, publishes no ports, runs as UID/GID 1001, has an unwritable root filesystem, uses `NoNewPrivs`, and has zero effective, permitted, bounding, inheritable, or ambient Linux capabilities. `npm run operations:backup-restore-smoke` creates a custom-format logical backup, restores it into an isolated temporary PostgreSQL database, and reconciles table counts, constraints, indexes, and migration history. Production off-host/PITR restore, document-object reconciliation, and migration failure/rollback procedures remain required.

## Remaining coverage

ClamAV-unavailable flows, scanner/storage fault injection, cross-replica worker leases, authorization capabilities outside the shipped time/project/report/document slice, migration upgrade fixtures from populated prior schemas, and legacy-document reconciliation are not yet complete. Manager-scoped HTTP/E2E behavior now covers real OIDC login, scoped report UI/CSV, managed-project update, out-of-scope denial/no side effect, and logout. PostgreSQL tests also reject inactive actors despite stale project membership and prove unscoped managers cannot read cross-user report data. Own completed-time correction has unit and PostgreSQL coverage, including millisecond round-tripping, unchanged-submit no-op behavior, pagination beyond 50 entries, and denial of foreign-entry edits by employee, manager, and administrator actors. Mutation UX adds operation-specific pending labels, grouped clock-command blocking, network recovery, BFCache revalidation, one-shot PRG notices, and a client-live timer while retaining native no-JavaScript POST fallback. A production Chromium smoke test manually verified hydration under the nonce CSP, painted pending state, immediate start/switch/stop dashboard replacement, and a ticking timer; durable CI browser automation for those paint/lifecycle details remains a testing gap. Dashboard day/Monday-week totals and monthly reports use the configured organization timezone; unit and real-PostgreSQL tests cover cross-midnight, week-start, and spring-DST clipping.
