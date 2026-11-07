# Local development and deployment

## Container path

```bash
cp .env.example .env.local
# Set a random local POSTGRES_PASSWORD.
docker compose --env-file .env.local up --build
curl --fail http://localhost:3000/api/health/live
```

The app is available only on loopback. PostgreSQL has no host-published port. Migrations run as a one-shot service before the app starts. Compose data persists in `ppts-db`.

Useful commands:

```bash
docker compose --env-file .env.local logs -f app
docker compose --env-file .env.local ps
docker compose --env-file .env.local down
docker compose --env-file .env.local down --volumes  # destructive reset
```

To seed after persistence is wired into the UI:

```bash
docker compose --env-file .env.local run --rm migrate npm run db:seed
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

- Port conflict: set `PPTS_PORT=3001` in `.env.local`.
- Migration failure: inspect `docker compose logs db migrate`; do not edit an already applied migration.
- Full reset: `docker compose --env-file .env.local down --volumes`, then start again.
- Build problems: confirm Node 24+ and run `npm ci`, not an unpinned global install.

## Security boundaries

Local HTTP is acceptable only on loopback for synthetic data. Do not expose this stack to a LAN or internet. Do not reuse the local password. Production requires TLS, a supported external IdP with MFA, managed secrets, least-privilege DB roles, durable backups, centralized observability, rate limiting, and incident procedures.
