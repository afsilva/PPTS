# Local development and deployment

## Separation of source and runtime secrets

The repository contains only the non-secret `.env.example` template. Local credentials, session secrets, API keys, and identity-provider secrets must live outside the checkout.

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
3. Generates all local database, Keycloak, account, and session secrets.
4. Applies restrictive permissions and stops so the file can be reviewed.

Review the path printed by the command if desired, then run:

```bash
make start
```

On macOS, the script also detects whether a Podman machine exists and starts or creates it when necessary. On Linux, Podman runs natively.

The app is available at <http://localhost:3000>. PostgreSQL has no host-published port. Migrations run as a one-shot service, followed by an idempotent one-shot seed for the synthetic Northstar Studio / PPTS Modernization catalog and active Engineering, Planning, and Testing work codes. The app waits for both catalog seeding and Keycloak reconciliation. The seed does not create users, memberships, presence, or time entries. Application and identity data persist separately in the Podman-managed `ppts-db` and `ppts-keycloak-db` volumes. Private document bytes and malware definitions persist in `ppts-documents` and `ppts-clamav-definitions`; quarantined bytes are never served. See [project-document operations](project-documents.md).

### Authentication and receipt maintenance

Local Keycloak applies progressive brute-force protection after five failed credential attempts. PPTS independently limits each user to five active application sessions; concurrent callbacks serialize on the user row and revoke the oldest sessions first. Sessions have an eight-hour absolute lifetime and one-hour idle lifetime.

Purge revoked, absolutely expired, and idle session rows—which include encrypted provider-token material—with:

```bash
npm run maintenance:sessions
```

Clock and presence mutations retain actor-scoped replay receipts for 24 hours so a retried request cannot duplicate a transition or success audit. Purge expired rows with:

```bash
npm run maintenance:clock-receipts
```

Both commands use `DATABASE_URL`, delete only inactive/expired rows, and print only the removed count. The Podman stack runs the equivalent combined `maintenance` service immediately at startup and then every `MAINTENANCE_INTERVAL_SECONDS` (default `86400`, allowed range 300–604800 seconds). It retries failures after at most five minutes, runs without host ports on the internal database network, and emits only counts or a generic failure marker without exception details. Operators must monitor container health/restarts and `[maintenance] cleanup failed` logs; production orchestration must preserve this schedule and alerting behavior. Deleting an unexpired receipt weakens retry guarantees, so do not truncate the receipt table during normal operation. Production also requires distributed rate controls at the trusted TLS edge; in-process client-IP throttling is intentionally not used because proxy-derived addresses are unsafe without an approved ingress topology.

### Lifecycle commands

```bash
make start     # build, migrate, start, and wait for health
make restart   # rebuild/restart while preserving database data
make stop      # stop containers while preserving both databases
make clean     # remove containers, local images, and both database volumes
make status    # show service status
make logs      # follow application logs
make config    # render and validate Compose configuration
make help
```

`make clean` permanently deletes both Podman database volumes, private document bytes, and ClamAV definition data. It intentionally preserves the external runtime directory and credentials. Remove that directory manually only when you also intend to delete local credentials.

### Overrides

A runtime location may be selected explicitly, but it must remain outside the repository:

```bash
make start RUNTIME_DIR="$HOME/.ppts-sandbox"
make start RUNTIME_DIR=/srv/ppts-local
make start PPTS_PORT=3001
make start PPTS_PORT=3001 KEYCLOAK_PORT=8081
make config PODMAN=/usr/local/bin/podman
```

Advanced use may point directly to an external environment file:

```bash
make start ENV_FILE="$HOME/.config/ppts/development.env"
```

If `PPTS_PORT` is present in that environment file, it controls the published port and health URL. Otherwise the Make variable/default (`3000`) is used. `ORGANIZATION_TIME_ZONE` must be an IANA identifier such as `UTC`, `America/New_York`, or `Europe/London`; it controls dashboard day/Monday-week totals and monthly HTML/CSV boundaries, and defaults to `UTC`. Change it only in the protected external environment file, then rebuild/restart the app. Changing it changes which boundary-crossing entries belong to a report month, so production changes require business-owner approval and reconciliation.

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

The supplied local Keycloak environment is Compose-based. A fully native app also requires a separately configured OIDC provider with matching callback and post-logout URLs. Keep all values in an external shell/session secret source instead of a repository `.env` file:

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

Do not add exported values to shell history. Prefer a user-level secret manager or protected external file. `OIDC_INTERNAL_ISSUER` is optional for trusted server-side routing that differs from the browser-facing issuer.

## PostgreSQL backup/restore smoke

With the local stack running and otherwise idle, verify logical backup recoverability with:

```bash
npm run operations:backup-restore-smoke
```

The script creates a PostgreSQL custom-format archive inside the database container, verifies its catalog, restores it into a randomly named isolated database, and compares every public table's row count plus constraint/index totals and migration history. Temporary archives and databases are removed on success, failure, or interruption. It never prints credentials or copies database contents into the repository or host filesystem.

This smoke proves the current local database is logically restorable; it does not replace encrypted off-host production backups, point-in-time recovery, retention policy, access controls, document-object reconciliation, or scheduled restore drills.

## Troubleshooting

- **Podman unavailable on macOS:** run `podman machine list`; `make start` normally starts an existing machine automatically.
- **Compose unavailable:** upgrade Podman or configure its Compose provider, then verify `podman compose version`.
- **Port conflict:** use `make start PPTS_PORT=3001` or edit the external environment file.
- **Permissions rejected:** run `chmod 700 <runtime-directory>` and `chmod 600 <environment-file>`.
- **Repository path rejected:** choose a `RUNTIME_DIR` outside the PPTS checkout.
- **Migration failure:** run `make logs` and inspect the migration container with Podman; never edit an applied migration.
- **Complete application and identity database reset:** run `make clean`, then `make start`.
- **Architecture diagnostics:** run `uname -m` and `podman info --format '{{.Host.Arch}}'`.

## Security boundaries

Local HTTP is acceptable only on loopback for synthetic data. Do not expose this stack to a LAN or the internet. Do not reuse the local password. Production requires TLS, a supported external IdP with MFA, managed secrets, least-privilege database roles, durable backups, centralized observability, rate limiting, and incident procedures.
