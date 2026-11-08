import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { readSession } from "@/auth/session";
import type { Actor } from "@/modules/authorization/policy";
import { getProjectDetail, getProjectEditorOptions } from "@/modules/projects/service";
import { MutationForm, SubmitButton } from "@/app/components/submit-button";
import { MutationNotice } from "@/app/components/mutation-notice";
import styles from "../../page.module.css";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const session = await readSession();
  if (!session) redirect("/login");
  const actor: Actor = {
    userId: session.user.id,
    roles: session.user.roles.map(({ role }) => role),
  };
  const { id } = await params;
  let detail;
  try {
    detail = await getProjectDetail(actor, id);
  } catch {
    notFound();
  }
  const { project, documents, canWriteDocuments, canManage } = detail;
  const options = canManage ? await getProjectEditorOptions(actor, id) : null;
  const result = (await searchParams).result;
  return (
    <main className={styles.managementPage}>
      <Link href="/">← Dashboard</Link>
      <h1>
        {project.client.name} · {project.name}
      </h1>
      <p>{project.description || "No project description."}</p>
      {result && (
        <MutationNotice className={result === "saved" ? styles.notice : styles.errorNotice}>
          {result === "saved"
            ? "Your change was saved. Documents remain unavailable until scanning succeeds."
            : result === "stale"
              ? "This project changed. Reload and try again."
              : result === "unsupported-document"
                ? "That document format or file structure is not allowed."
                : result === "document-quota"
                  ? "This project has reached its document quota."
                  : result === "retention-active"
                    ? "That document is still under retention and cannot be deleted."
                    : "The change could not be saved."}
        </MutationNotice>
      )}
      <section className={styles.managementCard}>
        <h2>Project details</h2>
        {canManage && options ? (
          <MutationForm
            action="/api/projects/update"
            method="post"
            className={styles.managementForm}
          >
            <input type="hidden" name="id" value={project.id} />
            <input type="hidden" name="version" value={project.version} />
            <label>
              Client
              <select name="clientId" defaultValue={project.clientId}>
                {options.clients.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select name="statusId" defaultValue={project.statusId}>
                {options.statuses.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Name
              <input name="name" maxLength={120} defaultValue={project.name} required />
            </label>
            <label>
              Billing rate
              <input
                name="billingRate"
                inputMode="decimal"
                defaultValue={
                  project.billingRateCents === null
                    ? ""
                    : (project.billingRateCents / 100).toFixed(2)
                }
              />
            </label>
            <label className={styles.fullField}>
              Description
              <textarea name="description" maxLength={2000} defaultValue={project.description} />
            </label>
            <label>
              Languages
              <input name="languages" maxLength={500} defaultValue={project.languages} />
            </label>
            <label>
              Modules/libraries
              <input name="modules" maxLength={500} defaultValue={project.modules} />
            </label>
            <label className={styles.fullField}>
              Extras
              <textarea name="extras" maxLength={1000} defaultValue={project.extras} />
            </label>
            <label>
              Coder
              <select name="coderId" defaultValue={project.coderId ?? ""}>
                <option value="">Unassigned</option>
                {options.people
                  .filter((x) => x.kind === "EMPLOYEE")
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.displayName}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Development contact
              <select name="developmentContactId" defaultValue={project.developmentContactId ?? ""}>
                <option value="">Unassigned</option>
                {options.people.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Production contact
              <select name="productionContactId" defaultValue={project.productionContactId ?? ""}>
                <option value="">Unassigned</option>
                {options.people.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Development server
              <input
                name="developmentServerName"
                maxLength={255}
                defaultValue={project.developmentServerName}
              />
            </label>
            <label>
              Development path
              <input
                name="developmentServerPath"
                maxLength={500}
                defaultValue={project.developmentServerPath}
              />
            </label>
            <label>
              Production server
              <input
                name="productionServerName"
                maxLength={255}
                defaultValue={project.productionServerName}
              />
            </label>
            <label>
              Production path
              <input
                name="productionServerPath"
                maxLength={500}
                defaultValue={project.productionServerPath}
              />
            </label>
            <Estimate
              name="estimatedDesignMinutes"
              label="Design minutes"
              value={project.estimatedDesignMinutes}
            />
            <Estimate
              name="estimatedCodingMinutes"
              label="Coding minutes"
              value={project.estimatedCodingMinutes}
            />
            <Estimate
              name="estimatedManagementMinutes"
              label="Management minutes"
              value={project.estimatedManagementMinutes}
            />
            <Estimate
              name="estimatedTestingMinutes"
              label="Testing minutes"
              value={project.estimatedTestingMinutes}
            />
            <Estimate
              name="estimatedMaintenanceMinutes"
              label="Maintenance minutes"
              value={project.estimatedMaintenanceMinutes}
            />
            <SubmitButton className={styles.primaryButton} pendingLabel="Saving project…">
              Save project
            </SubmitButton>
          </MutationForm>
        ) : (
          <dl className={styles.detailList}>
            <dt>Status</dt>
            <dd>{project.status.name}</dd>
            <dt>Languages</dt>
            <dd>{project.languages || "—"}</dd>
            <dt>Coder</dt>
            <dd>{project.coder?.displayName || "—"}</dd>
            <dt>Development contact</dt>
            <dd>{project.developmentContact?.displayName || "—"}</dd>
            <dt>Production contact</dt>
            <dd>{project.productionContact?.displayName || "—"}</dd>
          </dl>
        )}
      </section>
      <section className={styles.managementCard}>
        <h2>Project members</h2>
        <div className={styles.memberList}>
          {project.members.map((member) => (
            <div key={member.userId}>
              <span>
                <strong>{member.user.displayName}</strong>
                <small>{member.role.toLowerCase()}</small>
              </span>
              {canManage && member.userId !== actor.userId && (
                <MutationForm
                  action={`/api/projects/members/remove?returnTo=/projects/${project.id}`}
                  method="post"
                >
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="userId" value={member.userId} />
                  <SubmitButton
                    className={styles.dangerButton}
                    pendingLabel="Removing…"
                    confirmMessage={`Remove ${member.user.displayName} from this project?`}
                  >
                    Remove
                  </SubmitButton>
                </MutationForm>
              )}
            </div>
          ))}
          {!project.members.length && <p>No project members.</p>}
        </div>
      </section>
      <section className={styles.managementCard}>
        <h2>Project documents</h2>
        <p>
          Files are private, validated, quarantined, and unavailable until malware scanning
          succeeds. Accepted formats: PDF, text, PNG, and JPEG.
        </p>
        {canWriteDocuments && (
          <MutationForm
            action={`/api/projects/${project.id}/documents`}
            method="post"
            encType="multipart/form-data"
            className={styles.documentForm}
          >
            <input type="hidden" name="submissionId" value={randomUUID()} />
            <label>
              Document
              <input name="document" type="file" accept=".pdf,.txt,.png,.jpg,.jpeg" required />
            </label>
            <SubmitButton className={styles.primaryButton} pendingLabel="Uploading safely…">
              Upload document
            </SubmitButton>
          </MutationForm>
        )}
        <div className={styles.documentList}>
          {documents.map((document) => (
            <div key={document.id}>
              <span>
                <strong>{document.originalName}</strong>
                <small>
                  {document.uploadedBy.displayName} ·{" "}
                  {document.status.toLowerCase().replaceAll("_", " ")}
                  {document.sizeBytes ? ` · ${formatBytes(document.sizeBytes)}` : ""}
                </small>
              </span>
              <span className={styles.documentActions}>
                {document.status === "AVAILABLE" && (
                  <a href={`/api/projects/${project.id}/documents/${document.id}/download`}>
                    Download
                  </a>
                )}
                {canWriteDocuments && (
                  <MutationForm
                    action={`/api/projects/${project.id}/documents/${document.id}/delete`}
                    method="post"
                  >
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="documentId" value={document.id} />
                    <input type="hidden" name="version" value={document.version} />
                    <SubmitButton
                      className={styles.dangerButton}
                      pendingLabel="Deleting…"
                      confirmMessage={`Delete ${document.originalName}?`}
                    >
                      Delete
                    </SubmitButton>
                  </MutationForm>
                )}
              </span>
            </div>
          ))}
          {!documents.length && <p>No project documents.</p>}
        </div>
      </section>
      <section className={styles.managementCard}>
        <h2>Project journal</h2>
        <MutationForm
          action={`/api/projects/logs?returnTo=/projects/${project.id}`}
          method="post"
          className={styles.journalForm}
        >
          <input type="hidden" name="projectId" value={project.id} />
          <label>
            New entry
            <textarea name="body" maxLength={5000} required />
          </label>
          <SubmitButton className={styles.primaryButton} pendingLabel="Adding entry…">
            Add journal entry
          </SubmitButton>
        </MutationForm>
        {project.logs.map((log) => (
          <article className={styles.logEntry} key={log.id}>
            <header>
              {log.author.displayName} ·{" "}
              {log.createdAt.toLocaleString("en-US", { timeZone: "UTC" })} UTC
            </header>
            <p>{log.body}</p>
          </article>
        ))}
        {!project.logs.length && <p>No journal entries yet.</p>}
      </section>
    </main>
  );
}
function formatBytes(value: bigint) {
  const bytes = Number(value);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function Estimate({ name, label, value }: { name: string; label: string; value: number | null }) {
  return (
    <label>
      {label}
      <input name={name} type="number" min="0" defaultValue={value ?? ""} />
    </label>
  );
}
