import { catalogMutation } from "@/modules/catalog/http";
import { statusCreateSchema } from "@/modules/catalog/schemas";
import { createProjectStatus } from "@/modules/catalog/service";

export async function POST(request: Request) {
  return catalogMutation(
    request,
    statusCreateSchema,
    "PROJECT_STATUS_CREATED",
    createProjectStatus,
  );
}
