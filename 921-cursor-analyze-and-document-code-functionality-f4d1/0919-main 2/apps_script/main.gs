/**
 * Module: main
 * Purpose: One-time setup to create spreadsheets/tabs and discover archives.
 */

function setupProject() {
  const gamesSS = getOrCreateGamesSpreadsheet();
  const callbacksSS = gamesSS; // consolidated into core
  // Ratings/Stats/Live spreadsheets removed in unified-only mode
  const archivesSS = gamesSS; // consolidated into core
  const logsSS = getOrCreateLogsSpreadsheet();
  // Ensure sheets and headers exist in the proper files
  var gameOpsLogSheet = getOrCreateSheet(gamesSS, CONFIG.SHEET_NAMES.GameOpsLog, CONFIG.HEADERS.GameOpsLog);
  // CallbackStats deprecated: callbacks are applied in-place into Unified
  var unifiedSheet = getOrCreateSheet(gamesSS, CONFIG.SHEET_NAMES.Games, CONFIG.HEADERS.Games); ensureSheetHeader(unifiedSheet, CONFIG.HEADERS.Games);
  getOrCreateSheet(archivesSS, CONFIG.SHEET_NAMES.Archives, CONFIG.HEADERS.Archives);
  // Daily totals removed
  getOrCreateSheet(logsSS, CONFIG.SHEET_NAMES.Logs, CONFIG.HEADERS.Logs);

  // Discover archives and write
  const username = getConfiguredUsername();
  const rows = discoverArchives(username);
  writeArchivesSheet(archivesSS, rows);

  return JSON.stringify({ gamesUrl: gamesSS.getUrl(), callbacksUrl: callbacksSS.getUrl(), archivesUrl: archivesSS.getUrl(), logsUrl: logsSS.getUrl() });
}

// Orchestrator implementations live in their respective files:
// - ingestActiveMonth: incremental.gs
// - rebuildDailyTotals: removed
// - runCallbacksBatch: callbacks.gs
// - fullBackfill: backfill.gs
// - backfillLastRatings: incremental.gs
// - recheckInactiveArchives: removed

// Enrichment jobs removed in unified-only mode
