import "server-only";
import { z, type ZodType } from "zod";
import type { Actor } from "@/modules/authorization/policy";
import { auditMutationFailure } from "@/modules/audit/failure";
import { authorizeMutation, mutationResult, readBoundedForm } from "@/modules/mutations/http";

export async function catalogMutation<T>(
  request: Request,
  schema: ZodType<T>,
  action: string,
  operation: (actor: Actor, input: T) => Promise<unknown>,
  returnTo: string | ((input: T) => string) = "/",
  resourceType = "Catalog",
  successResult: string | ((input: T, result: unknown) => string) = "saved",
  fallbackReturnTo = "/",
) {
  const authorization = await authorizeMutation(request);
  if ("response" in authorization) return authorization.response;
  const requestedReturn = new URL(request.url).searchParams.get("returnTo");
  const safeRequestedReturn =
    requestedReturn === "/catalog" ||
    z
      .string()
      .regex(
        /^\/projects\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      )
      .safeParse(requestedReturn).success
      ? (requestedReturn ?? "/")
      : "/";
  let destination =
    typeof returnTo === "string" && returnTo === "/"
      ? safeRequestedReturn
      : typeof returnTo === "string"
        ? returnTo
        : fallbackReturnTo;
  try {
    const input = schema.parse(await readBoundedForm(request));
    destination = typeof returnTo === "function" ? returnTo(input) : returnTo;
    const result = await operation(authorization.actor, input);
    const resultToken =
      typeof successResult === "function" ? successResult(input, result) : successResult;
    return mutationResult(request, undefined, destination, resultToken);
  } catch (error) {
    await auditMutationFailure(authorization.actor, action, error, resourceType);
    return mutationResult(request, error, destination);
  }
}
