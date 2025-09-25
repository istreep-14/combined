/**
 * Module: triggers
 * Purpose: Install time-driven triggers for ingest, callbacks, and stats snapshots.
 */

function removeExistingTriggersFor(functionNames) {
  try {
    var set = {};
    for (var i = 0; i < functionNames.length; i++) set[String(functionNames[i])] = true;
    var triggers = ScriptApp.getProjectTriggers();
    for (var t = 0; t < triggers.length; t++) {
      var fn = triggers[t].getHandlerFunction();
      if (set[fn]) {
        ScriptApp.deleteTrigger(triggers[t]);
      }
    }
  } catch (e) {
    logWarn('TRIGGER_REMOVE_FAIL', 'Failed removing existing triggers', { error: String(e && e.message || e) });
  }
}

function installTriggers() {
  var fns = [
    'quickIngestAndRefreshDaily',
    'runCallbacksBatch',
    'runStatsSnapshots',
    'ensureMonthRollover'
  ];
  removeExistingTriggersFor(fns);

  // Quick ingest: every 5 minutes
  ScriptApp.newTrigger('quickIngestAndRefreshDaily')
    .timeBased()
    .everyMinutes(5)
    .create();

  // Callback batch: every 10 minutes
  ScriptApp.newTrigger('runCallbacksBatch')
    .timeBased()
    .everyMinutes(10)
    .create();

  // Stats snapshots: hourly
  ScriptApp.newTrigger('runStatsSnapshots')
    .timeBased()
    .everyHours(1)
    .create();

  // Rollover checker: daily at 00:00
  ScriptApp.newTrigger('ensureMonthRollover')
    .timeBased()
    .atHour(0)
    .everyDays(1)
    .create();

  appendOpsLog('', 'install_triggers', 'ok', 200, { created: 4 });
}

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
  // Live stats trigger removed in unified-only mode
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
