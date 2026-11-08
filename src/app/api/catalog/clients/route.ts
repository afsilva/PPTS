import { catalogMutation } from "@/modules/catalog/http";
import { clientCreateSchema } from "@/modules/catalog/schemas";
import { createClient } from "@/modules/catalog/service";

export async function POST(request: Request) {
  return catalogMutation(request, clientCreateSchema, "CLIENT_CREATED", createClient);
}
