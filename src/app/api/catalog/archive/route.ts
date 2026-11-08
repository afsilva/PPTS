import { catalogMutation } from "@/modules/catalog/http";
import { archiveEntitySchema } from "@/modules/catalog/schemas";
import { setArchived } from "@/modules/catalog/service";

export async function POST(request: Request) {
  return catalogMutation(request, archiveEntitySchema, "CATALOG_ARCHIVED", setArchived);
}
