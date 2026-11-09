# Legacy PPTS functional parity

**Source inspected:** `original/ppts-2.0alpha3.tar` (May 2001) · **Reviewed:** 2026-11-08

The archive is a Perl CGI/MySQL application with eight logical tables and three connected areas: employee presence/time clock, project knowledge (metadata, journal, documents), and administration/monthly reports. This document is the modernization acceptance checklist. “Parity” means preserving useful business outcomes, not reproducing insecure defects.

## Legacy behavior inventory

| Legacy capability                                                  | Modern status            | Deliberate modernization                                                                                                                                                  |
| ------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Employee status board, message, updated time, current project      | Implemented              | Session identity; bounded output; normalized presence state                                                                                                               |
| Clock in/out, project/work-code switch, active entry               | Implemented              | Transactional state machine, server timestamps, one-open-entry constraint, actor-scoped replay receipts                                                                   |
| Available/off-duty states                                          | Implemented              | Explicit states instead of special project ID `1`                                                                                                                         |
| Own recent time and totals                                         | Implemented              | Correct interval clipping rather than legacy duration bugs                                                                                                                |
| Keycloak login and roles                                           | Implemented              | OIDC code + PKCE; revocable local sessions; deny-by-default authorization                                                                                                 |
| Project membership                                                 | Implemented              | Server-verified scope; legacy had no access control                                                                                                                       |
| Client/project-status/project/work-code creation and archive/state | Implemented              | Administrator-only, validated, audited, relational integrity, and durable real-Chromium lifecycle acceptance                                                              |
| Current/historical monthly report by client/project/person         | Implemented              | Dynamic year, IANA timezone/DST clipping, stable user identity, scoped HTML/formula-safe CSV, and checksum-bound synthetic legacy reconciliation fixtures                 |
| Worker/contact profiles and people lifecycle                       | Implemented              | Administrator-only records, optional one-to-one active-login link for employees, archive and optimistic concurrency                                                       |
| Full project technical/contact/estimate metadata                   | Implemented              | Scoped editor with constrained employee coder and contact selections                                                                                                      |
| Project journal                                                    | Implemented              | Authenticated immutable author, scoped read/write, and bounded plain text                                                                                                 |
| Project documents                                                  | Local parity implemented | Private opaque storage, quarantine, validation/hash, fail-closed ClamAV, quotas, scoped download/delete; production object-store gate remains                             |
| Own completed-time correction                                      | Implemented              | Immediate own-only edit, matching `REMOTE_USER` legacy behavior; adds precision preservation, pagination, no-op/concurrency/interval/overlap validation, and atomic audit |
| Legacy import                                                      | Not implemented          | Dump contains schema but no data; ETL must detect orphans and produce reconciliation totals                                                                               |

## Preserved business rules

- Only active, non-archived projects and active work codes may receive new time.
- Starting work opens an entry; switching atomically closes it and opens another; stopping closes it and clears the current project.
- Reports group by client/project/person and hide empty projects.
- Employees and contacts remain conceptually distinct; project coder must ultimately be an employee while server contacts may be contacts.
- Archive is preferred to destructive deletion wherever historical time or audit data exists.
- A user may directly correct only their own completed time. The legacy `fixTime.cgi` filters by `REMOTE_USER`, updates immediately, and explicitly instructs users to contact the owner rather than edit another person's time; it has no approval workflow.

## Corrected legacy defects

The port intentionally does **not** preserve: blank MySQL root password, SQL string concatenation, browser-trusted user IDs, project ID `1` as “off clock,” zero dates, hard-coded report years, month allocation solely by end time, ignored multi-day duration, `60 minutes` formatting, public upload directories, path-derived project folders, hard deletes that orphan rows, unauthenticated admin URLs, or hidden-field journal attribution.

## Remaining acceptance work

1. Approve the production `ORGANIZATION_TIME_ZONE` value; UTC remains the safe local default and DST/month-boundary fixtures are automated.
2. Complete Keycloak role lifecycle and production synchronization; account-to-person linking is now administrator-only, one-to-one, and limited to active accounts and employee profiles.
3. Replace the local private named-volume boundary with independently credentialed encrypted object storage and approve production format/quota/retention/legal-hold/scanner-freshness policy before production document enablement. Local quarantine, validation, scanning, download, and delete parity is implemented.
4. Build idempotent legacy ETL with dry run, orphan report, document hashes, and source/target reconciliation through the same quarantine/scanning pipeline. The report fixture now establishes the per-project/person/month reconciliation contract for imported time.

Real-Chromium acceptance covers administrator catalog creation/update/state/archive, people creation/update/archive, project creation/detail update/contact clearing, journal creation, pending labels, authoritative refresh, Keycloak login, nonce-CSP hydration, and browser error capture. The synthetic report fixture is bound to the reviewed archive checksum and proves ordinary totals remain compatible while explicitly quantifying corrected legacy defects: selection solely by `EndTime`, discarded whole days, and failure to carry exactly 60 minutes.

The original archive remains an unmodified historical input. It must never be copied into a runtime image or served by the application.
