import "server-only";
import { getDatabase } from "@/db/client";
import type { Actor } from "@/modules/authorization/policy";
import { BusinessError } from "@/modules/business/errors";

export async function auditMutationFailure(
  actor: Actor,
  action: string,
  error: unknown,
  resourceType = "TimeEntry",
) {
  const reason = error instanceof BusinessError ? error.code : "INVALID_REQUEST";
  try {
    await getDatabase().auditEvent.create({
      data: {
        actorId: actor.userId,
        action,
        resourceType,
        outcome: "FAILURE",
        metadata: { reason },
      },
    });
  } catch (auditError) {
    console.error(
      "[audit] failed to persist business mutation failure",
      auditError instanceof Error ? auditError.name : "unknown",
    );
  }
}
