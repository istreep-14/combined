### Archive Game Schema (Raw)

This document describes the raw fields returned by Chess.com archive endpoints. It applies to:
- Monthly archives: `https://api.chess.com/pub/player/{username}/games/{YYYY}/{MM}`
- Time-control archives (observed): `https://api.chess.com/pub/player/{username}/games/live/{BASE}/{INCREMENT}`

Both yield the same game object structure. Some fields are optional.

### Game Object Fields

- url (string)
  - Example: https://www.chess.com/game/live/142733007366
- pgn (string)
  - Full PGN including headers and movetext
- time_control (string)
  - Examples: "180", "120+1", "60", "1/86400"
- start_time (number, optional)
  - Unix seconds; usually present for Daily, absent for Live
- end_time (number)
  - Unix seconds; always present
- rated (boolean)
  - True if game changes ratings
- accuracies (object, optional)
  - white (number), black (number)
- uuid (string)
  - Game UUID
- initial_setup (string)
  - Initial FEN; standard start for most games
- fen (string)
  - Final FEN
- time_class (string)
  - One of: bullet, blitz, rapid, daily
- rules (string)
  - chess, chess960, threecheck, kingofthehill, bughouse, crazyhouse, ...
- white (object)
  - username (string), rating (number), result (string), @id (string), uuid (string)
- black (object)
  - username (string), rating (number), result (string), @id (string), uuid (string)
- eco (string, optional)
  - Opening URL (e.g., "https://www.chess.com/openings/...")
- tournament (string, optional)
  - Tournament URL
- match (string, optional)
  - Team match URL

### PGN Headers (inside pgn)

- Event, Site, Date, Round
- White, Black (usernames)
- Result (1-0 | 0-1 | 1/2-1/2)
- CurrentPosition (final FEN)
- Timezone (e.g., UTC)
- ECO (code) and ECOUrl (URL)
- UTCDate, UTCTime
- WhiteElo, BlackElo
- TimeControl (mirrors time_control)
- Termination (free text reason)
- StartTime, EndDate, EndTime
- Link (game URL)
- Movetext after a blank line

### Derived Fields (used elsewhere in this repo)

- type: live | daily (from time_class)
- id: last path segment of url
- base_time, increment, correspondence_time: parsed from time_control
- start_time (localized string): from start_time or PGN UTC headers
- end_time (localized string): from end_time
- duration_seconds: end - start when both epochs known
- format: from rules/time_class (see Constants)
- Identity (player/opponent) and outcomes: from configured username and results
- eco_code: PGN ECO (code); eco_url: PGN ECOUrl (fallback json.eco)

### Result Codes (player.result → outcome)

See `Constants.md` for the mapping table; typical values include win, checkmated, resigned, timeout, abandoned, agreed, repetition, stalemate, insufficient, 50move, timevsinsufficient, etc.

### Notes

- Live archives may omit start_time in JSON; use PGN UTCDate+UTCTime.
- accuracies is sparse; handle absence.
- json.eco is a URL; ECO "code" comes from PGN ECO.
- tournament/match are optional and not common in ad-hoc live games.

