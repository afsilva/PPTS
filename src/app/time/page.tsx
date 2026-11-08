import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/auth/session";
import { MutationForm, SubmitButton } from "@/app/components/submit-button";
import { can, type Actor } from "@/modules/authorization/policy";
import { getOwnTimeHistory } from "@/modules/time-tracking/corrections";
import styles from "../page.module.css";

function inputUtc(date: Date) {
  return date.toISOString().slice(0, 16);
}
function message(result?: string) {
  if (result === "saved") return { ok: true, text: "Time entry corrected and audited." };
  if (result === "stale")
    return { ok: false, text: "This entry changed. Reload before editing it again." };
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
  searchParams: Promise<{ result?: string }>;
}) {
  const session = await readSession();
  if (!session) redirect("/login");
  const actor: Actor = {
    userId: session.user.id,
    roles: session.user.roles.map(({ role }) => role),
  };
  const entries = await getOwnTimeHistory(actor);
  const editable = can(actor, {
    capability: "CORRECT_TIME",
    targetUserId: actor.userId,
    scoped: false,
  });
  const notice = message((await searchParams).result);
  return (
    <main className={styles.managementPage}>
      <Link href="/">← Dashboard</Link>
      <h1>My time history</h1>
      <p>
        Times are shown and edited in UTC. Corrections are ownership-checked, overlap-checked, and
        audited.
      </p>
      {notice && (
        <p
          className={notice.ok ? styles.notice : styles.errorNotice}
          role="status"
          aria-live="polite"
        >
          {notice.text}
        </p>
      )}
      {entries.map((entry) => (
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
            >
              <input type="hidden" name="id" value={entry.id} />
              <input type="hidden" name="version" value={entry.version} />
              <label>
                Started (UTC)
                <input
                  type="datetime-local"
                  name="startedAt"
                  step="60"
                  defaultValue={inputUtc(entry.startedAt)}
                  required
                />
              </label>
              <label>
                Ended (UTC)
                <input
                  type="datetime-local"
                  name="endedAt"
                  step="60"
                  defaultValue={inputUtc(entry.endedAt!)}
                  required
                />
              </label>
              <label className={styles.fullField}>
                Work note
                <textarea name="note" maxLength={2000} defaultValue={entry.note} />
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
      {!entries.length && (
        <section className={styles.managementCard}>
          <p>No completed time entries yet.</p>
        </section>
      )}
    </main>
  );
}
