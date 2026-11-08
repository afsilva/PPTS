import { authorizeMutation, mutationResult, readBoundedForm } from "@/modules/mutations/http";
import { auditMutationFailure } from "@/modules/audit/failure";
import { switchSchema } from "@/modules/time-tracking/schemas";
import { switchWork } from "@/modules/time-tracking/service";

export async function POST(request: Request) {
  const authorization = await authorizeMutation(request);
  if ("response" in authorization) return authorization.response;
  try {
    const input = switchSchema.parse(await readBoundedForm(request));
    await switchWork(authorization.actor, input);
    return mutationResult(request);
  } catch (error) {
    await auditMutationFailure(authorization.actor, "TIME_SWITCH", error);
    return mutationResult(request, error);
  }
}
