import { authorizeMutation, mutationResult, readBoundedForm } from "@/modules/mutations/http";
import { auditMutationFailure } from "@/modules/audit/failure";
import { presenceSchema } from "@/modules/time-tracking/schemas";
import { setAvailable } from "@/modules/time-tracking/service";

export async function POST(request: Request) {
  const authorization = await authorizeMutation(request);
  if ("response" in authorization) return authorization.response;
  try {
    const input = presenceSchema.parse(await readBoundedForm(request));
    await setAvailable(authorization.actor, input.message);
    return mutationResult(request);
  } catch (error) {
    await auditMutationFailure(authorization.actor, "PRESENCE_AVAILABLE", error);
    return mutationResult(request, error);
  }
}
