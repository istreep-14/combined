## Player info (identity, profile, membership) — JSON/PGN-first, callback optional

This concept consolidates non-outcome data about each player (both sides) across sources. It excludes result/outcome fields and focuses on identity, profile, membership, and status data. Prefer JSON/PGN when available; use Callback as enrichment.

### Primary fields by source
- JSON archive (per side: `games[].white.*`, `games[].black.*`)
  - `username` (string): canonical username
  - `@id` (url): profile URL
  - `uuid` (string): member UUID
  - `rating` (number): post-game rating (equals PGN WhiteElo/BlackElo when present)
  - Note: `result` exists but is intentionally out of scope here

- PGN headers
  - `White`, `Black` (string): usernames
  - `WhiteElo`, `BlackElo` (number): post-game ratings (equivalent to JSON post ratings when both exist)

- Callback (optional enrichment) `players.{side}` (side ∈ {top,bottom}; use the `color` field on each side or `game.colorOfWinner` to determine white/black)
  - `username` (string)
  - `id` (number): numeric user id
  - `uuid` (string)
  - `avatarUrl` (url)
  - `countryId` (number), `countryName` (string)
  - `membershipLevel` (number), `membershipCode` (string) — e.g., basic, diamond
  - `isOnline`, `isInLivechess`, `isEnabled`, `isContentHidden`, `isBlocked`, `isFriend` (booleans)
  - `friendRequestSent`, `friendRequestReceived` (booleans)
  - `memberSince` (epoch seconds), `lastLoginDate` (epoch seconds)
  - `rating` (number): post-game rating at capture time
  - `defaultTab` (number), `postMoveAction` (string), `isTouchMove` (boolean)
  - `gamesInProgress` (number), `vacationRemaining` (string)
  - `flair.id`, `flair.images.png|svg|lottie` (optional)

### Identity resolution and normalization
- Normalized usernames: lowercased, trimmed (store canonical, keep original casing for display if desired).
- Linkage priority per side:
  1) JSON `username` ↔ PGN header `White`/`Black` (should match ignoring case)
  2) Callback `players.{side}.username` with `color` to assign white/black
- Profile linkage:
  - Prefer JSON `@id` for the profile URL; if missing, construct from `username` when needed: `https://www.chess.com/member/{username}`
- UUID preference: prefer JSON `uuid`; use Callback UUID when JSON missing.

### Perspective fields (optional convenience)
- `my_username` and `opp_username`: resolve using configured `USERNAME` (case-insensitive)
- `my_color` ∈ {white, black}: compare `USERNAME` to PGN `White`/`Black`; fallback via JSON usernames
- These are for joining/analyzing from your perspective; they do not reflect outcomes.

### Recommended normalized schema (per game)
- Per side (white/black):
  - `player_username_{side}` (string)
  - `player_profile_url_{side}` (url)
  - `player_uuid_{side}` (string)
  - `player_rating_post_{side}` (number)
  - `player_membership_code_{side}` (string, callback when present)
  - `player_country_name_{side}` (string, callback when present)
  - `player_avatar_url_{side}` (url, callback when present)
  - `player_is_online_{side}` (boolean, callback when present)
  - `player_last_login_epoch_{side}` (number, callback when present)

- Perspective (optional):
  - `my_username`, `opp_username`, `my_color`

### Notes and caveats
- Ratings referenced here are post-game; there is no guaranteed "pregame" rating field across sources.
- Callback fields reflect a snapshot at capture time and may include additional UI/experience fields not present in JSON/PGN.
- Some callback fields can be missing or hidden (`isContentHidden`).

### Mapping cues for white/black on callback
- Use `players.{side}.color` to identify which side is white/black. Do not assume `top` is always black or white.
- When `color` is missing or ambiguous, fall back to matching `username` against PGN `White`/`Black` or JSON `white.username` / `black.username`.

