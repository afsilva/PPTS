# Local Keycloak identity

PPTS local authentication uses a pinned Keycloak 26.8.1 OCI image with native ARM64/AMD64 support and a separate PostgreSQL database. It is development infrastructure only.

## Start and sign in

```bash
make start
```

Open <http://localhost:3000>. You are redirected to Keycloak at <http://localhost:8080>.

Synthetic accounts:

- Administrator: `alex.admin`
- Employee: `casey.employee`
- Manager: `morgan.manager` (synthetic project/report-scope verification)

Passwords are generated, never committed, and stored in the protected external environment file:

- macOS: `~/Library/Application Support/PPTS/environment`
- Linux: `${XDG_STATE_HOME:-~/.local/state}/ppts/environment`

To print only the local usernames and passwords to your own terminal:

```bash
make credentials
```

The command refuses loose environment-file permissions and non-terminal output by default, reducing accidental capture in logs or redirected files. Use `PPTS_ALLOW_CREDENTIAL_REDIRECT=1` only for an explicit, protected automation destination.

The Keycloak console administrator is `local-admin`; its generated password is shown by the same command. Do not reuse these values elsewhere.

## Security model

- Authorization Code flow with PKCE S256, state, and nonce.
- Exact issuer, audience, RS256 signature, expiry, and nonce validation.
- Public local client, so there is no client secret to leak.
- AES-256-GCM-encrypted, HttpOnly, SameSite=Lax transaction and session cookies.
- The session cookie contains no OIDC token and is validated against an authoritative revocable server-side record; the ID token is encrypted server-side only for provider logout.
- Server-side session records support revocation and inactive-user enforcement; an eight-hour absolute limit, one-hour idle limit, and transactionally enforced five-active-session cap constrain replay.
- Keycloak progressive brute-force protection temporarily locks accounts after repeated credential failures; production additionally requires trusted-edge distributed throttling and MFA.
- Revoked, expired, and idle rows are removed by `npm run maintenance:sessions`, which must be scheduled and monitored in production.
- User identity binds only on `(issuer, subject)`, never email.
- The OIDC client has `fullScopeAllowed=false`; only the four approved PPTS realm roles are explicitly mapped into its token scope.
- Administrators may associate an already provisioned active login with one employee business profile in `/people`. This link does not create an account, change credentials, or change roles; those remain Keycloak-managed. Contacts cannot be linked, and unlinking preserves the login, profile, sessions, time entries, and audit records.
- Keycloak credentials and both database passwords remain outside Git.
- Keycloak and app databases use separate Podman volumes.
- Ports bind only to loopback; local HTTP is never a production configuration.

Realm structure and synthetic users are committed without credentials. A one-shot bootstrap container reconciles the security-critical client settings on every start, creates the canonical manager when upgrading an existing local realm, fails if required roles or other canonical users are missing, and reapplies approved roles and generated passwords idempotently after Keycloak becomes healthy. This prevents persisted database state from silently retaining unsafe client drift. Changing a generated database password while its volume exists is intentionally not a rotation mechanism: reset with `make clean` first. Account and administrator password changes are reapplied on the next restart.

## Reset

`make stop` preserves both databases. `make clean` removes both Podman database volumes and application images but preserves external credentials. The next `make start` imports the canonical realm again and reapplies those credentials.

Keycloak data or realm changes are local development concerns and do not define production identity configuration. Production requires an external supported IdP, HTTPS, secure cookies, MFA policy, and managed secrets.
