# Local development and deployment

## Separation of source and runtime secrets

The repository contains only the non-secret `.env.example` template. Local credentials, API keys, and future identity-provider secrets must live outside the checkout.

Default private runtime locations:

- **macOS:** `~/Library/Application Support/PPTS/environment`
- **Linux:** `${XDG_STATE_HOME:-~/.local/state}/ppts/environment`

The lifecycle script creates the runtime directory with mode `0700` and its environment file with mode `0600`. It resolves canonical paths and refuses `RUNTIME_DIR` or `ENV_FILE` located anywhere inside the source repository. Podman database data lives in a named container volume rather than the checkout.

Do not copy the runtime environment back into the repository. `.gitignore` remains defense in depth, not the primary control.

## Podman path

Requirements:

- macOS or Linux on ARM64/AArch64 or x86-64/AMD64
- GNU Make or BSD Make
- A current Podman release with `podman compose`
- `curl` for the post-start health check

The Node and PostgreSQL base images are multi-architecture OCI images. No platform is forced in Compose, so Podman selects the native Linux ARM64 or AMD64 image for the Podman machine/host.

### First start

```bash
make start
```

The first invocation:

1. Selects the external platform-appropriate runtime directory.
2. Copies `.env.example` to its private `environment` file.
3. Applies restrictive file permissions.
4. Stops and asks you to replace `POSTGRES_PASSWORD`.

Edit the path printed by the command, then run:

```bash
make start
```

On macOS, the script also detects whether a Podman machine exists and starts or creates it when necessary. On Linux, Podman runs natively.

The app is available at <http://localhost:3000>. PostgreSQL has no host-published port. Migrations run as a one-shot service before the app starts. Database data persists in the Podman-managed `ppts-db` volume.

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

`make clean` permanently deletes the Podman database volume. It intentionally preserves the external runtime directory and credentials. Remove that directory manually only when you also intend to delete local credentials.

### Overrides

A runtime location may be selected explicitly, but it must remain outside the repository:

```bash
make start RUNTIME_DIR="$HOME/.ppts-sandbox"
make start RUNTIME_DIR=/srv/ppts-local
make start PPTS_PORT=3001
make config PODMAN=/usr/local/bin/podman
```

Advanced use may point directly to an external environment file:

```bash
make start ENV_FILE="$HOME/.config/ppts/development.env"
```

If `PPTS_PORT` is present in that environment file, it controls the published port and health URL. Otherwise the Make variable/default (`3000`) is used.

### Direct Podman access

The Make targets wrap `scripts/containers.sh`. Because the environment path is platform-dependent, prefer Make. To inspect the resolved Compose setup, run:

```bash
make config
```

To discover the current default path:

```bash
make help
```

## Native development path

For native development, keep secrets in an external shell/session secret source instead of a repository `.env` file. Start PostgreSQL separately, then:

```bash
export DATABASE_URL='postgresql://ppts:YOUR_LOCAL_PASSWORD@localhost:5432/ppts'
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Do not add the exported value to shell history. Prefer a user-level secret manager or protected external file for regular use.

## Troubleshooting

- **Podman unavailable on macOS:** run `podman machine list`; `make start` normally starts an existing machine automatically.
- **Compose unavailable:** upgrade Podman or configure its Compose provider, then verify `podman compose version`.
- **Port conflict:** use `make start PPTS_PORT=3001` or edit the external environment file.
- **Permissions rejected:** run `chmod 700 <runtime-directory>` and `chmod 600 <environment-file>`.
- **Repository path rejected:** choose a `RUNTIME_DIR` outside the PPTS checkout.
- **Migration failure:** run `make logs` and inspect the migration container with Podman; never edit an applied migration.
- **Complete database reset:** run `make clean`, then `make start`.
- **Architecture diagnostics:** run `uname -m` and `podman info --format '{{.Host.Arch}}'`.

## Security boundaries

Local HTTP is acceptable only on loopback for synthetic data. Do not expose this stack to a LAN or the internet. Do not reuse the local password. Production requires TLS, a supported external IdP with MFA, managed secrets, least-privilege database roles, durable backups, centralized observability, rate limiting, and incident procedures.
