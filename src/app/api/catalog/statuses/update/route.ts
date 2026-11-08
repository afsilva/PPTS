import { catalogMutation } from "@/modules/catalog/http";
import { statusUpdateSchema } from "@/modules/catalog/schemas";
import { updateProjectStatus } from "@/modules/catalog/service";
export async function POST(request: Request) {
  return catalogMutation(
    request,
    statusUpdateSchema,
    "PROJECT_STATUS_UPDATED",
    updateProjectStatus,
    "/catalog",
  );
}
