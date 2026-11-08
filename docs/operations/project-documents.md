# Project-document operations

## Local architecture

`app` accepts bounded uploads and writes generated opaque objects only to `/var/lib/ppts-documents/quarantine`. `document-worker` retrieves quarantined rows, recomputes size/SHA-256, sends bytes to ClamAV using fixed `INSTREAM` frames, promotes only a strict clean result, and commits availability with an audit event. ClamAV is reachable only on the internal `document-scan` network and has no host port. The browser receives neither storage paths nor keys.

The named volumes are:

- `ppts-documents`: private quarantine/clean bytes, mounted only by app and worker;
- `ppts-clamav-definitions`: malware definitions, mounted only by ClamAV.

`make clean` deletes both volumes. Normal `make stop` preserves them.

## Local policy settings

The protected external environment file supports:

```text
DOCUMENT_MAX_BYTES=5242880
DOCUMENT_PROJECT_MAX_BYTES=104857600
DOCUMENT_PROJECT_MAX_COUNT=500
DOCUMENT_RETENTION_DAYS=0
```

The file remains outside Git with mode `0600`/`0400`. Limits are enforced again by database checks and quota transactions. Zero retention allows an authorized user to request immediate deletion; choose and document a production retention/legal-hold policy before release.

## Monitoring and incident behavior

- `QUARANTINED` and `SCANNING` are never downloadable.
- Scanner timeout, network failure, malformed response, or integrity mismatch becomes `SCAN_FAILED`; retry is bounded and remains fail-closed.
- `FOUND` becomes `REJECTED`, records only a stable reason, and removes quarantined bytes.
- `DELETE_PENDING` is immediately inaccessible. Purge errors must retain that inaccessible state and be alerted/retried.
- Never log the original filename, object key, hash, content, raw ClamAV output, or storage URL.

Operators should alert on stale quarantine rows, exhausted scan attempts, stale ClamAV definitions, repeated quota rejection, purge failures, and database/storage inventory differences. There is intentionally no “mark clean” override.

## Production gate

Do not treat the local named volume as a production object-store design. Before production, deploy private encrypted object storage with public ACLs/policies blocked, separate least-privilege app/worker/maintenance credentials, conditional object creation, lifecycle cleanup for orphan quarantine objects, approved versioning/legal hold, centralized immutable audit export, and tested PostgreSQL/object restore reconciliation. Scanner definitions require controlled updates, freshness monitoring, and fail-closed readiness.
