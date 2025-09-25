## Game ID and canonical URL

### Sources
- JSON `games[].url`: Canonical game URL (primary key). Example: `https://www.chess.com/game/live/124221014703`.
- PGN `Link`: Same as JSON URL.
- Callback `game.id`: Numeric game identifier. Example: `143445742366`.
- Callback `game.uuid`: Game UUID string (non-URL identifier).
- Callback `game.isLiveGame`: Boolean indicating live (true) vs correspondence/daily (false).

### URL patterns (constructed from callback ID)
- Live: `https://www.chess.com/game/live/{id}`
- Daily: `https://www.chess.com/game/daily/{id}`

Construction rule:
1) Prefer the URL from JSON/PGN when present (authoritative and stable).
2) If Callback is present, use `isLiveGame` to choose the path, then append `game.id`.
3) If Callback is not present, infer the path from source time metadata:
   - If JSON `time_class` ∈ {bullet, blitz, rapid} → live path
   - If JSON `time_class` = daily → daily path
   - If JSON `time_class` missing, parse PGN `TimeControl`:
     - Contains `+` (live increment) → live path
     - Contains `/` (correspondence seconds per move) → daily path
     - Bare seconds: compute EstimatedMinutes = base_seconds ÷ 60; if ≥ 10 → Rapid (live), else live; daily only when `/` is present
   - For variants: `chess960` follows same live/daily rule; other variants (bughouse, crazyhouse, kingofthehill, threecheck) are always live

Examples:
- isLiveGame=true, id=124221014703 → `https://www.chess.com/game/live/124221014703`
- isLiveGame=false, id=9876543210 → `https://www.chess.com/game/daily/9876543210`

### Relationships and validation
- Equality: JSON `games[].url` ≡ PGN `Link`.
- Consistency check: the trailing numeric segment of the URL should match `game.id`.
- `game.uuid` uniquely identifies the game in Callback systems but is not part of the public URL.

### Live vs Daily linkage
- Live games correspond to the time classes Bullet, Blitz, Rapid.
- Daily corresponds to correspondence chess (per-move allotment like `1/86400`).
- See `concepts/time_control.md` for thresholds and parsing. In Callback, `isLiveGame` links directly to live vs daily.

### Other identifiers
- Player identifiers in JSON/Callback (`games[].white.uuid`, `games[].black.uuid`, `players.{side}.uuid`) refer to members, not games.
- Profile URLs (`games[].white.@id`, `games[].black.@id`) identify users, not games.

### Edge considerations
- Aborted/unrated games still have IDs and URLs; rating-affecting flags do not change URL construction.
- For idempotency, always key by URL; use `game.id`/`game.uuid` as auxiliary keys for joins and validation.
