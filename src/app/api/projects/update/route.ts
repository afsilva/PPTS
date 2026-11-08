import { catalogMutation } from "@/modules/catalog/http";
import { projectUpdateSchema } from "@/modules/projects/schemas";
import { updateProject } from "@/modules/projects/service";

export async function POST(request: Request) {
  return catalogMutation(
    request,
    projectUpdateSchema,
    "PROJECT_UPDATED",
    updateProject,
    (input) => `/projects/${input.id}`,
  );
}
