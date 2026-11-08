import "server-only";
import { Readable } from "node:stream";
import busboy from "busboy";
import { getDocumentConfig } from "@/config/documents";
import { BusinessError } from "@/modules/business/errors";
import { documentUploadFieldsSchema, normalizeDocumentName } from "./schemas";

export type DocumentUpload = Readonly<{
  submissionId: string;
  originalName: string;
  bytes: Buffer;
}>;

export async function readDocumentMultipart(request: Request): Promise<DocumentUpload> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;.*\bboundary=(?:"[^"]+"|[^;\s]+)/i.test(contentType))
    throw new BusinessError("INVALID_DOCUMENT");
  if (!request.body) throw new BusinessError("INVALID_DOCUMENT");
  const max = getDocumentConfig().DOCUMENT_MAX_BYTES;
  return new Promise((resolve, reject) => {
    let submissionId = "";
    let originalName = "";
    let fileCount = 0;
    let total = 0;
    const chunks: Buffer[] = [];
    let failed = false;
    const fail = (error: unknown) => {
      if (failed) return;
      failed = true;
      reject(error);
    };
    let parser;
    try {
      parser = busboy({
        headers: { "content-type": contentType },
        // Busboy counts the terminal multipart boundary when enforcing parts;
        // allow that marker while separately requiring exactly one field/file.
        limits: { files: 1, fields: 1, parts: 3, fileSize: max, fieldSize: 100 },
      });
    } catch {
      throw new BusinessError("INVALID_DOCUMENT");
    }
    parser.on("field", (name, value) => {
      if (name !== "submissionId" || submissionId)
        return fail(new BusinessError("INVALID_DOCUMENT"));
      submissionId = value;
    });
    parser.on("file", (name, stream, info) => {
      fileCount += 1;
      if (name !== "document" || fileCount !== 1)
        return fail(new BusinessError("INVALID_DOCUMENT"));
      try {
        originalName = normalizeDocumentName(info.filename ?? "");
      } catch {
        return fail(new BusinessError("INVALID_DOCUMENT"));
      }
      stream.on("limit", () => fail(new BusinessError("PAYLOAD_TOO_LARGE")));
      stream.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > max) return fail(new BusinessError("PAYLOAD_TOO_LARGE"));
        chunks.push(chunk);
      });
    });
    parser.once("filesLimit", () => fail(new BusinessError("INVALID_DOCUMENT")));
    parser.once("fieldsLimit", () => fail(new BusinessError("INVALID_DOCUMENT")));
    parser.once("partsLimit", () => fail(new BusinessError("INVALID_DOCUMENT")));
    parser.once("error", () => fail(new BusinessError("INVALID_DOCUMENT")));
    parser.once("close", () => {
      if (failed) return;
      try {
        const fields = documentUploadFieldsSchema.parse({ submissionId });
        if (fileCount !== 1 || total < 1 || !originalName) throw new Error();
        resolve({ ...fields, originalName, bytes: Buffer.concat(chunks, total) });
      } catch {
        fail(new BusinessError("INVALID_DOCUMENT"));
      }
    });
    Readable.fromWeb(request.body as never).pipe(parser);
  });
}
