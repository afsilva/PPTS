# Dependency and supply-chain policy

**Owner:** Maintainers · **Last reviewed:** 2026-11-07

## Required controls

- All direct dependencies are exact-pinned; `package-lock.json` is mandatory and reviewed.
- CI installs only with `npm ci` and runs the policy gate before installation.
- `npm audit --audit-level=low` must report zero known vulnerabilities across production and development dependencies.
- The lockfile must contain no npm-deprecated package and no Git, file, URL, or unrecognized registry source.
- Every locked registry package/version—including transitive, development, optional, and platform-specific records—must have been published at least **72 hours** before the fixed policy evaluation time.
- Dependency changes are isolated for review; lockfile changes must be explained. Automated updates may open immediately but cannot merge until the cooling-off period passes.

Run locally:

```bash
npm run supply-chain
npm run audit
npm run verify
```

The publication-age checker reads the lockfile, fetches npm registry publication metadata with bounded concurrency/retries, and fails closed on missing or malformed metadata, registry failure, future/young timestamps, deprecation metadata, or non-registry sources. `POLICY_NOW` can supply a fixed ISO-8601 UTC evaluation time; CI captures one at job start.

## Installation order

A protected pipeline must run:

1. Checkout.
2. `npm run supply-chain` using an already trusted Node runtime and repository script.
3. `npm ci --ignore-scripts` to prevent unreviewed lifecycle code from executing during initial extraction.
4. `npm run audit`.
5. Explicitly approved package rebuild/generation/build steps.

Prisma and esbuild require reviewed lifecycle/native preparation. CI therefore performs the gated no-script install first, audits it, then executes explicit project generation/build commands rather than treating lifecycle scripts as trusted before policy checks.

## Exceptions

There is no silent allowlist. An emergency exception must be an exact `name@version`, approved by two maintainers, linked to an incident/security advisory, time-limited to at most seven days, and documented in a security ADR. The preferred response is to wait, pin a known-safe older version, remove the package, or use an internally reviewed artifact.

## Limitations

A 72-hour delay is a cooling-off control, not proof of safety. It cannot detect old malware, compromised maintainers, dependency confusion, undisclosed vulnerabilities, or malicious behavior without a package advisory. Registry publication metadata is an external trust dependency and can be unavailable or altered. Additional controls remain necessary: integrity hashes, lockfile review, minimal dependencies, lifecycle-script restrictions, vulnerability scanning, protected CI, SBOM/provenance/signing work, and runtime isolation.
