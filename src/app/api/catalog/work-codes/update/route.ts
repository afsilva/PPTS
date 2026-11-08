import { catalogMutation } from "@/modules/catalog/http";
import { workCodeUpdateSchema } from "@/modules/catalog/schemas";
import { updateWorkCode } from "@/modules/catalog/service";
export async function POST(request: Request) {
  return catalogMutation(
    request,
    workCodeUpdateSchema,
    "WORK_CODE_UPDATED",
    updateWorkCode,
    "/catalog",
  );
}
