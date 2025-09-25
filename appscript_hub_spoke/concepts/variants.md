## Variants: type vs typeName, and canonical format

### Callback: type vs typeName
- `game.type`: short code of rules/variant (e.g., `chess`, `chess960`, `bughouse`, `crazyhouse`, `kingofthehill`, `threecheck`).
- `game.typeName`: human-readable name (e.g., `Standard Chess`, `Chess960`, `Bughouse`).

Guidance:
- Use `type` for logic and mapping, and `typeName` purely for display.
- Do not mix them; `typeName` can change for localization or branding while `type` remains stable.

### JSON archive and canonical format
- JSON `games[].rules` aligns with callback `game.type`.
- Canonical `format` (your bucket for ratings) follows:
  - If `rules=chess` → `format = time_class` (Bullet/Blitz/Rapid/Daily)
  - If `rules=chess960` → live buckets map to `live960`; daily → `daily960`
  - If `rules ∈ {bughouse, crazyhouse, kingofthehill, threecheck}` → `format = rules` (collapse time class)

### Live vs Daily mapping recap
- See `concepts/time_control.md` for time class derivation from `time_control`.
- Callback `isLiveGame` is a confirmatory signal; primary derivation uses JSON/PGN time control.

