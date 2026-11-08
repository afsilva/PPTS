import "server-only";
import type { ZodType } from "zod";
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
) {
  const authorization = await authorizeMutation(request);
  if ("response" in authorization) return authorization.response;
  let destination = typeof returnTo === "string" ? returnTo : "/";
  try {
    const input = schema.parse(await readBoundedForm(request));
    await operation(authorization.actor, input);
    destination = typeof returnTo === "function" ? returnTo(input) : returnTo;
    return mutationResult(request, undefined, destination);
  } catch (error) {
    await auditMutationFailure(authorization.actor, action, error, resourceType);
    return mutationResult(request, error, destination);
  }
}
