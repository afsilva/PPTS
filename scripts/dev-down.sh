#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "This command is deprecated; using the external-runtime Podman workflow." >&2
exec "$(dirname "$0")/containers.sh" stop
