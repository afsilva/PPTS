import { readActor } from "@/modules/authorization/server";
import { safeAttachmentHeader } from "@/modules/documents/headers";
import { documentError } from "@/modules/documents/http";
import { openProjectDocument } from "@/modules/documents/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  const actor = await readActor();
  if (!actor) return new Response("Document not available", { status: 404 });
  const { id, documentId } = await params;
  try {
    const { row, stream } = await openProjectDocument(actor, id, documentId);
    return new Response(stream, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": safeAttachmentHeader(row.originalName),
        "Content-Length": String(row.sizeBytes),
        "Content-Type": "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return documentError(error);
  }
}
