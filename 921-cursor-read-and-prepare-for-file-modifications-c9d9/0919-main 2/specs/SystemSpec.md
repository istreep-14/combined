## System Specification (Normative)

Status: authoritative. Consumers MUST follow this document. Non-normative narrative docs MAY exist elsewhere but this spec prevails.

### 1. Scope and Purpose

- The system ingests Chess.com player game archives into Google Sheets via Google Apps Script.
- Goals:
  - Maintain a lean `Games` table for analytics and a rich `GameMeta` table for details.
  - Provide idempotent backfill and incremental ingest for the active month.
  - Minimize redundant network calls via ETag/conditional GET.
  - Ensure operational traceability via structured logs and `GameOpsLog`.
- Non-goals:
  - Ratings/Adjustments timeline is removed. DailyTotals is optional (builder provided separately). Callback deltas are used only to enrich `GameMeta`.

### 2. Normative Language and Global Invariants

- MUST/MUST NOT/SHOULD/SHOULD NOT as per RFC 2119 semantics.
- Invariants:
  - I1. `url` uniquely identifies a game across all sheets.
  - I2. `Games.url` values MUST be unique (no duplicates).
  - I3. `GameMeta` MUST be upserted by `url` (update row if exists; insert if missing). Never append duplicates.
  - I4. `Archives` rows represent per-month archive resources and MUST track `finalized` and `last_url_seen` when present.
  - I5. Ingest operations MUST be idempotent. Rerunning the same operation MUST NOT produce duplicate `Games` rows nor conflicting `GameMeta` rows.
  - I6. `end_reason` in `Games` MUST be set to the exact raw `result` of the losing side; if draw, either side’s draw code MAY be used.
  - I7. `format` MUST be determined from normalized `time_class` and `rules` according to the current mapping.
  - I8. All sheet headers MUST match the canonical definitions in DataContracts.md.
  - I9. Long-running operations MUST acquire a script lock to avoid overlap.

### 3. High-Level Architecture

- Data Source: Chess.com Public Data API (archives, monthly games, player stats). Optional: internal callback endpoints for enrichments.
- Storage: Google Sheets in one or more spreadsheets (Games, GameMeta, Archives, Logs, LiveStats, PlayerStats, etc.).
- Code: Google Apps Script files providing orchestration, transform, IO, logging, and API helpers.
- Logging: Structured logs in `Logs` and operational events in `GameOpsLog`.

### 3.a Configuration (Script Properties)

- Required:
  - `CHESS_USERNAME` (string): the player to ingest.
- Optional:
  - `TIMEZONE` (IANA tz, e.g., `America/New_York`). If absent, project timezone is used.
  - Spreadsheet name overrides (strings): `SPREADSHEET_NAME_*` for Games, Archives, Logs, Stats, LiveStats, etc. If absent, defaults are used.

On first setup, the system MAY create spreadsheets and persist their IDs in Script Properties as `SPREADSHEET_ID_*`.

### 4. Primary Flows (Normative)

4.1 Full Backfill
- Discovers or iterates all monthly archive URLs from `Archives`.
- For each month:
  - Fetch with ETag support; transform to `Games` rows; build a URL index from existing `Games` rows.
  - Append only new `Games` rows (URL-set dedupe). Upsert corresponding `GameMeta` rows by `url`.
  - Update `Archives` telemetry (`etag`, `last_modified`, last_checked) and append ops logs.
- Time budget: MUST respect Apps Script limits. If nearing limit, MUST stop cleanly and be safe to resume.

4.2 Incremental Ingest (Active Month)
- Guarantees: idempotent, minimal work, and no duplicates.
- Steps:
  - Ensure rollover (see §5) to have exactly one `active` month.
  - Fetch active archive with ETag. If 304, mark `last_checked` and exit.
  - Transform all games to rows.
  - Determine start position using `Archives.last_url_seen` (if present) by locating the last seen `url` in the archive list and taking all rows after it.
  - Append new `Games` rows; upsert `GameMeta` by `url`. Fill last-based fields and per-format snapshots during write.
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

### 6. Transform Semantics (Key Rules)

- `Games` row:
  - `date` is the local date (yyyy-MM-dd) of `end_time`.
  - `start_time`/`end_time` are local date-time strings.
  - `time_control` is the raw PGN-compliant string.
  - `rated` is boolean.
  - `format` is derived from normalized `time_class` and `rules`.
  - `my_color`, `my_rating`, `my_outcome` come from the player matching configured username.
  - `opponent_username`, `opponent_rating` from the opponent.
  - `end_reason` derived as in I6.

- `GameMeta` row:
  - Includes detailed fields (epochs, base/inc/corr from parsed time control, opening, both players’ identity/outcomes/scores, accuracies, PGN-derived pgn_moves, tcn, FEN, etc.). The full PGN MUST NOT be stored.
  - MUST be upserted by `url`.

### 7. Concurrency and Idempotency

- All top-level ingest/rollover functions MUST acquire a script lock.
- Writes MUST be batched via `setValues` where possible.
- URL-set dedupe MUST precede append to `Games` during backfill.
- `GameMeta` MUST be upserted by `url` to avoid duplicates and to allow overwriting partial data with richer data on reruns.

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
- Inactive recheck removed; rollover is folded into ingest.
- Health checks MAY run to ensure rollover invariants and liveness.

### 10.a Entrypoints (Normative)

- `fullBackfill()` — performs backfill across all known archives; idempotent; time-budget aware; safe to rerun.
- `ingestActiveMonth()` — performs incremental ingest for the active month; handles rollover; idempotent.
// recheckInactiveArchives removed
- `installTriggers()` — installs time-driven triggers for incremental ingest, live stats updates, and monthly recheck.
- `healthCheck()` — verifies rollover conditions and logs status.

### 11. Legacy/Deprecated Elements

- Ratings timeline and adjustments are deprecated. Callback deltas populate `GameMeta` fields; no separate Ratings sheet exists.

### 12. Versioning

- `CONFIG.SCHEMA_VERSION` tracks schema evolution. Changes to headers or semantics MUST bump this value and be reflected in DataContracts.md.

