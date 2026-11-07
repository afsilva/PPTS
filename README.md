# PPTS

A secure, modern successor to the original **People & Projects Tracking System**. PPTS tracks team presence, project work, time entries, and—incrementally—projects, reporting, notes, and private documents.

> **Status:** pre-release foundation. Local OIDC authentication and revocable database-backed sessions are implemented; the dashboard still uses clearly labeled preview business data. Do not use this version for production timekeeping or expose the local stack beyond loopback.

## Technology

- Next.js 16, React 19, and TypeScript
- PostgreSQL 18 with Prisma
- Server-rendered UI with an original, restrained design inspired by clarity and spatial consistency
- Docker Compose for a production-like local deployment
- OWASP Top 10:2025 and ASVS 5.0 Level 2 security targets

## Quick start

### Podman deployment (recommended)

Requirements: Git, GNU/BSD Make, and a current Podman release with Compose support. The same commands work on macOS and Linux, and use native OCI images on Apple Silicon/ARM64 and Intel/AMD64.

```bash
make start
```

The first run creates a private configuration file **outside the Git repository**, generates local-only credentials, sets mode `0600`, and stops so you can review it:

- macOS: `~/Library/Application Support/PPTS/environment`
- Linux: `${XDG_STATE_HOME:-~/.local/state}/ppts/environment`

Run `make start` again after reviewing it. The tooling rejects runtime or environment paths inside the repository. On macOS, it also creates or starts the Podman machine when needed. Open <http://localhost:3000> and sign in through the local Keycloak service. Run `make credentials` to display the generated synthetic account credentials. Application and identity databases are internal-only; browser ports bind to `127.0.0.1`.

```bash
make restart  # rebuild and restart, preserving data
make stop     # stop containers, preserving data
make clean    # remove containers, built images, and both local database volumes
make status
make logs
```

`make clean` deletes both application and Keycloak database volumes but preserves the external runtime configuration. See [local operations](docs/operations/local-development.md) for environment and port overrides.

### Native development

The supplied local identity environment is Compose-based. For a fully native app, use Node.js 24+, PostgreSQL 18, and a separately configured OIDC provider whose callback and post-logout URLs match the app origin. Keep these values in a protected external secret source:

```bash
export DATABASE_URL='postgresql://ppts:YOUR_LOCAL_PASSWORD@localhost:5432/ppts'
export APP_ORIGIN='http://localhost:3000'
export OIDC_ISSUER='https://YOUR-IDP.example/realms/ppts'
export OIDC_CLIENT_ID='ppts-local'
export SESSION_SECRET='A_BASE64URL_SECRET_OF_AT_LEAST_43_CHARACTERS'
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Use loopback HTTP only for local development. Non-loopback deployments require HTTPS. `OIDC_INTERNAL_ISSUER` may be set when trusted server-to-server routing differs from the browser-facing issuer.

## Quality commands

```bash
npm run supply-chain  # rejects packages published less than 72 hours ago or deprecated
npm run audit         # rejects any known vulnerability, including development tools
npm run format:check
npm run lint
npm run typecheck
npm run build
npm run verify
```

Health endpoints:

- `GET /api/health/live` — process liveness
- `GET /api/health/ready` — process-level readiness placeholder; dependency-aware readiness remains a production blocker

## Repository map

```text
src/app/                Next.js routes and presentation
src/modules/            Domain modules (introduced by vertical slice)
prisma/                 Schema, migrations, and development seed
.github/                CI, dependency updates, ownership
scripts/                Repeatable developer/operations commands
docs/architecture/      Architecture and decisions
docs/security/          Threat model and authorization policy
docs/operations/        Local and operational guidance
```

## Security

Please read [SECURITY.md](SECURITY.md) before reporting an issue. Never commit production credentials, real legacy records, tokens, backups, or private employee information. The local Compose stack is for development—it is not a production topology.

## Documentation policy

A change is not complete until affected documentation, architecture decisions, threat model, authorization matrix, schema diagrams/migrations, and operational commands are updated in the same pull request. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Project documents

- [Modernization proposal](MODERNIZATION_PROPOSAL.md)
- [Architecture](docs/architecture/overview.md)
- [Security model](docs/security/threat-model.md)
- [OWASP Top 10:2025 status](docs/security/owasp-top-10-2025.md)
- [Dependency and supply-chain policy](docs/security/dependency-policy.md)
- [Local operations](docs/operations/local-development.md)
- [Local Keycloak identity](docs/operations/local-identity.md)
- [Roadmap](docs/ROADMAP.md)

## License

The legacy application was GPL-2.0-or-later. Licensing for this rewrite must be confirmed before public release; until then, no license is granted beyond applicable law. See [docs/architecture/decisions/0001-rewrite-foundation.md](docs/architecture/decisions/0001-rewrite-foundation.md).
