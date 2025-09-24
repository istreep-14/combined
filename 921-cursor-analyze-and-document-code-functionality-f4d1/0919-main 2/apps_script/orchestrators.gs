/**
 * Module: orchestrators
 * Purpose: Backfill, incremental ingest, rollover, and recheck flows (idempotent and locked).
 */

function ingestActiveMonth() { return _ingestActiveMonthImpl(); }
function fullBackfill() { return _fullBackfillImpl(); }
function ensureMonthRollover() { return _ensureMonthRolloverImpl(); }
function quickIngestAndRefreshDaily() { return _quickIngestAndRefreshDailyImpl(); }

// ---- incremental.gs content ----
function _ingestActiveMonthImpl() {
  var lock = LockService.getScriptLock(); lock.tryLock(30000);
  try {
    _ensureMonthRolloverImpl();
    var gamesSS = getOrCreateGamesSpreadsheet();
    var archivesSS = getOrCreateArchivesSpreadsheet();
    var username = getConfiguredUsername();
    var archivesSheet = getOrCreateSheet(archivesSS, CONFIG.SHEET_NAMES.Archives, CONFIG.HEADERS.Archives);

    var lastRow = archivesSheet.getLastRow(); if (lastRow < 2) return;
    var data = archivesSheet.getRange(2, 1, lastRow - 1, CONFIG.HEADERS.Archives.length).getValues();
    var active = data.filter(function(r){ return String(r[3]) === 'active'; }); if (!active.length) return;
    var row = active[0]; var year = row[0]; var month = row[1]; var archiveUrl = row[2]; var etag = row[4];

    var response = fetchJsonWithEtag(archiveUrl, etag);
    var now = new Date();
    if (response.status === 'not_modified') { var idx = data.indexOf(row); archivesSheet.getRange(idx + 2, 7).setValue(now); return; }
    if (response.status !== 'ok') {
      var idx2 = data.indexOf(row); archivesSheet.getRange(idx2 + 2, 11).setValue(String(response.error || response.code)); archivesSheet.getRange(idx2 + 2, 7).setValue(now);
      if (response.code === 404 || String(response.error).indexOf('HTTP_404') >= 0) { archivesSheet.getRange(idx2 + 2, 4).setValue('active_pending'); }
      return;
    }

    var json = response.json;
    var allUnified = transformArchiveToUnifiedRows(username, json);
    // Stamp archive_name (YYYY/MM)
    var archNameActive = String(year) + '/' + ((parseInt(month,10) < 10 ? '0' : '') + String(parseInt(month,10)));
    for (var si2 = 0; si2 < allUnified.length; si2++) { allUnified[si2][CONFIG.HEADERS.UnifiedGames.length - 1] = archNameActive; }
    var urlIdxUnified = 0; // first column is URL
    var lastUrlCol = CONFIG.HEADERS.Archives.indexOf('last_url_seen') + 1;
    var idxActive = data.indexOf(row);
    var rowNumber = idxActive + 2;
    var lastUrlSeen = lastUrlCol > 0 ? (archivesSheet.getRange(rowNumber, lastUrlCol).getValue() || '') : '';
    var startIndex = 0;
    if (lastUrlSeen) {
      for (var si = allUnified.length - 1; si >= 0; si--) { if (allUnified[si][urlIdxUnified] === lastUrlSeen) { startIndex = si + 1; break; } }
    }
    var candidateRows = allUnified.slice(startIndex);

    // Dedupe against existing UnifiedGames
    var existingUrlSet = buildExistingUnifiedUrlIndex(gamesSS);
    var newRows = [];
    for (var ii = 0; ii < candidateRows.length; ii++) { var urlNew = candidateRows[ii][0]; if (urlNew && !existingUrlSet.has(urlNew)) newRows.push(candidateRows[ii]); }

    if (newRows.length) {
      var sheetName = getUnifiedSheetNameForMonthKey(archNameActive);
      var unifiedSheet = getOrCreateSheet(gamesSS, sheetName, CONFIG.HEADERS.UnifiedGames);
      ensureSheetHeader(unifiedSheet, CONFIG.HEADERS.UnifiedGames);
      var chunkSize = 200;
      for (var off = 0; off < newRows.length; off += chunkSize) {
        var chunk = computeLastBasedForRows(newRows.slice(off, off + chunkSize), archNameActive);
        if (chunk.length) { upsertByUrl(unifiedSheet, chunk); appendOpsLog(archiveUrl, 'write_unified_chunk', 'ok', '', { rows: chunk.length }); }
        // Advance cursor and counts immediately per chunk for safe resume
        if (lastUrlCol > 0) { var lastUrlInChunk = chunk[chunk.length - 1][0]; archivesSheet.getRange(rowNumber, lastUrlCol).setValue(lastUrlInChunk); }
        archivesSheet.getRange(rowNumber, 7).setValue(new Date());
      }
    }

    if (response.etag) archivesSheet.getRange(rowNumber, 5).setValue(response.etag);
    if (response.lastModified) archivesSheet.getRange(rowNumber, 6).setValue(response.lastModified);
    archivesSheet.getRange(rowNumber, 7).setValue(now);
    appendOpsLog(archiveUrl, 'ingest', response.status, response.code, { added: newRows.length });
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

// removed count helpers

function buildExistingUnifiedUrlIndex(gamesSS) {
  var sheet = getOrCreateSheet(gamesSS, CONFIG.SHEET_NAMES.UnifiedGames, CONFIG.HEADERS.UnifiedGames);
  ensureSheetHeader(sheet, CONFIG.HEADERS.UnifiedGames);
  var lastRow = sheet.getLastRow();
  var index = new Set();
  if (lastRow < 2) return index;
  var urls = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < urls.length; i++) {
    var u = urls[i][0]; if (u) index.add(u);
  }
  return index;
}

// ---- backfill.gs content ----
function _fullBackfillImpl() {
  var lock = LockService.getScriptLock(); lock.tryLock(30000);
  try {
    var gamesSS = getOrCreateGamesSpreadsheet();
    var archivesSS = getOrCreateArchivesSpreadsheet();
    var archivesSheet = getOrCreateSheet(archivesSS, CONFIG.SHEET_NAMES.Archives, CONFIG.HEADERS.Archives);
    var username = getConfiguredUsername();

    if (archivesSheet.getLastRow() < 2) {
      var found = discoverArchives(username); if (found && found.length) writeArchivesSheet(archivesSS, found);
      if (archivesSheet.getLastRow() < 2) return;
    }

    // Build sortable list with row indices
    var vals = archivesSheet.getRange(2, 1, archivesSheet.getLastRow() - 1, CONFIG.HEADERS.Archives.length).getValues();
    var rows = []; for (var i = 0; i < vals.length; i++) rows.push({ r: vals[i], idx: 2 + i });
    function ymKey(o){ return parseInt(o.r[0],10)*100 + parseInt(o.r[1],10); }
    rows.sort(function(a,b){ return ymKey(a) - ymKey(b); });

    // Pick the first non-finalized, non-active archive
    var finIdx = CONFIG.HEADERS.Archives.indexOf('finalized');
    var target = null;
    for (var j = 0; j < rows.length; j++) {
      var status = String(rows[j].r[3]);
      if (status === 'active') continue;
      if (finIdx >= 0 && String(rows[j].r[finIdx]) === 'true') continue;
      target = rows[j]; break;
    }
    if (!target) return;

    var year = target.r[0]; var month = target.r[1]; var archiveUrl = target.r[2]; var etag = target.r[4];
    var resp = fetchJsonWithEtag(archiveUrl, etag); var now = new Date();

    // If 304, re-fetch without ETag to get the JSON body for first-time writes
    if (resp.status === 'not_modified') resp = fetchJsonWithEtag(archiveUrl, null);

    if (resp.etag) archivesSheet.getRange(target.idx, 5).setValue(resp.etag);
    if (resp.lastModified) archivesSheet.getRange(target.idx, 6).setValue(resp.lastModified);
    archivesSheet.getRange(target.idx, 7).setValue(now);
    if (resp.status !== 'ok') { appendOpsLog(archiveUrl, 'fetch_archive', resp.status, resp.code, {}); return; }

    var json = resp.json || {}; var all = transformArchiveToUnifiedRows(username, json);
    var archName = String(year) + '/' + ((parseInt(month,10) < 10 ? '0' : '') + String(parseInt(month,10)));
    for (var a = 0; a < all.length; a++) { all[a][CONFIG.HEADERS.UnifiedGames.length - 1] = archName; }

    // Dedupe vs existing UnifiedGames
    var existing = buildExistingUnifiedUrlIndex(gamesSS);
    var newRows = []; for (var r = 0; r < all.length; r++) { var u = all[r][0]; if (u && !existing.has(u)) newRows.push(all[r]); }

    if (newRows.length) {
      var sheetName = getUnifiedSheetNameForMonthKey(archName);
      var unifiedSheet = getOrCreateSheet(gamesSS, sheetName, CONFIG.HEADERS.UnifiedGames); ensureSheetHeader(unifiedSheet, CONFIG.HEADERS.UnifiedGames);
      writeRowsChunked(unifiedSheet, computeLastBasedForRows(newRows, archName));
    }

    // Finalize this archive (mark inactive + finalized)
    archivesSheet.getRange(target.idx, 4).setValue('inactive');
    if (finIdx >= 0) archivesSheet.getRange(target.idx, finIdx + 1).setValue(true);
    appendOpsLog(archiveUrl, 'ingest_month_done', 'ok', resp.code, { archive: archName, added: newRows.length });
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

// ---- rollover.gs content ----
function _ensureMonthRolloverImpl() {
  var archivesSS = getOrCreateArchivesSpreadsheet(); var archivesSheet = getOrCreateSheet(archivesSS, CONFIG.SHEET_NAMES.Archives, CONFIG.HEADERS.Archives);
  var lastRow = archivesSheet.getLastRow(); if (lastRow < 2) return;
  var values = archivesSheet.getRange(2, 1, lastRow - 1, CONFIG.HEADERS.Archives.length).getValues();
  var activeRows = values.filter(function(r){ return String(r[3]) === 'active'; });
  var now = new Date(); var yNow = now.getFullYear(); var mNow = now.getMonth() + 1;
  if (activeRows.length === 0) { var newUrl = playerArchiveMonthUrl(getConfiguredUsername(), yNow, mNow); var newRow = [String(yNow), (mNow < 10 ? '0' : '') + String(mNow), newUrl, 'active', '', '', now, CONFIG.SCHEMA_VERSION, '', '']; archivesSheet.appendRow(newRow); return; }
  var active = activeRows[0]; var activeYear = parseInt(active[0], 10); var activeMonth = parseInt(active[1], 10);
  if (activeYear === yNow && activeMonth === mNow) return;
  _finalizePreviousActiveMonth(values, active);
  var exists = values.some(function(r){ return parseInt(r[0],10) === yNow && parseInt(r[1],10) === mNow; });
  if (!exists) { var url = playerArchiveMonthUrl(getConfiguredUsername(), yNow, mNow); archivesSheet.appendRow([String(yNow), (mNow < 10 ? '0' : '') + String(mNow), url, 'active', '', '', now, CONFIG.SCHEMA_VERSION, '', '']); }
  else { for (var i = 0; i < values.length; i++) { var r = values[i]; if (parseInt(r[0],10) === yNow && parseInt(r[1],10) === mNow) { archivesSheet.getRange(2 + i, 4).setValue('active'); break; } } }
}

function _quickIngestAndRefreshDailyImpl() {
  var tz = getProjectTimeZone();
  var before = new Date();
  var yBefore = before.getFullYear(); var mBefore = before.getMonth(); var dBefore = before.getDate();
  // Run fast ingest for active month; this updates UnifiedGames and writes last-based via computeLastBasedForRows
  var added = _ingestActiveMonthImpl() || 0;
  try {
    // Determine which local dates to refresh in DailyRatings: today, and if we crossed midnight since last run, also yesterday
    var sheet = getOrCreateSheet(getOrCreateGamesSpreadsheet(), CONFIG.SHEET_NAMES.DailyRatings, CONFIG.HEADERS.DailyRatings);
    ensureSheetHeader(sheet, CONFIG.HEADERS.DailyRatings);
    var now = new Date();
    var today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
    var yesterday = Utilities.formatDate(new Date(now.getTime() - 24*60*60*1000), tz, 'yyyy-MM-dd');
    var lastChecked = PropertiesService.getScriptProperties().getProperty('DAILY_LAST_CHECKED_DATE') || '';
    var targets = {};
    targets[today] = true;
    if (lastChecked && lastChecked !== today) targets[yesterday] = true;
    PropertiesService.getScriptProperties().setProperty('DAILY_LAST_CHECKED_DATE', today);
    // Rebuild/append RatingsTimeline tail for today (cheap: noop if no new games)
    try { appendTimelineTailForToday(); } catch (e) { logWarn('TIMELINE_TAIL_FAIL', 'appendTimelineTailForToday failed', { error: String(e && e.message || e) }); }
    // Incrementally refresh DailyRatings only for target dates
    try { updateDailyRatingsForDates(Object.keys(targets)); } catch (e) { logWarn('DAILY_UPDATE_FAIL', 'updateDailyRatingsForDates failed', { error: String(e && e.message || e) }); }
  } catch (e) {
    logWarn('QUICK_REFRESH_FAIL', 'quickIngestAndRefreshDaily post steps failed', { error: String(e && e.message || e) });
  }
  return added;
}

function _finalizePreviousActiveMonth(allRows, activeRow) {
  var archivesSS = getOrCreateArchivesSpreadsheet(); var gamesSS = getOrCreateGamesSpreadsheet(); var archivesSheet = getOrCreateSheet(archivesSS, CONFIG.SHEET_NAMES.Archives, CONFIG.HEADERS.Archives);
  var username = getConfiguredUsername(); var now = new Date(); var idx = allRows.indexOf(activeRow); var rowNumber = 2 + idx; var year = parseInt(activeRow[0], 10); var month = parseInt(activeRow[1], 10); var url = activeRow[2]; var etag = activeRow[4];
  // Skip if already finalized
  var finalizedCol = CONFIG.HEADERS.Archives.indexOf('finalized') + 1;
  if (finalizedCol > 0) {
    var finalizedVal = archivesSheet.getRange(rowNumber, finalizedCol).getValue();
    if (String(finalizedVal) === 'true') { archivesSheet.getRange(rowNumber, 4).setValue('inactive'); return; }
  }
  var response = fetchJsonWithEtag(url, etag);
  if (response.status === 'ok') {
    var json = response.json; var rows = transformArchiveToUnifiedRows(username, json); var urlIndex = buildExistingUnifiedUrlIndex(gamesSS); var newRows = [];
    for (var i = 0; i < rows.length; i++) { var u = rows[i][0]; if (u && !urlIndex.has(u)) newRows.push(rows[i]); }
      if (newRows.length) { var unifiedSheet = getOrCreateSheet(gamesSS, CONFIG.SHEET_NAMES.UnifiedGames, CONFIG.HEADERS.UnifiedGames); ensureSheetHeader(unifiedSheet, CONFIG.HEADERS.UnifiedGames); writeRowsChunked(unifiedSheet, newRows); }
    if (response.etag) archivesSheet.getRange(rowNumber, 5).setValue(response.etag); if (response.lastModified) archivesSheet.getRange(rowNumber, 6).setValue(response.lastModified);
    archivesSheet.getRange(rowNumber, 7).setValue(now);
  } else { archivesSheet.getRange(rowNumber, 7).setValue(now); archivesSheet.getRange(rowNumber, 11).setValue(String(response.error || response.code)); }
  archivesSheet.getRange(rowNumber, 4).setValue('inactive');
  if (finalizedCol > 0) archivesSheet.getRange(rowNumber, finalizedCol).setValue(true);
}

// removed _recheckInactiveArchivesImpl as part of simplification

/**
 * Repair utilities to fix alignment after manual stops or timeouts.
 */

// repairMonthAlignment removed in unified-only mode

function reindexAllArchiveCounts() {
  var gamesSS = getOrCreateGamesSpreadsheet();
  var archivesSS = getOrCreateArchivesSpreadsheet();
  var archivesSheet = getOrCreateSheet(archivesSS, CONFIG.SHEET_NAMES.Archives, CONFIG.HEADERS.Archives);
  var lastRow = archivesSheet.getLastRow(); if (lastRow < 2) return;
  var values = archivesSheet.getRange(2, 1, lastRow - 1, CONFIG.HEADERS.Archives.length).getValues();
  var now = new Date();
  for (var i = 0; i < values.length; i++) {
    var r = values[i]; var y = parseInt(r[0],10); var m = parseInt(r[1],10);
    archivesSheet.getRange(2 + i, 7).setValue(now);
  }
}

