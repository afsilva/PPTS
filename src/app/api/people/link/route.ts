import { catalogMutation } from "@/modules/catalog/http";
import { personLinkSchema } from "@/modules/people/schemas";
import { linkPersonIdentity } from "@/modules/people/service";

export async function POST(request: Request) {
  return catalogMutation(
    request,
    personLinkSchema,
    "PERSON_IDENTITY_LINKED",
    linkPersonIdentity,
    "/people",
    "Person",
  );
}
