/**
 * Module: logging
 * Purpose: Structured logging and operations log rows.
 */

function logEvent(level, code, message, context) {
  try {
    var logsSS = getOrCreateLogsSpreadsheet();
    var sheet = getOrCreateSheet(logsSS, CONFIG.SHEET_NAMES.Logs, CONFIG.HEADERS.Logs);
    var row = [new Date(), String(level || 'INFO'), String(code || ''), String(message || ''), context ? JSON.stringify(context) : ''];
    writeRowsChunked(sheet, [row]);
  } catch (e) {
    // swallow logging errors
  }
}

// Unified logging helpers
function logRow(level, code, message, context) {
  try {
    var logsSS = getOrCreateLogsSpreadsheet();
    var sheet = getOrCreateSheet(logsSS, CONFIG.SHEET_NAMES.Logs, CONFIG.HEADERS.Logs);
    var ts = new Date();
    var ctx = context ? JSON.stringify(context) : '';
    writeRowsChunked(sheet, [[ts, level || 'INFO', code || '', String(message || ''), ctx]]);
  } catch (e) {}
}

function logInfo(code, message, context) { logRow('INFO', code, message, context); }
function logWarn(code, message, context) { logRow('WARN', code, message, context); }
function logError(code, message, context) { logRow('ERROR', code, message, context); }

function appendOpsLog(url, operation, status, httpCode, details) {
  try {
    var gamesSS = getOrCreateGamesSpreadsheet();
    var sheet = getOrCreateSheet(gamesSS, CONFIG.SHEET_NAMES.GameOpsLog, CONFIG.HEADERS.GameOpsLog);
    var row = [new Date(), String(url || ''), String(operation || ''), String(status || ''), (httpCode === undefined || httpCode === null ? '' : Number(httpCode)), details ? JSON.stringify(details) : ''];
    writeRowsChunked(sheet, [row]);
  } catch (e) {}
}

