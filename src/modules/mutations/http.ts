import "server-only";
import { NextResponse } from "next/server";
import { getAuthConfig } from "@/auth/config";
import { readActor } from "@/modules/authorization/server";
import { BusinessError } from "@/modules/business/errors";
import { MAX_FORM_BYTES } from "./form";
export { readBoundedForm } from "./form";

const noStore = { "Cache-Control": "no-store" };

function errorResponse(body: string, status: number) {
  return new NextResponse(body, { status, headers: noStore });
}

export async function authorizeMutation(request: Request) {
  const config = getAuthConfig();
  if (request.headers.get("origin") !== config.APP_ORIGIN)
    return { response: errorResponse("Forbidden", 403) } as const;
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const mediaType = contentType.split(";", 1)[0]?.trim();
  if (mediaType !== "application/x-www-form-urlencoded")
    return { response: errorResponse("Unsupported Media Type", 415) } as const;
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader) {
    const length = Number(lengthHeader);
    if (!Number.isFinite(length) || length < 0 || length > MAX_FORM_BYTES)
      return { response: errorResponse("Payload Too Large", 413) } as const;
  }
  const actor = await readActor();
  if (!actor) return { response: errorResponse("Unauthorized", 401) } as const;
  return { actor } as const;
}

export function mutationResult(request: Request, error?: unknown, returnTo = "/") {
  if (error instanceof BusinessError && error.code === "PAYLOAD_TOO_LARGE")
    return errorResponse("Payload Too Large", 413);
  const destination = new URL(returnTo, request.url);
  if (error) destination.searchParams.set("result", publicError(error));
  else destination.searchParams.set("result", "saved");
  return NextResponse.redirect(destination, {
    status: 303,
    headers: { "Cache-Control": "no-store" },
  });
}

function publicError(error: unknown) {
  if (error instanceof BusinessError) {
    switch (error.code) {
      case "ALREADY_CLOCKED_IN":
        return "already-working";
      case "NOT_CLOCKED_IN":
        return "not-working";
      case "NO_CHANGE":
        return "no-change";
      case "PAYLOAD_TOO_LARGE":
        return "failed";
      case "STALE_VERSION":
        return "stale";
      case "ENTITY_IN_USE":
        return "in-use";
      case "INVALID_INTERVAL":
        return "invalid-interval";
      case "OVERLAPPING_TIME":
        return "overlap";
      case "INVALID_ASSIGNMENT":
      case "INVALID_TARGET":
      case "FORBIDDEN":
        return "not-allowed";
    }
  }
  return "failed";
}
