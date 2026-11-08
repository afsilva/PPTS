import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/auth/session";
import { MutationForm, SubmitButton } from "@/app/components/submit-button";
import { MutationNotice } from "@/app/components/mutation-notice";
import type { Actor } from "@/modules/authorization/policy";
import { getCatalog } from "@/modules/catalog/service";
import styles from "../page.module.css";

export default async function CatalogPage({
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
  const catalog = await getCatalog(actor);
  const result = (await searchParams).result;
  return (
    <main className={styles.managementPage}>
      <Link href="/">← Dashboard</Link>
      <h1>Catalog administration</h1>
      <p>
        Manage timekeeping reference data. Historical records remain linked when items are archived
        or deactivated.
      </p>
      {result && (
        <MutationNotice className={result === "saved" ? styles.notice : styles.errorNotice}>
          {result === "saved"
            ? "Your change was saved."
            : result === "stale"
              ? "This record changed. Reload and try again."
              : "The change could not be saved."}
        </MutationNotice>
      )}
      <section className={styles.managementCard}>
        <h2>Clients</h2>
        <MutationForm
          action="/api/catalog/clients?returnTo=/catalog"
          method="post"
          className={styles.compactCreate}
        >
          <label>
            New client
            <input name="name" maxLength={120} required />
          </label>
          <SubmitButton className={styles.primaryButton} pendingLabel="Adding…">
            Add client
          </SubmitButton>
        </MutationForm>
        {catalog.clients.map((x) => (
          <div className={styles.catalogEditRow} key={x.id}>
            <MutationForm action="/api/catalog/clients/update" method="post">
              <input type="hidden" name="id" value={x.id} />
              <input type="hidden" name="version" value={x.version} />
              <label>
                Name
                <input
                  name="name"
                  maxLength={120}
                  defaultValue={x.name}
                  disabled={Boolean(x.archivedAt)}
                  required
                />
              </label>
              {!x.archivedAt && <SubmitButton pendingLabel="Saving…">Save</SubmitButton>}
            </MutationForm>
            {!x.archivedAt && (
              <MutationForm action="/api/catalog/archive?returnTo=/catalog" method="post">
                <input type="hidden" name="entity" value="client" />
                <input type="hidden" name="id" value={x.id} />
                <SubmitButton
                  className={styles.dangerButton}
                  pendingLabel="Archiving…"
                  confirmMessage="Archive this client and prevent new work?"
                >
                  Archive
                </SubmitButton>
              </MutationForm>
            )}
          </div>
        ))}
      </section>
      <section className={styles.managementCard}>
        <h2>Project statuses</h2>
        <MutationForm
          action="/api/catalog/statuses?returnTo=/catalog"
          method="post"
          className={styles.compactCreate}
        >
          <label>
            Name
            <input name="name" maxLength={120} required />
          </label>
          <label>
            Description
            <input name="description" maxLength={2000} />
          </label>
          <SubmitButton className={styles.primaryButton} pendingLabel="Adding…">
            Add status
          </SubmitButton>
        </MutationForm>
        {catalog.statuses.map((x) => (
          <MutationForm
            className={styles.catalogEditRow}
            action="/api/catalog/statuses/update"
            method="post"
            key={x.id}
          >
            <input type="hidden" name="id" value={x.id} />
            <input type="hidden" name="version" value={x.version} />
            <label>
              Name
              <input name="name" maxLength={120} defaultValue={x.name} required />
            </label>
            <label>
              Description
              <input name="description" maxLength={2000} defaultValue={x.description} />
            </label>
            <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
          </MutationForm>
        ))}
      </section>
      <section className={styles.managementCard}>
        <h2>Work codes</h2>
        <MutationForm
          action="/api/catalog/work-codes?returnTo=/catalog"
          method="post"
          className={styles.compactCreate}
        >
          <label>
            Name
            <input name="name" maxLength={120} required />
          </label>
          <label>
            Description
            <input name="description" maxLength={2000} />
          </label>
          <SubmitButton className={styles.primaryButton} pendingLabel="Adding…">
            Add code
          </SubmitButton>
        </MutationForm>
        {catalog.workCodes.map((x) => (
          <div className={styles.catalogEditRow} key={x.id}>
            <MutationForm action="/api/catalog/work-codes/update" method="post">
              <input type="hidden" name="id" value={x.id} />
              <input type="hidden" name="version" value={x.version} />
              <label>
                Name
                <input name="name" maxLength={120} defaultValue={x.name} required />
              </label>
              <label>
                Description
                <input name="description" maxLength={2000} defaultValue={x.description} />
              </label>
              <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
            </MutationForm>
            <MutationForm action="/api/catalog/work-codes/state?returnTo=/catalog" method="post">
              <input type="hidden" name="id" value={x.id} />
              <input type="hidden" name="version" value={x.version} />
              <input type="hidden" name="active" value={x.active ? "false" : "true"} />
              <SubmitButton pendingLabel="Updating…">
                {x.active ? "Deactivate" : "Activate"}
              </SubmitButton>
            </MutationForm>
          </div>
        ))}
      </section>
      <section className={styles.managementCard}>
        <h2>Projects</h2>
        {catalog.projects.map((x) => (
          <div className={styles.catalogEditRow} key={x.id}>
            <span>
              <strong>
                {x.client.name} · {x.name}
              </strong>
              <small>
                {x.status.name}
                {x.archivedAt ? " · archived" : ""}
              </small>
            </span>
            <Link href={`/projects/${x.id}`}>{x.archivedAt ? "View" : "Edit project"}</Link>
          </div>
        ))}
      </section>
    </main>
  );
}
