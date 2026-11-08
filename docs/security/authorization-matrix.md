# Authorization matrix

**Policy:** deny by default. “Own” means the target user ID equals the immutable ID from the authenticated server session. “Scoped” means active project/team membership verified server-side.

| Capability                       |           Employee |                Manager | Administrator |           Auditor |
| -------------------------------- | -----------------: | ---------------------: | ------------: | ----------------: |
| View limited status board        |                Yes |                    Yes |           Yes |               Yes |
| Change own status/clock          |                Own |                    Own |           Own |                No |
| View time entries                |                Own |                 Scoped |           All | Granted read-only |
| Request correction               |                Own |                    Own |           Own |                No |
| Approve/correct time             |                 No |                 Scoped |           All |                No |
| Manage assigned projects/members |                 No |                 Scoped |           All |                No |
| Manage clients/work codes        |                 No |                     No |           All |                No |
| Manage people/roles              |                 No |                     No |           All |                No |
| Read project documents           |             Scoped |                 Scoped |           All |    Explicit grant |
| Write/delete project documents   | Scoped contributor |         Scoped manager |           All |                No |
| Read security audit events       |                 No | Scoped business events |           All |    Explicit grant |

The shipped first slice implements limited global status-board reads, own status/clock changes, and project-member assignment by administrators or managers with verified `ProjectRole.MANAGER` scope. Status-board output is restricted to display name, coarse presence state, and a bounded status message or project display name; it excludes email, subject/issuer, roles, contact details, and time-entry detail. Membership forms expose only active user display names and active projects within the actor's management scope.

Every row requires automated positive and negative tests before the capability ships. Administrator is not an authorization shortcut inside repositories; policies are explicit and auditable. Rows beyond the first-slice subset remain design policy, not a claim of complete implementation.
