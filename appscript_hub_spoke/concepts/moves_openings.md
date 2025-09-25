## Moves, clocks, openings, and FEN/setup

JSON/PGN-first, with callback as optional enrichment. This document groups move text and timing, opening information (ECO), and board position fields (initial setup, current snapshot, final FEN).

### Move sources
- JSON archive: `games[].pgn` contains full PGN (headers + movetext). The movetext may include clock annotations like `[%clk 0:01:00]` (remaining time after the move).
- PGN header/body: Same as above (PGN string).
- Callback (optional): `game.moveList` (encoded), `game.moveTimestamps` (deciseconds), and sometimes `plyCount`.

Accuracy and performance (JSON analysis):
- `games[].accuracies.white`, `games[].accuracies.black` — engine-derived accuracy percentages when available.
- These can enrich performance analyses alongside per-move time data (e.g., accuracy vs time spent, accuracy vs opening families).

### Per-move time from PGN clock annotations
- PGN annotations `[%clk HH:MM:SS(.t)]` show the mover’s remaining clock after that move.
- For a given side, time spent on a move ≈ previous remaining − current remaining + increment.
  - Use parsed increment from `TimeControl` (see `concepts/time_control.md`).
  - For the first move by a side, baseline is the base time.
  - Clamp negatives to zero to guard minor rounding noise.
- Each player has an independent clock. Clocks tick only when it is that player’s turn; moves alternate sides.

### Per-move time from callback timestamps
- `game.moveTimestamps` are deciseconds (×10). Divide by 10 to get seconds.
- These represent remaining time snapshots after moves (analogous to PGN `[%clk]`). Apply the same per-move time formula per side: prev − curr + inc.
- `baseTime1` and `timeIncrement1` are also in deciseconds; divide by 10 for seconds.

Callback move encodings:
- `game.moveList` is an internal encoded representation; not required if you keep PGN movetext. You can ignore it unless you need lower-level event reconstruction.
- `game.lastMove` is a short marker string for UI/debug; treat as informational.
- `game.turnColor` indicates whose turn it was at the capture/end. If a side was checkmated, `turnColor` may reflect the side that would have moved next absent checkmate (i.e., the mated side just moved and got mated by opponent, resulting in no further turn).

### Ply count and move indexing
- Ply count (half-moves) can be derived from PGN movetext or taken from callback `plyCount` when present.
- Derive move number as `1 + floor(ply_index/2)`; side to move alternates white (even ply starting at 0) then black.

### Opening information (ECO)
- PGN headers:
  - `ECO` is the ECO code (e.g., `B01`).
  - `ECOUrl` is a URL to the opening page (human-readable name is on that page).
- JSON archive:
  - `games[].eco` is a URL that matches the PGN `ECOUrl` (when present). Treat it as the canonical opening page link.
- Recommended storage:
  - `eco_code` (from PGN `ECO`)
  - `eco_url` (from JSON `games[].eco` or PGN `ECOUrl`)
  - Optional: `eco_name` if you later enrich by fetching the page or another catalog.

### Board position fields
- Initial setup (variants/Chess960):
  - PGN `SetUp = "1"` indicates a non-standard initial position.
  - PGN `FEN` then gives the initial setup FEN.
- Current position snapshot:
  - PGN `CurrentPosition` is a snapshot at save time (not guaranteed to equal the final position).
- Final position:
  - JSON `games[].fen` is the final position FEN (authoritative at end of game).

### Suggested normalized fields
- Moves and timing
  - `pgn_moves` (text): movetext extracted from PGN (no headers)
  - `ply_count` (number): derived or from callback
  - `per_move_time_seconds_white[]`, `per_move_time_seconds_black[]` (arrays or serialized): from PGN clocks or callback timestamps
  - `avg_move_time_seconds_white`, `avg_move_time_seconds_black` (numbers): convenient aggregates
- Opening
  - `eco_code` (string), `eco_url` (url), `eco_name` (string; optional enrichment)
- Positions
  - `initial_setup_fen` (string), `setup_flag` (boolean/String `SetUp`)
  - `current_position_fen_snapshot` (string)
  - `final_fen` (string)

### Caveats and notes
- Not all PGNs include `[%clk]` annotations; when missing, per-move times cannot be reconstructed from PGN alone.
- Callback timestamps are deciseconds and may omit UI or network delays; use as an approximation of thinking time.
- ECO data in archives may be absent for some games; store blanks and enrich later if needed.
- `CurrentPosition` is informational; do not treat as final FEN.

