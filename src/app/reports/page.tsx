import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/auth/session";
import { getOrganizationTimeZone } from "@/config/env";
import { can, type Actor } from "@/modules/authorization/policy";
import { getMonthlyReport, monthBounds } from "@/modules/reports/service";
import { zonedYearMonth } from "@/modules/reports/timezone";
import styles from "../page.module.css";

function hours(seconds: number) {
  return `${Math.floor(seconds / 3600)}h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}m`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await readSession();
  if (!session) redirect("/login");
  const actor: Actor = {
    userId: session.user.id,
    roles: session.user.roles.map(({ role }) => role),
  };
  if (!can(actor, { capability: "READ_REPORTS", scoped: actor.roles.includes("MANAGER") }))
    redirect("/");

  const timeZone = getOrganizationTimeZone();
  const current = zonedYearMonth(new Date(), timeZone);
  const query = await searchParams;
  const year = query.year === undefined ? current.year : Number(query.year);
  const month = query.month === undefined ? current.month : Number(query.month);
  try {
    monthBounds(year, month, timeZone);
  } catch {
    redirect(`/reports?year=${current.year}&month=${current.month}`);
  }
  const groups = await getMonthlyReport(actor, year, month);
  const exportUrl = `/api/reports/monthly.csv?year=${year}&month=${month}`;

  return (
    <main className={styles.reportPage}>
      <Link href="/">← Dashboard</Link>
      <h1>Monthly time report</h1>
      <p>
        Intervals crossing a month boundary are clipped in the configured organization time zone:{" "}
        <strong>{timeZone}</strong>.
      </p>
      <form className={styles.reportFilters} method="get">
        <label>
          Year
          <input name="year" type="number" min="2000" max="2200" defaultValue={year} required />
        </label>
        <label>
          Month
          <input name="month" type="number" min="1" max="12" defaultValue={month} required />
        </label>
        <button className={styles.primaryButton}>View report</button>
        <a className={styles.secondaryLink} href={exportUrl} download>
          Export protected CSV
        </a>
      </form>
      {groups.map((group) => (
        <section className={styles.reportGroup} key={group.projectId}>
          <h2>
            {group.clientName} · {group.projectName}
          </h2>
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {group.people.map((person) => (
                <tr key={person.userId}>
                  <td>{person.displayName}</td>
                  <td>{hours(person.seconds)}</td>
                </tr>
              ))}
              <tr>
                <th>Project total</th>
                <th>{hours(group.totalSeconds)}</th>
              </tr>
            </tbody>
          </table>
        </section>
      ))}
      {!groups.length && <p>No completed time was recorded for this month.</p>}
    </main>
  );
}
