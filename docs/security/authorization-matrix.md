# Authorization matrix

**Policy:** deny by default. “Own” means the target user ID equals the immutable ID from the authenticated server session. “Scoped” means active project/team membership verified server-side.

| Capability                       |           Employee |        Manager | Administrator |           Auditor |
| -------------------------------- | -----------------: | -------------: | ------------: | ----------------: |
| View limited status board        |                Yes |            Yes |           Yes |               Yes |
| Change own status/clock          |                Own |            Own |           Own |                No |
| View time entries                |                Own |         Scoped |           All | Granted read-only |
| Correct own completed time       |                Own |            Own |           Own |                No |
| Correct another person's time    |                 No |             No |            No |                No |
| Manage assigned projects/members |                 No |         Scoped |           All |                No |
| Manage clients/work codes        |                 No |             No |           All |                No |
| Manage people/roles              |                 No |             No |           All |                No |
| Read project documents           |             Scoped |         Scoped |           All |    Explicit grant |
| Write/delete project documents   | Scoped contributor | Scoped manager |           All |                No |
| Read security audit events       |                 No |             No |           All |                No |
| Read monthly reports / CSV       |                 No |         Scoped |           All |               All |

The shipped application implements limited global status-board reads, own status/clock changes, immediate correction of only the authenticated user's completed entries, and project-scoped private document list/upload/download/delete. Document writes require a non-auditor project member or administrator; reads require project scope or administrator. Every download rechecks current scope, only `AVAILABLE` objects may be issued, and pending/rejected/deleting objects are non-enumerating and inaccessible. Explicit auditor document grants remain a production-policy item and are not currently exposed. Administrators may link one active OIDC-provisioned login to one non-archived employee profile or unlink it; contacts cannot be linked, roles/passwords remain exclusively identity-provider managed, and database constraints plus row locking enforce one-to-one race safety. The original PPTS has no manager-approval workflow and explicitly limits correction to `REMOTE_USER`; manager and administrator roles therefore do not authorize cross-user correction. The application also implements project administration by administrators or managers with verified `ProjectRole.MANAGER` scope, scoped monthly HTML/CSV reports, and an administrator-only audit-events view. Report exports repeat server-side authorization and manager project scoping. The audit view is capped at 50 rows per page and exposes only an allowlist of non-sensitive metadata; request bodies, notes, tokens, identity claims, and arbitrary event metadata remain hidden. Status-board output excludes email, subject/issuer, roles, contact details, and time-entry detail.

Every row requires automated positive and negative tests before the capability ships. Administrator is not an authorization shortcut inside repositories; policies are explicit and auditable. Rows beyond the first-slice subset remain design policy, not a claim of complete implementation.
