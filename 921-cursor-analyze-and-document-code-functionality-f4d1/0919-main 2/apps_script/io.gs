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

// Ratings/Stats/Live spreadsheets removed in unified-only mode

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

function ensureSheetHeader(sheet, desired) {
  try {
    if (!sheet) return;
    if (!desired || !desired.length) return;
    var lastCol = sheet.getLastColumn();
    var lastRow = sheet.getLastRow();
    if (lastRow < 1) {
      sheet.getRange(1, 1, 1, desired.length).setValues([desired]);
      sheet.setFrozenRows(1);
      return;
    }
    var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0] || [];
    var same = (header.length === desired.length);
    if (same) {
      for (var i = 0; i < header.length; i++) { if (String(header[i]) !== String(desired[i])) { same = false; break; } }
    }
    if (!same) {
      sheet.getRange(1, 1, 1, desired.length).setValues([desired]);
      if (lastCol > desired.length) {
        try { sheet.getRange(1, desired.length + 1, 1, lastCol - desired.length).clearContent(); } catch (e) {}
      }
      sheet.setFrozenRows(1);
    }
  } catch (e) {}
}

function writeRowsChunked(sheet, rows, startRow) {
  if (!rows || rows.length === 0) return;
  const maxChunk = 5000;
  let offset = 0;
  const colCount = rows[0].length;
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

// Legacy compatibility for older "Metrics" API
// Deprecated: legacy "Metrics" alias kept for backward compatibility
function getSpreadsheetNameMetrics() { return getSpreadsheetNameLogs(); }
function getOrCreateMetricsSpreadsheet() { return getOrCreateLogsSpreadsheet(); }

// Removed specific upgrade helpers in favor of ensureSheetHeader

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
