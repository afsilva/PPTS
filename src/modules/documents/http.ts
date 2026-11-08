import "server-only";
import { NextResponse } from "next/server";
import { getAuthConfig } from "@/auth/config";
import { readActor } from "@/modules/authorization/server";
import { BusinessError } from "@/modules/business/errors";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function authorizeDocumentUpload(request: Request) {
  if (request.headers.get("origin") !== getAuthConfig().APP_ORIGIN)
    return {
      response: new NextResponse("Forbidden", { status: 403, headers: privateHeaders }),
    } as const;
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;.*\bboundary=(?:"[^"]+"|[^;\s]+)/i.test(contentType))
    return {
      response: new NextResponse("Unsupported Media Type", {
        status: 415,
        headers: privateHeaders,
      }),
    } as const;
  const actor = await readActor();
  if (!actor)
    return {
      response: new NextResponse("Unauthorized", { status: 401, headers: privateHeaders }),
    } as const;
  return { actor } as const;
}

export function documentError(error: unknown) {
  const status = error instanceof BusinessError && error.code === "PAYLOAD_TOO_LARGE" ? 413 : 404;
  return new NextResponse(status === 413 ? "Payload Too Large" : "Document not available", {
    status,
    headers: privateHeaders,
  });
}
