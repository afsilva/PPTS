import { getDatabase } from "@/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getDatabase().$queryRaw`SELECT 1`;
    return Response.json(
      { status: "ok", checks: { application: "ready", database: "ready" } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "unavailable", checks: { application: "ready", database: "unavailable" } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
