## System Specification (Normative)

Status: authoritative. Consumers MUST follow this document. Non-normative narrative docs MAY exist elsewhere but this spec prevails.

### 1. Scope and Purpose

- The system ingests Chess.com player game archives into Google Sheets via Google Apps Script.
- Goals:
  - Maintain monthly `Unified_YYYY_MM` tables as the single source for analytics and reporting.
  - Provide idempotent backfill and incremental ingest for the active month.
  - Minimize redundant network calls via ETag/conditional GET.
  - Ensure operational traceability via structured logs and `GameOpsLog`.
- Non-goals:
  - No DailyTotals computations (legacy only). No exact rating deltas via callbacks in the core ingest path.

### 2. Normative Language and Global Invariants

- MUST/MUST NOT/SHOULD/SHOULD NOT as per RFC 2119 semantics.
- Invariants:
  - I1. `url` uniquely identifies a game.
  - I2. `Unified_YYYY_MM.url` values MUST be unique within each monthly sheet.
  - I3. Unified rows MUST be upserted by `url` (update if exists; insert if missing). Never append duplicates in a month.
  - I4. `Archives` rows represent per-month archive resources and MUST track `finalized` and `last_url_seen` when present.
  - I5. Ingest operations MUST be idempotent. Rerunning the same operation MUST NOT produce duplicate `Games` rows nor conflicting `GameMeta` rows.
  - I6. `end_reason` in `Games` MUST be set to the exact raw `result` of the losing side; if draw, either side’s draw code MAY be used.
  - I7. `format` MUST be determined from normalized `time_class` and `rules` according to the current mapping.
  - I8. All sheet headers MUST match the canonical definitions in DataContracts.md.
  - I9. Long-running operations MUST acquire a script lock to avoid overlap.

### 3. High-Level Architecture

- Data Source: Chess.com Public Data API (archives/monthly games) and callback endpoints for enrichments.
- Storage: Google Sheets with `Unified_YYYY_MM` monthly sheets, `Archives`, `Logs`, and `GameOpsLog`.
- Code: Google Apps Script files providing orchestration, transform, IO, logging, and API helpers.
- Logging: Structured logs in `Logs` and operational events in `GameOpsLog`.

### 3.a Configuration (Script Properties)

- Required:
  - `CHESS_USERNAME` (string): the player to ingest.
- Optional:
  - `TIMEZONE` (IANA tz, e.g., `America/New_York`). If absent, project timezone is used.
  - Spreadsheet name overrides (strings): `SPREADSHEET_NAME_*` for core spreadsheet names (Games, Archives, Logs). If absent, defaults are used.

On first setup, the system MAY create spreadsheets and persist their IDs in Script Properties as `SPREADSHEET_ID_*`.

### 4. Primary Flows (Normative)

4.1 Full Backfill (Unified)
- Discovers or iterates all monthly archive URLs from `Archives`.
- For each month:
  - Fetch with ETag support; transform to Unified rows; build a URL index from existing `Unified_YYYY_MM`.
  - Upsert only new Unified rows (URL-set dedupe) into the month sheet.
  - Update `Archives` telemetry (`etag`, `last_modified`, counts) and append ops logs.
- Time budget: MUST respect Apps Script limits. If nearing limit, MUST stop cleanly and be safe to resume.

4.2 Incremental Ingest (Active Month, Unified)
- Guarantees: idempotent, minimal work, and no duplicates.
- Steps:
  - Ensure rollover (see §5) to have exactly one `active` month.
  - Fetch active archive with ETag. If 304, mark `last_checked` and exit.
  - Transform all games to Unified rows.
  - Determine start position using `Archives.last_url_seen` (if present) by locating the last seen `url` in the archive list and taking all rows after it.
  - Upsert new Unified rows by `url` into `Unified_YYYY_MM`.
  - Update `Archives.last_url_seen` to the last appended game `url`.
  - Update telemetry and append ops logs.

4.3 Inactive Archive Recheck
Removed in simplified flow.

### 5. Rollover Semantics

