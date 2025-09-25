## Rating change approaches (FORMAT-centric)

Key convention: FORMAT is the bucket for ratings and deltas. Use your canonical mapping (`chess` → time_class; `chess960` → live960/daily960; other variants collapse to rules). All per-format state (e.g., last rating) is keyed by FORMAT.

### 1) Last-based delta (fast, incremental)
- Idea: Keep the last seen post-game rating per FORMAT in script properties. For a new game with post-game rating `R_post`, set:
  - `my_pregame_last = last_R`
  - `my_delta_last = R_post − last_R`
  - Update `last_R = R_post`.
- Opponent inferred:
  - `opp_delta_last = − my_delta_last` (usually; first-games can differ)
  - `opp_pregame_last = opp_post − opp_delta_last`
- Pros: cheap, instant, robust enough for most sequences.
- Cons: edge cases when first game(s) in FORMAT or after inactivity; initial last_R unknown.

### 2) Callback overlay (authoritative when non-zero)
- Use Callback `ratingChangeWhite|Black` to override `my_delta`/`opp_delta` when non-zero.
- Also read pregame ratings from Callback `players.{color}.rating` when provided (post-game snapshot often equals PGN/JSON post; pregame not guaranteed).
- Policy: `final_delta = (delta_cb != 0 ? delta_cb : delta_last)`.

### 3) Estimation model (analytics only, not for ledger)
- Purpose: build analytics like expected score, performance ratings, and variance trends; do not overwrite ledger.
- Sketch: Given result and post-game ratings and an Elo/Glicko-like response curve, estimate pregame ratings by solving for ratings that produce the observed deltas and outcomes.
  - Expected score `E = 1/(1 + 10^((R_opp − R_my)/400))` (Elo proxy)
  - Observed score `S ∈ {1, 0.5, 0}`; Delta magnitude relates to K-factor (or Glicko’s volatility/RD);
  - Over many games in a FORMAT, RD tends to shrink → deltas shrink for similar outcomes; infer “stability”.
- Outputs (analytics workspace):
  - `expected_score` per game
  - `performance_score` over windows (sum S / games)
  - `opponent_avg_pregame_est`
  - `my_avg_pregame_est`
  - `stability_proxy` (rolling delta magnitude vs time)

Keep all of (3) under `analysis/` and never mix into real-time ledger; it’s exploratory.
