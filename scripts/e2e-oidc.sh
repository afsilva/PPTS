#!/bin/sh
# End-to-end verification of the local OIDC stack. Requires a running stack
# (make start / make restart) and a protected external environment file.
# Exercises the browser-facing flows with curl cookie jars: redirect
# enforcement, Keycloak login, callback, session API shape, CSRF-guarded
# logout, SSO-session termination, inactive users, and audit persistence.
# No generated credential is printed.
set -u

case "$(uname -s)" in
  Darwin) root="${HOME}/Library/Application Support/PPTS" ;;
  Linux) root="${XDG_STATE_HOME:-${HOME}/.local/state}/ppts" ;;
  *) root="${HOME}/.ppts" ;;
esac
ENV_FILE=${ENV_FILE:-${RUNTIME_DIR:-$root}/environment}
PODMAN=${PODMAN:-podman}

[ -f "$ENV_FILE" ] || { echo "No environment file at $ENV_FILE; run make start first." >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "curl is required." >&2; exit 1; }

set -a
. "$ENV_FILE"
set +a

# One canonical hostname for the whole flow so the cookie jar stays valid
# across the application and Keycloak hops (cookies are host-scoped).
APP=http://localhost:${PPTS_PORT:-3000}
KC=http://localhost:${KEYCLOAK_PORT:-8080}
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT INT TERM

# A fresh key per run keeps this script repeatable while retaining one key for
# the deliberate exact-replay and changed-payload assertions below.
new_submission_id() { node -e 'process.stdout.write(crypto.randomUUID())'; }
admin_reset_id=$(new_submission_id)
admin_foreign_clock_id=$(new_submission_id)
admin_clock_in_id=$(new_submission_id)
admin_switch_id=$(new_submission_id)
admin_clock_out_id=$(new_submission_id)
employee_denied_clock_id=$(new_submission_id)
employee_clock_in_id=$(new_submission_id)
employee_clock_out_id=$(new_submission_id)

pass=0
fail=0
ok() { pass=$((pass + 1)); printf 'ok   - %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL - %s\n' "$1"; }
check() { # check <description> <0 for pass, nonzero for fail>
  if [ "$2" = 0 ]; then ok "$1"; else bad "$1"; fi
}

# begin_login <jar> -> echoes the Keycloak authorization URL
begin_login() {
  curl -s -c "$1" -b "$1" -o "$WORK/begin.html" -w '%{redirect_url}' "$APP/auth/login"
}

# perform_login <jar> <username> <password> -> echoes "<final_url> <http_code>"
perform_login() {
  jar=$1; user=$2; password=$3
  auth_url=$(begin_login "$jar")
  case "$auth_url" in
    "$KC"*) ;;
    *) printf '%s 000' "$auth_url"; return ;;
  esac
  form=$(curl -s -c "$jar" -b "$jar" "$auth_url")
  case "$form" in
    *'<input'*) ;;
    *) printf '%s 403' "$auth_url"; return ;;
  esac
  action=$(printf '%s' "$form" | sed -n 's/.*<form[^>]*action="\([^"]*\)".*/\1/p' | head -n 1 | sed 's/&amp;/\&/g')
  case "$action" in
    http*) target="$action" ;;
    /*) target="$KC$action" ;;
    *) target="$KC/realms/ppts/login" ;;
  esac
  data="username=$(printf '%s' "$user" | sed 's/ /%20/g')&password=$password"
  hidden=$(printf '%s' "$form" | grep -o '<input type="hidden" name="[^"]*" value="[^"]*"' | sed 's/.*name="\([^"]*\)" value="\([^"]*\)".*/\1=\2/' | paste -sd '&' -)
  [ -n "$hidden" ] && data="$data&$hidden"
  # --data selects POST for the Keycloak form, while curl correctly follows
  # Keycloak's 302 redirect to the application's GET-only callback as GET.
  # An explicit `-X POST` would incorrectly preserve POST across redirects.
  curl -s -L -c "$jar" -b "$jar" -o "$WORK/final.html" \
    -w '%{url_effective} %{http_code}' \
    --data "$data" "$target"
}

# --- 1. Unauthenticated behavior --------------------------------------------
code=$(curl -s -o /dev/null -w '%{http_code}' "$APP/api/health/live")
check "health endpoint is live" $([ "$code" = 200 ]; echo $?)
code=$(curl -s -o /dev/null -w '%{http_code}' "$APP/api/health/ready")
check "process readiness endpoint is available" $([ "$code" = 200 ]; echo $?)
body=$(curl -s -o /dev/null -w '%{redirect_url}' "$APP/")
check "root redirects unauthenticated users to login" $(printf '%s' "$body" | grep -q "$APP/login"; echo $?)
code=$(curl -s -o "$WORK/s.json" -w '%{http_code}' "$APP/api/auth/session")
check "session endpoint answers 401 without a session" $([ "$code" = 401 ]; echo $?)
# Deliberately exercise the callback's sanitized failure audit path without
# sending an authorization code, token, credential, or provider response.
callback_location=$(curl -s -o /dev/null -w '%{redirect_url}' "$APP/auth/callback?state=invalid")
check "invalid callback fails closed" $(printf '%s' "$callback_location" | grep -q "$APP/login?error=invalid_callback"; echo $?)

