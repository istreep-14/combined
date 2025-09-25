## Time control, time class, and clock mechanics

### Sources and shapes
- JSON `games[].time_control`: PGN-style string, examples: `60`, `300+2`, `1/86400`.
- PGN `TimeControl`: same as JSON (string).
- Callback `game.baseTime1`, `game.timeIncrement1`: base seconds and increment seconds as numbers.

### Parsing to base and increment
- Base time (seconds): parse integer before `+` or `/` when present; if bare number, it is the base seconds.
- Increment (seconds): parse integer after `+` (live increment). If `/` is present, treat as correspondence seconds per move; increment = 0.

Examples:
- `300+2` → base = 300, increment = 2
- `60` → base = 60, increment = 0
- `1/86400` → base = 1 (per-move base in days context), corr = 86400 (seconds per move)

### Estimating total time and mapping to time class
Chess.com uses an average game length of 40 moves per player to estimate total time per side:

EstimatedMinutes = (base_seconds + increment_seconds × 40) ÷ 60

Time class thresholds:
- Bullet: EstimatedMinutes < 3
- Blitz: 3 ≤ EstimatedMinutes < 10
- Rapid: EstimatedMinutes ≥ 10

Examples (Live):
- 5 | 0 → 5.0 minutes → Blitz
- 10 | 0 → 10.0 minutes → Rapid
- 2 | 12 → (120 + 12×40)/60 = 10.0 minutes → Rapid
- 3 | 0 → 3.0 minutes → Blitz
- 4 | 4 → (240 + 160)/60 = 6.67 minutes → Blitz
- 15 | 10 → (900 + 400)/60 ≈ 21.67 minutes → Rapid
- 1 | 5 → (60 + 200)/60 = 4.33 minutes → Blitz
- 1 | 0 → 1.0 minutes → Bullet

### Variants and canonical format
- Standard rules `chess`: `format = time_class`.
- `chess960`: live buckets (bullet/blitz/rapid) → `live960`; daily → `daily960`.
- Other variants (`bughouse`, `crazyhouse`, `kingofthehill`, `threecheck`): `format = rules` (time class collapsed).

### Live vs Daily
- Live: real-time play where both clocks run during the session; encompasses Bullet, Blitz, Rapid.
- Daily: correspondence play with per-move allotments (e.g., `1/86400`), no live increment; players may move hours/days apart.
- Sources:
  - JSON: `time_control` string encodes live increments with `+` and daily with `/`.
  - Callback: `isLiveGame` indicates live vs daily explicitly.
  - Mapping: if `isLiveGame` is true → one of Bullet/Blitz/Rapid; if false → Daily.

### Clock mechanics summary
- Each player has an independent clock; only the side to move is ticking.
- With increment, after a player completes a move their clock increases by the increment amount.
- With correspondence (`1/86400`), per-move allotment is in seconds per move; no live increment.
- A player loses on time when their clock reaches zero while it is their turn.

Result code links:
- Loss on time: `timeout`.
- Timeout vs insufficient material: `timevsinsufficient` (draw on the side that had material insufficiency).

### Field relationships across sources
- Base/increment can be parsed from JSON/PGN `time_control` or read directly from Callback `baseTime1`, `timeIncrement1`.
- Time class derives from estimated total minutes using the 40-move heuristic as above.
