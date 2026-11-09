#!/bin/sh
# Logical PostgreSQL backup/restore smoke test for the local Podman database.
# The archive never leaves the database container and is deleted on exit.
set -eu

PODMAN=${PODMAN:-podman}
command -v "$PODMAN" >/dev/null 2>&1 || { echo "Podman is required." >&2; exit 1; }

DB_CONTAINER=$($PODMAN ps --format '{{.Names}}' 2>/dev/null | grep -m1 -E '(^|/)ppts-db-[0-9]+$' || true)
[ -n "$DB_CONTAINER" ] || { echo "Running PPTS database container not found." >&2; exit 1; }

suffix=$(openssl rand -hex 8)
restore_db="ppts_restore_${suffix}"
archive="/tmp/ppts-backup-${suffix}.dump"
work=$(mktemp -d)
cleanup() {
  "$PODMAN" exec "$DB_CONTAINER" dropdb --if-exists -U ppts "$restore_db" >/dev/null 2>&1 || true
  "$PODMAN" exec "$DB_CONTAINER" rm -f "$archive" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT INT TERM

manifest() {
  database=$1
  output=$2
  tables=$($PODMAN exec "$DB_CONTAINER" psql -X -U ppts -d "$database" -At \
    -v ON_ERROR_STOP=1 -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
  : > "$output"
  for table in $tables; do
    case "$table" in *[!A-Za-z0-9_]*) echo "Unsafe table identifier in manifest." >&2; exit 1 ;; esac
    count=$($PODMAN exec "$DB_CONTAINER" psql -X -U ppts -d "$database" -At \
      -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM \"$table\"")
    printf '%s|%s\n' "$table" "$count" >> "$output"
  done
  $PODMAN exec "$DB_CONTAINER" psql -X -U ppts -d "$database" -At \
    -v ON_ERROR_STOP=1 -c "SELECT 'constraints|' || count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'" >> "$output"
  $PODMAN exec "$DB_CONTAINER" psql -X -U ppts -d "$database" -At \
    -v ON_ERROR_STOP=1 -c "SELECT 'indexes|' || count(*) FROM pg_indexes WHERE schemaname='public'" >> "$output"
  LC_ALL=C sort -o "$output" "$output"
}

printf '%s\n' 'Creating consistent custom-format logical backup...'
$PODMAN exec "$DB_CONTAINER" pg_dump -U ppts -d ppts --format=custom --no-owner --no-acl --file="$archive"
$PODMAN exec "$DB_CONTAINER" test -s "$archive"
$PODMAN exec "$DB_CONTAINER" pg_restore --list "$archive" >/dev/null

# Run while the local stack is otherwise idle so this post-dump source count
# manifest represents the same business state as the completed archive.
manifest ppts "$work/source"

printf '%s\n' 'Restoring backup into an isolated temporary database...'
$PODMAN exec "$DB_CONTAINER" createdb -U ppts "$restore_db"
$PODMAN exec "$DB_CONTAINER" pg_restore -U ppts -d "$restore_db" --exit-on-error --no-owner --no-acl "$archive"
manifest "$restore_db" "$work/restored"

if ! diff -u "$work/source" "$work/restored"; then
  echo "Backup/restore manifest mismatch. Retry while the local stack is idle." >&2
  exit 1
fi

$PODMAN exec "$DB_CONTAINER" psql -X -U ppts -d "$restore_db" -At -v ON_ERROR_STOP=1 \
  -c 'SELECT 1 FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL LIMIT 1' | grep -qx 1

printf '%s\n' 'Backup/restore smoke passed: table counts, constraints, indexes, and migration history match.'