# --- 2. Administrator login --------------------------------------------------
JAR_A="$WORK/jar-alex.txt"; rm -f "$JAR_A"
result=$(perform_login "$JAR_A" "alex.admin" "${KEYCLOAK_ALEX_PASSWORD}")
final_url=$(printf '%s' "$result" | awk '{print $1}')
final_code=$(printf '%s' "$result" | awk '{print $2}')
check "admin login lands on the dashboard" $(printf '%s' "$final_url" | grep -q "$APP/"; echo $?)
check "admin login returns 200" $([ "$final_code" = 200 ]; echo $?)
curl -s -b "$JAR_A" "$APP/" | grep -q "Alex Morgan"
check "dashboard shows the authenticated administrator name" $?
code=$(curl -s -o "$WORK/s.json" -w '%{http_code}' -b "$JAR_A" "$APP/api/auth/session")
check "session endpoint is 200 with a session" $([ "$code" = 200 ]; echo $?)
grep -q '"authenticated":true' "$WORK/s.json"
check "session endpoint reports authenticated" $?
grep -q '"displayName":"Alex Morgan"' "$WORK/s.json"
check "session endpoint returns the display name" $?
if grep -q '"id"' "$WORK/s.json" || grep -q '"roles"' "$WORK/s.json" || grep -q '"username"' "$WORK/s.json"; then
  check "session endpoint omits internal identifiers and roles" 1
else
  check "session endpoint omits internal identifiers and roles" 0
fi
code=$(curl -s -o "$WORK/report.html" -w '%{http_code}' -b "$JAR_A" "$APP/reports")
check "administrator can open monthly reports" $([ "$code" = 200 ] && grep -q 'Export protected CSV' "$WORK/report.html"; echo $?)
year=$(date -u +%Y); month=$(date -u +%m)
code=$(curl -s -D "$WORK/report-headers" -o "$WORK/report.csv" -w '%{http_code}' -b "$JAR_A" "$APP/api/reports/monthly.csv?year=$year&month=$month")
check "administrator can export protected monthly CSV" $([ "$code" = 200 ] && grep -qi 'content-type: text/csv' "$WORK/report-headers" && grep -q 'Organization time zone' "$WORK/report.csv"; echo $?)
code=$(curl -s -o "$WORK/audit.html" -w '%{http_code}' -b "$JAR_A" "$APP/audit")
check "administrator can open bounded audit events" $([ "$code" = 200 ] && grep -q 'Security audit events' "$WORK/audit.html"; echo $?)

