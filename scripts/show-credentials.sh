#!/bin/sh
set -eu
case "$(uname -s)" in
  Darwin) root="${HOME}/Library/Application Support/PPTS" ;;
  Linux) root="${XDG_STATE_HOME:-${HOME}/.local/state}/ppts" ;;
  *) root="${HOME}/.ppts" ;;
esac
file=${ENV_FILE:-${RUNTIME_DIR:-$root}/environment}
[ -f "$file" ] || { echo "No local credentials found; run make start." >&2; exit 1; }
mode=$(stat -f '%Lp' "$file" 2>/dev/null || stat -c '%a' "$file" 2>/dev/null || echo unknown)
[ "$mode" = 600 ] || [ "$mode" = 400 ] || { echo "Refusing to display credentials: $file permissions are $mode (expected 0600 or 0400)." >&2; exit 1; }
[ -t 1 ] || [ "${PPTS_ALLOW_CREDENTIAL_REDIRECT:-}" = 1 ] || { echo "Refusing to write credentials to a non-terminal. Set PPTS_ALLOW_CREDENTIAL_REDIRECT=1 to explicitly override." >&2; exit 1; }
value(){ sed -n "s/^$1=//p" "$file" | tail -n 1; }
for key in PPTS_PORT KEYCLOAK_PORT KEYCLOAK_ALEX_PASSWORD KEYCLOAK_CASEY_PASSWORD KEYCLOAK_ADMIN_PASSWORD; do [ -n "$(value "$key")" ] || { echo "Missing $key in $file" >&2; exit 1; }; done
for key in KEYCLOAK_ALEX_PASSWORD KEYCLOAK_CASEY_PASSWORD KEYCLOAK_ADMIN_PASSWORD; do
  case "$(value "$key")" in replace-with-*|local-development-only) echo "Refusing: $key still contains a placeholder." >&2; exit 1 ;; esac
done
printf 'PPTS local identity credentials (keep private)\n\nAdministrator\n  URL:      http://localhost:%s\n  Username: alex.admin\n  Password: %s\n\nEmployee\n  Username: casey.employee\n  Password: %s\n\nKeycloak console\n  URL:      http://localhost:%s/admin/\n  Username: local-admin\n  Password: %s\n' "$(value PPTS_PORT)" "$(value KEYCLOAK_ALEX_PASSWORD)" "$(value KEYCLOAK_CASEY_PASSWORD)" "$(value KEYCLOAK_PORT)" "$(value KEYCLOAK_ADMIN_PASSWORD)"
