import { auditMutationFailure } from "@/modules/audit/failure";
import { authorizeMutation, mutationResult, readBoundedForm } from "@/modules/mutations/http";
import { assignProjectMember } from "@/modules/projects/membership";
import { projectMembershipSchema } from "@/modules/projects/schemas";

export async function POST(request: Request) {
  const authorization = await authorizeMutation(request);
  if ("response" in authorization) return authorization.response;
  try {
    const input = projectMembershipSchema.parse(await readBoundedForm(request));
    await assignProjectMember(authorization.actor, input);
    return mutationResult(request);
  } catch (error) {
    await auditMutationFailure(
      authorization.actor,
      "PROJECT_MEMBER_ASSIGNED",
      error,
      "ProjectMember",
    );
    return mutationResult(request, error);
  }
}
