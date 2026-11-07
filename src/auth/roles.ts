/**
 * PPTS provisioning roles. Deliberately plain string literals so this module
 * stays importable from Node test runners without the generated Prisma client.
 * Values must match the `Role` enum in prisma/schema.prisma.
 */
export const PPTS_ROLES = ["EMPLOYEE", "MANAGER", "ADMINISTRATOR", "AUDITOR"] as const;
export type PptsRole = (typeof PPTS_ROLES)[number];

/**
 * Fail-closed role provisioning. Only roles explicitly recognized by the
 * application are accepted; a subject with no recognized role cannot be
 * provisioned, so a misconfigured mapper can never grant access by default.
 */
export function recognizeRoles(rawRoles: unknown): PptsRole[] {
  if (!Array.isArray(rawRoles)) return [];
  return [
    ...new Set(
      rawRoles.filter(
        (role): role is PptsRole =>
          typeof role === "string" && (PPTS_ROLES as readonly string[]).includes(role),
      ),
    ),
  ] as PptsRole[];
}

export function assertProvisionable(roles: readonly PptsRole[]) {
  if (roles.length === 0) throw new Error("no_authorized_role");
}

/** Most privileged recognized role, for display only. Never for authorization. */
export function displayRole(roles: readonly PptsRole[]): string {
  for (const role of ["ADMINISTRATOR", "AUDITOR", "MANAGER"] as const)
    if (roles.includes(role as PptsRole)) return role;
  return roles.includes("EMPLOYEE") ? "EMPLOYEE" : "Member";
}
