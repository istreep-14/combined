/**
 * Module: io
 * Purpose: Spreadsheet and sheet lifecycle helpers; batched writes; header upgrades.
 */

function getOrCreateGamesSpreadsheet() {
  const props = getScriptProps();
  const existingId = props.getProperty('SPREADSHEET_ID_GAMES');
  if (existingId) {
    try {
      var ssExisting = SpreadsheetApp.openById(existingId);
      ensureFileInProjectFolder(ssExisting.getId());
      return ssExisting;
    } catch (e) {}
  }
  const ss = SpreadsheetApp.create(getSpreadsheetNameGames());
  props.setProperty('SPREADSHEET_ID_GAMES', ss.getId());
  ensureFileInProjectFolder(ss.getId());
  return ss;
}

function getOrCreateCallbacksSpreadsheet() {
  // Consolidate CallbackStats into the core Games spreadsheet
  return getOrCreateGamesSpreadsheet();
}

// Ratings spreadsheet removed

function getOrCreateStatsSpreadsheet() { return getOrCreateGamesSpreadsheet(); }

function getOrCreateLiveStatsSpreadsheet() { return getOrCreateGamesSpreadsheet(); }

function getOrCreateArchivesSpreadsheet() {
  // Consolidate Archives into the core Games spreadsheet
  return getOrCreateGamesSpreadsheet();
}

// Removed: DailyTotals spreadsheet helpers

function getOrCreateLogsSpreadsheet() {
  const props = getScriptProps();
  const key = 'SPREADSHEET_ID_LOGS';
  const existingId = props.getProperty(key);
  if (existingId) {
    try { var ssExisting = SpreadsheetApp.openById(existingId); ensureFileInProjectFolder(ssExisting.getId()); return ssExisting; } catch (e) {}
  }
  const ss = SpreadsheetApp.create(getSpreadsheetNameLogs());
  props.setProperty(key, ss.getId());
  ensureFileInProjectFolder(ss.getId());
  return ss;
}

function getOrCreateSheet(ss, sheetName, headers) {
  // Guard against undefined spreadsheet handles from callers
  if (!ss || typeof ss.getSheetByName !== 'function') {
    try {
      ss = SpreadsheetApp.getActive();
    } catch (e) {}
    if (!ss) {
      // Default fallback: use Games spreadsheet if unknown
      ss = getOrCreateGamesSpreadsheet();
    }
  }
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  if (sheet.getLastRow() === 0) {
    if (headers && headers.length) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function writeRowsChunked(sheet, rows, startRow) {
  if (!rows || rows.length === 0) return;
  const maxChunk = 5000;
  let offset = 0;
  const colCount = rows[0].length;
  // Validate width vs header when possible
  try {
    var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] || [];
    if (header && header.length && colCount !== header.length) {
      logWarn('WRITE_WIDTH_MISMATCH', 'Row width differs from header; truncating/padding', { header: header.length, row: colCount, sheet: sheet.getName() });
    }
  } catch (e) {}
  const start = startRow || sheet.getLastRow() + 1;
  while (offset < rows.length) {
    const chunk = rows.slice(offset, offset + maxChunk);
    sheet.getRange(start + offset, 1, chunk.length, colCount).setValues(chunk);
    offset += chunk.length;
  }
}

// Raw JSON staging removed

function getOrCreateProjectFolder() {
  var name = getProjectRootFolderName();
  var it = DriveApp.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(name);
}

function ensureFileInProjectFolder(fileId) {
  try {
    var folder = getOrCreateProjectFolder();
    var file = DriveApp.getFileById(fileId);
    folder.addFile(file);
    try {
      DriveApp.getRootFolder().removeFile(file);
    } catch (e) {}
  } catch (e) {}
}

// Legacy Metrics aliases removed

// header upgrade helpers removed; headers are established at creation via getOrCreateSheet

// header upgrade helpers removed

// Ratings header upgrade removed

function upsertByUrl(sheet, rows) {
  if (!rows || !rows.length) return;
  var headerLen = sheet.getLastColumn() || rows[0].length;
  var existing = {};
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var urls = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < urls.length; i++) {
      var u = urls[i][0];
      if (u && existing[u] === undefined) existing[u] = 2 + i; // row number
    }
  }
  var toAppend = [];
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var url = row && row[0];
    if (!url) continue;
    var at = existing[url];
    if (at) {
      var values = [row.slice(0, headerLen)];
      sheet.getRange(at, 1, 1, values[0].length).setValues(values);
    } else {
      toAppend.push(row);
    }
  }
  if (toAppend.length) writeRowsChunked(sheet, toAppend);
}

