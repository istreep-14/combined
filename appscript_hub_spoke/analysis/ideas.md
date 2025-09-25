## Analysis ideas (future work, separate from ledger)

- Expected score per game: Elo proxy using rating gap at (estimated) pregame
- Performance rating over windows: solve for rating that yields observed score vs opponents
- Stability/consistency: rolling average of |delta| per FORMAT; variance trends
- Time-of-day and weekday effects: outcome vs end_time_local features
- Move-tempo vs accuracy: correlate per-move time and `accuracies.*`
- Opening families: ECO family (A–E) vs outcome and accuracy
- Clutch factor: outcome of materially even positions near time trouble (needs engine/clock data)
- Opponent profiling: membership tiers, country, online status vs outcome (exploratory)
- Draw taxonomy: repetition vs agreed vs stalemate distributions per FORMAT
- Session fatigue: streak-length vs delta magnitude and blunder rate (needs engine eval)

Additional quick-win ideas
- Color imbalance over time; first-move advantage per FORMAT
- Session grouping by inter-game gaps; tilt detection
- Opponent repeat-match performance
- PGN clocks presence vs outcome (with/without clocks)
- Increment utilization rate per game/FORMAT

Note: keep all heavy/statistical work here; ledger/Core remain formula-free and fast.
