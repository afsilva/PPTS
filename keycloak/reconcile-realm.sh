#!/bin/sh
set -eu
server=${KEYCLOAK_URL:-http://keycloak:8080}
kcadm=/opt/keycloak/bin/kcadm.sh
$kcadm config credentials --server "$server" --realm master --user "$KEYCLOAK_ADMIN" --password "$KEYCLOAK_ADMIN_PASSWORD" >/dev/null
# This realm is development-only and browser-facing solely through a loopback
# HTTP listener. Persisted realm state must not retain Keycloak's external-HTTPS
# requirement, which would reject the canonical local authorization flow.
$kcadm update realms/ppts \
  -s sslRequired=none \
  -s bruteForceProtected=true \
  -s permanentLockout=false \
  -s failureFactor=5 \
  -s waitIncrementSeconds=60 \
  -s quickLoginCheckMilliSeconds=1000 \
  -s minimumQuickLoginWaitSeconds=60 \
  -s maxFailureWaitSeconds=900 \
  -s maxDeltaTimeSeconds=43200 >/dev/null

client_id=$($kcadm get clients -r ppts -q clientId=ppts-local --fields id --format csv --noquotes | sed -n '1p')
[ -n "$client_id" ] || { echo "Canonical ppts-local client is missing" >&2; exit 1; }
$kcadm update "clients/$client_id" -r ppts \
  -s enabled=true -s publicClient=true -s fullScopeAllowed=false -s standardFlowEnabled=true \
  -s directAccessGrantsEnabled=false -s implicitFlowEnabled=false -s serviceAccountsEnabled=false \
  -s 'redirectUris=["http://localhost:'"$PPTS_PORT"'/auth/callback"]' \
  -s 'webOrigins=["http://localhost:'"$PPTS_PORT"'"]' \
  -s 'attributes."pkce.code.challenge.method"="S256"' \
  -s 'attributes."post.logout.redirect.uris"="http://localhost:'"$PPTS_PORT"'/login"' >/dev/null

# Realm roles must be emitted in ID tokens. Attach the built-in `roles` scope
# even when the realm database predates the committed import template.
roles_scope_id=$($kcadm get client-scopes -r ppts --fields id,name --format csv --noquotes | sed -n 's/^\([^,]*\),roles$/\1/p' | sed -n '1p')
[ -n "$roles_scope_id" ] || { echo "Built-in roles client scope is missing" >&2; exit 1; }
$kcadm update "clients/$client_id/default-client-scopes/$roles_scope_id" -r ppts >/dev/null
realm_roles_mapper_id=$($kcadm get "client-scopes/$roles_scope_id/protocol-mappers/models" -r ppts --fields id,name --format csv --noquotes | sed -n 's/^\([^,]*\),realm roles$/\1/p' | sed -n '1p')
[ -n "$realm_roles_mapper_id" ] || { echo "Realm roles protocol mapper is missing" >&2; exit 1; }
$kcadm update "client-scopes/$roles_scope_id/protocol-mappers/models/$realm_roles_mapper_id" -r ppts \
  -s 'config."id.token.claim"="true"' \
  -s 'config."access.token.claim"="true"' \
  -s 'config."claim.name"="realm_access.roles"' \
  -s 'config."multivalued"="true"' >/dev/null

# `fullScopeAllowed` is deliberately disabled. Map only PPTS's four approved
# realm roles into this client so unrelated realm roles cannot enter tokens.
for role in EMPLOYEE MANAGER ADMINISTRATOR AUDITOR; do
  role_id=$($kcadm get "roles/$role" -r ppts --fields id --format csv --noquotes 2>/dev/null || true)
  [ -n "$role_id" ] || { echo "Canonical realm role $role is missing" >&2; exit 1; }
  current=$($kcadm get "clients/$client_id/scope-mappings/realm" -r ppts --fields name --format csv --noquotes)
  case "$current" in
    *"$role"*) ;;
    *) $kcadm create "clients/$client_id/scope-mappings/realm" -r ppts \
         -b '[{"id":"'"$role_id"'","name":"'"$role"'"}]' >/dev/null ;;
  esac
done
# The import strategy ignores an already-persisted realm, so reconciliation
# also creates newly introduced synthetic accounts during upgrades.
morgan_id=$($kcadm get users -r ppts -q username=morgan.manager --fields id --format csv --noquotes | sed -n '1p')
if [ -z "$morgan_id" ]; then
  $kcadm create users -r ppts \
    -s username=morgan.manager -s firstName=Morgan -s lastName=Rivera \
    -s email=morgan.manager@local.invalid -s emailVerified=true -s enabled=true >/dev/null
  morgan_id=$($kcadm get users -r ppts -q username=morgan.manager --fields id --format csv --noquotes | sed -n '1p')
fi
[ -n "$morgan_id" ] || { echo "Could not reconcile morgan.manager" >&2; exit 1; }

for item in "alex.admin:$KEYCLOAK_ALEX_PASSWORD:ADMINISTRATOR" "casey.employee:$KEYCLOAK_CASEY_PASSWORD:EMPLOYEE" "morgan.manager:$KEYCLOAK_MORGAN_PASSWORD:EMPLOYEE,MANAGER"; do
  username=${item%%:*}; remainder=${item#*:}; password=${remainder%%:*}; roles=${remainder#*:}
  id=$($kcadm get users -r ppts -q "username=$username" --fields id --format csv --noquotes | sed -n '1p')
  [ -n "$id" ] || { echo "Canonical local user $username is missing" >&2; exit 1; }
  $kcadm set-password -r ppts --userid "$id" --new-password "$password" >/dev/null
  old_ifs=$IFS; IFS=,
  for role in $roles; do $kcadm add-roles -r ppts --uid "$id" --rolename "$role" >/dev/null; done
  IFS=$old_ifs
done
