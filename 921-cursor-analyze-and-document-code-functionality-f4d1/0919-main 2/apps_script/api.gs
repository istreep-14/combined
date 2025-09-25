/**
 * Module: api
 * Purpose: Centralize endpoint builders and resilient HTTP helpers with ETag and backoff.
 */

// Constants
var HTTP_USER_AGENT = 'ChessSheets/1.0 (AppsScript)';
var HTTP_MAX_RETRIES = 5;
var HTTP_INITIAL_BACKOFF_MS = 500;

// Endpoint builders
function playerArchivesListUrl(username) { return 'https://api.chess.com/pub/player/' + encodeURIComponent(username) + '/games/archives'; }
function playerArchiveMonthUrl(username, year, month) { var mm = (month < 10 ? '0' : '') + String(month); return 'https://api.chess.com/pub/player/' + encodeURIComponent(username) + '/games/' + String(year) + '/' + mm; }
function playerStatsUrl(username) { return 'https://api.chess.com/pub/player/' + encodeURIComponent(username) + '/stats'; }
function callbackLiveGameUrl(id) { return 'https://www.chess.com/callback/live/game/' + String(id); }
function callbackDailyGameUrl(id) { return 'https://www.chess.com/callback/daily/game/' + String(id); }
function liveStatsUrl(format, username) { return 'https://www.chess.com/callback/stats/live/' + encodeURIComponent(String(format || '')) + '/' + encodeURIComponent(username) + '/0'; }

// HTTP helpers
function fetchJsonWithEtag(url, etag) {
  const headers = { 'User-Agent': HTTP_USER_AGENT, 'Accept': 'application/json' };
  if (etag) headers['If-None-Match'] = etag;
  const options = { method: 'get', muteHttpExceptions: true, followRedirects: true, headers: headers };
  var attempts = 0; var waitMs = HTTP_INITIAL_BACKOFF_MS;
  while (attempts < HTTP_MAX_RETRIES) {
    attempts++;
    let resp;
    try {
      resp = UrlFetchApp.fetch(url, options);
    } catch (err) {
      var msg = (err && err.message) ? String(err.message) : '';
      // Treat Apps Script bandwidth quota errors as retryable once, then bubble up
      if (/Bandwidth quota exceeded/i.test(msg) && attempts < 2) {
        Utilities.sleep(waitMs);
        continue;
      }
      return { code: 0, status: 'error', error: msg || 'FETCH_EXCEPTION' };
    }
    const code = resp.getResponseCode();
    const hdrs = resp.getAllHeaders();
    const newEtag = hdrs['ETag'] || hdrs['Etag'] || hdrs['etag'] || null;
    const lastModified = hdrs['Last-Modified'] || hdrs['last-modified'] || null;
    if (code === 304) return { code: code, status: 'not_modified', etag: etag || newEtag, lastModified: lastModified };
    if (code >= 200 && code < 300) {
      const text = resp.getContentText();
      const json = text ? JSON.parse(text) : null;
      return { code: code, status: 'ok', json: json, etag: newEtag, lastModified: lastModified };
    }
    if (code === 429 || (code >= 500 && code < 600)) { Utilities.sleep(waitMs + Math.floor(Math.random() * 250)); waitMs = Math.min(waitMs * 2, 4000); continue; }
    return { code: code, status: 'error', error: 'HTTP_' + code, etag: newEtag, lastModified: lastModified };
  }
  return { code: 0, status: 'error', error: 'RETRY_EXHAUSTED' };
}

function fetchJsonBatchWithEtag(urls, etags) {
  var reqs = [];
  for (var i = 0; i < urls.length; i++) {
    var headers = { 'User-Agent': HTTP_USER_AGENT, 'Accept': 'application/json' };
    if (etags && etags[i]) headers['If-None-Match'] = etags[i];
    reqs.push({ url: urls[i], method: 'get', muteHttpExceptions: true, followRedirects: true, headers: headers });
  }
  var responses = UrlFetchApp.fetchAll(reqs);
  var out = [];
  for (var j = 0; j < responses.length; j++) {
    var resp = responses[j];
    var code = resp.getResponseCode();
    var hdrs = resp.getAllHeaders();
    var newEtag = hdrs['ETag'] || hdrs['Etag'] || hdrs['etag'] || null;
    var lastModified = hdrs['Last-Modified'] || hdrs['last-modified'] || null;
    if (code === 304) out.push({ code: code, status: 'not_modified', etag: etags ? etags[j] : newEtag, lastModified: lastModified });
    else if (code >= 200 && code < 300) { var text = resp.getContentText(); var json = text ? JSON.parse(text) : null; out.push({ code: code, status: 'ok', json: json, etag: newEtag, lastModified: lastModified }); }
    else out.push({ code: code, status: 'error', error: 'HTTP_' + code, etag: newEtag, lastModified: lastModified });
  }
  return out;
}

