import type { PptsRole } from "@/auth/roles";

export type Actor = Readonly<{ userId: string; roles: readonly PptsRole[] }>;

export type AuthorizationRequest =
  | { capability: "VIEW_STATUS_BOARD" }
  | { capability: "CHANGE_CLOCK"; targetUserId: string }
  | { capability: "VIEW_TIME"; targetUserId: string; scoped: boolean }
  | { capability: "MANAGE_PROJECT"; scoped: boolean }
  | { capability: "MANAGE_CLIENTS_AND_CODES" }
  | { capability: "MANAGE_PEOPLE_AND_ROLES" }
  | { capability: "READ_AUDIT"; scoped: boolean };

const has = (actor: Actor, role: PptsRole) => actor.roles.includes(role);

/**
 * Pure deny-by-default policy. Repository queries provide `scoped`; callers
 * cannot substitute a role check for project/team scope verification.
 */
export function can(actor: Actor, request: AuthorizationRequest): boolean {
  switch (request.capability) {
    case "VIEW_STATUS_BOARD":
      return actor.roles.length > 0;
    case "CHANGE_CLOCK":
      return !has(actor, "AUDITOR") && actor.userId === request.targetUserId;
    case "VIEW_TIME":
      if (has(actor, "ADMINISTRATOR")) return true;
      if (actor.userId === request.targetUserId) return true;
      if (has(actor, "AUDITOR")) return request.scoped;
      return has(actor, "MANAGER") && request.scoped;
    case "MANAGE_PROJECT":
      return has(actor, "ADMINISTRATOR") || (has(actor, "MANAGER") && request.scoped);
    case "MANAGE_CLIENTS_AND_CODES":
    case "MANAGE_PEOPLE_AND_ROLES":
      return has(actor, "ADMINISTRATOR");
    case "READ_AUDIT":
      return has(actor, "ADMINISTRATOR") || (has(actor, "AUDITOR") && request.scoped);
    default:
      return false;
  }
}

export function requireAllowed(actor: Actor, request: AuthorizationRequest): void {
  if (!can(actor, request)) throw new Error("forbidden");
}
