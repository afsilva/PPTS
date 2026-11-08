import { authorizeMutation, mutationResult, readBoundedForm } from "@/modules/mutations/http";
import { auditMutationFailure } from "@/modules/audit/failure";
import { clockOutSchema } from "@/modules/time-tracking/schemas";
import { clockOut } from "@/modules/time-tracking/service";

export async function POST(request: Request) {
  const authorization = await authorizeMutation(request);
  if ("response" in authorization) return authorization.response;
  try {
    const input = clockOutSchema.parse(await readBoundedForm(request));
    await clockOut(authorization.actor, input);
    return mutationResult(request, undefined, "/", "clocked-out");
  } catch (error) {
    await auditMutationFailure(authorization.actor, "TIME_CLOCK_OUT", error);
    return mutationResult(request, error);
  }
}
