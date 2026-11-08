# PPTS

A secure, modern successor to the original **People & Projects Tracking System**. PPTS tracks team presence, project work, time entries, and—incrementally—projects, reporting, notes, and private documents.

> **Status:** pre-release modernization. Local OIDC and revocable sessions, transactional replay-safe presence/time tracking, scoped project membership, people/catalog/project administration with optional employee/login linking, organization-timezone monthly HTML/CSV reporting, precision-preserving paginated self-service correction, responsive mutation feedback and a live current timer, bounded administrator audit visibility, and quarantine-first scanned project documents are implemented. Production object storage/document policy, legacy ETL, account/role lifecycle, and production operational controls remain incomplete. The local stack uses synthetic data only; do not use this release for production timekeeping or expose it beyond loopback.

## History of PPTS

The original [PPTS project site](https://ppts.sourceforge.net) traces the system to an idea from September 2000 and an initial application created the following month as **IPTS—the Internal People Tracking System**. IPTS used a bulletin-board-style workflow that let employees at Whetstone Logic, Inc. publish their current activity, such as being at lunch, coding, or testing.

As the application became important to the company, it grew beyond presence tracking. A time-clock system let people clock into a project and record the kind of work they were performing, while monthly reports summarized hours by project for management and billing. A project-tracking area became a shared “corporate memory,” associating project details and uploaded documents with the work.

According to the preserved homepage, the expanded system was functional within Whetstone Logic by February 2001. Its authors renamed it **PPTS—People & Projects Tracking System** to better describe its broader purpose and released it as open source for use by companies, universities, telecommuters, and distributed teams. An archived July 2001 homepage announced **PPTS 2.0 Alpha 3**, dated May 2, 2001.

This repository is a modern, security-focused successor—not a claim that the original implementation has been continuously maintained. It preserves the core ideas of people presence, project knowledge, and time tracking while rebuilding them on a current architecture. Historical details are sourced from the [April 2001](https://web.archive.org/web/20010404005450/http://ppts.sourceforge.net/) and [July 2001](https://web.archive.org/web/20010720111511/http://ppts.sourceforge.net/) archived project pages.

## Modernization technology

The port replaces the original early-2000s application with a server-rendered TypeScript system built on:

- Next.js 16.4.5, React 19.3.1, TypeScript 5.9.3, and Node.js 24
- PostgreSQL 18.3 with Prisma 7.10.1
- Keycloak 26.8.1 and standards-based OIDC Authorization Code flow with PKCE
- Podman Compose with native ARM64/AMD64 images, isolated networks, and digest-pinned runtime images
- Private quarantine/clean document storage and a separate fail-closed ClamAV scanning worker
- `jose` for JWT verification and purpose-bound authenticated encryption
- Node's built-in test runner, ESLint, Prettier, and reproducible npm supply-chain gates
- A server-rendered UI with an original, restrained design inspired by clarity and spatial consistency
- OWASP Top 10:2025 and OWASP ASVS 5.0 Level 2 security targets

## AI-assisted development disclosure

This modernization is being developed with human direction and review using [Goose](https://github.com/aaif/goose), an open-source agentic AI interface from the Agentic AI Foundation. Goose has been used to inspect the legacy and current code, propose and edit implementation and documentation, run development tools, investigate failures, and execute verification workflows.

Model information recorded for work on this repository:

- **OpenAI gpt-5.6-sol**, accessed through Goose's ChatGPT Codex provider, was used for the current authentication, container, documentation, security-review, and release-preparation work.
- **Qwen 3.8** was used during an earlier implementation/review handoff.
- Some earlier AI-assisted work was handed off without durable provider/model metadata; it is intentionally not attributed to a guessed model.

AI-generated or AI-edited output is not treated as authoritative by itself. Changes are accepted through source review, threat modeling, dependency and secret checks, unit and end-to-end tests, production builds, and human approval. Commit history records the resulting changes but should not be interpreted as a complete transcript of AI interaction. Model assignments may change in future work; this section records the models known to have contributed to the current baseline.

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

Compose applies migrations, runs an idempotent one-shot seed for the synthetic client/project/work-code catalog, reconciles Keycloak, and then starts the app. The seed never creates authenticated users, memberships, presence, or time entries.

`make clean` deletes both application and Keycloak database volumes but preserves the external runtime configuration. See [local operations](docs/operations/local-development.md) for environment and port overrides.

### Native development

The supplied local identity environment is Compose-based. For a fully native app, use Node.js 24+, PostgreSQL 18, and a separately configured OIDC provider whose callback and post-logout URLs match the app origin. Keep these values in a protected external secret source:

```bash
export DATABASE_URL='postgresql://ppts:YOUR_LOCAL_PASSWORD@localhost:5432/ppts'
export APP_ORIGIN='http://localhost:3000'
export OIDC_ISSUER='https://YOUR-IDP.example/realms/ppts'
export OIDC_CLIENT_ID='ppts-local'
export SESSION_SECRET='A_BASE64URL_SECRET_OF_AT_LEAST_43_CHARACTERS'
export ORGANIZATION_TIME_ZONE='America/New_York'
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
npm test                  # pure unit tests; included in verify
npm run test:contract     # every route/business action retains test evidence
npm run test:integration  # real PostgreSQL; CI migrates an empty test database
npm run maintenance:clock-receipts  # purge expired clock/presence retry receipts
npm run build
npm run verify             # static, dependency, unit, contract, and build gates
```

Health endpoints:

- `GET /api/health/live` — process liveness
- `GET /api/health/ready` — dependency-aware PostgreSQL readiness (returns 503 when unavailable)

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

A feature or fix is not complete until every changed action has retained positive and negative/boundary regression tests, its regression-contract entry is current, and affected documentation, architecture decisions, threat model, authorization matrix, schema diagrams/migrations, and operational commands are updated in the same pull request. See [CONTRIBUTING.md](CONTRIBUTING.md) and the [testing strategy](docs/testing.md).

## Project documents

- [Modernization proposal](MODERNIZATION_PROPOSAL.md)
- [Legacy functional parity assessment](docs/migration/legacy-parity.md)
- [Architecture](docs/architecture/overview.md)
- [Security model](docs/security/threat-model.md)
- [OWASP Top 10:2025 status](docs/security/owasp-top-10-2025.md)
- [Dependency and supply-chain policy](docs/security/dependency-policy.md)
- [Local operations](docs/operations/local-development.md)
- [Local Keycloak identity](docs/operations/local-identity.md)
- [Project-document operations](docs/operations/project-documents.md)
- [Roadmap](docs/ROADMAP.md)

## License

The legacy application was GPL-2.0-or-later. Licensing for this rewrite must be confirmed before public release; until then, no license is granted beyond applicable law. See [docs/architecture/decisions/0001-rewrite-foundation.md](docs/architecture/decisions/0001-rewrite-foundation.md).