- Exactly one row in `Archives` SHOULD be `active` at a time.
- At ingest start, the system MUST:
  - If no active month exists, create/activate the current year-month row with calculated `archive_url`.
  - If an active month belongs to a past month:
    - Optionally fetch once and ingest missing games (URL-set dedupe; upsert meta).
    - Mark the month `inactive` and set `finalized=true` to avoid repeated work.
    - Ensure the current month exists and is set to `active`.
- The system MUST NOT repeatedly refetch finalized months during the active ingest path.

### 6. Transform Semantics (Unified)

- Unified row includes: local dates/times, epochs, time control parsed fields, opening (eco), both players’ identity/outcomes/scores, accuracies, optional move timestamps, last-based deltas, and callback-based deltas. The full PGN is not stored.

### 7. Concurrency and Idempotency

- All top-level ingest/rollover functions MUST acquire a script lock.
- Writes MUST be batched via `setValues` where possible.
- URL-set dedupe MUST precede upsert to Unified during backfill.

### 8. Networking and Efficiency

- All archive fetches MUST use conditional GET with ETag when available.
- On 304 (Not Modified), the system MUST avoid transforms/writes and only update `last_checked`.
- On 429/5xx, the system SHOULD retry with exponential backoff.

### 9. Error Handling and Observability

- Failures SHOULD be recorded in `Logs` (level, code, message, context).
- Operational milestones MUST be recorded in `GameOpsLog` (timestamp, url, operation, status, http_code, details_json).
- On partial completion or timeouts, reruns MUST be safe and converge without duplication.

### 10. Triggers and Scheduling

- Incremental ingest SHOULD run on a frequent schedule (e.g., every 15 minutes).
- Inactive recheck SHOULD run monthly on day 2 to catch late-added games.
- Health checks MAY run to ensure rollover invariants and liveness.

### 10.a Entrypoints (Normative)

- `fullBackfill()` — performs backfill across all known archives; idempotent; time-budget aware; safe to rerun.
- `ingestActiveMonth()` — performs incremental ingest for the active month; handles rollover; idempotent.
// recheckInactiveArchives removed
- `installTriggers()` — installs time-driven triggers for incremental ingest, live stats updates, and monthly recheck.
- `healthCheck()` — verifies rollover conditions and logs status.

### 11. Legacy/Deprecated Elements

- DailyTotals sheets/code: MUST NOT be used. Any helper names that reference DailyTotals are legacy and not invoked by the core flows.
- Exact rating deltas via callbacks are out of scope for core ingest. Enrichments MAY store in a separate sheet if implemented.

### 12. Versioning

- `CONFIG.SCHEMA_VERSION` tracks schema evolution. Changes to headers or semantics MUST bump this value and be reflected in DataContracts.md.


### Appendix: Migration Notes (Games/GameMeta -> Unified)

- Rationale
  - Reduce duplication and joins in Sheets by consolidating per‑game data into a single monthly table.
  - Keep writes idempotent and incremental; scope updates to impacted URLs only.

- What changed
  - Replaced `Games` and `GameMeta` with monthly `Unified_YYYY_MM` sheets.
  - Ingest/backfill upsert Unified rows by `url`; last‑based deltas computed via per‑format cursors.
- Callback deltas are applied in-place to Unified rows; no `CallbackStats` sheet.
  - Live Stats and Ratings pipelines removed.

- Field mapping (conceptual)
  - `Games` basics (date/time_control/rated/format/my/opponent/end_reason) → Unified fields with the same semantics.
  - `GameMeta` details (epochs, base/inc/corr, eco, accuracies, identities/outcomes/scores, optional move timestamps) → Unified fields.
  - New in Unified: last‑based (my/opp pregame + delta) and callback‑based (my/opp rating change + pregame) columns.

- Operational migration steps (one‑time)
  1) Stop old triggers that write `Games`/`GameMeta`.
  2) Deploy the unified ingest/callback code and run `setupProject()`.
  3) Run `fullBackfill()` to populate historical `Unified_YYYY_MM` sheets.
  4) Validate dashboards/queries against Unified.
  5) Optionally delete legacy tabs and scripts after validation.

