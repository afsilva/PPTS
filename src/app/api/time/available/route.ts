import { authorizeMutation, mutationResult, readBoundedForm } from "@/modules/mutations/http";
import { auditMutationFailure } from "@/modules/audit/failure";
import { presenceSchema } from "@/modules/time-tracking/schemas";
import { setPresence } from "@/modules/time-tracking/service";

export async function POST(request: Request) {
  const authorization = await authorizeMutation(request);
  if ("response" in authorization) return authorization.response;
  let action = "PRESENCE_STATE_CHANGE";
  try {
    const input = presenceSchema.parse(await readBoundedForm(request));
    action = input.state === "AVAILABLE" ? "PRESENCE_AVAILABLE" : "PRESENCE_OFF_DUTY";
    await setPresence(authorization.actor, input);
    return mutationResult(
      request,
      undefined,
      "/",
      input.state === "AVAILABLE" ? "available" : "off-duty",
    );
  } catch (error) {
    await auditMutationFailure(authorization.actor, action, error);
    return mutationResult(request, error);
  }
}
