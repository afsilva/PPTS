# Local development and deployment

## Podman path

Requirements:

- macOS or Linux on ARM64/AArch64 or x86-64/AMD64
- GNU Make or BSD Make
- A current Podman release with `podman compose`
- `curl` for the post-start health check

The Node and PostgreSQL base images are multi-architecture OCI images. No platform is forced in Compose, so Podman selects the native Linux ARM64 or AMD64 image for the Podman machine/host. Do not add `platform:` unless intentionally testing cross-architecture emulation.

### First start

```bash
cp .env.example .env.local
# Replace POSTGRES_PASSWORD with a random local value.
make start
```

On macOS, the lifecycle script detects whether a Podman machine exists and starts or creates it when necessary. On Linux, Podman runs natively and no machine command is used.

The app is available at <http://localhost:3000>. PostgreSQL has no host-published port. Migrations run as a one-shot service before the app starts. Database data persists in the named `ppts-db` volume.

### Lifecycle commands

```bash
make start     # build, migrate, start, and wait for health
make restart   # rebuild/restart while preserving database data
make stop      # stop containers while preserving database data
make clean     # remove containers, local images, and database volume
make status    # show service status
make logs      # follow application logs
make config    # render and validate Compose configuration
make help
```

`make clean` permanently deletes the local database volume. It does not delete `.env.local` or source files.

### Overrides

Make variables can select another environment file, port, Podman binary, or Compose file:

```bash
make start PPTS_PORT=3001
make start ENV_FILE=.env.test
make config PODMAN=/usr/local/bin/podman
```

Values in `ENV_FILE` are passed to Compose. If `PPTS_PORT` exists in that file, it controls the published port and health-check URL. The default is `3000`.

The first invocation creates `.env.local` from `.env.example` if absent and stops so that the password can be reviewed. Placeholder passwords are rejected.

### Direct Podman access

The Make targets are thin wrappers around this portable script:

```bash
./scripts/containers.sh start
```

For advanced troubleshooting, the equivalent Compose prefix is:

```bash
podman compose --env-file .env.local -f compose.yaml
```

For example:

```bash
podman compose --env-file .env.local -f compose.yaml logs -f app
```

## Native development path

Start PostgreSQL separately, set `DATABASE_URL` in `.env.local`, then run:

```bash
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

## Troubleshooting

- **Podman unavailable on macOS:** run `podman machine list`; `make start` normally starts an existing machine automatically.
- **Compose unavailable:** upgrade Podman or install/configure its Compose provider, then verify `podman compose version`.
- **Port conflict:** use `make start PPTS_PORT=3001` or set `PPTS_PORT=3001` in `.env.local`.
- **Migration failure:** inspect `podman compose --env-file .env.local logs db migrate`; never edit an already applied migration.
- **Complete reset:** run `make clean`, then `make start`.
- **Build problems:** run `podman info`, ensure sufficient Podman machine disk/memory, and inspect `make logs`.
- **Architecture diagnostics:** run `uname -m` and `podman info --format '{{.Host.Arch}}'`. Supported values normalize to ARM64/AArch64 or x86-64/AMD64.

## Security boundaries

Local HTTP is acceptable only on loopback for synthetic data. Do not expose this stack to a LAN or the internet. Do not reuse the local password. Production requires TLS, a supported external IdP with MFA, managed secrets, least-privilege database roles, durable backups, centralized observability, rate limiting, and incident procedures.
