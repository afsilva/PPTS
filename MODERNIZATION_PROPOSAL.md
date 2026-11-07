# PPTS Modernization Proposal

**Reviewed artifact:** `ppts-2.0alpha3.tar` (March 2001, roughly 7,670 lines)  
**Review date:** 2026-11-07  
**Security baseline:** [OWASP Top 10:2025](https://top10.owasp.org/2025/)

## Executive summary

PPTS is a compact intranet application that combines:

- an employee status board (in/out/current project/message),
- project, client, worker, status, and work-code administration,
- time-clock entries and monthly reports,
- project notes/logs,
- project document upload/list/delete.

The underlying product remains useful, but this code should not be exposed to a modern network. It predates contemporary application-security practices and contains systemic SQL injection, weak object-level authorization, unsafe file handling, unescaped output, no application-level identity/role model, no CSRF protection, obsolete dependencies, and error disclosure. These are architectural issues, so patching each CGI is unlikely to be safe or economical.

I recommend a **modular monolith**, not microservices: a server-rendered TypeScript application using **Next.js (current supported release), PostgreSQL, Prisma, and an OpenID Connect identity provider**. Keep JavaScript minimal and progressively enhance the status board. Run the app and database in separate containers, store documents in private S3-compatible object storage, and put all authorization in server-side policy functions.

The preferred migration is an incremental, tested replacement with a final read-only legacy period—not a line-by-line port.

## What the current application does

| Area | Current implementation |
|---|---|
| Dashboard/status board | `index.cgi`, `in_out.cgi`, `board` |
| Workers/directory | `viewWorkers.cgi`, `admin/*Workers.cgi`, `workers` |
| Clients/projects | `admin/*Clients.cgi`, `admin/*Projects.cgi`, `projects`, `clients`, `projectstatus` |
| Time tracking | `in_out.cgi`, `admin/fixTime.cgi`, `timelog`, `workcode` |
| Reporting | `reports/myreport.cgi`, `reports/myoldreport.cgi` |
| Project notes | `prots/insert_log.cgi`, `prots/view_logs.cgi`, `projectlog` |
| Documents | `prots/upload.cgi`, `view_documents.cgi`, `delete_file.cgi`, local filesystem |

The schema has nine MyISAM tables and no foreign keys. Identity is represented mainly by Apache's `REMOTE_USER` and mutable usernames. The code does not express a reliable distinction between regular users, project managers, and administrators.

## Material findings from the inspection

This is a source review, not a penetration test. Findings are examples of repeated patterns.

### Critical

1. **SQL injection and mass assignment**
   - SQL is assembled by concatenating form keys and values. See `admin/insertWorkers.cgi:105-116` and `in_out.cgi:391-407`.
   - IDs and report parameters are inserted directly into queries, e.g. `prots/view_logs.cgi:87`, `viewWorkers.cgi:92`, and `reports/myoldreport.cgi:118`.
   - Calling DBI `prepare()` does not make a concatenated query parameterized.
   - User-controlled field names are accepted in generic insert/update loops, which is also mass assignment.

2. **Broken access control / insecure direct object references**
   - Requests can select arbitrary worker, project, log, and file IDs; there is no consistent server-side ownership or role check.
   - `in_out.cgi` accepts `USERID`, `username`, `STATUS`, and `newentry` from the client and applies updates.
   - `delete_file.cgi` has its POST check commented out and deletes a client-supplied directory/filename (`:33-40`, `:62-65`).
   - Admin scripts do not implement an application authorization guard. Protection appears to depend on external web-server configuration, which is not included in the artifact and cannot provide object-level authorization.

3. **Unsafe document operations**
   - Upload names and project/client fields determine filesystem paths (`prots/upload.cgi:33-62`). There is no reliable canonical-path containment check, allowlist, content inspection, size quota, or authorization policy.
   - Documents appear to be served directly from the web tree, potentially allowing active content execution or stored XSS.
   - Deletion is vulnerable to path traversal and has no CSRF defense.

### High

4. **Stored/reflected cross-site scripting**
   - Templates render database and request values with plain `TMPL_VAR`; output encoding is not consistently enabled. Examples include project logs, names, messages, server paths, and error messages.
   - The custom “dangerous character” escaping is context-insensitive and cannot safely encode HTML text, attributes, URLs, JavaScript, and SQL.

5. **No CSRF protection**
   - State-changing forms contain no anti-CSRF token. Some mutation endpoints only check POST; others have that check disabled. POST alone is not CSRF protection.

6. **Weak authentication/session architecture**
   - The application trusts `REMOTE_USER`, but the package contains no authentication/session policy, MFA support, role model, session expiry, or reauthentication for sensitive operations.
   - Usernames are used as time-entry identities rather than immutable user IDs.

7. **Sensitive data and secrets handling**
   - Database credentials are in source configuration and default to a passwordless MySQL root account (`Conf/Configuration.pm`).
   - Worker home address, home/cell phone, and birthday are broadly exposed without a privacy/field-level authorization model.
   - There is no evidence of TLS enforcement, encryption at rest, retention, or secure backup policy.

### Medium/high

8. **Integrity and concurrency flaws**
   - MyISAM provides no foreign keys or transactions. Multi-step operations can partially complete.
   - `insertWorkers.cgi` reselects a newly inserted worker by first and last name rather than using the generated ID (`:119-136`).
   - Clock state is duplicated between `board.NEWENTRY` and `timelog`; concurrent updates can create overlapping/open entries.
   - Sentinel project IDs and zero dates encode application state implicitly.

9. **Security misconfiguration and error disclosure**
   - `CGI::Carp 'fatalsToBrowser'` and HTML database errors disclose internals.
   - No security headers, request-size limits, rate limiting, trusted-proxy policy, or production-safe error boundary are apparent.
   - Uploaded directories use mode `0755`, and the upload tree lives under the application.

10. **No security audit trail or alerting**
    - There is no durable record of login failures, authorization failures, admin changes, document operations, or time-entry corrections. Project logs are business notes, not security logs.

11. **Obsolete supply chain**
    - Perl CGI, CGI_Lite, old HTML::Template/DBI expectations, Apache CGI, and MySQL 3-era schema are unsupported or difficult to assure. There is no lockfile, SBOM, provenance, automated scanning, or patch policy.

12. **Exceptional-condition mishandling**
    - Database errors sometimes exit with a successful response, mutations are not transactional, missing rows and malformed values are weakly handled, and `system("mv", ...)` can leave uploads in inconsistent states.

## Proposed product scope

### Preserve in the first release

- Sign-in and role-aware navigation.
- Staff status board.
- Clock in/out or switch project/work code, with optional note.
- Personal time history and correction request/correction workflow.
- Client, project, project-status, worker, and work-code management.
- Monthly reporting by project/person/work code; CSV export.
- Project notes.
- Private project document upload, download, and deletion.

### Deliberately defer

- Billing/invoicing and payroll integrations.
- Native mobile app (ship a responsive web/PWA experience first).
- Microservices, event streaming, and a public API unless real consumers emerge.
- Rich HTML in notes. Store/render plain text or tightly sanitized Markdown only.

## Recommended architecture

### Technology choice

- **Application:** TypeScript with Next.js on the current supported LTS Node.js release.
- **UI:** server-rendered React, semantic HTML, accessible component primitives, and a small design system. Prefer server actions/route handlers over a separate SPA API.
- **Validation:** Zod schemas at every trust boundary.
- **Database:** PostgreSQL with Prisma migrations and explicit transactions.
- **Authentication:** OpenID Connect using the organization's IdP (Entra ID, Okta, Auth0, Keycloak, etc.); require MFA through IdP policy. If local accounts are unavoidable, use a mature auth library and Argon2id—never custom auth.
- **Authorization:** centralized RBAC plus resource membership checks. Deny by default.
- **Documents:** private S3-compatible object storage. Objects use random keys; original filename is metadata. Downloads use short-lived authorized responses/URLs.
- **Operations:** OCI container, non-root/read-only filesystem, managed PostgreSQL/object storage where possible, TLS reverse proxy, OpenTelemetry, structured JSON logs, error tracking, and metrics/alerts.
- **Delivery:** GitHub Actions (or equivalent), Dependabot/Renovate, CodeQL/Semgrep, secret scanning, lockfile verification, SBOM, signed images, migration checks, unit/integration/E2E tests, and DAST against staging.

Choose exact versions when implementation begins and pin them in lockfiles/container digests. “Latest” without a maintenance policy is not a security control.

### Why a modular monolith

PPTS is about 7.7K lines and has one cohesive relational domain. A modular monolith gives straightforward transactions and authorization, simpler deployment, lower operating cost, and fewer network trust boundaries. Suggested modules:

```text
src/
  modules/
    identity/       # IdP user mapping and roles
    people/         # staff profiles and privacy rules
    clients/
    projects/       # project membership/status/notes
    time-tracking/  # clock transitions and corrections
    documents/      # metadata and storage adapter
    reports/
    audit/
  security/         # policy checks, CSRF/origin, rate limits
  db/
```

Browser → TLS reverse proxy/WAF (optional) → application → PostgreSQL  
                                                ↘ private object storage  
                                                ↘ logs/metrics/alerts

Do not let the browser choose an acting user ID. The acting user always comes from the validated server session.

## Authorization model

| Capability | Employee | Manager | Administrator | Auditor |
|---|---:|---:|---:|---:|
| View status board | Yes, limited fields | Yes | Yes | Yes |
| Change own status/clock | Yes | Yes | Yes | No |
| View own entries | Yes | Yes | Yes | Yes |
| View project/team entries | No by default | Assigned projects/team | Yes | Yes, read-only |
| Correct time | Request/self within policy | Team/project policy | Yes | No |
| Manage projects/clients/codes | No | Assigned scope | Yes | No |
| Manage people/roles | No | No | Yes | No |
| Manage documents | Assigned projects | Assigned projects | Yes | Read-only if granted |
| View audit events | No | Scoped | Yes | Yes |

Enforce these checks in application services for every operation; hiding a button is not authorization. For high-assurance deployments, add PostgreSQL row-level security as defense in depth after application policies are stable.

## Proposed data model

Use UUID/ULID primary keys, UTC `timestamptz`, `created_at`, `updated_at`, and optimistic version fields where concurrent editing matters.

- `users(id, idp_subject UNIQUE, username UNIQUE, display_name, email, active)`
- `roles`, `user_roles`
- `worker_profiles(user_id FK, title, work_phone, private_contact_fields...)`
- `clients(id, name, archived_at)`
- `project_statuses(id, name, description)`
- `projects(id, client_id FK, status_id FK, name, description, billing_rate_cents, archived_at, ...)`
- `project_members(project_id, user_id, project_role)`
- `work_codes(id, name, description, active)`
- `presence(user_id UNIQUE, state, project_id NULL, message, updated_at, version)`
- `time_entries(id, user_id FK, project_id FK, work_code_id FK, started_at, ended_at NULL, note, source, version)`
- `time_entry_corrections(id, entry_id, requested_by, approved_by, before_json, after_json, reason, status, ...)`
- `project_notes(id, project_id FK, author_id FK, body, created_at)`
- `documents(id, project_id FK, object_key UNIQUE, original_name, media_type, byte_size, sha256, scan_status, uploaded_by, deleted_at)`
- `audit_events(id, occurred_at, actor_id, action, resource_type, resource_id, outcome, request_id, ip_prefix, metadata_json)`

Important constraints:

- one open time entry per user (partial unique index where `ended_at IS NULL`),
- `ended_at > started_at`,
- nonnegative sizes/rates,
- normalized unique names where business rules require them,
- foreign keys with explicit delete behavior,
- no sentinel IDs or zero dates,
- soft-delete/archive business entities; retain time/audit records per policy.

Clock/switch operations must run in one transaction and lock the user's open entry. Never trust client-supplied duration; calculate it server-side from stored timestamps.

## OWASP Top 10:2025 control plan

| Category | Rewrite controls | Verification |
|---|---|---|
| **A01 Broken Access Control** | Deny-by-default server policies; derive actor from session; RBAC + project/team membership; opaque IDs; private objects; CSRF/origin checks; no directory traversal; CORS disabled unless needed | Authorization matrix tests, object-level negative tests, ZAP/Burp checks |
| **A02 Security Misconfiguration** | Hardened production profile; no debug output; TLS/HSTS; CSP with nonces, `frame-ancestors`, `nosniff`, Referrer/Permissions policies; secure cookies; request/body limits; least-privilege DB/storage accounts; non-root container | IaC/container scanning, header tests, environment config tests |
| **A03 Software Supply Chain Failures** | Pinned lockfile and image digests; protected reviews; automated dependency updates; SCA, secret scan, SBOM (CycloneDX/SPDX), signed provenance/images; supported runtimes; patch SLA | CI gates, scheduled scans, release attestations |
| **A04 Cryptographic Failures** | TLS 1.2+ (prefer 1.3); managed encryption at rest/backups; secrets manager and rotation; secure `HttpOnly`, `Secure`, `SameSite` cookies; minimize/retention-protect PII; never log tokens | TLS tests, secret rotation drill, data inventory/review |
| **A05 Injection** | ORM/query builder with parameter binding; allowlisted sort/filter fields; typed validation and length limits; framework auto-escaping; no raw HTML; sanitized Markdown only if required; no shell calls for storage | SAST, injection tests, property/fuzz tests |
| **A06 Insecure Design** | Threat model and abuse cases; explicit state machine for clock transitions; transaction/idempotency design; upload quarantine/scan; quotas; correction approval; privacy model | Design review, invariant/concurrency tests, abuse-case E2E tests |
| **A07 Authentication Failures** | OIDC Authorization Code + PKCE; MFA; short sessions and rotation; logout/revocation; login rate limits at IdP/edge; no account enumeration; reauth for role/security changes | OIDC conformance/config review, session tests |
| **A08 Software or Data Integrity Failures** | Protected CI, signed releases, migration checksums, immutable audit events, document SHA-256, malware scanning/quarantine, verified backups/restores, strict webhook signatures if added | Signature/checksum tests, restore drills, pipeline review |
| **A09 Security Logging & Alerting Failures** | Structured audit/security logs; request/correlation IDs; log authz failures and admin/document/time corrections; redact secrets/PII; centralized tamper-resistant storage; alerts and runbooks | Alert simulation, log-content tests, incident exercises |
| **A10 Mishandling of Exceptional Conditions** | Central typed error boundary; fail closed; transactions/rollback; timeouts and resource limits; generic user errors; explicit 4xx/5xx; graceful storage/DB failures; idempotent mutations | Fault injection, timeout/retry tests, malformed input tests |

Use **OWASP ASVS 5.0 Level 2** as the release verification checklist; Top 10 is an awareness/risk taxonomy, not a complete acceptance standard.

## Document security design

Uploads deserve a dedicated flow:

1. Authorize project membership before accepting content.
2. Enforce size/count quotas at proxy and application layers.
3. Generate an object key; never use the supplied filename as a path.
4. Normalize the display filename and reject control characters.
5. Verify file signatures/content, not only extension or browser MIME type.
6. Allow only required formats; initially PDF, plain text, and selected office/image types.
7. Upload into a quarantine bucket/prefix, calculate SHA-256, and malware-scan asynchronously.
8. Make content downloadable only after a clean result; force attachment for risky formats.
9. Keep the bucket private, disable public ACLs/versioning changes, and separate it from the app origin.
10. Log upload, scan, download, and deletion. Use soft deletion and retention/versioning as policy requires.

## Migration plan

### Phase 0 — Discovery and containment (1–2 weeks)

- Confirm workflows with users and decide which legacy fields are still needed.
- Inventory the real deployment: Apache authentication/config, current DB, document tree, users/roles, backups, and data volume.
- If the legacy system is running: restrict it to VPN/private network, enforce TLS, back it up, make DB credentials least-privileged, disable or tightly restrict upload/delete, and add reverse-proxy access logging.
- Create a threat model, data classification, retention rules, authorization matrix, and ASVS L2 checklist.

### Phase 1 — Foundation (1–2 weeks)

- Repository, ADRs, lint/format/type checking, test harness, CI security gates, dev containers, deployment/IaC.
- OIDC integration, secure session handling, role/policy module, audit service, migrations, observability, and production-safe error handling.

### Phase 2 — Core domain (2–3 weeks)

- Migrate people, clients, projects, statuses, work codes, and project memberships.
- Build admin screens with validation, archive behavior, authorization, and audit events.
- Implement a repeatable ETL script with source-to-target counts and rejected-row reports.

### Phase 3 — Status and time tracking (2–3 weeks)

- Implement transactional clock state machine: `OFF_DUTY`, `AVAILABLE`, `WORKING`.
- Status board, own-entry history, correction workflow, concurrency/idempotency tests.
- Decide explicitly whether “available but not on a project” is time-tracked.

### Phase 4 — Reports, notes, and documents (2–3 weeks)

- Build timezone-aware monthly reports and CSV export; compare totals with legacy fixtures.
- Migrate project notes as plain text.
- Build private object-storage workflow, quarantine/scanning, quotas, and audit trail.
- Import files using a manifest of legacy path, target key, size, hash, project mapping, and disposition.

### Phase 5 — Verification and cutover (1–2 weeks)

- Unit, integration, E2E, authorization, concurrency, migration reconciliation, accessibility, performance, backup/restore, SAST/SCA/DAST, and independent security review.
- Dry-run migrations on restored production copies; record runtime and reconciliation.
- Freeze legacy writes, final backup, run delta/final ETL, reconcile, smoke test, switch traffic.
- Keep legacy read-only and private for an agreed rollback/records period, then securely retire it and rotate all old credentials.

A small experienced team should expect roughly **10–14 weeks**, subject to data quality, unknown deployment configuration, and requirements discovered during workflow review.

## Data migration details

- Never connect the new production app directly to live legacy tables for normal operation.
- Export a consistent snapshot and retain an immutable copy plus checksums.
- Decode legacy character encoding explicitly (likely Latin-1/Windows-1252; verify rather than assume) and write UTF-8.
- Convert zero/invalid dates to `NULL` with a migration warning.
- Map `employee`/archive flags to booleans/timestamps.
- Resolve text `timelog.UserID` and `projectlog.UserID` to immutable users; quarantine ambiguous/missing matches.
- Convert MySQL timestamps using the confirmed historical server timezone, then store UTC.
- Preserve old IDs in migration mapping tables, not as public identifiers.
- Recalculate entry durations and report totals; compare per user/project/month with legacy output.
- Identify overlapping/open entries and decide remediation with the business owner instead of silently changing them.
- Hash every migrated document and report missing, duplicate, unsafe, or orphaned files.
- Treat legacy HTML-like content as untrusted plain text unless separately reviewed and sanitized.

## Acceptance criteria for release

- Every route/action has an explicit authentication and authorization policy test.
- No raw SQL with interpolated values; no user-controlled column/table names.
- No user-controlled filesystem paths and no public object-storage access.
- Mutations have CSRF/origin protection; session cookies have secure attributes.
- CSP is enforced without unsafe inline script; all output is contextually encoded.
- One open entry per user is enforced in the database and under concurrent requests.
- Migration reconciles all entities, time totals, and documents, with explained exceptions.
- ASVS L2 review is complete; critical/high SAST/SCA/DAST findings are resolved or formally risk-accepted.
- Backup restoration and rollback are rehearsed.
- Security alerts have an owner, tested delivery, and response runbooks.
- WCAG 2.2 AA checks cover core workflows.

## Immediate next decisions

1. Which IdP should own identity and MFA?
2. Are deployments single-company or multi-tenant? (Do not add tenancy unless required; if required, put `organization_id` in every relevant key/policy from day one.)
3. Who may see employee home contact details and birthdays—and should those fields be migrated at all?
4. Who can view/correct whose time, and is approval required?
5. Which document formats, maximum sizes, retention periods, and scan service are required?
6. Which timezone governs reports, and how should daylight-saving transitions be displayed?
7. Is the project billing rate still needed, and is it sensitive?
8. Is compatibility with old URLs/API behavior required? The source suggests no external API, so avoid preserving unsafe CGI request shapes.

## Recommendation

Approve a clean, modular-monolith rewrite and begin with discovery plus a migration spike. Build authentication/authorization, auditability, and the time-entry state machine before UI breadth. Do not expose the legacy CGI application publicly, and do not perform a mechanical Perl-to-TypeScript translation: preserving its request and persistence patterns would preserve its vulnerabilities.
