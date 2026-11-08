# ADR 0002: Quarantine-first private project documents

- **Status:** Accepted for the local parity implementation; production policy approval remains required
- **Date:** 2026-11-08

## Context

Legacy PPTS moved arbitrary browser uploads into a world-readable web directory built from client/project names. It trusted filenames and paths and offered direct links and path-selected deletion. Preserving those mechanics would recreate path traversal, unrestricted upload, authorization, malware, and data-exposure defects.

## Decision

PPTS preserves the useful outcomes—upload, bounded project listing, download, and deletion—behind a new trust boundary:

- authenticated, project-scoped capability checks on every operation;
- exact-Origin multipart upload with a hard streaming limit and one file/one idempotency field;
- Unicode-normalized display names that can never become paths or object keys;
- random 128-bit lowercase hexadecimal object keys;
- private named-volume storage split into quarantine and clean areas;
- a deliberately narrow PDF, UTF-8 text, PNG, and JPEG allowlist with extension/signature agreement;
- SHA-256 and exact-size integrity metadata;
- fail-closed `UPLOADING → QUARANTINED → SCANNING → AVAILABLE` state transitions;
- a separate document worker and pinned ClamAV container on an internal-only network;
- scanner timeout, protocol error, disconnection, or integrity mismatch leaves the file unavailable;
- application-proxied attachment download with fresh authorization, durable issuance audit, `nosniff`, and private/no-store caching;
- immediate logical deletion followed by object purge and a retained metadata/audit tombstone;
- per-project byte and count quotas, idempotent submission IDs, optimistic versions, database checks, and atomic success audit events.

The app and worker currently share one local named volume because the local Compose deployment is single-host. Quarantine is never served. Production must use independently credentialed private object storage: app write-quarantine/read-clean, scanner read/delete-quarantine/write-clean, and a separate maintenance principal.

## Consequences and decision gates

Production uploads remain blocked until owners approve allowed formats, byte/count and ingress quotas, retention/legal-hold behavior, malware-signature freshness/alerting, KMS/encryption, object versioning, backup deletion, and restore/reconciliation procedures. The local default retention is zero days, which allows explicit immediate deletion and is not a production policy recommendation.

An unavailable scanner cannot make a file available. A document may remain quarantined or `SCAN_FAILED` for retry, but there is no administrative “mark clean” bypass. Existing metadata-only rows are migrated to `REJECTED` because their bytes and scan provenance cannot be established.
