import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { Prisma, type ProjectDocument } from "@/generated/prisma/client";
import { getDocumentConfig } from "@/config/documents";
import { getDatabase } from "@/db/client";
import type { Actor } from "@/modules/authorization/policy";
import { requireAllowed } from "@/modules/authorization/policy";
import { BusinessError } from "@/modules/business/errors";
import type { DocumentDeleteInput } from "./schemas";
import { scanDocument } from "./scanner";
import {
  deleteDocumentObject,
  documentObjectSize,
  promoteDocumentObject,
  readDocumentObject,
  streamDocumentObject,
  writeDocumentObject,
} from "./storage";
import { validateDocument } from "./validation";
import type { DocumentUpload } from "./multipart";

const activeStatuses = [
  "UPLOADING",
  "QUARANTINED",
  "SCANNING",
  "SCAN_FAILED",
  "AVAILABLE",
] as const;

async function scope(actor: Actor, projectId: string) {
  const db = getDatabase();
  const user = await db.user.findUnique({
    where: { id: actor.userId },
    select: { active: true },
  });
  if (!user?.active) throw new BusinessError("FORBIDDEN");
  if (actor.roles.includes("ADMINISTRATOR")) return true;
  return Boolean(
    await db.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: actor.userId } },
      select: { userId: true },
    }),
  );
}

function allowed(
  actor: Actor,
  capability: "READ_PROJECT_DOCUMENT" | "WRITE_PROJECT_DOCUMENT" | "DELETE_PROJECT_DOCUMENT",
  scoped: boolean,
) {
  try {
    requireAllowed(actor, { capability, scoped });
  } catch {
    throw new BusinessError("FORBIDDEN");
  }
}

export async function listProjectDocuments(actor: Actor, projectId: string) {
  allowed(actor, "READ_PROJECT_DOCUMENT", await scope(actor, projectId));
  return getDatabase().projectDocument.findMany({
    where: { projectId, status: { notIn: ["DELETE_PENDING", "DELETED"] } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      originalName: true,
      mediaType: true,
      sizeBytes: true,
      status: true,
      version: true,
      createdAt: true,
      uploadedBy: { select: { displayName: true } },
    },
  });
}

export async function uploadProjectDocument(
  actor: Actor,
  projectId: string,
  upload: DocumentUpload,
): Promise<ProjectDocument> {
  allowed(actor, "WRITE_PROJECT_DOCUMENT", await scope(actor, projectId));
  const config = getDocumentConfig();
  let validated;
  try {
    validated = validateDocument(upload.bytes, upload.originalName);
  } catch {
    throw new BusinessError("UNSUPPORTED_DOCUMENT");
  }
  const sha256 = createHash("sha256").update(upload.bytes).digest("hex");
  const objectKey = randomBytes(16).toString("hex");
  const retentionUntil = config.DOCUMENT_RETENTION_DAYS
    ? new Date(Date.now() + config.DOCUMENT_RETENTION_DAYS * 86_400_000)
    : null;

  const reservation = await getDatabase().$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId}::uuid FOR UPDATE`;
      // Interactive transactions use one PostgreSQL connection; await each query
      // instead of issuing concurrent client.query calls (deprecated by pg).
      const project = await tx.project.findUnique({
        where: { id: projectId },
        include: { client: true },
      });
      const membership = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: actor.userId } },
        select: { userId: true },
      });
      const existing = await tx.projectDocument.findUnique({
        where: {
          projectId_uploadedById_submissionId: {
            projectId,
            uploadedById: actor.userId,
            submissionId: upload.submissionId,
          },
        },
      });
      const aggregate = await tx.projectDocument.aggregate({
        where: { projectId, status: { in: [...activeStatuses] } },
        _count: { id: true },
        _sum: { sizeBytes: true },
      });
      if (existing) return { existing } as const;
      if (!project || project.archivedAt || project.client.archivedAt)
        throw new BusinessError("INVALID_TARGET");
      allowed(
        actor,
        "WRITE_PROJECT_DOCUMENT",
        actor.roles.includes("ADMINISTRATOR") || Boolean(membership),
      );
      const total = aggregate._sum.sizeBytes ?? BigInt(0);
      if (
        aggregate._count.id >= config.DOCUMENT_PROJECT_MAX_COUNT ||
        total + BigInt(upload.bytes.length) > BigInt(config.DOCUMENT_PROJECT_MAX_BYTES)
      )
        throw new BusinessError("DOCUMENT_QUOTA_EXCEEDED");
      const row = await tx.projectDocument.create({
        data: {
          projectId,
          uploadedById: actor.userId,
          submissionId: upload.submissionId,
          objectKey,
          originalName: upload.originalName,
          mediaType: validated.mediaType,
          sizeBytes: BigInt(upload.bytes.length),
          sha256,
          status: "UPLOADING",
          retentionUntil,
        },
      });
      return { row } as const;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  if ("existing" in reservation && reservation.existing) return reservation.existing;
  const row = "row" in reservation ? reservation.row : undefined;
  if (!row) throw new BusinessError("INVALID_TARGET");
  try {
    await writeDocumentObject("quarantine", row.objectKey, upload.bytes);
    const finalized = await getDatabase().$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId}::uuid FOR UPDATE`;
        const membership = actor.roles.includes("ADMINISTRATOR")
          ? true
          : Boolean(
              await tx.projectMember.findUnique({
                where: { projectId_userId: { projectId, userId: actor.userId } },
              }),
            );
        const project = await tx.project.findUnique({
          where: { id: projectId },
          include: { client: true },
        });
        if (!project || project.archivedAt || project.client.archivedAt || !membership)
          throw new BusinessError("FORBIDDEN");
        const changed = await tx.projectDocument.updateMany({
          where: { id: row.id, status: "UPLOADING", version: row.version },
          data: { status: "QUARANTINED", version: { increment: 1 } },
        });
        if (changed.count !== 1) throw new BusinessError("STALE_VERSION");
        await tx.auditEvent.create({
          data: {
            actorId: actor.userId,
            action: "DOCUMENT_UPLOAD_QUARANTINED",
            resourceType: "ProjectDocument",
            resourceId: row.id,
            outcome: "SUCCESS",
            metadata: { projectId, sizeBytes: upload.bytes.length, mediaType: validated.mediaType },
          },
        });
        return tx.projectDocument.findUniqueOrThrow({ where: { id: row.id } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return finalized;
  } catch (error) {
    await deleteDocumentObject("quarantine", row.objectKey).catch(() => undefined);
    await getDatabase().projectDocument.updateMany({
      where: { id: row.id, status: "UPLOADING" },
      data: {
        status: "REJECTED",
        lastFailureCode: "UPLOAD_FINALIZATION_FAILED",
        version: { increment: 1 },
      },
    });
    throw error;
  }
}

