## API Contracts and Mappings (Normative)

Status: authoritative. API endpoints and helper behaviors MUST conform to this spec.

### 1) Endpoints

- Player Archives List
  - Function: `playerArchivesListUrl(username)`
  - URL: `https://api.chess.com/pub/player/{username}/games/archives`
  - Method: GET
  - Response: `{ archives: ["https://api.chess.com/pub/player/{username}/games/YYYY/MM", ...] }`

- Player Archive (Monthly)
  - Function: `playerArchiveMonthUrl(username, year, month)`
  - URL: `https://api.chess.com/pub/player/{username}/games/YYYY/MM` (MM is zero-padded)
  - Method: GET
  - Response: `{ games: [ Game, ... ] }` (see Archive Game object fields below)

- Player Stats (optional for LiveStats)
  - Function: `playerStatsUrl(username)`
  - URL: `https://api.chess.com/pub/player/{username}/stats`
  - Method: GET
  - Response: Chess.com player stats JSON (used to compute LiveStats tables).

- Live Stats (Chess.com callback)
  - Function: `liveStatsUrl(format, username)`
  - URL: `https://www.chess.com/callback/stats/live/{format}/{username}/0`
  - Method: GET
  - Response: JSON used for LiveStatsEOD/Meta population.

- Game Callback (optional enrichments)
  - Functions: `callbackLiveGameUrl(id)`, `callbackDailyGameUrl(id)`
  - URLs: `https://www.chess.com/callback/live/game/{id}`, `https://www.chess.com/callback/daily/game/{id}`

### 2) HTTP Helpers

- `fetchJsonWithEtag(url, etag)`
  - Adds headers: `User-Agent: ChessSheets/1.0`, `Accept: application/json`, `If-None-Match: {etag}` when provided.
  - Retries on 429 and 5xx with exponential backoff.
  - Returns one of:
    - `{ status: 'ok', code: 2xx, json, etag, lastModified }`
    - `{ status: 'not_modified', code: 304, etag, lastModified }`
    - `{ status: 'error', code, error, etag?, lastModified? }`

- `fetchJsonBatchWithEtag(urls, etags)`
  - Parallel fetches with per-request ETag.
  - Returns array of result objects in same order as `urls`.

### 3) Transform Contract (Archive → Rows)

- Function: `transformArchiveToRows(username, json)`
  - Input: JSON from monthly archive endpoint.
  - Output: Array of `Games` rows. Each row has a non-standard `_meta` property holding a `GameMeta` row to upsert.
  - Guarantees:
    - `Games` row order matches the archive order.
    - `Games[0]` is `url` and MUST be non-empty when present in source.
    - `_meta[0]` is `url` and `_meta[1]` is `id`; `id` is extracted from the URL tail and MUST be provided for callbacks.

### 4) Format Derivation

- Normalize `time_class` to: `bullet|blitz|rapid|daily`.
- Normalize `rules` to: `chess|chess960`.
- `format` := `rules == chess ? time_class : rules + '-' + time_class`.

### 5) End Reason Policy

- `end_reason` MUST be the exact raw `result` of the loser.
- On draws, choose either side’s draw code (e.g., `agreed`, `repetition`, `stalemate`, `insufficient`, `50move`, `timevsinsufficient`).
- PGN Termination MUST NOT override this policy.

### 6) Rollover and Cursor Policy

- Active month is the only target of incremental ingest.
- `last_url_seen` in `Archives` is used as a cursor. When present, ingestion MUST locate that `url` in the fetched archive and ingest rows after it.
- `finalized=true` marks an inactive month that SHOULD NOT be refetched in the active-ingest path.

### 7) Idempotency and Upserts

- Backfill MUST deduplicate by URL against existing `Games`.
- `GameMeta` MUST be upserted by `url` on all ingest paths.

### 8) Archive Game Object (Source Reference)

- Fields used: `url, pgn, time_control, end_time, start_time, time_class, rules, accuracies{white,black}, tcn, initial_setup, fen, uuid (ignored), white{username,rating,result,@id,uuid}, black{username,rating,result,@id,uuid}, tournament, match, eco (url)`
- PGN headers used: `Link, TimeControl, UTCDate, UTCTime, ECO, ECOUrl, StartTime, EndTime, Termination`.

