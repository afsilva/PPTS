import { catalogMutation } from "@/modules/catalog/http";
import { workCodeCreateSchema } from "@/modules/catalog/schemas";
import { createWorkCode } from "@/modules/catalog/service";

export async function POST(request: Request) {
  return catalogMutation(request, workCodeCreateSchema, "WORK_CODE_CREATED", createWorkCode);
}
