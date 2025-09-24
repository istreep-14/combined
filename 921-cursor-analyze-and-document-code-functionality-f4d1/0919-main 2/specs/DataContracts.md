## Data Contracts (Canonical Schemas)

Status: authoritative. Headers MUST match exactly (order and names). Any code or doc that disagrees is wrong.

### 1) Sheets and Headers (Unified-only)

- Unified_YYYY_MM
  - Columns:
    - url
    - id
    - is_live
    - rated
    - time_class
    - rules
    - format
    - date
    - start_time
    - end_time
    - end_time_epoch
    - duration_seconds
    - time_control
    - base_time
    - increment
    - correspondence_time
    - eco_code
    - eco_url
    - my_username
    - my_color
    - my_rating_end
    - my_result
    - my_outcome
    - my_score
    - opp_username
    - opp_color
    - opp_rating_end
    - opp_result
    - opp_outcome
    - opp_score
    - accuracy_white
    - accuracy_black
    - my_rating_change_cb
    - opp_rating_change_cb
    - my_pregame_cb
    - opp_pregame_cb
    - my_pregame_last
    - my_delta_last
    - opp_pregame_last
    - opp_delta_last
    - ply_count
    - end_reason
    - move_timestamps_ds
    - archive_name

- Archives
  - Columns:
    - year
    - month
    - archive_url
    - status
    - etag
    - last_modified
    - last_checked
    - game_count_api
    - game_count_ingested
    - callback_completed
    - errors
    - schema_version
    - finalized
    - last_url_seen

- GameOpsLog
  - Columns:
    - timestamp
    - url
    - operation
    - status
    - http_code
    - details_json

- Logs
  - Columns:
    - timestamp
    - level
    - code
    - message
    - context_json

// LiveStats removed in unified-only mode

### 2) Field Semantics and Invariants

- url: absolute game URL; primary key across Games and GameMeta.
- date: local date string (yyyy-MM-dd) from end_time.
- start_time, end_time: local date-time strings derived from epoch seconds and project timezone.
- time_control: PGN-compliant string, e.g., "60", "300+2", "1/86400".
- rated: boolean; MUST reflect Chess.com `rated`.
- format: derived label (e.g., bullet, blitz, rapid, daily, chess960-bullet) per mapping.
- my_color: 'white'|'black'.
- my_rating/opponent_rating: integer rating after the game.
- my_outcome: 'win'|'loss'|'draw'.
- opponent_username: opponent's username.
- end_reason: exact raw result from the loser; for draws, any draw code (agreed, stalemate, repetition, insufficient, 50move, timevsinsufficient).

- GameMeta epochs: UNIX seconds (integer). duration_seconds may be blank if either epoch missing.
- base_time/increment/correspondence_time: derived from time_control parsing; MUST be numeric or blank.
- eco_code/eco_url: from PGN headers if available; eco_url MAY fallback to `game.eco` URL.
- my_* and opp_* blocks: identity and result/outcome/score fields aligned to configured username.
- pgn_moves: tail moves portion extracted from PGN after headers.
- tcn, initial_setup, fen: raw values from API when present.

### 3) Allowed Values and Normalization

- time_class (normalized): 'bullet'|'blitz'|'rapid'|'daily'.
- rules (normalized): 'chess'|'chess960'.
- format derivation (examples, not exhaustive):
  - rules=chess, time_class=bullet -> format=bullet
  - rules=chess, time_class=blitz -> format=blitz
  - rules=chess, time_class=rapid -> format=rapid
  - rules=chess, time_class=daily -> format=daily
  - rules=chess960, time_class=blitz -> format=chess960-blitz

### 4) Sheet-Level Invariants

-- Unified:
  - URL uniqueness MUST hold per month sheet.
  - Header row MUST match order above.

- Archives:
  - `status` ∈ {active, active_pending, inactive}.
  - `finalized` boolean indicates that the month has been finalized and SHOULD NOT be refetched in the active ingest path.
  - `last_url_seen` is updated only by the active-month ingest.

### 5) Versioning

- `schema_version` column in `Archives` MUST equal `CONFIG.SCHEMA_VERSION` for rows created by the current code.
- Any change to headers or meanings MUST bump `CONFIG.SCHEMA_VERSION` and update this document.

