import { getOrganizationTimeZone } from "@/config/env";
import { readActor } from "@/modules/authorization/server";
import { monthlyReportCsv } from "@/modules/reports/csv";
import { getMonthlyReport, monthBounds } from "@/modules/reports/service";

const noStoreHeaders = {
  "Cache-Control": "no-store, private, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request) {
  const actor = await readActor();
  if (!actor) return new Response("Unauthorized", { status: 401, headers: noStoreHeaders });

  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year"));
  const month = Number(url.searchParams.get("month"));
  try {
    monthBounds(year, month);
    const groups = await getMonthlyReport(actor, year, month);
    const timeZone = getOrganizationTimeZone();
    const body = monthlyReportCsv(groups, { year, month, timeZone });
    const fileMonth = String(month).padStart(2, "0");
    return new Response(body, {
      headers: {
        ...noStoreHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ppts-monthly-${year}-${fileMonth}.csv"`,
      },
    });
  } catch {
    // Do not reveal whether denial resulted from role, scope, or invalid input.
    return new Response("Not allowed", { status: 403, headers: noStoreHeaders });
  }
}
