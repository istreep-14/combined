## Session capabilities and social/context (callback-centric, optional)

These fields come from the Callback API and describe what actions or states are available or visible at capture time. They enrich analysis but are not required for core ingestion.

### Capability flags (game.*)
- `isAbortable`: whether the game could be aborted (live-only relevance)
- `isAnalyzable`: whether analysis is enabled for the game
- `isResignable`: whether resignation was possible (usually true in finished live games)
- `allowVacation`: relevant to daily (correspondence) contexts; not important for your core use

### Social/context (game.*)
- `areFriends`, `canSendTrophy`: social relationships and UI affordances
- Top-level `friendRequestSent`, `friendRequestReceived`: site-level relationship states

### Per-player UI/context (players.{side})
- `defaultTab`, `postMoveAction`, `isTouchMove`
- `gamesInProgress`, `vacationRemaining` (primarily for ongoing daily games; not important for your core use)
- `isOnline`, `isInLivechess`, `isEnabled`, `isContentHidden`, `isBlocked`, `isFriend`

### How to use
- Keep as optional columns for downstream analysis (e.g., membership/social patterns, suspicious behavior flags).
- Do not rely on them for canonical identities or core result/rating calculations.

See also: `concepts/player_info.md` for identity fields; `concepts/time_control.md` for live/daily separation.
