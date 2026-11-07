import styles from "./page.module.css";

const people = [
  {
    initials: "AM",
    name: "Alex Morgan",
    activity: "PPTS Modernization",
    state: "Working",
    tone: "blue",
  },
  {
    initials: "JS",
    name: "Jordan Silva",
    activity: "Design review",
    state: "Working",
    tone: "violet",
  },
  { initials: "TK", name: "Taylor Kim", activity: "Available", state: "Available", tone: "green" },
  { initials: "RP", name: "Riley Patel", activity: "Off duty", state: "Off duty", tone: "gray" },
];

const entries = [
  { day: "Today", project: "PPTS Modernization", code: "Engineering", duration: "2h 18m" },
  { day: "Yesterday", project: "PPTS Modernization", code: "Architecture", duration: "6h 42m" },
  { day: "Nov 5", project: "Internal Operations", code: "Planning", duration: "1h 35m" },
];

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <span className={styles.icon} aria-hidden="true">
      {children}
    </span>
  );
}

export default function Home() {
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
          <a href="#reports">
            <Icon>▥</Icon>Reports
          </a>
        </nav>
        <div className={styles.sidebarFooter}>
          <a href="#settings">
            <Icon>⚙</Icon>Settings
          </a>
          <div className={styles.profile}>
            <span className={`${styles.avatar} ${styles.avatarBlue}`}>AM</span>
            <span>
              <strong>Alex Morgan</strong>
              <small>Administrator</small>
            </span>
            <button aria-label="Open account menu">•••</button>
          </div>
        </div>
      </aside>

      <main id="main" className={styles.main}>
        <header className={styles.topbar}>
          <button className={styles.mobileMenu} aria-label="Open navigation">
            ☰
          </button>
          <div>
            <p className={styles.eyebrow}>Friday, November 7</p>
            <h1>Good morning, Alex.</h1>
          </div>
          <div className={styles.topActions}>
            <button className={styles.iconButton} aria-label="Search">
              ⌕
            </button>
            <button className={styles.iconButton} aria-label="Notifications">
              ♢<span className={styles.notificationDot} />
            </button>
          </div>
        </header>

        <section id="overview" className={styles.heroGrid} aria-label="Current work overview">
          <article className={styles.timerCard}>
            <div className={styles.cardTop}>
              <div>
                <span className={styles.liveDot} />
                Currently working
              </div>
              <button aria-label="More timer options">•••</button>
            </div>
            <div className={styles.projectIdentity}>
              <span className={styles.projectIcon}>P</span>
              <div>
                <h2>PPTS Modernization</h2>
                <p>Northstar Studio · Engineering</p>
              </div>
            </div>
            <p className={styles.timer} aria-label="2 hours and 18 minutes elapsed">
              02:18:37
            </p>
            <div className={styles.timerActions}>
              <button className={styles.stopButton}>
                <span aria-hidden="true">■</span> Stop timer
              </button>
              <button className={styles.secondaryButton}>Switch task</button>
            </div>
          </article>

          <article className={styles.summaryCard}>
            <div className={styles.cardTop}>
              <h2>Today</h2>
              <span className={styles.goal}>58% of goal</span>
            </div>
            <div className={styles.todayMetric}>
              <strong>4h 39m</strong>
              <span>of 8 hours</span>
            </div>
            <div className={styles.progress} aria-label="58 percent of daily goal">
              <span />
            </div>
            <dl className={styles.stats}>
              <div>
                <dt>Focus time</dt>
                <dd>3h 52m</dd>
              </div>
              <div>
                <dt>Entries</dt>
                <dd>3</dd>
              </div>
              <div>
                <dt>Week total</dt>
                <dd>31h 16m</dd>
              </div>
            </dl>
          </article>
        </section>

        <section className={styles.contentGrid}>
          <div className={styles.leftColumn}>
            <article id="people" className={styles.card}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Team status</h2>
                  <p>See what everyone is focused on right now.</p>
                </div>
                <a href="#all-people">
                  View everyone <span>›</span>
                </a>
              </div>
              <div className={styles.peopleList}>
                {people.map((person) => (
                  <div className={styles.personRow} key={person.name}>
                    <span
                      className={`${styles.avatar} ${styles[`avatar${person.tone[0].toUpperCase()}${person.tone.slice(1)}`]}`}
                    >
                      {person.initials}
                    </span>
                    <div className={styles.personName}>
                      <strong>{person.name}</strong>
                      <small>{person.activity}</small>
                    </div>
                    <span
                      className={`${styles.status} ${styles[`status${person.tone[0].toUpperCase()}${person.tone.slice(1)}`]}`}
                    >
                      <i />
                      {person.state}
                    </span>
                  </div>
                ))}
              </div>
            </article>

            <article id="time" className={styles.card}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Recent time</h2>
                  <p>Your latest tracked entries.</p>
                </div>
                <a href="#all-time">
                  View timesheet <span>›</span>
                </a>
              </div>
              <div className={styles.entries}>
                {entries.map((entry) => (
                  <div className={styles.entry} key={`${entry.day}-${entry.code}`}>
                    <span className={styles.entryDay}>{entry.day}</span>
                    <span className={styles.entryBar} />
                    <div>
                      <strong>{entry.project}</strong>
                      <small>{entry.code}</small>
                    </div>
                    <b>{entry.duration}</b>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <aside className={styles.rightColumn} aria-label="Project summary">
            <article id="projects" className={styles.card}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Active projects</h2>
                  <p>This week&apos;s momentum.</p>
                </div>
                <a href="#all-projects">All projects</a>
              </div>
              <div className={styles.projectList}>
                <div className={styles.projectItem}>
                  <span className={`${styles.projectTile} ${styles.tileBlue}`}>P</span>
                  <div>
                    <strong>PPTS Modernization</strong>
                    <small>24h 12m this week</small>
                  </div>
                  <span className={styles.health}>On track</span>
                </div>
                <div className={styles.projectItem}>
                  <span className={`${styles.projectTile} ${styles.tileViolet}`}>N</span>
                  <div>
                    <strong>Northstar Website</strong>
                    <small>17h 48m this week</small>
                  </div>
                  <span className={styles.health}>On track</span>
                </div>
                <div className={styles.projectItem}>
                  <span className={`${styles.projectTile} ${styles.tileOrange}`}>O</span>
                  <div>
                    <strong>Operations</strong>
                    <small>8h 05m this week</small>
                  </div>
                  <span className={`${styles.health} ${styles.healthWatch}`}>Watch</span>
                </div>
              </div>
            </article>

            <article className={`${styles.card} ${styles.weekCard}`}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>This week</h2>
                  <p>Hours across your team.</p>
                </div>
                <button aria-label="Change week">•••</button>
              </div>
              <div
                className={styles.chart}
                aria-label="Bar chart: Monday 6.5 hours, Tuesday 7.8, Wednesday 5.9, Thursday 6.3, Friday 4.7"
              >
                {[65, 78, 59, 63, 47].map((height, i) => (
                  <div key={i}>
                    <span
                      style={{ height: `${height}%` }}
                      className={i === 4 ? styles.currentBar : ""}
                    />
                    <small>{["M", "T", "W", "T", "F"][i]}</small>
                  </div>
                ))}
              </div>
              <div className={styles.weekTotal}>
                <span>
                  <strong>31h 16m</strong>
                  <small>Total tracked</small>
                </span>
                <span>
                  <strong>+8%</strong>
                  <small>vs. last week</small>
                </span>
              </div>
            </article>
          </aside>
        </section>
        <footer className={styles.footer}>PPTS modern foundation · Preview data only</footer>
      </main>
    </div>
  );
}
