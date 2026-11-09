import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { readSession } from "@/auth/session";
import { displayRole } from "@/auth/roles";
import { can, type Actor } from "@/modules/authorization/policy";
import { getDashboard } from "@/modules/time-tracking/service";
import { getCatalog } from "@/modules/catalog/service";
import { MutationForm, SubmitButton } from "@/app/components/submit-button";
import { MutationNotice } from "@/app/components/mutation-notice";
import { LiveTimer } from "@/app/components/live-timer";
import styles from "./page.module.css";

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <span className={styles.icon} aria-hidden="true">
      {children}
    </span>
  );
}

function duration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function stateLabel(state: string) {
  if (state === "WORKING") return "Working";
  if (state === "AVAILABLE") return "Available";
  return "Off duty";
}

function resultMessage(result?: string) {
  switch (result) {
    case "clocked-in":
      return "Timer started. Current work is shown below.";
    case "switched":
      return "Timer switched to the selected work.";
    case "clocked-out":
      return "Timer stopped and the completed entry is now in My time.";
    case "available":
      return "Your presence is now Available.";
    case "off-duty":
      return "Your presence is now Off duty.";
    case "saved":
      return "The update was saved.";
    case "already-working":
      return "You already have active work.";
    case "not-working":
      return "There is no active entry to stop.";
    case "no-change":
      return "Choose a different project or work code.";
    case "not-allowed":
      return "That project or work code is not available to your account.";
    case "stale":
      return "This record changed in another session. Reload and try again.";
    case "in-use":
      return "This record is still assigned and cannot be archived.";
    case "failed":
      return "The update could not be completed. Please try again.";
    default:
      return null;
  }
}

