import { catalogMutation } from "@/modules/catalog/http";
import { workCodeStateSchema } from "@/modules/catalog/schemas";
import { setWorkCodeState } from "@/modules/catalog/service";

export async function POST(request: Request) {
  return catalogMutation(request, workCodeStateSchema, "WORK_CODE_STATE_CHANGED", setWorkCodeState);
}