export async function processDocumentScan(documentId: string) {
  const claimed = await getDatabase().$transaction(
    async (tx) => {
      const row = await tx.projectDocument.findUnique({ where: { id: documentId } });
      if (!row || !["QUARANTINED", "SCAN_FAILED"].includes(row.status)) return null;
      const result = await tx.projectDocument.updateMany({
        where: { id: row.id, version: row.version, status: row.status },
        data: { status: "SCANNING", scanAttemptCount: { increment: 1 }, version: { increment: 1 } },
      });
      return result.count === 1 ? { ...row, version: row.version + 1 } : null;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  if (!claimed) return null;
  try {
    const bytes = await readDocumentObject("quarantine", claimed.objectKey);
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (BigInt(bytes.length) !== claimed.sizeBytes || hash !== claimed.sha256)
      throw new Error("INTEGRITY_MISMATCH");
    const scan = await scanDocument(bytes);
    if (scan.outcome === "INFECTED") {
      await getDatabase().$transaction(async (tx) => {
        const changed = await tx.projectDocument.updateMany({
          where: { id: claimed.id, status: "SCANNING", version: claimed.version },
          data: {
            status: "REJECTED",
            lastFailureCode: "MALWARE_DETECTED",
            scannedAt: new Date(),
            version: { increment: 1 },
          },
        });
        if (changed.count)
          await tx.auditEvent.create({
            data: {
              action: "DOCUMENT_SCAN_REJECTED",
              resourceType: "ProjectDocument",
              resourceId: claimed.id,
              outcome: "SUCCESS",
              metadata: { projectId: claimed.projectId, reason: "MALWARE_DETECTED" },
            },
          });
      });
      await deleteDocumentObject("quarantine", claimed.objectKey);
      return "REJECTED" as const;
    }
    if (scan.outcome === "FAILED") throw new Error(scan.reason);
    await promoteDocumentObject(claimed.objectKey);
    if ((await documentObjectSize("clean", claimed.objectKey)) !== bytes.length)
      throw new Error("INTEGRITY_MISMATCH");
    const now = new Date();
    const available = await getDatabase().$transaction(async (tx) => {
      const changed = await tx.projectDocument.updateMany({
        where: {
          id: claimed.id,
          status: "SCANNING",
          version: claimed.version,
          deleteRequestedAt: null,
        },
        data: {
          status: "AVAILABLE",
          scannedAt: now,
          availableAt: now,
          lastFailureCode: null,
          version: { increment: 1 },
        },
      });
      if (!changed.count) return false;
      await tx.auditEvent.create({
        data: {
          action: "DOCUMENT_AVAILABLE",
          resourceType: "ProjectDocument",
          resourceId: claimed.id,
          outcome: "SUCCESS",
          metadata: { projectId: claimed.projectId, sizeBytes: bytes.length },
        },
      });
      return true;
    });
    if (!available) await deleteDocumentObject("clean", claimed.objectKey);
    else await deleteDocumentObject("quarantine", claimed.objectKey);
    return available ? ("AVAILABLE" as const) : null;
  } catch {
    await getDatabase().projectDocument.updateMany({
      where: { id: claimed.id, status: "SCANNING", version: claimed.version },
      data: { status: "SCAN_FAILED", lastFailureCode: "SCAN_FAILED", version: { increment: 1 } },
    });
    return "SCAN_FAILED" as const;
  }
}

export async function processPendingDocuments(limit = 10) {
  const pending = await getDatabase().projectDocument.findMany({
    where: { status: { in: ["QUARANTINED", "SCAN_FAILED"] }, scanAttemptCount: { lt: 5 } },
    orderBy: { updatedAt: "asc" },
    take: Math.max(1, Math.min(limit, 50)),
    select: { id: true },
  });
  for (const row of pending) await processDocumentScan(row.id);
  return pending.length;
}

export async function openProjectDocument(actor: Actor, projectId: string, documentId: string) {
  allowed(actor, "READ_PROJECT_DOCUMENT", await scope(actor, projectId));
  return getDatabase().$transaction(async (tx) => {
    const row = await tx.projectDocument.findFirst({
      where: { id: documentId, projectId, status: "AVAILABLE", deleteRequestedAt: null },
    });
    if (!row) throw new BusinessError("DOCUMENT_UNAVAILABLE");
    await tx.auditEvent.create({
      data: {
        actorId: actor.userId,
        action: "DOCUMENT_DOWNLOAD_ISSUED",
        resourceType: "ProjectDocument",
        resourceId: row.id,
        outcome: "SUCCESS",
        metadata: { projectId },
      },
    });
    return { row, stream: Readable.toWeb(streamDocumentObject(row.objectKey)) as ReadableStream };
  });
}

export async function deleteProjectDocument(actor: Actor, input: DocumentDeleteInput) {
  allowed(actor, "DELETE_PROJECT_DOCUMENT", await scope(actor, input.projectId));
  const row = await getDatabase().$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ProjectDocument" WHERE id = ${input.documentId}::uuid FOR UPDATE`;
      const current = await tx.projectDocument.findFirst({
        where: { id: input.documentId, projectId: input.projectId },
      });
      if (!current || current.status === "DELETED") throw new BusinessError("INVALID_TARGET");
      if (current.retentionUntil && current.retentionUntil > new Date())
        throw new BusinessError("RETENTION_ACTIVE");
      const membership =
        actor.roles.includes("ADMINISTRATOR") ||
        Boolean(
          await tx.projectMember.findUnique({
            where: { projectId_userId: { projectId: input.projectId, userId: actor.userId } },
          }),
        );
      allowed(actor, "DELETE_PROJECT_DOCUMENT", membership);
      if (current.status === "DELETE_PENDING") return current;
      if (current.version !== input.version) throw new BusinessError("STALE_VERSION");
      const updated = await tx.projectDocument.update({
        where: { id: current.id },
        data: {
          status: "DELETE_PENDING",
          deleteRequestedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: "DOCUMENT_DELETE_REQUESTED",
          resourceType: "ProjectDocument",
          resourceId: current.id,
          outcome: "SUCCESS",
          metadata: { projectId: input.projectId },
        },
      });
      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  await Promise.all([
    deleteDocumentObject("quarantine", row.objectKey),
    deleteDocumentObject("clean", row.objectKey),
  ]);
  return getDatabase().$transaction(async (tx) => {
    const deleted = await tx.projectDocument.update({
      where: { id: row.id },
      data: { status: "DELETED", deletedAt: new Date(), version: { increment: 1 } },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.userId,
        action: "DOCUMENT_PURGED",
        resourceType: "ProjectDocument",
        resourceId: row.id,
        outcome: "SUCCESS",
        metadata: { projectId: input.projectId },
      },
    });
    return deleted;
  });
}