function writeGamesAndMetaRows(gamesSS, rows, archiveName) {
  if (!rows || !rows.length) return { games: 0, meta: 0 };
  var gamesSheet = getOrCreateSheet(gamesSS, CONFIG.SHEET_NAMES.Games, CONFIG.HEADERS.Games);
  var metaSheet = getOrCreateSheet(gamesSS, CONFIG.SHEET_NAMES.GameMeta, CONFIG.HEADERS.GameMeta);
  var colCount = CONFIG.HEADERS.Games.length;
  var gameRows = []; var metaRows = [];
  var metaArchiveIdx = CONFIG.HEADERS.GameMeta.indexOf('archive_name');
  // Build seeds for last-based (by full format) and snapshots (by base bucket)
  var seeds = { lastByFormat: {}, snaps: { bullet:'', blitz:'', rapid:'', daily:'' } };
  try {
    var lastRow = metaSheet.getLastRow();
    if (lastRow >= 2) {
      var mh = metaSheet.getRange(1, 1, 1, metaSheet.getLastColumn()).getValues()[0] || [];
      function mi(h){ for (var i = 0; i < mh.length; i++) if (String(mh[i]) === h) return i; return -1; }
      var iFmt = mi('format'); var iMy = mi('my_rating');
      var iSB = mi('my_snapshot_bullet'), iSL = mi('my_snapshot_blitz'), iSR = mi('my_snapshot_rapid'), iSD = mi('my_snapshot_daily');
      var vals = metaSheet.getRange(2, 1, lastRow - 1, metaSheet.getLastColumn()).getValues();
      for (var r = 0; r < vals.length; r++) {
        var fmt = String(vals[r][iFmt] || ''); var my = vals[r][iMy];
        if (fmt && my !== '' && my !== null && my !== undefined) seeds.lastByFormat[fmt] = Number(my);
        if (iSB >= 0 && vals[r][iSB] !== '' && vals[r][iSB] !== null && vals[r][iSB] !== undefined) seeds.snaps.bullet = Number(vals[r][iSB]);
        if (iSL >= 0 && vals[r][iSL] !== '' && vals[r][iSL] !== null && vals[r][iSL] !== undefined) seeds.snaps.blitz = Number(vals[r][iSL]);
        if (iSR >= 0 && vals[r][iSR] !== '' && vals[r][iSR] !== null && vals[r][iSR] !== undefined) seeds.snaps.rapid = Number(vals[r][iSR]);
        if (iSD >= 0 && vals[r][iSD] !== '' && vals[r][iSD] !== null && vals[r][iSD] !== undefined) seeds.snaps.daily = Number(vals[r][iSD]);
      }
    }
  } catch (e) {}
  for (var i = 0; i < rows.length; i++) {
    var rr = rows[i]; if (!rr) continue;
    if (rr._meta) {
      var mm = rr._meta;
      if (archiveName && metaArchiveIdx >= 0 && metaArchiveIdx < mm.length) mm[metaArchiveIdx] = archiveName;
      // Fill last-based (by full format) and snapshots (by base bucket from format)
      try {
        var header = CONFIG.HEADERS.GameMeta; function idx(h){ return header.indexOf(h); }
        var ifmt = idx('format'); var imy = idx('my_rating'); var iopp = idx('opp_rating');
        var iMyPregLast = idx('my_pregame_last'); var iMyDeltaLast = idx('my_delta_last');
        var iOppPregLast = idx('opp_pregame_last'); var iOppDeltaLast = idx('opp_delta_last');
        var iSB2 = idx('my_snapshot_bullet'); var iSL2 = idx('my_snapshot_blitz'); var iSR2 = idx('my_snapshot_rapid'); var iSD2 = idx('my_snapshot_daily');
        var fmtNow = String(mm[ifmt] || ''); var myNow = mm[imy]; var oppNow = mm[iopp];
        var pre = (seeds.lastByFormat[fmtNow] === undefined || seeds.lastByFormat[fmtNow] === '' || seeds.lastByFormat[fmtNow] === null) ? '' : Number(seeds.lastByFormat[fmtNow]);
        var dmy = (pre === '' || myNow === '' || myNow === null || myNow === undefined) ? '' : (Number(myNow) - Number(pre));
        var dopp = (dmy === '' ? '' : -Number(dmy));
        var oppPre = (oppNow === '' || oppNow === null || oppNow === undefined || dopp === '' ? '' : (Number(oppNow) - Number(dopp)));
        mm[iMyPregLast] = pre; mm[iMyDeltaLast] = dmy; mm[iOppPregLast] = oppPre; mm[iOppDeltaLast] = dopp;
        if (fmtNow && myNow !== '' && myNow !== null && myNow !== undefined) seeds.lastByFormat[fmtNow] = Number(myNow);
        // Snapshots are stored by base class: bullet/blitz/rapid/daily (variants still map to the class via time_class)
        if (iSB2 >= 0 && iSL2 >= 0 && iSR2 >= 0 && iSD2 >= 0) {
          mm[iSB2] = seeds.snaps.bullet; mm[iSL2] = seeds.snaps.blitz; mm[iSR2] = seeds.snaps.rapid; mm[iSD2] = seeds.snaps.daily;
          var base = (fmtNow.indexOf('bullet') >= 0) ? 'bullet' : (fmtNow.indexOf('blitz') >= 0) ? 'blitz' : (fmtNow.indexOf('rapid') >= 0) ? 'rapid' : (fmtNow.indexOf('daily') >= 0) ? 'daily' : '';
          if (base === 'bullet' && myNow !== '' && myNow !== null && myNow !== undefined) seeds.snaps.bullet = mm[iSB2] = Number(myNow);
          else if (base === 'blitz' && myNow !== '' && myNow !== null && myNow !== undefined) seeds.snaps.blitz = mm[iSL2] = Number(myNow);
          else if (base === 'rapid' && myNow !== '' && myNow !== null && myNow !== undefined) seeds.snaps.rapid = mm[iSR2] = Number(myNow);
          else if (base === 'daily' && myNow !== '' && myNow !== null && myNow !== undefined) seeds.snaps.daily = mm[iSD2] = Number(myNow);
        }
      } catch (e) {}
      metaRows.push(mm);
      rr = rr.slice(0, colCount);
    }
    gameRows.push(rr);
  }
  if (gameRows.length) writeRowsChunked(gamesSheet, gameRows);
  if (metaRows.length) upsertByUrl(metaSheet, metaRows);
  return { games: gameRows.length, meta: metaRows.length };
}