export default async function Home({
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
  const dashboard = await getDashboard(actor);
  const canManageCatalog = can(actor, { capability: "MANAGE_CLIENTS_AND_CODES" });
  const catalog = canManageCatalog ? await getCatalog(actor) : null;
  const { result } = await searchParams;
  const feedback = resultMessage(result);
  const displayName = dashboard.user.displayName;
  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const canChangeClock = can(actor, { capability: "CHANGE_CLOCK", targetUserId: actor.userId });
  const elapsed = dashboard.current
    ? Math.max(
        0,
        Math.floor(
          (dashboard.generatedAt.getTime() - dashboard.current.startedAt.getTime()) / 1000,
        ),
      )
    : 0;

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main">
        Skip to main content
      </a>
      <aside className={styles.sidebar} aria-label="Primary navigation">
        <div className={styles.brand}>
          <span className={styles.brandMark}>P</span>
          <span>PPTS</span>
        </div>
        <nav className={styles.nav}>
          <a className={styles.navActive} href="#overview" aria-current="page">
            <Icon>⌂</Icon>Overview
          </a>
          <a href="/time">
            <Icon>◷</Icon>My time
          </a>
          <a href="#projects">
            <Icon>◇</Icon>Projects
          </a>
          <a href={actor.roles.includes("ADMINISTRATOR") ? "/people" : "#people"}>
            <Icon>◎</Icon>People
          </a>
          {actor.roles.includes("ADMINISTRATOR") && (
            <a href="/catalog">
              <Icon>⚙</Icon>Catalog
            </a>
          )}
          {(actor.roles.includes("MANAGER") ||
            actor.roles.includes("ADMINISTRATOR") ||
            actor.roles.includes("AUDITOR")) && (
            <a href="/reports">
              <Icon>▤</Icon>Reports
            </a>
          )}
          {actor.roles.includes("ADMINISTRATOR") && (
            <a href="/audit">
              <Icon>☷</Icon>Audit events
            </a>
          )}
        </nav>
        <div className={styles.sidebarFooter}>
          <div className={styles.profile}>
            <span className={`${styles.avatar} ${styles.avatarBlue}`}>{initials}</span>
            <span>
              <strong>{displayName}</strong>
              <small>{displayRole(actor.roles)}</small>
            </span>
            <MutationForm action="/auth/logout" method="post">
              <SubmitButton
                className={styles.logoutButton}
                ariaLabel="Sign out"
                title="Sign out"
                pendingLabel="Signing out…"
              >
                <span aria-hidden="true">↪</span>
                <span className={styles.logoutLabel}>Sign out</span>
              </SubmitButton>
            </MutationForm>
          </div>
        </div>
      </aside>

      <main id="main" className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <p className={styles.eyebrow}>
              {dashboard.generatedAt.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                timeZone: dashboard.organizationTimeZone,
              })}
            </p>
            <h1>Hello, {displayName.split(" ")[0]}.</h1>
          </div>
        </header>

        {feedback && (
          <MutationNotice
            className={
              result === "saved" ||
              result === "clocked-in" ||
              result === "switched" ||
              result === "clocked-out" ||
              result === "available" ||
              result === "off-duty"
                ? styles.notice
                : styles.errorNotice
            }
          >
            {feedback}
          </MutationNotice>
        )}

        <section id="overview" className={styles.heroGrid} aria-label="Current work overview">
          <article className={styles.timerCard}>
            <div className={styles.cardTop}>
              <div>
                <span className={dashboard.current ? styles.liveDot : styles.quietDot} />
                {dashboard.current ? "Currently working" : stateLabel(dashboard.user.presence)}
              </div>
            </div>
            {dashboard.current ? (
              <>
                <div className={styles.projectIdentity}>
                  <span className={styles.projectIcon}>
                    {dashboard.current.projectName.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <h2>{dashboard.current.projectName}</h2>
                    <p>
                      {dashboard.current.clientName} · {dashboard.current.workCodeName}
                    </p>
                  </div>
                </div>
                <LiveTimer className={styles.timer} baselineSeconds={elapsed} />
                {canChangeClock && (
                  <div className={styles.timerActions}>
                    <MutationForm action="/api/time/clock-out" method="post" mutationGroup="clock">
                      <input type="hidden" name="submissionId" value={randomUUID()} />
                      <SubmitButton className={styles.stopButton} pendingLabel="Stopping…">
                        <span aria-hidden="true">■</span> Stop timer
                      </SubmitButton>
                    </MutationForm>
                  </div>
                )}
              </>
            ) : (
              <div className={styles.emptyTimer}>
                <h2>No active timer</h2>
                <p>Select an assigned project and active work code to begin.</p>
              </div>
            )}
          </article>

          <article className={styles.summaryCard}>
            <div className={styles.cardTop}>
              <h2>Today</h2>
            </div>
            <div className={styles.todayMetric}>
              <strong>{duration(dashboard.today.seconds)}</strong>
              <span>tracked in {dashboard.organizationTimeZone}</span>
            </div>
            <dl className={styles.stats}>
              <div>
                <dt>Entries</dt>
                <dd>{dashboard.today.entries}</dd>
              </div>
              <div>
                <dt>Week total</dt>
                <dd>{duration(dashboard.week.seconds)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{stateLabel(dashboard.user.presence)}</dd>
              </div>
            </dl>
          </article>
        </section>

        {canChangeClock && (
          <section className={styles.clockPanel} aria-labelledby="clock-controls-title">
            <div>
              <h2 id="clock-controls-title">{dashboard.current ? "Switch work" : "Start work"}</h2>
              <p>Only active projects assigned to you and active work codes are available.</p>
            </div>
            {dashboard.projects.length > 0 && dashboard.workCodes.length > 0 ? (
              <MutationForm
                className={styles.clockForm}
                action={dashboard.current ? "/api/time/switch" : "/api/time/clock-in"}
                method="post"
                mutationGroup="clock"
              >
                <input type="hidden" name="submissionId" value={randomUUID()} />
                <label>
                  Project
                  <select name="projectId" defaultValue={dashboard.current?.projectId} required>
                    {dashboard.projects.map((project) => (
                      <option value={project.id} key={project.id}>
                        {project.clientName} · {project.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Work code
                  <select name="workCodeId" defaultValue={dashboard.current?.workCodeId} required>
                    {dashboard.workCodes.map((code) => (
                      <option value={code.id} key={code.id}>
                        {code.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Status message
                  <input name="message" maxLength={280} defaultValue={dashboard.user.message} />
                </label>
                <SubmitButton
                  className={styles.primaryButton}
                  pendingLabel={dashboard.current ? "Switching…" : "Starting…"}
                >
                  {dashboard.current ? "Switch task" : "Start timer"}
                </SubmitButton>
              </MutationForm>
            ) : (
              <p className={styles.emptyState}>
                No active project assignment or work code is available. Ask an administrator to
                configure access.
              </p>
            )}
            {!dashboard.current && (
              <div className={styles.presenceActions}>
                <MutationForm
                  className={styles.availableForm}
                  action="/api/time/available"
                  method="post"
                  mutationGroup="clock"
                >
                  <input type="hidden" name="submissionId" value={randomUUID()} />
                  <input type="hidden" name="state" value="AVAILABLE" />
                  <label>
                    Availability message
                    <input name="message" maxLength={280} defaultValue={dashboard.user.message} />
                  </label>
                  <SubmitButton className={styles.secondaryButton} pendingLabel="Updating…">
                    Mark available
                  </SubmitButton>
                </MutationForm>
                {dashboard.user.presence !== "OFF_DUTY" && (
                  <MutationForm action="/api/time/available" method="post" mutationGroup="clock">
                    <input type="hidden" name="submissionId" value={randomUUID()} />
                    <input type="hidden" name="state" value="OFF_DUTY" />
                    <input type="hidden" name="message" value="" />
                    <SubmitButton className={styles.secondaryButton} pendingLabel="Updating…">
                      Go off duty
                    </SubmitButton>
                  </MutationForm>
                )}
              </div>
            )}
          </section>
        )}

        {catalog && (
          <section className={styles.catalogPanel} aria-labelledby="catalog-title">
            <div>
              <h2 id="catalog-title">Administration</h2>
              <p>Manage the clients, statuses, projects, and work codes used by PPTS.</p>
            </div>
            <div className={styles.catalogForms}>
              <MutationForm action="/api/catalog/clients" method="post">
                <h3>Add client</h3>
                <label>
                  Name
                  <input name="name" maxLength={120} required />
                </label>
                <SubmitButton className={styles.primaryButton} pendingLabel="Adding client…">
                  Add client
                </SubmitButton>
              </MutationForm>
              <MutationForm action="/api/catalog/statuses" method="post">
                <h3>Add project status</h3>
                <label>
                  Name
                  <input name="name" maxLength={120} required />
                </label>
                <label>
                  Description
                  <input name="description" maxLength={2000} />
                </label>
                <SubmitButton className={styles.primaryButton} pendingLabel="Adding status…">
                  Add status
                </SubmitButton>
              </MutationForm>
              <MutationForm action="/api/catalog/work-codes" method="post">
                <h3>Add work code</h3>
                <label>
                  Name
                  <input name="name" maxLength={120} required />
                </label>
                <label>
                  Description
                  <input name="description" maxLength={2000} />
                </label>
                <SubmitButton className={styles.primaryButton} pendingLabel="Adding code…">
                  Add code
                </SubmitButton>
              </MutationForm>
              <MutationForm action="/api/catalog/projects" method="post">
                <h3>Add project</h3>
                <label>
                  Client
                  <select name="clientId" required>
                    {catalog.clients
                      .filter((item) => !item.archivedAt)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Status
                  <select name="statusId" required>
                    {catalog.statuses.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Name
                  <input name="name" maxLength={120} required />
                </label>
                <label>
                  Description
                  <input name="description" maxLength={2000} />
                </label>
                <label>
                  Billing rate (per hour)
                  <input name="billingRate" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" />
                </label>
                <SubmitButton className={styles.primaryButton} pendingLabel="Adding project…">
                  Add project
                </SubmitButton>
              </MutationForm>
            </div>
            <div className={styles.catalogLists}>
              <div>
                <h3>Clients</h3>
                {catalog.clients.map((item) => (
                  <div key={item.id}>
                    <span>
                      {item.name}
                      {item.archivedAt ? " (archived)" : ""}
                    </span>
                    {!item.archivedAt && (
                      <MutationForm action="/api/catalog/archive" method="post">
                        <input type="hidden" name="entity" value="client" />
                        <input type="hidden" name="id" value={item.id} />
                        <SubmitButton
                          pendingLabel="Archiving…"
                          confirmMessage="Archive this record?"
                        >
                          Archive
                        </SubmitButton>
                      </MutationForm>
                    )}
                  </div>
                ))}
              </div>
              <div>
                <h3>Projects</h3>
                {catalog.projects.map((item) => (
                  <div key={item.id}>
                    <span>
                      {item.client.name} · {item.name} · {item.status.name}
                      {item.archivedAt ? " (archived)" : ""}
                    </span>
                    {!item.archivedAt && (
                      <MutationForm action="/api/catalog/archive" method="post">
                        <input type="hidden" name="entity" value="project" />
                        <input type="hidden" name="id" value={item.id} />
                        <SubmitButton
                          pendingLabel="Archiving…"
                          confirmMessage="Archive this record?"
                        >
                          Archive
                        </SubmitButton>
                      </MutationForm>
                    )}
                  </div>
                ))}
              </div>
              <div>
                <h3>Work codes</h3>
                {catalog.workCodes.map((item) => (
                  <div key={item.id}>
                    <span>
                      {item.name} · {item.active ? "active" : "inactive"}
                    </span>
                    <MutationForm action="/api/catalog/work-codes/state" method="post">
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="active" value={item.active ? "false" : "true"} />
                      <SubmitButton pendingLabel="Updating…">
                        {item.active ? "Deactivate" : "Activate"}
                      </SubmitButton>
                    </MutationForm>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {dashboard.manageableProjects.length > 0 && dashboard.manageableUsers.length > 0 && (
          <section className={styles.membershipPanel} aria-labelledby="membership-title">
            <div>
              <h2 id="membership-title">Project access</h2>
              <p>
                Assign an active person to a project you manage. Manager access can administer that
                project&apos;s members.
              </p>
            </div>
            <MutationForm
              className={styles.membershipForm}
              action="/api/projects/members"
              method="post"
            >
              <label>
                Project
                <select name="projectId" required>
                  {dashboard.manageableProjects.map((project) => (
                    <option value={project.id} key={project.id}>
                      {project.clientName} · {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Person
                <select name="userId" required>
                  {dashboard.manageableUsers.map((person) => (
                    <option value={person.id} key={person.id}>
                      {person.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Project role
                <select name="role" required defaultValue="CONTRIBUTOR">
                  <option value="CONTRIBUTOR">Contributor</option>
                  <option value="MANAGER">Manager</option>
                </select>
              </label>
              <SubmitButton className={styles.primaryButton} pendingLabel="Assigning…">
                Assign access
              </SubmitButton>
            </MutationForm>
          </section>
        )}

        <section className={styles.contentGrid}>
          <div className={styles.leftColumn}>
            <article id="people" className={styles.card}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Team status</h2>
                  <p>Limited presence information for active people.</p>
                </div>
              </div>
              <div className={styles.peopleList}>
                {dashboard.people.map((person) => (
                  <div className={styles.personRow} key={person.displayName}>
                    <span className={`${styles.avatar} ${styles.avatarBlue}`}>
                      {person.initials}
                    </span>
                    <div className={styles.personName}>
                      <strong>{person.displayName}</strong>
                      <small>{person.activity || "No status message"}</small>
                    </div>
                    <span className={styles.status}>
                      <i />
                      {stateLabel(person.state)}
                    </span>
                  </div>
                ))}
              </div>
            </article>

            <article id="time" className={styles.card}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Recent time</h2>
                  <p>Your latest completed entries.</p>
                </div>
              </div>
              <div className={styles.entries}>
                {dashboard.recentEntries.length ? (
                  dashboard.recentEntries.map((entry) => (
                    <div className={styles.entry} key={entry.id}>
                      <span className={styles.entryDay}>
                        {entry.startedAt.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          timeZone: "UTC",
                        })}
                      </span>
                      <span className={styles.entryBar} />
                      <div>
                        <strong>{entry.projectName}</strong>
                        <small>{entry.workCodeName}</small>
                      </div>
                      <b>{duration(entry.seconds)}</b>
                    </div>
                  ))
                ) : (
                  <p className={styles.emptyState}>No completed entries yet.</p>
                )}
              </div>
            </article>
          </div>

          <aside className={styles.rightColumn} aria-label="Project summary">
            <article id="projects" className={styles.card}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Available projects</h2>
                  <p>Active projects within your authorization scope.</p>
                </div>
              </div>
              <div className={styles.projectList}>
                {dashboard.projects.map((project) => (
                  <div className={styles.projectItem} key={project.id}>
                    <span className={`${styles.projectTile} ${styles.tileBlue}`}>
                      {project.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <strong>
                        <a href={`/projects/${project.id}`}>{project.name}</a>
                      </strong>
                      <small>{project.clientName}</small>
                    </div>
                  </div>
                ))}
                {!dashboard.projects.length && (
                  <p className={styles.emptyState}>No active project assignments.</p>
                )}
              </div>
            </article>
          </aside>
        </section>
        <footer className={styles.footer}>PPTS · Database-backed time and presence</footer>
      </main>
    </div>
  );
}
