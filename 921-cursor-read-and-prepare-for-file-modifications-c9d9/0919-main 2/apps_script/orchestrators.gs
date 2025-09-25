/**
 * Module: orchestrators
 * Purpose: Backfill, incremental ingest, rollover, and recheck flows (idempotent and locked).
 */

function ingestActiveMonth() { return _ingestActiveMonthImpl(); }
function fullBackfill() { return _fullBackfillImpl(); }
function ensureMonthRollover() { return _ensureMonthRolloverImpl(); }

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
    var allRows = transformArchiveToRows(username, json);
    // Stamp archive_name (YYYY/MM) into the correct column in GameMeta rows for anchoring
    var archNameActive = String(year) + '/' + ((parseInt(month,10) < 10 ? '0' : '') + String(parseInt(month,10)));
    var metaArchiveIdx = CONFIG.HEADERS.GameMeta.indexOf('archive_name');
    for (var si2 = 0; si2 < allRows.length; si2++) {
      if (allRows[si2] && allRows[si2]._meta) {
        var mm = allRows[si2]._meta;
        if (metaArchiveIdx >= 0 && metaArchiveIdx < mm.length) mm[metaArchiveIdx] = archNameActive;
      }
    }
    var urlIdxGames = 0; // first column in Games rows
    var lastUrlCol = CONFIG.HEADERS.Archives.indexOf('last_url_seen') + 1;
    var idxActive = data.indexOf(row);
    var rowNumber = idxActive + 2;
    var lastUrlSeen = lastUrlCol > 0 ? (archivesSheet.getRange(rowNumber, lastUrlCol).getValue() || '') : '';
    var startIndex = 0;
    if (lastUrlSeen) {
      for (var si = allRows.length - 1; si >= 0; si--) { if (allRows[si][urlIdxGames] === lastUrlSeen) { startIndex = si + 1; break; } }
    }
    var candidateRows = allRows.slice(startIndex);

    // Dedupe against existing Games in case of partial prior runs
    var existingUrlSet = buildExistingUrlIndex(gamesSS);
    var newRows = [];
    for (var ii = 0; ii < candidateRows.length; ii++) { var urlNew = candidateRows[ii][0]; if (urlNew && !existingUrlSet.has(urlNew)) newRows.push(candidateRows[ii]); }

    if (newRows.length) {
      var chunkSize = 200;
      var archNameActive = String(year) + '/' + ((parseInt(month,10) < 10 ? '0' : '') + String(parseInt(month,10)));
      for (var off = 0; off < newRows.length; off += chunkSize) {
        var chunk = newRows.slice(off, off + chunkSize);
        var res = writeGamesAndMetaRows(gamesSS, chunk, archNameActive);
        appendOpsLog(archiveUrl, 'write_chunk', 'ok', '', { games: res.games, meta: res.meta });
        // Incremental DailyTotals update for affected dates
        try {
          var dIdx = CONFIG.HEADERS.Games.indexOf('date');
          var datesSet = {};
          for (var ci = 0; ci < chunk.length; ci++) { var dval = chunk[ci][dIdx]; if (dval) datesSet[String(dval)] = true; }
          var dates = Object.keys(datesSet);
          if (dates.length) updateDailyTotalsForDates(dates, {});
        } catch (e) { logWarn('DT_INC_FAIL', 'updateDailyTotalsForDates failed', { error: String(e && e.message || e) }); }
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

function buildExistingUrlIndex(gamesSS) {
  var sheet = getOrCreateSheet(gamesSS, CONFIG.SHEET_NAMES.Games, CONFIG.HEADERS.Games);
  // header established at creation
  var lastRow = sheet.getLastRow();
  var index = new Set();
  if (lastRow < 2) return index;
  var urls = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < urls.length; i++) {
    var u = urls[i][0];
    if (u) index.add(u);
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

    var json = resp.json || {}; var all = transformArchiveToRows(username, json);
    var archName = String(year) + '/' + ((parseInt(month,10) < 10 ? '0' : '') + String(parseInt(month,10)));
    var metaArchiveIdx2 = CONFIG.HEADERS.GameMeta.indexOf('archive_name');
    for (var a = 0; a < all.length; a++) {
      if (all[a] && all[a]._meta) {
        var m = all[a]._meta;
        if (metaArchiveIdx2 >= 0 && metaArchiveIdx2 < m.length) m[metaArchiveIdx2] = archName;
      }
    }

    // Dedupe vs existing Games
    var existing = buildExistingUrlIndex(gamesSS);
    var newRows = []; for (var r = 0; r < all.length; r++) { var u = all[r][0]; if (u && !existing.has(u)) newRows.push(all[r]); }

    if (newRows.length) { var res2 = writeGamesAndMetaRows(gamesSS, newRows, archName); }

    // After backfill, compute DailyTotals for the entire month
    try {
      var y = parseInt(year, 10); var m = parseInt(month, 10);
      var tz = getProjectTimeZone();
      var daysInMonth = new Date(y, m, 0).getDate();
      var monthDates = [];
      for (var dd = 1; dd <= daysInMonth; dd++) {
        var dObj = new Date(y, m - 1, dd);
        monthDates.push(Utilities.formatDate(dObj, tz, 'yyyy-MM-dd'));
      }
      updateDailyTotalsForDates(monthDates, {});
      appendOpsLog(archiveUrl, 'daily_totals_month', 'ok', '', { year: y, month: m, days: daysInMonth });
    } catch (e) { logWarn('DT_MONTH_FAIL', 'DailyTotals month update failed', { error: String(e && e.message || e), year: year, month: month }); }

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
  if (activeRows.length === 0) {
    var newUrl = playerArchiveMonthUrl(getConfiguredUsername(), yNow, mNow);
    // Archives header is 10 columns
    var newRow = [String(yNow), (mNow < 10 ? '0' : '') + String(mNow), newUrl, 'active', '', '', now, CONFIG.SCHEMA_VERSION, false, ''];
    archivesSheet.appendRow(newRow);
    return;
  }
  var active = activeRows[0]; var activeYear = parseInt(active[0], 10); var activeMonth = parseInt(active[1], 10);
  if (activeYear === yNow && activeMonth === mNow) return;
  _finalizePreviousActiveMonth(values, active);
  var exists = values.some(function(r){ return parseInt(r[0],10) === yNow && parseInt(r[1],10) === mNow; });
  if (!exists) {
    var url = playerArchiveMonthUrl(getConfiguredUsername(), yNow, mNow);
    archivesSheet.appendRow([String(yNow), (mNow < 10 ? '0' : '') + String(mNow), url, 'active', '', '', now, CONFIG.SCHEMA_VERSION, false, '']);
  }
  else { for (var i = 0; i < values.length; i++) { var r = values[i]; if (parseInt(r[0],10) === yNow && parseInt(r[1],10) === mNow) { archivesSheet.getRange(2 + i, 4).setValue('active'); break; } } }
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
    var json = response.json; var rows = transformArchiveToRows(username, json); var urlIndex = buildExistingUrlIndex(gamesSS); var newRows = [];
    for (var i = 0; i < rows.length; i++) { var u = rows[i][0]; if (u && !urlIndex.has(u)) newRows.push(rows[i]); }
      if (newRows.length) { var gamesSheet = getOrCreateSheet(gamesSS, CONFIG.SHEET_NAMES.Games, CONFIG.HEADERS.Games); writeRowsChunked(gamesSheet, newRows.map(function(rr){ return rr.slice(0, CONFIG.HEADERS.Games.length); }));
      var meta = newRows.map(function(rr){ return rr._meta; }).filter(Boolean); if (meta.length) { var metaSheet = getOrCreateSheet(gamesSS, CONFIG.SHEET_NAMES.GameMeta, CONFIG.HEADERS.GameMeta); upsertByUrl(metaSheet, meta); } }
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

function repairMonthAlignment(year, month) {
  var y = parseInt(year, 10); var m = parseInt(month, 10);
  var username = getConfiguredUsername();
  var gamesSS = getOrCreateGamesSpreadsheet();
  var archivesSS = getOrCreateArchivesSpreadsheet();
  var archivesSheet = getOrCreateSheet(archivesSS, CONFIG.SHEET_NAMES.Archives, CONFIG.HEADERS.Archives);
  var now = new Date();

  // Locate archive row
  var lastRow = archivesSheet.getLastRow(); if (lastRow < 2) return;
  var data = archivesSheet.getRange(2, 1, lastRow - 1, CONFIG.HEADERS.Archives.length).getValues();
  var foundIndex = -1; var archiveUrl = ''; var etag = '';
  for (var i = 0; i < data.length; i++) {
    var r = data[i]; if (parseInt(r[0],10) === y && parseInt(r[1],10) === m) { foundIndex = i; archiveUrl = r[2]; etag = r[4]; break; }
  }
  if (foundIndex < 0) return;
  var rowIndex = 2 + foundIndex;

  // Fetch month JSON (use ETag if available)
  var resp = fetchJsonWithEtag(archiveUrl, etag);
  if (resp.status === 'error') {
    archivesSheet.getRange(rowIndex, 11).setValue(String(resp.error || resp.code));
    archivesSheet.getRange(rowIndex, 7).setValue(now);
    appendOpsLog(archiveUrl, 'repair_fetch', 'error', resp.code, {});
    return;
  }
  if (resp.etag) archivesSheet.getRange(rowIndex, 5).setValue(resp.etag);
  if (resp.lastModified) archivesSheet.getRange(rowIndex, 6).setValue(resp.lastModified);
  archivesSheet.getRange(rowIndex, 7).setValue(now);

  var json = resp.json || {};
  var rows = transformArchiveToRows(username, json);
  if (!rows || !rows.length) return;

  // Build Games URL index
  var gamesSheet = getOrCreateSheet(gamesSS, CONFIG.SHEET_NAMES.Games, CONFIG.HEADERS.Games);
  var existingUrlSet = buildExistingUrlIndex(gamesSS);

  // Partition into missing-in-Games and present-in-Games
  var colCount = CONFIG.HEADERS.Games.length;
  var toAppendGames = []; var allMeta = [];
  for (var j = 0; j < rows.length; j++) {
    var rr = rows[j]; var url = rr[0]; if (!url) continue;
    if (!existingUrlSet.has(url)) {
      toAppendGames.push(rr.slice(0, colCount));
    }
    if (rr && rr._meta) allMeta.push(rr._meta);
  }

  if (toAppendGames.length) { writeRowsChunked(gamesSheet, toAppendGames); appendOpsLog(archiveUrl, 'repair_write_games', 'ok', '', { rows: toAppendGames.length }); }

  if (allMeta.length) {
    var metaSheet = getOrCreateSheet(gamesSS, CONFIG.SHEET_NAMES.GameMeta, CONFIG.HEADERS.GameMeta);
    upsertByUrl(metaSheet, allMeta); appendOpsLog(archiveUrl, 'repair_write_meta', 'ok', '', { rows: allMeta.length });
  }

  // Recompute counts
  // telemetry counts removed
}

// removed reindexAllArchiveCounts

// Helpers: last-based pregame and per-format snapshots
function getLastRatingByFormatFromMeta(gamesSS) {
  var metaSheet = getOrCreateSheet(gamesSS, CONFIG.SHEET_NAMES.GameMeta, CONFIG.HEADERS.GameMeta);
  // header established at creation
  var lastRow = metaSheet.getLastRow();
  var out = { bullet: '', blitz: '', rapid: '', daily: '' };
  if (lastRow < 2) return out;
  var header = metaSheet.getRange(1, 1, 1, metaSheet.getLastColumn()).getValues()[0];
  function idx(h){ for (var i = 0; i < header.length; i++) if (String(header[i]) === h) return i; return -1; }
  var iFmt = idx('format'); var iMy = idx('my_rating');
  var vals = metaSheet.getRange(2, 1, lastRow - 1, metaSheet.getLastColumn()).getValues();
  // Walk ascending by timestamp implicitly (sheet order). If not sorted, this is still a safe seed.
  for (var r = 0; r < vals.length; r++) {
    var fmt = String(vals[r][iFmt] || ''); var my = vals[r][iMy]; if (!fmt || my === '' || my === null || my === undefined) continue;
    if (fmt === 'bullet' || fmt === 'blitz' || fmt === 'rapid' || fmt === 'daily') out[fmt] = Number(my);
  }
  return out;
}

function applyLastBasedToMetaRows(metaRows, lastByFormat) {
  if (!metaRows || !metaRows.length) return;
  // Locate indexes in GameMeta header according to CONFIG
  var header = CONFIG.HEADERS.GameMeta;
  function idx(h){ return header.indexOf(h); }
  var iFmt = idx('format'); var iMy = idx('my_rating'); var iOpp = idx('opp_rating');
  var iMyPregLast = idx('my_pregame_last'); var iMyDeltaLast = idx('my_delta_last');
  var iOppPregLast = idx('opp_pregame_last'); var iOppDeltaLast = idx('opp_delta_last');
  for (var i = 0; i < metaRows.length; i++) {
    var row = metaRows[i]; var fmt = String(row[iFmt] || ''); var my = row[iMy]; var opp = row[iOpp];
    var pre = (lastByFormat[fmt] === '' || lastByFormat[fmt] === null || lastByFormat[fmt] === undefined) ? '' : Number(lastByFormat[fmt]);
    var dmy = (pre === '' || my === '' || my === null || my === undefined) ? '' : (Number(my) - Number(pre));
    var dopp = (dmy === '' ? '' : -Number(dmy));
    var oppPre = (opp === '' || opp === null || opp === undefined || dopp === '' ? '' : (Number(opp) - Number(dopp)));
    row[iMyPregLast] = pre; row[iMyDeltaLast] = dmy; row[iOppPregLast] = oppPre; row[iOppDeltaLast] = dopp;
    if (fmt && my !== '' && my !== null && my !== undefined) lastByFormat[fmt] = Number(my);
  }
}

function getLatestSnapshotsFromMeta(gamesSS) {
  var metaSheet = getOrCreateSheet(gamesSS, CONFIG.SHEET_NAMES.GameMeta, CONFIG.HEADERS.GameMeta);
  // header established at creation
  var lastRow = metaSheet.getLastRow();
  var snaps = { bullet: '', blitz: '', rapid: '', daily: '' };
  if (lastRow < 2) return snaps;
  var header = metaSheet.getRange(1, 1, 1, metaSheet.getLastColumn()).getValues()[0];
  function idx(h){ for (var i = 0; i < header.length; i++) if (String(header[i]) === h) return i; return -1; }
  var iB = idx('my_snapshot_bullet'); var iL = idx('my_snapshot_blitz'); var iR = idx('my_snapshot_rapid'); var iD = idx('my_snapshot_daily');
  // Try reading last non-empty snapshot row
  var vals = metaSheet.getRange(2, 1, lastRow - 1, metaSheet.getLastColumn()).getValues();
  for (var r = 0; r < vals.length; r++) {
    if (iB >= 0 && vals[r][iB] !== '' && vals[r][iB] !== null && vals[r][iB] !== undefined) snaps.bullet = Number(vals[r][iB]);
    if (iL >= 0 && vals[r][iL] !== '' && vals[r][iL] !== null && vals[r][iL] !== undefined) snaps.blitz = Number(vals[r][iL]);
    if (iR >= 0 && vals[r][iR] !== '' && vals[r][iR] !== null && vals[r][iR] !== undefined) snaps.rapid = Number(vals[r][iR]);
    if (iD >= 0 && vals[r][iD] !== '' && vals[r][iD] !== null && vals[r][iD] !== undefined) snaps.daily = Number(vals[r][iD]);
  }
  return snaps;
}

function applySnapshotsToMetaRows(metaRows, snapshot) {
  if (!metaRows || !metaRows.length) return;
  var header = CONFIG.HEADERS.GameMeta;
  function idx(h){ return header.indexOf(h); }
  var iFmt = idx('format'); var iMy = idx('my_rating');
  var iB = idx('my_snapshot_bullet'); var iL = idx('my_snapshot_blitz'); var iR = idx('my_snapshot_rapid'); var iD = idx('my_snapshot_daily');
  var snaps = { bullet: snapshot.bullet, blitz: snapshot.blitz, rapid: snapshot.rapid, daily: snapshot.daily };
  for (var i = 0; i < metaRows.length; i++) {
    var row = metaRows[i]; var fmt = String(row[iFmt] || ''); var my = row[iMy];
    // Carry forward existing snapshot values
    row[iB] = snaps.bullet; row[iL] = snaps.blitz; row[iR] = snaps.rapid; row[iD] = snaps.daily;
    // Update the played format to current post-game rating if present
    if (fmt === 'bullet' && my !== '' && my !== null && my !== undefined) snaps.bullet = row[iB] = Number(my);
    else if (fmt === 'blitz' && my !== '' && my !== null && my !== undefined) snaps.blitz = row[iL] = Number(my);
    else if (fmt === 'rapid' && my !== '' && my !== null && my !== undefined) snaps.rapid = row[iR] = Number(my);
    else if (fmt === 'daily' && my !== '' && my !== null && my !== undefined) snaps.daily = row[iD] = Number(my);
  }
}

