import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/auth/session";
import type { Actor } from "@/modules/authorization/policy";
import { getAvailableIdentityAccounts, getPeople } from "@/modules/people/service";
import { MutationForm, SubmitButton } from "@/app/components/submit-button";
import { MutationNotice } from "@/app/components/mutation-notice";
import styles from "../page.module.css";

function feedback(result?: string) {
  if (result === "saved") return { ok: true, text: "Your change was saved." };
  if (result === "stale") return { ok: false, text: "This record changed. Reload and try again." };
  if (result === "in-use")
    return {
      ok: false,
      text: "This person, identity account, or project assignment is already in use.",
    };
  if (result) return { ok: false, text: "The change could not be saved." };
  return null;
}

export default async function PeoplePage({
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
  if (!actor.roles.includes("ADMINISTRATOR")) redirect("/");
  const [people, availableAccounts] = await Promise.all([
    getPeople(actor),
    getAvailableIdentityAccounts(actor),
  ]);
  const notice = feedback((await searchParams).result);
  return (
    <main className={styles.managementPage}>
      <Link href="/">← Dashboard</Link>
      <h1>People and contacts</h1>
      <p>
        Profiles are business records. Authentication accounts and roles remain managed by Keycloak.
      </p>
      {notice && (
        <MutationNotice className={notice.ok ? styles.notice : styles.errorNotice}>
          {notice.text}
        </MutationNotice>
      )}
      <section className={styles.managementCard}>
        <h2>Add person</h2>
        <PersonFields action="/api/people" />
      </section>
      {people.map((person) => (
        <section className={styles.managementCard} key={person.id}>
          <h2>
            {person.displayName}
            {person.archivedAt ? " · archived" : ""}
          </h2>
          {person.user && (
            <p>
              Linked login: {person.user.displayName} ({person.user.username}) ·{" "}
              {person.user.active ? "active" : "disabled"}
            </p>
          )}
          {!person.archivedAt && (
            <>
              <PersonFields action="/api/people/update" person={person} />
              {person.user ? (
                <MutationForm
                  action="/api/people/unlink"
                  method="post"
                  className={styles.inlineForm}
                >
                  <input type="hidden" name="id" value={person.id} />
                  <input type="hidden" name="version" value={person.version} />
                  <SubmitButton
                    pendingLabel="Unlinking…"
                    confirmMessage="Unlink this business profile from its login account? Authentication and time records will not be deleted."
                  >
                    Unlink login account
                  </SubmitButton>
                </MutationForm>
              ) : (
                person.kind === "EMPLOYEE" &&
                availableAccounts.length > 0 && (
                  <MutationForm
                    action="/api/people/link"
                    method="post"
                    className={`${styles.compactCreate} ${styles.inlineForm}`}
                  >
                    <input type="hidden" name="id" value={person.id} />
                    <input type="hidden" name="version" value={person.version} />
                    <label>
                      Login account
                      <select name="userId" required defaultValue="">
                        <option value="" disabled>
                          Select an unlinked active account
                        </option>
                        {availableAccounts.map((account) => (
                          <option value={account.id} key={account.id}>
                            {account.displayName} ({account.username})
                          </option>
                        ))}
                      </select>
                    </label>
                    <SubmitButton pendingLabel="Linking…">Link login account</SubmitButton>
                  </MutationForm>
                )
              )}
              <MutationForm
                action="/api/people/archive"
                method="post"
                className={styles.inlineForm}
              >
                <input type="hidden" name="id" value={person.id} />
                <input type="hidden" name="version" value={person.version} />
                <SubmitButton
                  className={styles.dangerButton}
                  pendingLabel="Archiving…"
                  confirmMessage="Archive this person?"
                >
                  Archive person
                </SubmitButton>
              </MutationForm>
            </>
          )}
        </section>
      ))}
    </main>
  );
}

type PersonData = Awaited<ReturnType<typeof getPeople>>[number];
function PersonFields({ action, person }: { action: string; person?: PersonData }) {
  return (
    <MutationForm action={action} method="post" className={styles.managementForm}>
      {!person && <input type="hidden" name="submissionId" value={randomUUID()} />}
      {person && (
        <>
          <input type="hidden" name="id" value={person.id} />
          <input type="hidden" name="version" value={person.version} />
        </>
      )}
      <label>
        Type
        <select name="kind" defaultValue={person?.kind ?? "EMPLOYEE"}>
          <option value="EMPLOYEE">Employee</option>
          <option value="CONTACT">External contact</option>
        </select>
      </label>
      <label>
        Display name
        <input name="displayName" maxLength={160} defaultValue={person?.displayName} required />
      </label>
      <label>
        Title
        <input name="title" maxLength={120} defaultValue={person?.title} />
      </label>
      <label>
        Work phone
        <input name="workPhone" maxLength={40} defaultValue={person?.workPhone} />
      </label>
      <label>
        Home phone
        <input name="homePhone" maxLength={40} defaultValue={person?.homePhone} />
      </label>
      <label>
        Mobile phone
        <input name="mobilePhone" maxLength={40} defaultValue={person?.mobilePhone} />
      </label>
      <label>
        Legacy IM
        <input name="legacyIm" maxLength={80} defaultValue={person?.legacyIm} />
      </label>
      <label>
        Birthday month
        <input
          name="birthdayMonth"
          type="number"
          min="1"
          max="12"
          defaultValue={person?.birthdayMonth ?? ""}
        />
      </label>
      <label>
        Birthday day
        <input
          name="birthdayDay"
          type="number"
          min="1"
          max="31"
          defaultValue={person?.birthdayDay ?? ""}
        />
      </label>
      <label className={styles.fullField}>
        Address
        <textarea name="address" maxLength={500} defaultValue={person?.address} />
      </label>
      <SubmitButton
        className={styles.primaryButton}
        pendingLabel={person ? "Saving profile…" : "Adding person…"}
      >
        {person ? "Save profile" : "Add person"}
      </SubmitButton>
    </MutationForm>
  );
}
