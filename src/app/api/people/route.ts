import { catalogMutation } from "@/modules/catalog/http";
import { personCreateSchema } from "@/modules/people/schemas";
import { createPerson } from "@/modules/people/service";

export async function POST(request: Request) {
  return catalogMutation(
    request,
    personCreateSchema,
    "PERSON_CREATED",
    createPerson,
    "/people",
    "Person",
  );
}
