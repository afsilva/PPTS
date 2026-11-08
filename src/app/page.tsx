import { redirect } from "next/navigation";
import { readSession } from "@/auth/session";
import { displayRole } from "@/auth/roles";
import { can, type Actor } from "@/modules/authorization/policy";
import { getDashboard } from "@/modules/time-tracking/service";
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

function clock(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map((part) => String(part).padStart(2, "0")).join(":");
}

function stateLabel(state: string) {
  if (state === "WORKING") return "Working";
  if (state === "AVAILABLE") return "Available";
  return "Off duty";
}

function resultMessage(result?: string) {
  switch (result) {
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
          <a href="#time">
            <Icon>◷</Icon>My time
          </a>
          <a href="#projects">
            <Icon>◇</Icon>Projects
          </a>
          <a href="#people">
            <Icon>◎</Icon>People
          </a>
        </nav>
        <div className={styles.sidebarFooter}>
          <div className={styles.profile}>
            <span className={`${styles.avatar} ${styles.avatarBlue}`}>{initials}</span>
            <span>
              <strong>{displayName}</strong>
              <small>{displayRole(actor.roles)}</small>
            </span>
            <form action="/auth/logout" method="post">
              <button aria-label="Sign out" title="Sign out">
                ↪
              </button>
            </form>
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
                timeZone: "UTC",
              })}
            </p>
            <h1>Hello, {displayName.split(" ")[0]}.</h1>
          </div>
        </header>

        {feedback && (
          <p className={result === "saved" ? styles.notice : styles.errorNotice} role="status">
            {feedback}
          </p>
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
                <p className={styles.timer} aria-label={`${duration(elapsed)} elapsed`}>
                  {clock(elapsed)}
                </p>
                {canChangeClock && (
                  <div className={styles.timerActions}>
                    <form action="/api/time/clock-out" method="post">
                      <button className={styles.stopButton}>
                        <span aria-hidden="true">■</span> Stop timer
                      </button>
                    </form>
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
              <span>tracked in UTC</span>
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
              <form
                className={styles.clockForm}
                action={dashboard.current ? "/api/time/switch" : "/api/time/clock-in"}
                method="post"
              >
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
                <button className={styles.primaryButton}>
                  {dashboard.current ? "Switch task" : "Start timer"}
                </button>
              </form>
            ) : (
              <p className={styles.emptyState}>
                No active project assignment or work code is available. Ask an administrator to
                configure access.
              </p>
            )}
            {!dashboard.current && (
              <form className={styles.availableForm} action="/api/time/available" method="post">
                <input type="hidden" name="state" value="AVAILABLE" />
                <label>
                  Availability message
                  <input name="message" maxLength={280} defaultValue={dashboard.user.message} />
                </label>
                <button className={styles.secondaryButton}>Mark available</button>
              </form>
            )}
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
            <form className={styles.membershipForm} action="/api/projects/members" method="post">
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
              <button className={styles.primaryButton}>Assign access</button>
            </form>
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
                      <strong>{project.name}</strong>
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
