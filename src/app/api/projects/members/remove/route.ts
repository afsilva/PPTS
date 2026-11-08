import { catalogMutation } from "@/modules/catalog/http";
import { removeProjectMember } from "@/modules/projects/membership";
import { projectMemberRemoveSchema } from "@/modules/projects/schemas";

export async function POST(request: Request) {
  return catalogMutation(
    request,
    projectMemberRemoveSchema,
    "PROJECT_MEMBER_REMOVED",
    removeProjectMember,
    (input) => `/projects/${input.projectId}`,
  );
}
