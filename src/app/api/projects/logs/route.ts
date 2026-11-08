import { catalogMutation } from "@/modules/catalog/http";
import { projectLogSchema } from "@/modules/projects/schemas";
import { addProjectLog } from "@/modules/projects/service";

export async function POST(request: Request) {
  return catalogMutation(
    request,
    projectLogSchema,
    "PROJECT_LOG_CREATED",
    addProjectLog,
    (input) => `/projects/${input.projectId}`,
  );
}
