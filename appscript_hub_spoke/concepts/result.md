## Result, outcome, termination, and end reason

This concept aligns result-related fields across sources (JSON, PGN, Callback), defines clear variable names, and shows how to compute perspective-aware outcomes and an authoritative end reason.

### Source fields
- JSON archive
  - `games[].white.result`, `games[].black.result` → engine-style tokens: `win`, `checkmated`, `timeout`, `resigned`, `abandoned`, `agreed`, `repetition`, `stalemate`, `insufficient`, `50move`, `timevsinsufficient`, plus variant codes.
- PGN
  - `Result` → `1-0`, `0-1`, `1/2-1/2`.
  - `Termination` (optional) → human text, e.g., `Sarabi07 won on time`.
- Callback
  - `game.colorOfWinner` → `white` | `black`.
  - `game.gameEndReason` → token (same family as JSON result codes; see constants/result_codes.csv).
  - `game.resultMessage` → human text, e.g., `X won on time`.
  - `game.changesPlayersRating` → 1/0 (whether the game affects rating).
  - `game.ratingChange`, `game.ratingChangeWhite`, `game.ratingChangeBlack` → numeric deltas (when available).

See also: `constants/result_codes.csv` for standardized code families, including variant-only codes like `bughousepartnerlose`, `kingofthehill`, `threecheck`.

### Canonical variable names (what you likely want to store)
- `standard_result_string` → `1-0` | `0-1` | `1/2-1/2` (white-left notation).
- `standard_result_numeric_white` → 1 | 0 | 0.5 (white perspective numeric).
- `my_result_numeric` → 1 | 0 | 0.5 (perspective of configured user).
- `my_outcome_text` → `win` | `loss` | `draw`.
- `opp_outcome_text` → `win` | `loss` | `draw`.
- `end_reason_code` → single token representing why the game ended (loser-side when decisive; draw-family when drawn).
- `termination_text` → human-readable message (prefer Callback `resultMessage`, else PGN `Termination`).

Note: `end_reason_code` is not per-player; it describes the cause of the game end. Outcomes (win/loss/draw) are per-player.

### Derivations and precedence
Preferred precedence when multiple sources are available:
1) Outcome (who won): Callback `colorOfWinner` → else JSON white/black result → else PGN `Result`.
2) End reason: Callback `gameEndReason` (authoritative) → else JSON loser-side code (or draw code) → else infer from PGN `Termination` text when parsable.
3) Termination text: Callback `resultMessage` → else PGN `Termination` → else synthesize from winner+reason when needed.

### Mappings and formulas
- `standard_result_string` from winner/draw:
  - winner=`white` → `1-0`
  - winner=`black` → `0-1`
  - draw → `1/2-1/2`

- `standard_result_numeric_white` from `standard_result_string`:
  - `1-0` → 1, `0-1` → 0, `1/2-1/2` → 0.5

- Perspective numeric for configured user (`my_color` ∈ {`white`,`black`}):
  - If `my_color=white`: `my_result_numeric = standard_result_numeric_white`
  - If `my_color=black`: `my_result_numeric = 1 - standard_result_numeric_white` (draw stays 0.5)

- Outcome text per player:
  - If `my_result_numeric = 1` → `my_outcome_text = win`
  - If `my_result_numeric = 0.5` → `my_outcome_text = draw`
  - If `my_result_numeric = 0` → `my_outcome_text = loss`
  - `opp_outcome_text` is the opposite (draw stays draw)

- End reason policy (`end_reason_code`):
  - If decisive, choose the loser-side code.
    - From Callback: `end_reason_code = game.gameEndReason`.
    - From JSON: If `white.result = win`, then use `black.result`; if `black.result = win`, use `white.result`.
  - If draw, use the draw-family code present (e.g., `agreed`, `repetition`, `stalemate`, `insufficient`, `50move`, `timevsinsufficient`).
  - Bughouse: if loser code is `bughousepartnerlose` the other board ended the match (do not infer partner-loss from a win).

### PGN vs Callback text
- `termination_text`: Prefer Callback `resultMessage` (e.g., `Leesaw10 won on time`); else PGN `Termination` (same idea, slightly different formatting).
- `standard_result_string` remains the compact canonical score string `1-0` / `0-1` / `1/2-1/2`.

### Example
Callback excerpt:
```
game.colorOfWinner = "black"
game.gameEndReason = "timeout"
game.resultMessage = "Leesaw10 won on time"
```
Derivations:
- `standard_result_string = 0-1`
- `standard_result_numeric_white = 0`
- If my username is `FrankScobey` (white) → `my_result_numeric = 0`, `my_outcome_text = loss`
- `end_reason_code = timeout`
- `termination_text = "Leesaw10 won on time"`

### Notes and variant reminders
- Variant-only codes live in `constants/result_codes.csv` (e.g., `kingofthehill`, `threecheck`, `bughousepartnerlose`).
- For Bughouse, any loser-side code other than `bughousepartnerlose` implies this-board end; `bughousepartnerlose` implies partner board ended it.

