## Chess Ingest

Google Apps Script to ingest Chess.com games into Google Sheets with a lean `Games` table and a rich `GameMeta` table. Backfill runs once; incremental ingest maintains the active month using ETags and a `last_url_seen` cursor. Ratings/Adjustments timeline is removed. Optional `DailyTotals` builder can compute per-day aggregates.

### Quick Start

1. In Apps Script, set Script Properties:
   - `CHESS_USERNAME` (required)
   - `TIMEZONE` (optional, e.g., `America/New_York`)
2. Run `setupProject()`.
3. Run `fullBackfill()` once (safe to resume on timeouts).
4. Run `installTriggers()`.

### Entry Points

- `fullBackfill()` — processes one non-finalized, non-active archive per run (safe to rerun).
- `ingestActiveMonth()` — incremental ingest of the active month; also handles rollover (activates current month, finalizes previous).

### Authoritative Specs

- System: `specs/SystemSpec.md`
- Data: `specs/DataContracts.md`
- APIs: `specs/APIContracts.md`

### Notes

- `GameMeta` now stores both last-based and callback-based pregame/delta fields, plus per-format snapshots: `my_snapshot_bullet|blitz|rapid|daily`.
- `Archives` header is simplified to 10 columns, including `schema_version`, `finalized`, and `last_url_seen`.

