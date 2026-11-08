import { catalogMutation } from "@/modules/catalog/http";
import { clientUpdateSchema } from "@/modules/catalog/schemas";
import { updateClient } from "@/modules/catalog/service";
export async function POST(request: Request) {
  return catalogMutation(request, clientUpdateSchema, "CLIENT_UPDATED", updateClient, "/catalog");
}
