import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/auth/session";
import { MutationForm, SubmitButton } from "@/app/components/submit-button";
import { MutationNotice } from "@/app/components/mutation-notice";
import { can, type Actor } from "@/modules/authorization/policy";
import { getOwnTimeHistoryPage } from "@/modules/time-tracking/corrections";
import styles from "../page.module.css";

export function inputUtc(date: Date) {
  return date.toISOString().slice(0, -1);
}

function positivePage(value?: string) {
  if (!value || !/^\d+$/.test(value)) return 1;
  return Math.min(Math.max(Number(value), 1), 10_000);
}

function message(result?: string) {
  if (result === "corrected") return { ok: true, text: "Time entry corrected and audited." };
  if (result === "saved") return { ok: true, text: "No changes were needed." };
  if (result === "stale")
    return { ok: false, text: "This entry changed. The refreshed values below can be edited now." };
  if (result === "overlap")
    return { ok: false, text: "This correction overlaps another time entry." };
  if (result === "invalid-interval")
    return { ok: false, text: "Use a completed UTC interval of no more than 31 days." };
  if (result) return { ok: false, text: "The correction could not be saved." };
  return null;
}

export default async function TimePage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string; page?: string }>;
}) {
  const session = await readSession();
  if (!session) redirect("/login");
  const actor: Actor = {
    userId: session.user.id,
    roles: session.user.roles.map(({ role }) => role),
  };
  const query = await searchParams;
  const history = await getOwnTimeHistoryPage(actor, positivePage(query.page));
  if (history.total > 0 && history.page > history.pageCount)
    redirect(`/time?page=${history.pageCount}`);
  const editable = can(actor, {
    capability: "CORRECT_TIME",
    targetUserId: actor.userId,
    scoped: false,
  });
  const notice = message(query.result);
  const pageHref = (page: number) => (page === 1 ? "/time" : `/time?page=${page}`);

  return (
    <main className={styles.managementPage}>
      <Link href="/">← Dashboard</Link>
      <h1>My time history</h1>
      <p>
        Times are shown and edited in UTC with their original precision. Corrections are
        ownership-checked, overlap-checked, and audited.
      </p>
      {notice && (
        <MutationNotice className={notice.ok ? styles.notice : styles.errorNotice}>
          {notice.text}
        </MutationNotice>
      )}
      {history.entries.map((entry) => (
        <section className={styles.timeEntryCard} key={entry.id}>
          <header>
            <div>
              <strong>
                {entry.project.client.name} · {entry.project.name}
              </strong>
              <span>{entry.workCode.name}</span>
            </div>
            <span>v{entry.version}</span>
          </header>
          {editable ? (
            <MutationForm
              action="/api/time/correct"
              method="post"
              className={styles.correctionForm}
              requireChanges
            >
              <input type="hidden" name="id" value={entry.id} />
              <input type="hidden" name="version" value={entry.version} />
              <label>
                Started (UTC)
                <input
                  type="datetime-local"
                  name="startedAt"
                  step="0.001"
                  defaultValue={inputUtc(entry.startedAt)}
                  required
                />
              </label>
              <label>
                Ended (UTC)
                <input
                  type="datetime-local"
                  name="endedAt"
                  step="0.001"
                  defaultValue={inputUtc(entry.endedAt!)}
                  required
                />
              </label>
              <label className={styles.fullField}>
                Work note
                <textarea name="note" maxLength={1000} defaultValue={entry.note} />
                <small>Up to 1,000 characters.</small>
              </label>
              <SubmitButton className={styles.primaryButton} pendingLabel="Saving correction…">
                Save correction
              </SubmitButton>
            </MutationForm>
          ) : (
            <dl className={styles.detailList}>
              <dt>Started</dt>
              <dd>{entry.startedAt.toISOString()}</dd>
              <dt>Ended</dt>
              <dd>{entry.endedAt!.toISOString()}</dd>
              <dt>Note</dt>
              <dd>{entry.note || "—"}</dd>
            </dl>
          )}
        </section>
      ))}
      {!history.entries.length && (
        <section className={styles.managementCard}>
          <p>No completed time entries yet.</p>
        </section>
      )}
      {history.pageCount > 1 && (
        <nav className={styles.pagination} aria-label="Time history pages">
          {history.page > 1 ? <Link href={pageHref(history.page - 1)}>← Newer</Link> : <span />}
          <span>
            Page {history.page} of {history.pageCount} · {history.total} entries
          </span>
          {history.page < history.pageCount ? (
            <Link href={pageHref(history.page + 1)}>Older →</Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </main>
  );
}
