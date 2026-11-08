import { catalogMutation } from "@/modules/catalog/http";
import { personUnlinkSchema } from "@/modules/people/schemas";
import { unlinkPersonIdentity } from "@/modules/people/service";

export async function POST(request: Request) {
  return catalogMutation(
    request,
    personUnlinkSchema,
    "PERSON_IDENTITY_UNLINKED",
    unlinkPersonIdentity,
    "/people",
    "Person",
  );
}
