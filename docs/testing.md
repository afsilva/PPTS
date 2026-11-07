# Testing strategy

## Required gates

`npm run verify` enforces the 72-hour package-age/no-deprecation/no-non-registry-source policy, rejects every known vulnerability across production and development dependencies, and checks formatting, lint, type safety, Prisma generation, and the production build. CI runs the supply-chain and audit gates before executing package lifecycle/build code.

## Test layers

- **Unit:** pure domain state transitions, policy decisions, validation, duration/timezone logic.
- **Integration:** real PostgreSQL transactions, constraints, concurrent clock requests, audit writes, migrations from empty DB.
- **Current E2E:** OIDC administrator/employee login, session-response minimization, logout Origin rejection, application revocation, provider SSO termination, disabled-user denial, and authentication-audit persistence.
- **Vertical-slice E2E still required:** employee clock flow, administrator scoped reads, and positive/negative resource authorization.
- **Security:** every authorization capability has allow and deny cases; SAST/SCA/secrets, DAST on staging, header/CSP checks.
- **Accessibility:** automated checks plus keyboard, screen reader, 200% zoom, 320 CSS-pixel reflow, contrast, forced colors, and reduced motion.
- **Operations:** production container health, backup/restore into clean PostgreSQL, migration failure/rollback procedure.

Milestone 1 is not complete until simultaneous clock-in requests prove that PostgreSQL permits at most one open entry and unauthorized cross-user requests are denied and audited.
