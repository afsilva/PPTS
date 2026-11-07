# Contributing

## Definition of done

Every change must:

1. Preserve deny-by-default authorization and validate untrusted input server-side.
2. Include positive and negative tests appropriate to the change.
3. Pass `npm run verify` and applicable integration/E2E checks; dependency updates must also pass the 72-hour age, zero-vulnerability, and no-deprecation policy.
4. Include a migration for schema changes; never edit an applied migration.
5. Update affected docs, ADRs, threat model, authorization matrix, runbooks, and `.env.example` in the same pull request.
6. Avoid secrets, tokens, production data, or identifiable legacy records.
7. Meet WCAG 2.2 AA for changed interfaces, including keyboard, focus, zoom, contrast, and reduced motion.

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
