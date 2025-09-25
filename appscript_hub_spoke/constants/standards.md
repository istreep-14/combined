## Standards and conventions

- FORMAT is the rating bucket key across the system. Mapping rules are fixed; see `constants/formats.csv`.
- Identity:
  - Use URL as the primary game key.
  - Use configured `USERNAME` for perspective fields (`my_*`, `opp_*`, `my_color`, `opp_color`).
- Units:
  - Epochs in seconds; `*_local` are in project timezone.
  - Callback timing (`baseTime1`, `timeIncrement1`, `moveTimestamps`) are deciseconds → divide by 10.
- Moves timing:
  - Per-move time = prev_remaining − curr_remaining + increment_seconds (clamped ≥ 0).
- Results policy:
  - End reason uses loser-side code (draw: draw-family code). Bughouse partner-loss semantics apply.
- Sheets/materialization:
  - Ledger/Core are append-only and formula-free; batch writes only.
