# PPTS

A secure, modern successor to the original **People & Projects Tracking System**. PPTS tracks team presence, project work, time entries, and—incrementally—projects, reporting, notes, and private documents.

> **Status:** foundation milestone. The current dashboard uses clearly labeled preview data while persistence and OIDC authentication are implemented in the next vertical slice. Do not use this version for production timekeeping.

## Technology

- Next.js 16, React 19, and TypeScript
- PostgreSQL 18 with Prisma
- Server-rendered UI with an original, restrained design inspired by clarity and spatial consistency
- Docker Compose for a production-like local deployment
- OWASP Top 10:2025 and ASVS 5.0 Level 2 security targets

## Quick start

### Container deployment (recommended)

Requirements: Git and Docker with Compose.

```bash
cp .env.example .env.local
# Change POSTGRES_PASSWORD in .env.local, then:
docker compose --env-file .env.local up --build
```

Open <http://localhost:3000>. The database is internal-only; only the application binds to `127.0.0.1`.

Stop while preserving data:

```bash
docker compose --env-file .env.local down
```

Reset all local data:

```bash
docker compose --env-file .env.local down --volumes
```

### Native development

Use Node.js 24+ and a local PostgreSQL 18 instance:

```bash
cp .env.example .env.local
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

## Quality commands

```bash
npm run format:check
npm run lint
npm run typecheck
npm run build
npm run verify
npm audit --audit-level=high
```

Health endpoints:

- `GET /api/health/live` — process liveness
- `GET /api/health/ready` — application readiness; database check is added with persistence use

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
- [Local operations](docs/operations/local-development.md)
- [Roadmap](docs/ROADMAP.md)

## License

The legacy application was GPL-2.0-or-later. Licensing for this rewrite must be confirmed before public release; until then, no license is granted beyond applicable law. See [docs/architecture/decisions/0001-rewrite-foundation.md](docs/architecture/decisions/0001-rewrite-foundation.md).
