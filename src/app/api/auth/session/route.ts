import { readSession } from "@/auth/session";
export const dynamic = "force-dynamic";
export async function GET() {
  const session = await readSession();
  // Deliberately minimal: the client must never receive internal database
  // identifiers or the authorization set. Authorization is enforced
  // server-side by readSession/requireRole in every route and action.
  if (!session)
    return Response.json(
      { authenticated: false },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  return Response.json(
    {
      authenticated: true,
      displayName: session.user.displayName,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
