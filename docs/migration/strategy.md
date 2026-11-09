# Legacy migration strategy

Migration is deferred until core domain rules stabilize. It will use repeatable, read-only extraction from an immutable legacy snapshot—never direct production coupling.

The process will explicitly profile and reconcile character encoding, MySQL zero dates, historical timezone/DST, text usernames, orphaned relationships, overlapping/open time entries, archived flags, and filesystem documents. Every run will emit source/target counts, mappings, rejected rows with reasons, per-user/project/month time totals, and document manifests with hashes. `tests/fixtures/legacy-monthly-report.json` and its checksum-bound regression establish the initial report reconciliation contract without introducing real legacy data: ordinary totals must match, while end-time-only month allocation, dropped whole days, and exact-60-minute carry are reported as intentional corrections.

Legacy home addresses, birthdays, personal phone numbers, server credentials/paths, and rich HTML-like content are excluded by default pending purpose, access, retention, and sanitization decisions. Original IDs may be retained only in private migration mapping tables, never as public identifiers.

Cutover will rehearse snapshot, ETL, reconciliation, final write freeze, rollback, and legacy read-only retention before old credentials and systems are retired.
