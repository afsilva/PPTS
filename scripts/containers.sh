#!/bin/sh
set -eu

PODMAN=${PODMAN:-podman}
COMPOSE_FILE=${COMPOSE_FILE:-compose.yaml}
PPTS_PORT=${PPTS_PORT:-3000}
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
    umask "$old_umask"
    chmod 600 "$ENV_FILE"
    printf '\nCreated private runtime configuration at:\n  %s\n\nReplace POSTGRES_PASSWORD before starting again.\n' "$ENV_FILE" >&2
    fail "local environment file requires review"
  fi

  mode=$(stat -f '%Lp' "$ENV_FILE" 2>/dev/null || stat -c '%a' "$ENV_FILE" 2>/dev/null || printf 'unknown')
  case "$mode" in
    600|400) ;;
    *) fail "$ENV_FILE permissions are $mode; run: chmod 600 '$ENV_FILE'" ;;
  esac

  password=$(sed -n 's/^POSTGRES_PASSWORD=//p' "$ENV_FILE" | tail -n 1)
  [ -n "$password" ] || fail "POSTGRES_PASSWORD must be set in $ENV_FILE"
  case "$password" in
    replace-with-*|local-development-only)
      fail "replace the placeholder POSTGRES_PASSWORD in $ENV_FILE"
      ;;
  esac
}

require_existing_env() {
  assert_external_runtime
  [ -f "$ENV_FILE" ] || fail "$ENV_FILE does not exist; run 'make start' to initialize it"
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

compose() {
  PPTS_PORT="$PPTS_PORT" "$PODMAN" compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
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
    notice "External runtime configuration is preserved at $RUNTIME_DIR"
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
