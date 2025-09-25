## Time: start, end, localization, and duration

This document outlines how to get game start/end times, how to localize and format them, how to derive duration, and which convenient fields to materialize for analysis. Priority is JSON/PGN; callback is optional enrichment. Avoid overlapping fields that say the same thing (e.g., prefer `live_vs_daily` over duplicative `is_correspondence`).

### Primary sources (JSON/PGN-first)
- JSON end time (authoritative): `games[].end_time` (epoch seconds)
- PGN start (UTC): `UTCDate` + `UTCTime` when present (e.g., `2025.09.23` + `17:30:12`)
- PGN local end strings (optional): `EndDate`, `EndTime`
- Optional callback fields (enrichment): `game.endTime` (epoch), `game.moveTimestamps` (deciseconds)

### Localization and formatting
- Convert epoch seconds to the project timezone for display and downstream fields.
- Recommended output formats:
  - `start_time_local`: `yyyy-MM-dd HH:mm:ss`
  - `end_time_local`: `yyyy-MM-dd HH:mm:ss`
  - `date` (from end): `yyyy-MM-dd`
  - `end_time` (time-of-day from end): `HH:mm:ss`

Timezone nuances:
- PGN `Timezone` header may specify the context for `StartTime`/`EndTime`; when present and not `UTC`, treat `UTCDate`/`UTCTime` as authoritative for start and use `Timezone` for local strings.
- Always store/compute with epoch seconds internally, and localize only at materialization time.
- Be explicit about the project timezone (e.g., set once in configuration) to ensure consistent `*_local` fields across sessions.

Notes:
- Prefer JSON `end_time` for end-of-game time; fall back to callback `endTime` if JSON not available.
- For start time on live games, prefer PGN `UTCDate` + `UTCTime` parsed as UTC, then localized.
- If PGN start is missing, you may estimate from callback (when available) using `moveTimestamps` (sum of deciseconds ÷ 10) or base/inc and move count (approximation). Otherwise, leave `start_time_local` blank.

### Deriving duration
- When both start and end epochs are available: `duration_seconds = end_time_epoch - start_time_epoch` (guard against negatives/missing)
- Live games: duration is meaningful for session time analysis.
- Daily (correspondence) games: duration can span hours/days; include it for completeness but avoid mixing into live duration averages. Consider separate metrics per format or exclude daily from time-spent analyses.

Daily caution:
- Daily time controls (`1/86400`) provide per-move allotments; elapsed wall time says little about “time spent playing.” Flag or filter daily when aggregating durations.

### Convenient derived fields (mostly from end-of-game, localized)
- From `end_time_local` unless otherwise stated:
  - `date` → `yyyy-MM-dd` (end date)
  - `year` → `YYYY`
  - `month` → `MM`
  - `day` → `DD`
  - `hour` → `HH`
  - `minute` → `mm`
  - `second` → `ss`
  - `weekday` → `Mon`..`Sun` (or numeric 1–7)
  - `week_iso` → ISO week number (optional)
  - `end_time` → `HH:mm:ss` (time-of-day at end)

These make queries and pivots easier without spreadsheet formulas.

### Live vs Daily start hints (without callback)
- Live (Bullet/Blitz/Rapid) often includes PGN `UTCDate`/`UTCTime` → parse as start.
- Daily (correspondence) rarely has precise start; if missing, leave start blank and refrain from duration unless you can compute from move data.

### Callback enrichment (optional)
- `game.endTime` (epoch) can substitute when JSON `end_time` is missing.
- `game.moveTimestamps` are in deciseconds; dividing by 10 yields seconds between move events. Summing can bound actual elapsed time but may not include pauses between games and UI delays.

### Example mapping
- Input: `games[].end_time = 1758588348` → `end_time_local = 2025-09-23 00:45:48` (example TZ)
- Input: PGN `UTCDate=2025.09.23`, `UTCTime=00:40:00` → `start_time_local = 2025-09-23 00:40:00`
- Duration: `duration_seconds = 348`
- Derived: `date=2025-09-23`, `year=2025`, `month=09`, `day=23`, `hour=00`, `minute=45`, `second=48`, `end_time=00:45:48`

### Practical tips
- Normalize all stored date-times to a single, explicit timezone for display (store raw epoch too when possible).
- Avoid mixing daily and live durations in the same averages; report separately by `format`.
- Keep end-of-game derived fields (`date`, `year`, etc.) tied to the end timestamp to maintain consistency across the model.
