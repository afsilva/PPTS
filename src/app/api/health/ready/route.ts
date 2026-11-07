export const dynamic = "force-dynamic";

export function GET() {
  // Database readiness will be enabled with the first authenticated vertical slice.
  return Response.json(
    { status: "ok", checks: { application: "ready" } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