# --- 3. Time tracking and business authorization -----------------------------
DB_CONTAINER=$("$PODMAN" ps --format '{{.Names}}' 2>/dev/null | grep -m1 -E '(^|/)ppts-db-[0-9]+$' || true)
if [ -n "$DB_CONTAINER" ]; then
  # Normalize a prior interrupted run through the public business route.
  curl -s -o /dev/null -b "$JAR_A" --data "submissionId=$admin_reset_id" -H "Origin: $APP" "$APP/api/time/clock-out"
  # Exercise administrator-only profile/account lifecycle through public routes.
  "$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -c "UPDATE \"Person\" SET \"userId\"=NULL WHERE \"displayName\"='E2E Linked Profile'; DELETE FROM \"Person\" WHERE \"displayName\"='E2E Linked Profile'" >/dev/null
  code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR_A" --data 'submissionId=00000000-0000-4000-8000-0000000000e2&kind=EMPLOYEE&displayName=E2E%20Linked%20Profile' -H "Origin: http://evil.example" "$APP/api/people")
  check "person creation rejects a foreign Origin" $([ "$code" = 403 ]; echo $?)
  code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR_A" --data 'submissionId=00000000-0000-4000-8000-0000000000e2&kind=EMPLOYEE&displayName=E2E%20Linked%20Profile' -H "Origin: $APP" "$APP/api/people")
  check "administrator can create an employee profile" $([ "$code" = 303 ]; echo $?)
  profile_id=$("$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -tAc "SELECT id FROM \"Person\" WHERE \"displayName\"='E2E Linked Profile' LIMIT 1")
  alex_id=$("$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -tAc 'SELECT id FROM "User" WHERE username='\''alex.admin'\'' LIMIT 1')
  code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR_A" --data "id=$profile_id&userId=$alex_id&version=1" -H "Origin: $APP" "$APP/api/people/link")
  check "administrator can link an active login to an employee profile" $([ "$code" = 303 ]; echo $?)
  curl -s -b "$JAR_A" "$APP/people" > "$WORK/people-linked.html"
  check "people UI displays the linked login" $(grep -q 'E2E Linked Profile' "$WORK/people-linked.html" && grep -q 'alex.admin' "$WORK/people-linked.html"; echo $?)
  location=$(curl -s -o /dev/null -w '%{redirect_url}' -b "$JAR_A" --data "id=$profile_id&userId=$alex_id&version=1" -H "Origin: $APP" "$APP/api/people/link")
  check "stale identity link fails closed" $(printf '%s' "$location" | grep -q 'result=stale'; echo $?)
  code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR_A" --data "id=$profile_id&version=2" -H "Origin: $APP" "$APP/api/people/unlink")
  check "administrator can unlink a profile without deleting its login" $([ "$code" = 303 ]; echo $?)
  code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR_A" --data "id=$profile_id&version=3" -H "Origin: $APP" "$APP/api/people/archive")
  check "administrator can archive the unlinked profile" $([ "$code" = 303 ]; echo $?)

  project_id=$("$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -tAc 'SELECT id FROM "Project" WHERE name = '\''PPTS Modernization'\'' AND "archivedAt" IS NULL LIMIT 1')
  # Keep one active project deliberately outside Casey's scope to prove denial
  # after the administrator grants access to the seeded project.
  "$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -c 'WITH c AS (INSERT INTO "Client" (id,name,"createdAt","updatedAt") VALUES (gen_random_uuid(),'\''E2E Authorization Client'\'',NOW(),NOW()) ON CONFLICT (name) DO UPDATE SET "archivedAt"=NULL RETURNING id), s AS (SELECT id FROM "ProjectStatus" WHERE name='\''Active'\'' LIMIT 1) INSERT INTO "Project" (id,"clientId","statusId",name,description,"createdAt","updatedAt") SELECT gen_random_uuid(),c.id,s.id,'\''E2E Unassigned Project'\'','\''Authorization denial fixture'\'',NOW(),NOW() FROM c,s ON CONFLICT ("clientId",name) DO UPDATE SET "archivedAt"=NULL' >/dev/null
  denied_project_id=$("$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -tAc 'SELECT p.id FROM "Project" p JOIN "Client" c ON c.id=p."clientId" WHERE p.name='\''E2E Unassigned Project'\'' AND c.name='\''E2E Authorization Client'\'' AND p."archivedAt" IS NULL LIMIT 1')
  "$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -c "DELETE FROM \"ProjectMember\" USING \"User\" WHERE \"ProjectMember\".\"userId\"=\"User\".id AND \"User\".username='casey.employee' AND \"ProjectMember\".\"projectId\"='$project_id'::uuid" >/dev/null
  engineering_id=$("$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -tAc 'SELECT id FROM "WorkCode" WHERE name = '\''Engineering'\'' AND active LIMIT 1')
  planning_id=$("$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -tAc 'SELECT id FROM "WorkCode" WHERE name = '\''Planning'\'' AND active LIMIT 1')
  if [ -n "$project_id" ] && [ -n "$engineering_id" ] && [ -n "$planning_id" ]; then
    code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR_A" --data "submissionId=$admin_foreign_clock_id&projectId=$project_id&workCodeId=$engineering_id&message=E2E%20engineering" -H "Origin: http://evil.example" "$APP/api/time/clock-in")
    check "clock-in rejects a foreign Origin" $([ "$code" = 403 ]; echo $?)
    code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR_A" --data "submissionId=$admin_clock_in_id&projectId=$project_id&workCodeId=$engineering_id&message=E2E%20engineering" -H "Origin: $APP" "$APP/api/time/clock-in")
    check "administrator can clock into an active project" $([ "$code" = 303 ]; echo $?)
    curl -s -b "$JAR_A" "$APP/" | grep -q "E2E engineering"
    check "dashboard reads current work from the database" $?
    code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR_A" --data "submissionId=$admin_switch_id&projectId=$project_id&workCodeId=$planning_id&message=E2E%20planning" -H "Origin: $APP" "$APP/api/time/switch")
    check "administrator can switch work atomically" $([ "$code" = 303 ]; echo $?)
    open_count=$("$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -tAc 'SELECT COUNT(*) FROM "TimeEntry" e JOIN "User" u ON u.id=e."userId" WHERE u.username='\''alex.admin'\'' AND e."endedAt" IS NULL')
    check "switch leaves exactly one open administrator entry" $([ "$open_count" = 1 ]; echo $?)
    code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR_A" --data "submissionId=$admin_clock_out_id" -H "Origin: $APP" "$APP/api/time/clock-out")
    check "administrator can clock out" $([ "$code" = 303 ]; echo $?)
    open_count=$("$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -tAc 'SELECT COUNT(*) FROM "TimeEntry" e JOIN "User" u ON u.id=e."userId" WHERE u.username='\''alex.admin'\'' AND e."endedAt" IS NULL')
    check "clock-out leaves no open administrator entry" $([ "$open_count" = 0 ]; echo $?)
  else
    bad "synthetic project/work-code catalog was not seeded"
  fi
else
  bad "db container not found for time-tracking checks"
fi

# --- 4. Logout: CSRF guard, session revocation, SSO termination --------------
code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR_A" -X POST -H "Origin: http://evil.example" "$APP/auth/logout")
check "logout rejects a foreign Origin (CSRF guard)" $([ "$code" = 403 ]; echo $?)
code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR_A" "$APP/api/auth/session")
check "session is still valid before logout" $([ "$code" = 200 ]; echo $?)
# The POST remains same-origin so CSP form-action does not block the browser.
# A completion page then links to a one-time provider-logout route, whose fresh
# top-level navigation is permitted by the strict CSP.
location=$(curl -s -c "$JAR_A" -b "$JAR_A" -o /dev/null -w '%{redirect_url}' --data '' -H "Origin: $APP" "$APP/auth/logout")
check "logout POST lands on the same-origin completion page" $(printf '%s' "$location" | grep -q "$APP/auth/logout/complete"; echo $?)
code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR_A" "$APP/api/auth/session")
check "session is revoked after logout" $([ "$code" = 401 ]; echo $?)
curl -s -b "$JAR_A" "$location" | grep -q 'Continue sign out'
check "logout completion offers provider sign-out" $?
curl -s -L -c "$JAR_A" -b "$JAR_A" -o /dev/null -w '%{http_code}' "$APP/auth/logout/provider" > "$WORK/logout-code"
check "logout provider navigation completes" $([ "$(cat "$WORK/logout-code")" = "200" ]; echo $?)

# After an RP-initiated logout the Keycloak SSO session must be gone, so
# re-authenticating must present the login form rather than auto-login.
auth_url=$(begin_login "$JAR_A")
curl -s -L -c "$JAR_A" -b "$JAR_A" -o "$WORK/sso.html" -w '%{url_effective}' "$auth_url" > "$WORK/sso-url"
sso_url=$(cat "$WORK/sso-url")
if printf '%s' "$sso_url" | grep -q "$APP"; then
  check "Keycloak SSO session terminated by logout" 1
elif grep -q '<input' "$WORK/sso.html"; then
  check "Keycloak SSO session terminated by logout" 0
else
  check "Keycloak SSO session terminated by logout" 1
fi

# --- 5. Manager scope --------------------------------------------------------
JAR_M="$WORK/jar-morgan.txt"; rm -f "$JAR_M"
result=$(perform_login "$JAR_M" "morgan.manager" "${KEYCLOAK_MORGAN_PASSWORD}")
final_url=$(printf '%s' "$result" | awk '{print $1}')
final_code=$(printf '%s' "$result" | awk '{print $2}')
check "manager login lands on the dashboard" $(printf '%s' "$final_url" | grep -q "$APP/"; echo $?)
check "manager login returns 200" $([ "$final_code" = 200 ]; echo $?)
if [ -n "${DB_CONTAINER:-}" ] && [ -n "${project_id:-}" ] && [ -n "${denied_project_id:-}" ]; then
  morgan_id=$("$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -tAc 'SELECT id FROM "User" WHERE username='\''morgan.manager'\'' LIMIT 1')
  "$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -c "DELETE FROM \"ProjectMember\" WHERE \"userId\"='$morgan_id'::uuid; INSERT INTO \"ProjectMember\" (\"projectId\",\"userId\",role) VALUES ('$project_id'::uuid,'$morgan_id'::uuid,'MANAGER')" >/dev/null
  code=$(curl -s -o "$WORK/manager-report.html" -w '%{http_code}' -b "$JAR_M" "$APP/reports?year=$year&month=$month")
  check "manager can open the scoped report UI" $([ "$code" = 200 ] && grep -q 'Export protected CSV' "$WORK/manager-report.html"; echo $?)
  code=$(curl -s -D "$WORK/manager-report-headers" -o "$WORK/manager-report.csv" -w '%{http_code}' -b "$JAR_M" "$APP/api/reports/monthly.csv?year=$year&month=$month")
  check "manager can export a scoped monthly CSV" $([ "$code" = 200 ] && grep -qi 'content-type: text/csv' "$WORK/manager-report-headers"; echo $?)

  scoped_project_row=$("$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -AtF '|' -c "SELECT version,\"clientId\",\"statusId\",name,description,COALESCE(\"billingRateCents\"::text,''),languages,modules,extras,\"developmentServerName\",\"developmentServerPath\",\"productionServerName\",\"productionServerPath\",COALESCE(\"estimatedDesignMinutes\"::text,''),COALESCE(\"estimatedCodingMinutes\"::text,''),COALESCE(\"estimatedManagementMinutes\"::text,''),COALESCE(\"estimatedTestingMinutes\"::text,''),COALESCE(\"estimatedMaintenanceMinutes\"::text,''),COALESCE(\"coderId\"::text,''),COALESCE(\"developmentContactId\"::text,''),COALESCE(\"productionContactId\"::text,'') FROM \"Project\" WHERE id='$project_id'::uuid")
  IFS='|' read -r current_version scoped_client_id scoped_status_id scoped_name original_description scoped_billing_rate scoped_languages scoped_modules scoped_extras scoped_dev_name scoped_dev_path scoped_prod_name scoped_prod_path scoped_est_design scoped_est_coding scoped_est_management scoped_est_testing scoped_est_maintenance scoped_coder scoped_dev_contact scoped_prod_contact <<EOF
$scoped_project_row
EOF
  scoped_marker="Scoped manager update $(new_submission_id)"
  location=$(curl -s -o /dev/null -w '%{redirect_url}' -b "$JAR_M" \
    --data-urlencode "id=$project_id" --data-urlencode "version=$current_version" \
    --data-urlencode "clientId=$scoped_client_id" --data-urlencode "statusId=$scoped_status_id" \
    --data-urlencode "name=$scoped_name" --data-urlencode "description=$scoped_marker" \
    --data-urlencode "billingRate=$([ -n "$scoped_billing_rate" ] && printf '%s.%02d' $((scoped_billing_rate / 100)) $((scoped_billing_rate % 100)))" \
    --data-urlencode "languages=$scoped_languages" --data-urlencode "modules=$scoped_modules" \
    --data-urlencode "extras=$scoped_extras" --data-urlencode "developmentServerName=$scoped_dev_name" \
    --data-urlencode "developmentServerPath=$scoped_dev_path" --data-urlencode "productionServerName=$scoped_prod_name" \
    --data-urlencode "productionServerPath=$scoped_prod_path" --data-urlencode "estimatedDesignMinutes=$scoped_est_design" \
    --data-urlencode "estimatedCodingMinutes=$scoped_est_coding" --data-urlencode "estimatedManagementMinutes=$scoped_est_management" \
    --data-urlencode "estimatedTestingMinutes=$scoped_est_testing" --data-urlencode "estimatedMaintenanceMinutes=$scoped_est_maintenance" \
    --data-urlencode "coderId=$scoped_coder" --data-urlencode "developmentContactId=$scoped_dev_contact" \
    --data-urlencode "productionContactId=$scoped_prod_contact" -H "Origin: $APP" "$APP/api/projects/update")
  check "project-scoped manager can update the managed project" $(printf '%s' "$location" | grep -q "result=saved"; echo $?)
  persisted_marker=$("$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -tAc "SELECT description FROM \"Project\" WHERE id='$project_id'::uuid")
  check "manager project update persists within scope" $([ "$persisted_marker" = "$scoped_marker" ]; echo $?)

  denied_project_row=$("$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -AtF '|' -c "SELECT version,\"clientId\",\"statusId\",name,description FROM \"Project\" WHERE id='$denied_project_id'::uuid")
  IFS='|' read -r denied_version denied_client_id denied_status_id denied_name denied_description <<EOF
$denied_project_row
EOF
  location=$(curl -s -o /dev/null -w '%{redirect_url}' -b "$JAR_M" --data-urlencode "id=$denied_project_id" --data-urlencode "version=$denied_version" --data-urlencode "clientId=$denied_client_id" --data-urlencode "statusId=$denied_status_id" --data-urlencode "name=$denied_name" --data-urlencode 'description=must-not-persist' -H "Origin: $APP" "$APP/api/projects/update")
  check "manager update outside project scope fails closed" $(printf '%s' "$location" | grep -q 'result=not-allowed'; echo $?)
  unchanged_description=$("$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -tAc "SELECT description FROM \"Project\" WHERE id='$denied_project_id'::uuid")
  check "out-of-scope manager update has no side effect" $([ "$unchanged_description" = "$denied_description" ]; echo $?)

  "$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -c "UPDATE \"Project\" SET description='$original_description',version=$current_version WHERE id='$project_id'::uuid; DELETE FROM \"ProjectMember\" WHERE \"userId\"='$morgan_id'::uuid" >/dev/null
  code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR_M" -X POST -H "Origin: $APP" "$APP/auth/logout")
  check "manager logout succeeds" $([ "$code" = 303 -o "$code" = 200 ]; echo $?)
else
  bad "manager scope fixtures are unavailable"
fi

# --- 5. Employee login --------------------------------------------------------
JAR_B="$WORK/jar-casey.txt"; rm -f "$JAR_B"
result=$(perform_login "$JAR_B" "casey.employee" "${KEYCLOAK_CASEY_PASSWORD}")
final_url=$(printf '%s' "$result" | awk '{print $1}')
final_code=$(printf '%s' "$result" | awk '{print $2}')
check "employee login lands on the dashboard" $(printf '%s' "$final_url" | grep -q "$APP/"; echo $?)
check "employee login returns 200" $([ "$final_code" = 200 ]; echo $?)
curl -s -b "$JAR_B" "$APP/api/auth/session" | grep -q '"displayName":"Casey Lee"'
check "employee session reports the employee identity" $?
code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR_B" "$APP/api/reports/monthly.csv?year=2026&month=1")
check "employee report export fails closed" $([ "$code" = 403 ]; echo $?)
location=$(curl -s -o /dev/null -w '%{redirect_url}' -b "$JAR_B" "$APP/audit")
check "employee audit UI fails closed" $(printf '%s' "$location" | grep -q "$APP/"; echo $?)
location=$(curl -s -o /dev/null -w '%{redirect_url}' -b "$JAR_B" --data 'id=00000000-0000-4000-8000-000000000001&userId=00000000-0000-4000-8000-000000000002&version=1' -H "Origin: $APP" "$APP/api/people/link")
check "employee identity-link administration fails closed" $(printf '%s' "$location" | grep -q 'result=not-allowed'; echo $?)
if [ -n "${project_id:-}" ] && [ -n "${denied_project_id:-}" ] && [ -n "${engineering_id:-}" ]; then
  location=$(curl -s -o /dev/null -w '%{redirect_url}' -b "$JAR_B" --data "submissionId=$employee_denied_clock_id&projectId=$denied_project_id&workCodeId=$engineering_id&message=Must%20be%20denied" -H "Origin: $APP" "$APP/api/time/clock-in")
  check "unassigned employee clock-in fails closed" $(printf '%s' "$location" | grep -q 'result=not-allowed'; echo $?)
  employee_open=$("$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -tAc 'SELECT COUNT(*) FROM "TimeEntry" e JOIN "User" u ON u.id=e."userId" WHERE u.username='\''casey.employee'\'' AND e."endedAt" IS NULL')
  check "denied employee clock-in creates no open entry" $([ "$employee_open" = 0 ]; echo $?)

  casey_id=$("$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -tAc 'SELECT id FROM "User" WHERE username='\''casey.employee'\'' LIMIT 1')
  result=$(perform_login "$JAR_A" "alex.admin" "${KEYCLOAK_ALEX_PASSWORD}")
  admin_code=$(printf '%s' "$result" | awk '{print $2}')
  check "administrator can reauthenticate for membership administration" $([ "$admin_code" = 200 ]; echo $?)
  code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR_A" --data "projectId=$project_id&userId=$casey_id&role=CONTRIBUTOR" -H "Origin: http://evil.example" "$APP/api/projects/members")
  check "membership assignment rejects a foreign Origin" $([ "$code" = 403 ]; echo $?)
  code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR_A" --data "projectId=$project_id&userId=$casey_id&role=CONTRIBUTOR" -H "Origin: $APP" "$APP/api/projects/members")
  check "administrator can assign project membership" $([ "$code" = 303 ]; echo $?)
  membership_count=$("$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -tAc "SELECT COUNT(*) FROM \"ProjectMember\" WHERE \"projectId\"='$project_id'::uuid AND \"userId\"='$casey_id'::uuid AND role='CONTRIBUTOR'")
  check "membership assignment persists authorized scope" $([ "$membership_count" = 1 ]; echo $?)

  # Project documents cross a private quarantine/ClamAV boundary. The EICAR
  # string is generated at runtime and never committed as an upload fixture.
  code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR_B" \
    -H "Origin: http://evil.example" \
    -F "submissionId=00000000-0000-4000-8000-0000000000d1" \
    -F "document=@-;filename=denied.txt;type=text/plain" \
    "$APP/api/projects/$project_id/documents" <<'DOC'
foreign origin must not persist
DOC
  )
  check "document upload rejects a foreign Origin" $([ "$code" = 403 ]; echo $?)
  code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR_B" \
    -H "Origin: $APP" \
    -F "submissionId=00000000-0000-4000-8000-0000000000d1" \
    -F "document=@-;filename=e2e-notes.txt;type=text/plain" \
    "$APP/api/projects/$project_id/documents" <<'DOC'
E2E private clean document
DOC
  )
  check "assigned employee can upload a quarantined document" $([ "$code" = 303 ]; echo $?)
  clean_document_id=""
  scan_wait=0
  while [ "$scan_wait" -lt 30 ]; do
    clean_document_id=$("$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -tAc "SELECT id FROM \"ProjectDocument\" WHERE \"submissionId\"='00000000-0000-4000-8000-0000000000d1'::uuid AND status='AVAILABLE'")
    [ -n "$clean_document_id" ] && break
    scan_wait=$((scan_wait + 1)); sleep 1
  done
  check "clean document becomes available only after scanning" $([ -n "$clean_document_id" ]; echo $?)
  code=$(curl -s -D "$WORK/document-headers" -o "$WORK/document.txt" -w '%{http_code}' -b "$JAR_B" "$APP/api/projects/$project_id/documents/$clean_document_id/download")
  check "authorized document download is a private attachment" $([ "$code" = 200 ] && grep -qi '^content-disposition: attachment' "$WORK/document-headers" && grep -qi '^cache-control: private, no-store' "$WORK/document-headers" && grep -q 'E2E private clean document' "$WORK/document.txt"; echo $?)

  eicar='X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
  code=$(printf '%s' "$eicar" | curl -s -o /dev/null -w '%{http_code}' -b "$JAR_B" \
    -H "Origin: $APP" \
    -F "submissionId=00000000-0000-4000-8000-0000000000d2" \
    -F "document=@-;filename=eicar.txt;type=text/plain" \
    "$APP/api/projects/$project_id/documents")
  check "assigned employee can submit a malware-scanning test document" $([ "$code" = 303 ]; echo $?)
  infected_status=""
  scan_wait=0
  while [ "$scan_wait" -lt 30 ]; do
    infected_status=$("$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -tAc "SELECT status FROM \"ProjectDocument\" WHERE \"submissionId\"='00000000-0000-4000-8000-0000000000d2'::uuid")
    [ "$infected_status" = REJECTED ] && break
    scan_wait=$((scan_wait + 1)); sleep 1
  done
  check "ClamAV rejects EICAR and never makes it downloadable" $([ "$infected_status" = REJECTED ]; echo $?)

  code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR_B" --data "submissionId=$employee_clock_in_id&projectId=$project_id&workCodeId=$engineering_id&message=E2E%20employee" -H "Origin: $APP" "$APP/api/time/clock-in")
  check "assigned employee can clock in" $([ "$code" = 303 ]; echo $?)
  code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR_B" --data "submissionId=$employee_clock_in_id&projectId=$project_id&workCodeId=$engineering_id&message=E2E%20employee" -H "Origin: $APP" "$APP/api/time/clock-in")
  check "exact clock-in replay returns success" $([ "$code" = 303 ]; echo $?)
  location=$(curl -s -o /dev/null -w '%{redirect_url}' -b "$JAR_B" --data "submissionId=$employee_clock_in_id&projectId=$project_id&workCodeId=$engineering_id&message=Changed%20replay" -H "Origin: $APP" "$APP/api/time/clock-in")
  check "changed clock-in replay fails closed" $(printf '%s' "$location" | grep -q 'result=idempotency-conflict'; echo $?)
  employee_open=$("$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -tAc 'SELECT COUNT(*) FROM "TimeEntry" e JOIN "User" u ON u.id=e."userId" WHERE u.username='\''casey.employee'\'' AND e."endedAt" IS NULL')
  check "clock-in retry leaves exactly one open entry" $([ "$employee_open" = 1 ]; echo $?)
  replay_audits=$("$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -tAc "SELECT COUNT(*) FROM \"AuditEvent\" a JOIN \"ClockMutationReceipt\" r ON r.\"resourceId\"=a.\"resourceId\"::uuid JOIN \"User\" u ON u.id=r.\"userId\" WHERE u.username='casey.employee' AND r.\"submissionId\"='$employee_clock_in_id'::uuid AND a.action='TIME_CLOCK_IN' AND a.outcome='SUCCESS'")
  check "clock-in retry commits one success audit" $([ "$replay_audits" = 1 ]; echo $?)
  code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR_B" --data "submissionId=$employee_clock_out_id" -H "Origin: $APP" "$APP/api/time/clock-out")
  check "assigned employee can clock out" $([ "$code" = 303 ]; echo $?)
  correction_row=$("$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -AtF '|' -c 'SELECT e.id, e.version, to_char(e."startedAt" AT TIME ZONE '\''UTC'\'', '\''YYYY-MM-DD"T"HH24:MI:SS.MS'\''), to_char(e."endedAt" AT TIME ZONE '\''UTC'\'', '\''YYYY-MM-DD"T"HH24:MI:SS.MS'\'') FROM "TimeEntry" e JOIN "User" u ON u.id=e."userId" WHERE u.username='\''casey.employee'\'' AND e."endedAt" IS NOT NULL ORDER BY e."startedAt" DESC LIMIT 1')
  IFS='|' read -r correction_id correction_version correction_start correction_end <<EOF
$correction_row
EOF
  location=$(curl -s -o /dev/null -w '%{redirect_url}' -b "$JAR_B" --data-urlencode "id=$correction_id" --data-urlencode "version=$correction_version" --data-urlencode "startedAt=$correction_start" --data-urlencode "endedAt=$correction_end" --data-urlencode 'note=E2E corrected own time' -H "Origin: $APP" "$APP/api/time/correct")
  check "employee can correct own completed time with precision" $(printf '%s' "$location" | grep -q 'result=corrected'; echo $?)
  corrected_note=$("$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -tAc "SELECT note FROM \"TimeEntry\" WHERE id='$correction_id'::uuid")
  check "own-time correction persists refreshed state" $([ "$corrected_note" = 'E2E corrected own time' ]; echo $?)
  location=$(curl -s -o /dev/null -w '%{redirect_url}' -b "$JAR_B" --data "projectId=$denied_project_id&userId=$casey_id&role=MANAGER" -H "Origin: $APP" "$APP/api/projects/members")
  check "employee project administration fails closed" $(printf '%s' "$location" | grep -q 'result=not-allowed'; echo $?)
fi
code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR_B" -X POST -H "Origin: $APP" "$APP/auth/logout")
check "employee logout succeeds" $([ "$code" = "303" -o "$code" = "200" ]; echo $?)

# --- 5. Session cap and inactive users ------------------------------------------
# Independent browser jars prove that the sixth login revokes the oldest local
# application session without affecting the newest five.
cap_first=""; cap_last=""
cap_index=1
while [ "$cap_index" -le 6 ]; do
  cap_jar="$WORK/jar-cap-$cap_index.txt"
  result=$(perform_login "$cap_jar" "casey.employee" "${KEYCLOAK_CASEY_PASSWORD}")
  cap_code=$(printf '%s' "$result" | awk '{print $2}')
  [ "$cap_index" = 1 ] && cap_first=$cap_jar
  cap_last=$cap_jar
  [ "$cap_code" = 200 ] || break
  cap_index=$((cap_index + 1))
done
check "six independent employee logins complete" $([ "$cap_index" = 7 ]; echo $?)
code=$(curl -s -o /dev/null -w '%{http_code}' -b "$cap_first" "$APP/api/auth/session")
check "session cap revokes the oldest application session" $([ "$code" = 401 ]; echo $?)
code=$(curl -s -o /dev/null -w '%{http_code}' -b "$cap_last" "$APP/api/auth/session")
check "session cap preserves the newest application session" $([ "$code" = 200 ]; echo $?)

KEYCLOAK_CONTAINER=$("$PODMAN" ps --format '{{.Names}}' 2>/dev/null | grep -m1 -E 'keycloak-[0-9]+$' || true)
if [ -n "$KEYCLOAK_CONTAINER" ]; then
  KC_CONFIG=/tmp/ppts-e2e-kcadm.config
  "$PODMAN" exec "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh config credentials \
    --config "$KC_CONFIG" --server http://127.0.0.1:8080 --realm master \
    --user local-admin --password "$KEYCLOAK_ADMIN_PASSWORD" >/dev/null 2>&1
  brute_force=$("$PODMAN" exec "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh get realms/ppts \
    --config "$KC_CONFIG" --fields bruteForceProtected,failureFactor,waitIncrementSeconds \
    --format csv --noquotes 2>/dev/null)
  check "Keycloak brute-force protection is reconciled" $(printf '%s' "$brute_force" | grep -q '^true,5,60$'; echo $?)
  uid=$("$PODMAN" exec "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh get users \
    --config "$KC_CONFIG" -r ppts -q username=casey.employee --fields id \
    --format csv --noquotes 2>/dev/null | sed -n '1p')
  if [ -n "$uid" ]; then
    "$PODMAN" exec "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh update "users/$uid" \
      --config "$KC_CONFIG" -r ppts -s enabled=false >/dev/null 2>&1
    JAR_C="$WORK/jar-inactive.txt"; rm -f "$JAR_C"
    perform_login "$JAR_C" "casey.employee" "${KEYCLOAK_CASEY_PASSWORD}" > /dev/null
    code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR_C" "$APP/api/auth/session")
    check "disabled user cannot establish a session" $([ "$code" = 401 ]; echo $?)
    "$PODMAN" exec "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh update "users/$uid" \
      --config "$KC_CONFIG" -r ppts -s enabled=true >/dev/null 2>&1
  else
    bad "could not resolve casey.employee for the inactive-user test"
  fi
else
  bad "keycloak container not found for the inactive-user test"
fi

# --- 6. Audit trail --------------------------------------------------------------
DB_CONTAINER=$("$PODMAN" ps --format '{{.Names}}' 2>/dev/null | grep -m1 -E '(^|/)ppts-db-[0-9]+$' || true)
if [ -n "$DB_CONTAINER" ]; then
  rows=$("$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -tAc 'SELECT action || '"'"':'"'"' || COUNT(*) FROM "AuditEvent" GROUP BY action ORDER BY action' 2>/dev/null)
  case "$rows" in
    *AUTH_LOGIN:*) check "successful logins were audited" 0 ;;
    *) check "successful logins were audited" 1 ;;
  esac
  case "$rows" in
    *AUTH_LOGOUT:*) check "logout was audited" 0 ;;
    *) check "logout was audited" 1 ;;
  esac
  case "$rows" in
    *AUTH_LOGIN_FAILED:*) check "failed authentication attempts were audited" 0 ;;
    *) check "failed authentication attempts were audited" 1 ;;
  esac
  case "$rows" in
    *TIME_CLOCK_IN:*TIME_CLOCK_OUT:*TIME_SWITCH:*) check "successful time transitions were audited" 0 ;;
    *) check "successful time transitions were audited" 1 ;;
  esac
  case "$rows" in
    *PROJECT_MEMBER_ASSIGNED:*) check "project membership assignment was audited" 0 ;;
    *) check "project membership assignment was audited" 1 ;;
  esac
  failure_count=$("$PODMAN" exec "$DB_CONTAINER" psql -U ppts -d ppts -tAc 'SELECT COUNT(*) FROM "AuditEvent" WHERE action='\''TIME_CLOCK_IN'\'' AND outcome='\''FAILURE'\''')
  check "denied time transition was audited" $([ "$failure_count" -gt 0 ]; echo $?)
else
  bad "db container not found for the audit check"
fi

printf '\nE2E: %s passed, %s failed\n' "$pass" "$fail"
[ "$fail" = 0 ] || exit 1
echo "All E2E checks passed."
