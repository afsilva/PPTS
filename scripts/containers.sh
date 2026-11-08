#!/bin/sh
set -eu

PODMAN=${PODMAN:-podman}
COMPOSE_FILE=${COMPOSE_FILE:-compose.yaml}
PPTS_PORT=${PPTS_PORT:-3000}
KEYCLOAK_PORT=${KEYCLOAK_PORT:-8080}
OS=$(uname -s)
ARCH=$(uname -m)

case "$OS" in
  Darwin)
    RUNTIME_ROOT_DEFAULT="${HOME}/Library/Application Support/PPTS"
    ;;
  Linux)
    RUNTIME_ROOT_DEFAULT="${XDG_STATE_HOME:-${HOME}/.local/state}/ppts"
    ;;
  *)
    RUNTIME_ROOT_DEFAULT="${HOME}/.ppts"
    ;;
esac

RUNTIME_DIR=${RUNTIME_DIR:-$RUNTIME_ROOT_DEFAULT}
ENV_FILE=${ENV_FILE:-${RUNTIME_DIR}/environment}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

notice() {
  printf '==> %s\n' "$*"
}

canonical_directory() {
  (CDPATH= cd -- "$1" 2>/dev/null && pwd -P) || return 1
}

repository_root() {
  CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P
}

assert_external_runtime() {
  repo=$(repository_root)
  mkdir -p "$RUNTIME_DIR"
  chmod 700 "$RUNTIME_DIR"
  runtime=$(canonical_directory "$RUNTIME_DIR") || fail "cannot resolve runtime directory: $RUNTIME_DIR"

  case "$runtime/" in
    "$repo/"|"$repo"/*)
      fail "RUNTIME_DIR must be outside the source repository ($repo); received $runtime"
      ;;
  esac

  env_parent=$(dirname -- "$ENV_FILE")
  mkdir -p "$env_parent"
  chmod 700 "$env_parent"
  env_parent=$(canonical_directory "$env_parent") || fail "cannot resolve environment directory: $env_parent"
  case "$env_parent/" in
    "$repo/"|"$repo"/*)
      fail "ENV_FILE must be outside the source repository ($repo); received $ENV_FILE"
      ;;
  esac
}

require_podman() {
  command -v "$PODMAN" >/dev/null 2>&1 || fail "Podman was not found. Install Podman and retry."
}

ensure_env() {
  assert_external_runtime
  if [ ! -f "$ENV_FILE" ]; then
    old_umask=$(umask)
    umask 077
    cp .env.example "$ENV_FILE"
    replace_secret() { value=$(openssl rand -base64 48 | tr -d '=+/\n' | cut -c1-64); sed "s|^$1=.*|$1=$value|" "$ENV_FILE" > "$ENV_FILE.tmp" && mv "$ENV_FILE.tmp" "$ENV_FILE"; }
    PPTS_PORT=$(sed -n 's/^PPTS_PORT=//p' "$ENV_FILE" | tail -n 1); PPTS_PORT=${PPTS_PORT:-3000}
  KEYCLOAK_PORT=$(sed -n 's/^KEYCLOAK_PORT=//p' "$ENV_FILE" | tail -n 1); KEYCLOAK_PORT=${KEYCLOAK_PORT:-8080}
  validate_ports

  for key in POSTGRES_PASSWORD KEYCLOAK_DB_PASSWORD KEYCLOAK_ADMIN_PASSWORD KEYCLOAK_ALEX_PASSWORD KEYCLOAK_CASEY_PASSWORD SESSION_SECRET; do replace_secret "$key"; done
    umask "$old_umask"
    chmod 600 "$ENV_FILE"
    printf '\nCreated private runtime configuration with generated credentials at:\n  %s\n\nRun make start again to launch PPTS.\n' "$ENV_FILE" >&2
    fail "local environment initialized; review it before starting"
  fi

  mode=$(stat -f '%Lp' "$ENV_FILE" 2>/dev/null || stat -c '%a' "$ENV_FILE" 2>/dev/null || printf 'unknown')
  case "$mode" in
    600|400) ;;
    *) fail "$ENV_FILE permissions are $mode; run: chmod 600 '$ENV_FILE'" ;;
  esac

  for key in POSTGRES_PASSWORD KEYCLOAK_DB_PASSWORD KEYCLOAK_ADMIN_PASSWORD KEYCLOAK_ALEX_PASSWORD KEYCLOAK_CASEY_PASSWORD SESSION_SECRET; do
    value=$(sed -n "s/^$key=//p" "$ENV_FILE" | tail -n 1)
    [ -n "$value" ] || fail "$key must be set in $ENV_FILE"
    case "$value" in replace-with-*|local-development-only) fail "replace placeholder $key in $ENV_FILE" ;; esac
  done
  guard_credential_rotation
}

require_existing_env() {
  assert_external_runtime
  [ -f "$ENV_FILE" ] || fail "$ENV_FILE does not exist; run 'make start' to initialize it"
}

# Credentials that are baked into a database volume when it is first created:
# the PPTS database password, the Keycloak database password, and the Keycloak
# master-realm bootstrap admin password. Editing them in the environment file
# cannot rotate the live databases. A 0600 guard file records the values that
# were in use when the current volumes were created; a change is refused so
# the user gets a precise error instead of a cascade of authentication
# failures. `make clean` removes the guard together with the volumes.
identity_hash() {
  for key in POSTGRES_PASSWORD KEYCLOAK_DB_PASSWORD KEYCLOAK_ADMIN_PASSWORD; do
    value=$(sed -n "s/^$key=//p" "$ENV_FILE" | tail -n 1)
    printf '%s=%s\n' "$key" "$value"
  done | openssl dgst -sha256 | sed 's/^.* //'
}

guard_credential_rotation() {
  guard="${RUNTIME_DIR%/}/identity-hash"
  current=$(identity_hash)
  if [ -f "$guard" ]; then
    recorded=$(sed -n '1p' "$guard")
    [ "$current" = "$recorded" ] ||
      fail "database/Keycloak-admin credentials in $ENV_FILE changed since the current volumes were created. Those values are baked into the existing databases, so the stack cannot start with the new values. Either restore the previous values, or run 'make clean' (deletes local database data) and then 'make start' to re-bake them."
  else
    old_umask=$(umask); umask 077
    printf '%s\n' "$current" > "$guard"
    umask "$old_umask"
    chmod 600 "$guard"
  fi
}

ensure_machine() {
  [ "$OS" = "Darwin" ] || return 0
  if "$PODMAN" info >/dev/null 2>&1; then return 0; fi

  machine=$(
    "$PODMAN" machine list --format json 2>/dev/null |
      sed -n 's/.*"Name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' |
      sed -n '1p'
  )
  if [ -z "$machine" ]; then
    notice "Creating the Podman virtual machine for macOS ($ARCH)"
    "$PODMAN" machine init
  fi
  notice "Starting the Podman virtual machine"
  "$PODMAN" machine start
}

require_engine() {
  "$PODMAN" info >/dev/null 2>&1 || fail "Podman is not reachable. Start its service or machine and retry."
}

validate_ports() {
  for item in "PPTS_PORT:$PPTS_PORT" "KEYCLOAK_PORT:$KEYCLOAK_PORT"; do
    key=${item%%:*}; port=${item#*:}
    case "$port" in *[!0-9]*|"") fail "$key must be an integer between 1024 and 65535" ;; esac
    [ "$port" -ge 1024 ] && [ "$port" -le 65535 ] || fail "$key must be between 1024 and 65535"
  done
  [ "$PPTS_PORT" != "$KEYCLOAK_PORT" ] || fail "PPTS_PORT and KEYCLOAK_PORT must differ"
}

compose() {
  # Podman Compose intentionally delegates to the installed Compose provider.
  # The banner is informational, not an application warning; suppress only
  # that documented wrapper notice while retaining all provider diagnostics.
  PPTS_PORT="$PPTS_PORT" KEYCLOAK_PORT="$KEYCLOAK_PORT" PODMAN_COMPOSE_WARNING_LOGS=false \
    "$PODMAN" compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

wait_for_app() {
  port=$(sed -n 's/^PPTS_PORT=//p' "$ENV_FILE" | tail -n 1)
  port=${port:-$PPTS_PORT}
  url="http://127.0.0.1:${port}/api/health/live"
  count=0
  while [ "$count" -lt 60 ]; do
    if command -v curl >/dev/null 2>&1 && curl --fail --silent --max-time 2 "$url" >/dev/null 2>&1; then
      notice "PPTS is ready at http://localhost:${port}"
      notice "Runtime configuration is outside the repository at $RUNTIME_DIR"
      return 0
    fi
    count=$((count + 1))
    sleep 1
  done
  compose ps
  fail "PPTS did not become healthy at $url within 60 seconds; run 'make logs'"
}

require_supported_arch() {
  case "$ARCH" in
    arm64|aarch64|x86_64|amd64) ;;
    *) fail "unsupported host architecture: $ARCH (expected arm64/aarch64 or x86_64/amd64)" ;;
  esac
}

command=${1:-help}
require_podman
require_supported_arch

case "$command" in
  start)
    ensure_env
    ensure_machine
    require_engine
    notice "Starting PPTS on $OS/$ARCH with native multi-architecture images"
    compose up --build --detach --remove-orphans
    wait_for_app
    ;;
  restart)
    ensure_env
    ensure_machine
    require_engine
    notice "Restarting PPTS"
    compose down --remove-orphans
    compose up --build --detach --remove-orphans
    wait_for_app
    ;;
  stop)
    require_existing_env
    ensure_machine
    require_engine
    notice "Stopping PPTS; database volume and external runtime configuration are preserved"
    compose down --remove-orphans
    ;;
  clean)
    require_existing_env
    ensure_machine
    require_engine
    notice "Removing PPTS containers, built images, and database volume"
    compose down --volumes --remove-orphans --rmi local
    rm -f "${RUNTIME_DIR%/}/identity-hash"
    notice "External runtime configuration is preserved at $RUNTIME_DIR; database credential rotation is now possible"
    ;;
  status)
    require_existing_env
    ensure_machine
    require_engine
    compose ps
    ;;
  logs)
    require_existing_env
    ensure_machine
    require_engine
    compose logs --follow app
    ;;
  config)
    ensure_env
    ensure_machine
    require_engine
    compose config
    ;;
  *) fail "unknown command '$command'; run 'make help'" ;;
esac
