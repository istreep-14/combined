/**
 * Module: triggers
 * Purpose: Install and maintain time-driven triggers for ingest and maintenance.
 */

function installTriggers() {
  // Clear existing project triggers first
  var all = ScriptApp.getProjectTriggers();
  for (var i = 0; i < all.length; i++) {
    ScriptApp.deleteTrigger(all[i]);
  }
  // Ingest active month every 15 minutes
  ScriptApp.newTrigger('ingestActiveMonth')
    .timeBased()
    .everyMinutes(15)
    .create();
  // Update live stats (bullet/blitz/rapid) every 2 hours
  ScriptApp.newTrigger('updateLiveStatsAll')
    .timeBased()
    .everyHours(2)
    .create();
}

function resetTriggers() {
  installTriggers();
}

function healthCheck() {
  try {
    var ss = getOrCreateGamesSpreadsheet();
    _ensureMonthRolloverImpl();
    logInfo('HEALTH_OK', 'Health check completed');
  } catch (e) {
    logError('HEALTH_ERR', e && e.message, {});
  }
}
