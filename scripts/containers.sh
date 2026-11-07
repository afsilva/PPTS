#!/bin/sh
set -eu

PODMAN=${PODMAN:-podman}
ENV_FILE=${ENV_FILE:-.env.local}
COMPOSE_FILE=${COMPOSE_FILE:-compose.yaml}
PPTS_PORT=${PPTS_PORT:-3000}
OS=$(uname -s)
ARCH=$(uname -m)

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

notice() {
  printf '==> %s\n' "$*"
}

require_podman() {
  command -v "$PODMAN" >/dev/null 2>&1 || fail "Podman was not found. Install Podman and retry."
}

ensure_env() {
  if [ ! -f "$ENV_FILE" ]; then
    cp .env.example "$ENV_FILE"
    printf '\nCreated %s. Replace POSTGRES_PASSWORD before starting again.\n' "$ENV_FILE" >&2
    fail "local environment file requires review"
  fi

  password=$(sed -n 's/^POSTGRES_PASSWORD=//p' "$ENV_FILE" | tail -n 1)
  [ -n "$password" ] || fail "POSTGRES_PASSWORD must be set in $ENV_FILE"
  case "$password" in
    replace-with-*|local-development-only)
      fail "replace the placeholder POSTGRES_PASSWORD in $ENV_FILE"
      ;;
  esac
}

ensure_machine() {
  [ "$OS" = "Darwin" ] || return 0

  if "$PODMAN" info >/dev/null 2>&1; then
    return 0
  fi

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
    ensure_machine
    require_engine
    [ -f "$ENV_FILE" ] || fail "$ENV_FILE does not exist; nothing has been configured"
    notice "Stopping PPTS; database volume is preserved"
    compose down --remove-orphans
    ;;
  clean)
    ensure_machine
    require_engine
    [ -f "$ENV_FILE" ] || fail "$ENV_FILE does not exist; nothing has been configured"
    notice "Removing PPTS containers, built images, and database volume"
    compose down --volumes --remove-orphans --rmi local
    ;;
  status)
    ensure_machine
    require_engine
    [ -f "$ENV_FILE" ] || fail "$ENV_FILE does not exist; nothing has been configured"
    compose ps
    ;;
  logs)
    ensure_machine
    require_engine
    [ -f "$ENV_FILE" ] || fail "$ENV_FILE does not exist; nothing has been configured"
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
