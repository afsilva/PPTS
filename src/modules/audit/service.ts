import "server-only";
import { getDatabase } from "@/db/client";
import type { Actor } from "@/modules/authorization/policy";
import { requireAllowed } from "@/modules/authorization/policy";
import { BusinessError } from "@/modules/business/errors";

export const AUDIT_PAGE_SIZE = 50;
const MAX_AUDIT_PAGE = 1000;

export function parseAuditPage(value: string | undefined) {
  const page = Number(value ?? "1");
  if (!Number.isSafeInteger(page) || page < 1 || page > MAX_AUDIT_PAGE)
    throw new BusinessError("INVALID_TARGET");
  return page;
}

function publicMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const source = metadata as Record<string, unknown>;
  const result: Record<string, string> = {};
  // Only stable, non-sensitive operational fields may reach the UI. Submitted
  // bodies, notes, tokens, provider claims, and arbitrary metadata stay hidden.
  for (const key of ["reason", "previousRole"] as const) {
    const value = source[key];
    if (typeof value === "string") result[key] = value.slice(0, 80);
  }
  return result;
}

export async function getAuditEvents(actor: Actor, page: number) {
  try {
    requireAllowed(actor, { capability: "READ_AUDIT", scoped: false });
  } catch {
    throw new BusinessError("FORBIDDEN");
  }
  if (!Number.isSafeInteger(page) || page < 1 || page > MAX_AUDIT_PAGE)
    throw new BusinessError("INVALID_TARGET");

  const rows = await getDatabase().auditEvent.findMany({
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * AUDIT_PAGE_SIZE,
    take: AUDIT_PAGE_SIZE + 1,
    select: {
      id: true,
      occurredAt: true,
      action: true,
      resourceType: true,
      resourceId: true,
      outcome: true,
      metadata: true,
      actor: { select: { displayName: true } },
    },
  });
  return {
    events: rows.slice(0, AUDIT_PAGE_SIZE).map(({ metadata, ...event }) => ({
      ...event,
      metadata: publicMetadata(metadata),
    })),
    page,
    hasNext: rows.length > AUDIT_PAGE_SIZE,
  };
}
