## Event and tournament metadata

This concept gathers descriptive metadata about the event context across sources.

### PGN headers (primary)
- `Event`: name (e.g., `Live Chess`, `Let's Play!`, tournament/match titles)
- `Site`: provider (e.g., `Chess.com`) or event location for OTB PGNs
- `Round`: round indicator or `-`

Notes:
- `Event` is also a cue for live vs daily: `Live Chess` (live), `Let's Play!` (daily). See `concepts/game_id.md`.

### JSON archive (links)
- `tournament` (url): link to tournament, if applicable
- `match` (url): link to match, if applicable
- `tcn` (string): TCN representation (optional analysis/engine input)

Recommended storage fields:
- `event_name`, `site_name`, `round_label`
- `tournament_url`, `match_url`, `tcn`

Cross-references:
- Live/daily cues: `concepts/game_id.md`, `concepts/time_control.md`
- Moves and openings: `concepts/moves_openings.md`
