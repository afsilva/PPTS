import { authorizeMutation, mutationResult, readBoundedForm } from "@/modules/mutations/http";
import { auditMutationFailure } from "@/modules/audit/failure";
import { clockOut } from "@/modules/time-tracking/service";

export async function POST(request: Request) {
  const authorization = await authorizeMutation(request);
  if ("response" in authorization) return authorization.response;
  try {
    await readBoundedForm(request);
    await clockOut(authorization.actor);
    return mutationResult(request);
  } catch (error) {
    await auditMutationFailure(authorization.actor, "TIME_CLOCK_OUT", error);
    return mutationResult(request, error);
  }
}
