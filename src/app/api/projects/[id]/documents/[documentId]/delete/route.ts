import { catalogMutation } from "@/modules/catalog/http";
import { documentDeleteSchema } from "@/modules/documents/schemas";
import { deleteProjectDocument } from "@/modules/documents/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  const { id } = await params;
  return catalogMutation(
    request,
    documentDeleteSchema,
    "DOCUMENT_DELETE",
    deleteProjectDocument,
    (input) => `/projects/${input.projectId}`,
    "ProjectDocument",
    "saved",
    `/projects/${id}`,
  );
}
