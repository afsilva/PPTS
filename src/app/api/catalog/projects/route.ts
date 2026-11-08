import { catalogMutation } from "@/modules/catalog/http";
import { projectCreateSchema } from "@/modules/catalog/schemas";
import { createProject } from "@/modules/catalog/service";

export async function POST(request: Request) {
  return catalogMutation(request, projectCreateSchema, "PROJECT_CREATED", createProject);
}
