## Chess Ingest

Google Apps Script to ingest Chess.com games into Google Sheets with a lean `Games` table and a rich `GameMeta` table. Backfill runs once; incremental ingest maintains the active month using ETags and a `last_url_seen` cursor. DailyTotals is removed.

### Quick Start

1. In Apps Script, set Script Properties:
   - `CHESS_USERNAME` (required)
   - `TIMEZONE` (optional, e.g., `America/New_York`)
2. Run `setupProject()`.
3. Run `fullBackfill()` once (safe to resume on timeouts).
4. Run `installTriggers()`.

### Entry Points

- `fullBackfill()` — backfills all archives (idempotent).
- `ingestActiveMonth()` — incremental ingest of the active month; handles rollover.
- `recheckInactiveArchives()` — monthly recheck for inactive months.

### Authoritative Specs

- System: `specs/SystemSpec.md`
- Data: `specs/DataContracts.md`
- APIs: `specs/APIContracts.md`

