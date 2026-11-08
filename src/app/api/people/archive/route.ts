import { catalogMutation } from "@/modules/catalog/http";
import { personArchiveSchema } from "@/modules/people/schemas";
import { archivePerson } from "@/modules/people/service";

export async function POST(request: Request) {
  return catalogMutation(
    request,
    personArchiveSchema,
    "PERSON_ARCHIVED",
    archivePerson,
    "/people",
    "Person",
  );
}
