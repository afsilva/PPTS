import "server-only";
import { getDatabase } from "@/db/client";

/**
 * Persistence is best-effort: an authentication outcome must never 500 just
 * because audit storage failed. Failures are logged with sanitized data only.
 */
export async function auditAuth(input: {
  action: "AUTH_LOGIN" | "AUTH_LOGIN_FAILED" | "AUTH_LOGOUT";
  outcome: "SUCCESS" | "FAILURE";
  actorId?: string;
  /** Trusted provider identity, set only after successful token validation. */
  issuer?: string;
  subject?: string;
  requestId?: string | null;
  reason?: string;
}) {
  const clean = (value: string | null | undefined, max: number) =>
    value ? value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max) || undefined : undefined;
  try {
    await getDatabase().auditEvent.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        resourceType: "Session",
        outcome: input.outcome,
        requestId: clean(input.requestId, 100),
        metadata: {
          ...(input.issuer ? { issuer: clean(input.issuer, 255) } : {}),
          ...(input.subject ? { subject: clean(input.subject, 255) } : {}),
          ...(input.reason ? { reason: clean(input.reason, 80) } : {}),
        },
      },
    });
  } catch (error) {
    console.error(
      "[audit] failed to persist authentication event",
      error instanceof Error ? error.name : "unknown",
    );
  }
}
