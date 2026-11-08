# Contributing

## Definition of done

Every change must:

1. Preserve deny-by-default authorization and validate untrusted input server-side.
2. Include regression tests for every new or changed user action, route, service operation, domain rule, authorization decision, and defect. Each action needs its expected success case, relevant validation/state-boundary cases, and at least one denial/failure case; authorization changes require explicit allow and deny coverage.
3. Register every route and exported project/time-tracking business action in `tests/regression-contract.json` with durable test evidence. `npm run test:contract` fails when an action is added without registration or when referenced evidence disappears.
4. Pass `npm run verify`, the real-PostgreSQL `npm run test:integration` suite for persistence/business changes, and applicable full-stack E2E checks. Dependency updates must also pass the 72-hour age, zero-vulnerability, and no-deprecation policy.
5. Include a migration for schema changes; never edit an applied migration.
6. Update affected docs, ADRs, threat model, authorization matrix, runbooks, and `.env.example` in the same pull request.
7. Avoid secrets, tokens, production data, or identifiable legacy records.
8. Meet WCAG 2.2 AA for changed interfaces, including keyboard, focus, zoom, contrast, and reduced motion.

## Regression-test workflow

For every feature or bug fix:

1. List each externally visible action and each changed domain/business rule before implementation.
2. Add the smallest pure unit tests for rule boundaries.
3. Add real-database integration tests whenever transactions, authorization scope, constraints, audits, migrations, or concurrency are involved.
4. Add or extend E2E coverage for browser/session wiring, CSRF/Origin handling, role boundaries, and the complete user journey.
5. Add the route or exported business action and its evidence to `tests/regression-contract.json`. Existing evidence must remain; a new test does not replace an older regression unless the old behavior was intentionally removed and documented.
6. Reproduce every defect with a failing regression test before the fix when practicable, then retain that test permanently.

A feature is not complete merely because its happy path works. Tests must assert stored side effects and audit events, and denied/invalid actions must assert the absence of unauthorized side effects.

## Workflow

- Create a focused branch from `main`.
- Use Conventional Commit-style messages (`feat:`, `fix:`, `docs:`, `security:`).
- Require review for authentication, authorization, migrations, CI, deployment, and security-control changes.
- Resolve critical/high security findings before merge, or document a time-bounded risk acceptance.

## Application conventions

- Server Components are the default; add client boundaries only for real interaction.
- Authenticate and authorize inside every mutation/route. Layout checks are not sufficient.
- Derive the acting user from the server session; never accept actor IDs from forms.
- Use Zod allowlist schemas and reject unknown mutation fields.
- Use Prisma parameterization. Raw SQL requires review, bound parameters, and a documented reason.
- Do not render untrusted HTML or use shell commands for application storage.
- Use UTC in storage; display an explicit business/user timezone.
- Keep security logs structured and exclude secrets, tokens, document bodies, and unnecessary PII.

## Database changes

```bash
npm run db:migrate -- --name concise_change_name
npm run db:generate
```

Review generated SQL. Important invariants must exist in PostgreSQL, not only application code. Integration tests use a real database.

## Documentation ownership

The author owns documentation accuracy. Reviewers should reject drift between code and docs. Architecture-shaping choices require an ADR in `docs/architecture/decisions/`.
