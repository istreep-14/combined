/**
 * Module: main
 * Purpose: One-time setup to create spreadsheets/tabs and discover archives.
 */

function setupProject() {
  applySetupFromCode();
  const gamesSS = getOrCreateGamesSpreadsheet();
  const callbacksSS = gamesSS; // consolidated into core
  const statsSS = getOrCreateStatsSpreadsheet();
  const liveSS = getOrCreateLiveStatsSpreadsheet();
  const archivesSS = gamesSS; // consolidated into core
  const logsSS = getOrCreateLogsSpreadsheet();
  // Ensure sheets and headers exist in the proper files
  var gamesSheet = getOrCreateSheet(gamesSS, CONFIG.SHEET_NAMES.Games, CONFIG.HEADERS.Games);
  var gameMetaSheet = getOrCreateSheet(gamesSS, CONFIG.SHEET_NAMES.GameMeta, CONFIG.HEADERS.GameMeta);
  var gameOpsLogSheet = getOrCreateSheet(gamesSS, CONFIG.SHEET_NAMES.GameOpsLog, CONFIG.HEADERS.GameOpsLog);
  getOrCreateSheet(callbacksSS, CONFIG.SHEET_NAMES.CallbackStats, CONFIG.HEADERS.CallbackStats);
  getOrCreateSheet(statsSS, CONFIG.SHEET_NAMES.PlayerStats, CONFIG.HEADERS.PlayerStats);
  getOrCreateSheet(liveSS, CONFIG.SHEET_NAMES.LiveStatsEOD, CONFIG.HEADERS.LiveStatsEOD);
  getOrCreateSheet(liveSS, CONFIG.SHEET_NAMES.LiveStatsMeta, CONFIG.HEADERS.LiveStatsMeta);
  getOrCreateSheet(archivesSS, CONFIG.SHEET_NAMES.Archives, CONFIG.HEADERS.Archives);
  // Daily totals removed
  getOrCreateSheet(logsSS, CONFIG.SHEET_NAMES.Logs, CONFIG.HEADERS.Logs);

  // Discover archives and write
  const username = getConfiguredUsername();
  const rows = discoverArchives(username);
  writeArchivesSheet(archivesSS, rows);

  return JSON.stringify({ gamesUrl: gamesSS.getUrl(), callbacksUrl: callbacksSS.getUrl(), statsUrl: statsSS.getUrl(), liveUrl: liveSS.getUrl(), archivesUrl: archivesSS.getUrl(), logsUrl: logsSS.getUrl() });
}

// Orchestrator implementations live in their respective files:
// - ingestActiveMonth: incremental.gs
// - rebuildDailyTotals: removed
// - runCallbacksBatch: callbacks.gs
// - fullBackfill: backfill.gs
// - backfillLastRatings: incremental.gs
// - recheckInactiveArchives: removed

// Enrichment jobs implementations:
// - runOpeningAnalysisBatch: enrichment_openings.gs
// - runGameDataBatch: enrichment_gamedata.gs
