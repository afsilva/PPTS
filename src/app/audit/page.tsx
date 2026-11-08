import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/auth/session";
import type { Actor } from "@/modules/authorization/policy";
import { getAuditEvents, parseAuditPage } from "@/modules/audit/service";
import styles from "../page.module.css";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await readSession();
  if (!session) redirect("/login");
  const actor: Actor = {
    userId: session.user.id,
    roles: session.user.roles.map(({ role }) => role),
  };
  if (!actor.roles.includes("ADMINISTRATOR")) redirect("/");

  let page: number;
  try {
    page = parseAuditPage((await searchParams).page);
  } catch {
    redirect("/audit?page=1");
  }
  const result = await getAuditEvents(actor, page);

  return (
    <main className={styles.managementPage}>
      <Link href="/">← Dashboard</Link>
      <h1>Security audit events</h1>
      <p>
        Most recent first. This view intentionally omits request bodies, notes, tokens, identity
        claims, and arbitrary event metadata.
      </p>
      <section className={styles.managementCard}>
        <div className={styles.auditTableWrap}>
          <table className={styles.auditTable}>
            <thead>
              <tr>
                <th>Occurred (UTC)</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Outcome</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {result.events.map((event) => (
                <tr key={event.id}>
                  <td>{event.occurredAt.toISOString()}</td>
                  <td>{event.actor?.displayName ?? "System / unavailable"}</td>
                  <td>{event.action}</td>
                  <td>
                    {event.resourceType}
                    {event.resourceId ? ` · ${event.resourceId}` : ""}
                  </td>
                  <td>{event.outcome}</td>
                  <td>{event.metadata.reason ?? event.metadata.previousRole ?? "—"}</td>
                </tr>
              ))}
              {!result.events.length && (
                <tr>
                  <td colSpan={6}>No audit events are available on this page.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <nav className={styles.pagination} aria-label="Audit event pages">
          {page > 1 ? <Link href={`/audit?page=${page - 1}`}>← Newer</Link> : <span />}
          <span>Page {page}</span>
          {result.hasNext ? <Link href={`/audit?page=${page + 1}`}>Older →</Link> : <span />}
        </nav>
      </section>
    </main>
  );
}
