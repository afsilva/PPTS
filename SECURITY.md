# Security policy

## Supported versions

PPTS is pre-release software. Only the current `main` branch receives security updates. It is not approved for production use yet.

## Reporting a vulnerability

Do **not** open a public issue with exploit details or sensitive data. Use GitHub private vulnerability reporting after the repository is published. Until then, contact the repository owner privately and include:

- affected commit/version,
- impact and prerequisites,
- minimal reproduction,
- suggested mitigation if known.

Expect acknowledgment within three business days. Do not test against systems or data you do not own or have explicit permission to assess.

## Security baseline

- OWASP Top 10:2025 risk coverage
- OWASP ASVS 5.0 Level 2 release target
- OIDC with MFA for production identity
- Deny-by-default role and resource authorization
- Server-side validation and parameterized persistence
- CSRF/origin controls on mutations
- Private document storage and scanning when documents are introduced
- Structured, redacted security audit logs and operational alerting
- Exact-pinned dependencies, a 72-hour publication cooling-off gate, zero-known-vulnerability/deprecation policy, automated updates, and SAST/SCA/secret scanning
- SBOMs and signed release provenance as the delivery pipeline matures

See the [threat model](docs/security/threat-model.md), [OWASP Top 10:2025 status](docs/security/owasp-top-10-2025.md), and [authorization matrix](docs/security/authorization-matrix.md).

## Data handling prohibition

Never commit or upload real legacy database dumps, production documents, passwords, session material, access tokens, private keys, home addresses, birthdays, personal phone numbers, or other private employee/client data. Use generated `.invalid` identities and synthetic fixtures only.

## Known foundation limitations

- Local OIDC sign-in, revocable server-side sessions, and the first database-backed time/presence and scoped project-membership mutations are implemented with exact-Origin checks, server-side authorization, bounded input, and business auditing. The broader authorization matrix and production controls remain incomplete.
- Application readiness verifies PostgreSQL connectivity. Production orchestration must also monitor the external identity provider and scheduled workers rather than treating application readiness as whole-system readiness.
- Compose uses local HTTP bound to loopback. Production must terminate managed TLS and use HSTS.
- CSP currently permits inline style because React emits calculated chart heights. Remove this allowance with nonce/hashing or static classes before production approval.
- The development database credential is convenient, not a production secret-management pattern.
