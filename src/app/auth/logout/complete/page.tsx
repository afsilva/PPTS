import styles from "../../../login/page.module.css";

export default function LogoutCompletePage() {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="logout-title">
        <span className={styles.mark}>P</span>
        <p className={styles.eyebrow}>PPTS</p>
        <h1 id="logout-title">Signing you out…</h1>
        <p>Your PPTS session is closed. Continue to finish signing out of Keycloak.</p>
        <a className={styles.button} href="/auth/logout/provider">
          Continue sign out
        </a>
      </section>
    </main>
  );
}
