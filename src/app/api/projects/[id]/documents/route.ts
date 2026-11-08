import { auditMutationFailure } from "@/modules/audit/failure";
import { authorizeDocumentUpload } from "@/modules/documents/http";
import { readDocumentMultipart } from "@/modules/documents/multipart";
import { uploadProjectDocument } from "@/modules/documents/service";
import { mutationResult } from "@/modules/mutations/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeDocumentUpload(request);
  if ("response" in authorization) return authorization.response;
  const { id } = await params;
  try {
    const upload = await readDocumentMultipart(request);
    await uploadProjectDocument(authorization.actor, id, upload);
    return mutationResult(request, undefined, `/projects/${id}`);
  } catch (error) {
    await auditMutationFailure(authorization.actor, "DOCUMENT_UPLOAD", error, "ProjectDocument");
    return mutationResult(request, error, `/projects/${id}`);
  }
}
