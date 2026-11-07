#!/usr/bin/env bash
set -euo pipefail
[[ -f .env.local ]] || { echo "Copy .env.example to .env.local and change POSTGRES_PASSWORD first." >&2; exit 1; }
docker compose --env-file .env.local up --build
