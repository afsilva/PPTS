import { authorizeMutation, mutationResult, readBoundedForm } from "@/modules/mutations/http";
import { auditMutationFailure } from "@/modules/audit/failure";
import { clockInSchema } from "@/modules/time-tracking/schemas";
import { clockIn } from "@/modules/time-tracking/service";

export async function POST(request: Request) {
  const authorization = await authorizeMutation(request);
  if ("response" in authorization) return authorization.response;
  try {
    const input = clockInSchema.parse(await readBoundedForm(request));
    await clockIn(authorization.actor, input);
    return mutationResult(request, undefined, "/", "clocked-in");
  } catch (error) {
    await auditMutationFailure(authorization.actor, "TIME_CLOCK_IN", error);
    return mutationResult(request, error);
  }
}
