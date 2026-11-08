import { catalogMutation } from "@/modules/catalog/http";
import { personUpdateSchema } from "@/modules/people/schemas";
import { updatePerson } from "@/modules/people/service";

export async function POST(request: Request) {
  return catalogMutation(
    request,
    personUpdateSchema,
    "PERSON_UPDATED",
    updatePerson,
    "/people",
    "Person",
  );
}
