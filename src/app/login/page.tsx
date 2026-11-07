import styles from "./page.module.css";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="login-title">
        <span className={styles.mark}>P</span>
        <p className={styles.eyebrow}>People & Projects Tracking System</p>
        <h1 id="login-title">Welcome to PPTS</h1>
        <p>Sign in through the local identity service to access your projects and time.</p>
        {error && (
          <p className={styles.error} role="alert">
            Sign-in was not completed. Please try again.
          </p>
        )}
        <a className={styles.button} href="/auth/login">
          Sign in with Keycloak
        </a>
        <small>
          Local development environment · Accounts are stored outside the source repository.
        </small>
      </section>
    </main>
  );
}
