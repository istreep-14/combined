/**
 * Hub-and-spoke skeleton: structure first, no timelines/dailies.
 */

var HUB = { name: 'Games' };
var SPOKES = {
  analysis: { name: 'AnalysisStaging' },
  callback: { name: 'E_Callback' },
  all:      { name: 'AllFields' },
  meta:     { name: 'Meta' }
};

var STATE = {
  SCHEMA_VERSION: 'v1.0',
  INGEST_VERSION: 'v1.0'
};

function setupProject() {
  var hubSS = SpreadsheetApp.create('Hub - Games');
  var analysisSS = SpreadsheetApp.create('Spoke - Analysis');
  var allSS = SpreadsheetApp.create('Spoke - AllFields');
  var metaSS = allSS; // Meta lives in the same AllFields spreadsheet

  var hubSheet = getOrCreateSheet(hubSS, HUB.name, getHeaderFor('hub'));
  var analysisSheet = getOrCreateSheet(analysisSS, SPOKES.analysis.name, getHeaderFor('spoke:analysis'));
  var callbackSheet = getOrCreateSheet(allSS, SPOKES.callback.name, ['url','queued_at','applied_at','reason'].concat(getHeaderFor('spoke:callback')));
  var allSheet = getOrCreateSheet(allSS, SPOKES.all.name, getHeaderFor('all'));
  var metaSheet = getOrCreateSheet(metaSS, SPOKES.meta.name, getMetaHeader());

  PropertiesService.getScriptProperties().setProperty('HUB_ID', hubSS.getId());
  PropertiesService.getScriptProperties().setProperty('SPOKE_ANALYSIS_ID', analysisSS.getId());
  PropertiesService.getScriptProperties().setProperty('SPOKE_ALL_ID', allSS.getId());
  PropertiesService.getScriptProperties().setProperty('SPOKE_META_ID', metaSS.getId());

  // Create Hub ExportQueue
  getOrCreateSheet(hubSS, 'ExportQueue', ['url','target','reason','queued_at']);

  return {
    hubUrl: hubSS.getUrl(), analysisUrl: analysisSS.getUrl(), callbackUrl: allSS.getUrl(), allUrl: allSS.getUrl(), metaUrl: metaSS.getUrl()
  };
}

function getHubSS() {
  var id = PropertiesService.getScriptProperties().getProperty('HUB_ID');
  return SpreadsheetApp.openById(id);
}

function getSpokeSS(kind) {
  var key = (kind === 'analysis') ? 'SPOKE_ANALYSIS_ID' : (kind === 'all' ? 'SPOKE_ALL_ID' : 'SPOKE_ALL_ID');
  if (kind === 'meta') key = 'SPOKE_META_ID';
  var id = PropertiesService.getScriptProperties().getProperty(key);
  return SpreadsheetApp.openById(id);
}

function getOrCreateSheet(ss, name, headers) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0 && headers && headers.length) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

// Defaults and helpers
function setDefaults() {
  PropertiesService.getScriptProperties().setProperties({
    USERNAME: 'your_username',
    TIMEZONE: 'America/New_York'
  }, true);
}

function getDefaultUsername() {
  var p = PropertiesService.getScriptProperties();
  return p.getProperty('USERNAME') || '';
}

function getDefaultTimezone() {
  var p = PropertiesService.getScriptProperties();
  return p.getProperty('TIMEZONE') || Session.getScriptTimeZone() || 'Etc/UTC';
}

function fetchMonthArchive(username, year, month, etagOpt) {
  var mm = (month < 10 ? '0' : '') + String(month);
  var url = 'https://api.chess.com/pub/player/' + encodeURIComponent(username) + '/games/' + String(year) + '/' + mm;
  var headers = { 'User-Agent': 'HubSpoke/1.0', 'Accept': 'application/json' };
  if (etagOpt) headers['If-None-Match'] = etagOpt;
  var resp = UrlFetchApp.fetch(url, { method:'get', muteHttpExceptions:true, headers:headers, followRedirects:true });
  var code = resp.getResponseCode();
  var hdrs = resp.getAllHeaders();
  var etag = hdrs['ETag'] || hdrs['Etag'] || hdrs['etag'] || null;
  var lastModified = hdrs['Last-Modified'] || hdrs['last-modified'] || null;
  if (code === 304) return { status:'not_modified', etag: etag || etagOpt, lastModified: lastModified };
  if (code >= 200 && code < 300) return { status:'ok', etag: etag, lastModified: lastModified, json: JSON.parse(resp.getContentText() || '{}') };
  return { status:'error', code: code };
}

function flattenArchiveToRows(username, archiveJson, yearOpt, monthOpt, etagOpt, lastModOpt) {
  var outHub = []; var outAnalysis = [];
  var games = (archiveJson && archiveJson.games) || [];
  for (var i=0;i<games.length;i++) {
    var g = games[i]; var url = g.url || '';
    if (!url) continue;
    // Core fields (simplified for starter)
    var timeClass = String(g.time_class || '').toLowerCase();
    var rules = String(g.rules || '').toLowerCase();
    var format = (rules === 'chess' || !rules) ? timeClass : (rules + '-' + timeClass);
    var endEpoch = g.end_time || null;
    var startLocal = ''; var endLocal = '';
    var dateOnly = '';
    var pgn = g.pgn || '';
    // PGN headers
    var utcDate = extractPgnHeader(pgn, 'UTCDate');
    var utcTime = extractPgnHeader(pgn, 'UTCTime');
    var tz = getDefaultTimezone();
    var startMs = null;
    if (utcDate && utcTime) {
      var iso = utcDate.replace(/\./g,'-') + 'T' + utcTime + 'Z';
      var ms = Date.parse(iso); if (!isNaN(ms)) startMs = ms;
    }
    if (startMs !== null) {
      startLocal = Utilities.formatDate(new Date(startMs), tz, 'yyyy-MM-dd HH:mm:ss');
    }
    if (endEpoch) {
      var endMs = Number(endEpoch) * 1000;
      endLocal = Utilities.formatDate(new Date(endMs), tz, 'yyyy-MM-dd HH:mm:ss');
      dateOnly = Utilities.formatDate(new Date(endMs), tz, 'yyyy-MM-dd');
    }
    var baseInc = parseTimeControl(g.time_control || '');
    // Identify "me" by configured USERNAME (case-insensitive)
    var meName = String(getDefaultUsername() || '').toLowerCase();
    var whiteUser = (g.white && g.white.username) || '';
    var blackUser = (g.black && g.black.username) || '';
    var whiteUserLC = String(whiteUser || '').toLowerCase();
    var blackUserLC = String(blackUser || '').toLowerCase();
    var meColor = '';
    if (meName && whiteUserLC === meName) meColor = 'white';
    else if (meName && blackUserLC === meName) meColor = 'black';

    var myUser = '', myRating = '', myOutcome = '';
    var oppUser = '', oppRating = '', oppOutcome = '';
    if (meColor === 'white') {
      myUser = whiteUser; myRating = g.white && g.white.rating; myOutcome = (g.white && g.white.result) || '';
      oppUser = blackUser; oppRating = g.black && g.black.rating; oppOutcome = (g.black && g.black.result) || '';
    } else if (meColor === 'black') {
      myUser = blackUser; myRating = g.black && g.black.rating; myOutcome = (g.black && g.black.result) || '';
      oppUser = whiteUser; oppRating = g.white && g.white.rating; oppOutcome = (g.white && g.white.result) || '';
    } else {
      // Fallback if USERNAME not set or mismatch: keep white as "my" for determinism
      myUser = whiteUser; myRating = g.white && g.white.rating; myOutcome = (g.white && g.white.result) || '';
      oppUser = blackUser; oppRating = g.black && g.black.rating; oppOutcome = (g.black && g.black.result) || '';
    }

    var hubRow = projectFields('hub', {
      url: url, rated: g.rated || false, time_class: timeClass, rules: rules, format: format,
      end_time_epoch: endEpoch, start_time_local: startLocal, end_time_local: endLocal, date: dateOnly,
      duration_seconds: (endEpoch && startMs !== null ? Math.round((Number(endEpoch)*1000 - startMs)/1000) : ''),
      time_control: g.time_control || '', base_time: baseInc.base, increment: baseInc.inc, correspondence_time: baseInc.corr,
      my_username: myUser, my_color: meColor, my_rating_end: myRating, my_outcome: myOutcome,
      opp_username: oppUser, opp_color: (meColor===''?'':(meColor==='white'?'black':'white')), opp_rating_end: oppRating, opp_outcome: oppOutcome,
      end_reason: deriveEndReason(g),
      archive_year: yearOpt ? String(yearOpt) : '', archive_month: monthOpt ? ((monthOpt<10?'0':'')+String(monthOpt)) : '',
      archive_etag: etagOpt || '', archive_last_modified: lastModOpt || '',
      archive_sig: simpleHash((g.time_control||'')+'|'+(g.rated?'1':'0')+'|'+(g.white&&g.white.username||'')+'|'+(g.black&&g.black.username||'')+'|'+(g.end_time||'')),
      pgn_sig: simpleHash((extractPgnHeader(pgn,'UTCDate')||'')+'|'+(extractPgnHeader(pgn,'UTCTime')||'')+'|'+(extractPgnHeader(pgn,'ECO')||'')),
      schema_version: STATE.SCHEMA_VERSION, ingest_version: STATE.INGEST_VERSION,
      last_ingested_at: new Date(), last_rechecked_at: '',
      enrichment_status: 'queued', enrichment_targets: 'analysis,callback',
      last_enrichment_applied_at: '', last_enrichment_reason: '', notes: ''
    });
    outHub.push(hubRow);

    var stagingRow = projectFields('spoke:analysis', {
      url: url,
      eco_code: extractPgnHeader(pgn, 'ECO'),
      eco_url: extractPgnHeader(pgn, 'ECOUrl'),
      pgn_moves: extractPgnMoves(pgn),
      tcn: g.tcn || '', initial_setup: g.initial_setup || '', fen: g.fen || '',
      accuracies_white: g.accuracies && g.accuracies.white, accuracies_black: g.accuracies && g.accuracies.black,
      tournament_url: g.tournament || '', match_url: g.match || '',
      white_result_raw: g.white && g.white.result || '', black_result_raw: g.black && g.black.result || '',
      termination_raw: extractPgnHeader(pgn, 'Termination')
    });
    outAnalysis.push(stagingRow);
  }
  return { hub: outHub, analysis: outAnalysis };
}

function projectFields(target, values) {
  var header = getHeaderFor(target);
  var row = [];
  for (var i=0;i<header.length;i++) row.push(values[header[i]] !== undefined ? values[header[i]] : '');
  return row;
}

function parseTimeControl(tc) {
  if (!tc) return { base:'', inc:'', corr:'' };
  if (/\//.test(tc)) return { base:'', inc:'', corr: Number(tc.split('/')[1]||'') };
  if (/\+/.test(tc)) { var p = tc.split('+'); return { base: Number(p[0]||''), inc: Number(p[1]||''), corr:'' }; }
  return { base: Number(tc||''), inc:'', corr:'' };
}

function extractPgnHeader(pgn, key) {
  try { var re = new RegExp('\\['+key+' "([\\s\\S]*?)"\\]'); var m = (pgn||'').match(re); return (m && m[1]) ? m[1] : ''; } catch(e){ return ''; }
}

function extractPgnMoves(pgn) {
  if (!pgn) return '';
  var lines = String(pgn).split(/\r?\n/); var i=0; while (i<lines.length && /^\s*\[/.test(lines[i])) i++; if (i<lines.length && /^\s*$/.test(lines[i])) i++;
  return lines.slice(i).join(' ').trim();
}

function deriveEndReason(g) {
  var w = (g.white && g.white.result) || ''; var b = (g.black && g.black.result) || '';
  if (w === 'win') return b || 'win'; if (b === 'win') return w || 'win';
  return w || b || '';
}

function writeHub(rows) {
  var ss = getHubSS(); var sh = getOrCreateSheet(ss, HUB.name, getHeaderFor('hub'));
  if (rows && rows.length) sh.getRange(sh.getLastRow()+1, 1, rows.length, rows[0].length).setValues(rows);
}

function writeSpoke(kind, rows) {
  var ss = getSpokeSS(kind);
  var headerKey = (kind==='all') ? 'all' : ('spoke:'+kind);
  var sheetName = SPOKES[kind].name; var sh = getOrCreateSheet(ss, sheetName, getHeaderFor(headerKey));
  if (rows && rows.length) sh.getRange(sh.getLastRow()+1, 1, rows.length, rows[0].length).setValues(rows);
}

function exportNewGames(username, year, month) {
  var res = fetchMonthArchive(username, year, month, null);
  if (res.status !== 'ok' || !res.json) return { written:0 };
  var flat = flattenArchiveToRows(username, res.json, year, month, res.etag || '', res.lastModified || '');
  writeHub(flat.hub);
  writeSpoke('analysis', flat.analysis);
  // Build and write the single wide AllFields row set from registry union
  var allRows = buildAllFieldsRows(flat, res.etag || '', res.lastModified || '', year, month);
  writeSpoke('all', allRows);
  // Write Meta rows (one per url)
  var metaRows = buildMetaRows(flat, res.etag || '', res.lastModified || '', year, month);
  writeMeta(metaRows);
  // Auto-append callback queue entries in E_Callback
  var urls = flat.hub.map(function(r){ return r[0]; }).filter(function(u){ return !!u; });
  enqueueCallbackUrls(urls, 'new');
  return { written: flat.hub.length };
}

function buildAllFieldsRows(flat, etag, lastMod, year, month) {
  var header = getHeaderFor('all_no_callback');
  var mapHub = {}; // url -> hub row values by name
  var mapAnalysis = {};
  var idx = {};
  // Build maps
  var hubHeader = getHeaderFor('hub');
  for (var i=0;i<flat.hub.length;i++) {
    var row = flat.hub[i]; var url = row[0]; var obj = {}; for (var c=0;c<hubHeader.length;c++) obj[hubHeader[c]] = row[c]; mapHub[url]=obj;
  }
  var anHeader = getHeaderFor('spoke:analysis');
  for (var j=0;j<flat.analysis.length;j++) {
    var r2 = flat.analysis[j]; var url2 = r2[0]; var o2 = {}; for (var c2=0;c2<anHeader.length;c2++) o2[anHeader[c2]] = r2[c2]; mapAnalysis[url2]=o2;
  }
  var out = [];
  Object.keys(mapHub).forEach(function(url){
    var o = {}; var h = mapHub[url]||{}; var a = mapAnalysis[url]||{};
    // ensure some meta in AllFields
    h.archive_etag = etag; h.archive_last_modified = lastMod;
    h.archive_year = String(year); h.archive_month = (month<10?'0':'')+String(month);
    for (var k=0;k<header.length;k++) {
      var key = header[k]; o[key] = (h[key]!==undefined ? h[key] : (a[key]!==undefined ? a[key] : ''));
    }
    var row = header.map(function(k){ return o[k]; });
    out.push(row);
  });
  return out;
}

function buildMetaRows(flat, etag, lastMod, year, month) {
  var header = getMetaHeader();
  var out = [];
  for (var i=0;i<flat.hub.length;i++) {
    var row = flat.hub[i]; var url = row[0];
    var meta = {
      url: url,
      archive_year: String(year), archive_month: (month<10?'0':'')+String(month),
      archive_etag: etag, archive_last_modified: lastMod,
      archive_sig: '', pgn_sig: '', schema_version: STATE.SCHEMA_VERSION, ingest_version: STATE.INGEST_VERSION,
      last_ingested_at: Utilities.formatDate(new Date(), getDefaultTimezone(), 'yyyy-MM-dd HH:mm:ss'),
      last_rechecked_at: '',
      enrichment_status: 'queued', enrichment_targets: 'callback',
      last_enrichment_applied_at: '', last_enrichment_reason: '', notes: '',
      callback_status: 'queued', callback_queued_at: Utilities.formatDate(new Date(), getDefaultTimezone(), 'yyyy-MM-dd HH:mm:ss'), callback_applied_at: '', callback_reason: ''
    };
    var arr = header.map(function(k){ return meta[k]!==undefined ? meta[k] : ''; });
    out.push(arr);
  }
  return out;
}

function writeMeta(rows) {
  var ss = getSpokeSS('meta'); var sh = getOrCreateSheet(ss, SPOKES.meta.name, getMetaHeader());
  if (rows && rows.length) sh.getRange(sh.getLastRow()+1, 1, rows.length, rows[0].length).setValues(rows);
}

function enqueueForCallback(urls) {
  queueExports(urls, ['callback'], 'manual');
}

function processCallbackBatch(maxN) {
  // Read from E_Callback queue (AllFields spreadsheet): rows with empty applied_at
  var ss = getSpokeSS('callback');
  var sheet = getOrCreateSheet(ss, SPOKES.callback.name, ['url','queued_at','applied_at','reason'].concat(getHeaderFor('spoke:callback')));
  var last = sheet.getLastRow(); if (last < 2) return { applied:0 };
  var header = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  function idx(n){ for (var i=0;i<header.length;i++) if (String(header[i])===n) return i; return -1; }
  var iUrl = idx('url'); var iQ = idx('queued_at'); var iA = idx('applied_at'); var iR = idx('reason');
  var startRow = 2; var totalRows = last - 1; var limit = Math.max(1, maxN||20); var picked = [];
  var vals = sheet.getRange(2,1,totalRows,sheet.getLastColumn()).getValues();
  for (var r=0; r<vals.length && picked.length<limit; r++) { if (!vals[r][iA]) picked.push({ row: 2+r, url: vals[r][iUrl] }); }
  if (!picked.length) return { applied: 0 };
  var out = []; var tz = getDefaultTimezone();
  for (var i=0;i<urls.length;i++) {
    var url = picked[i].url; var id = url.split('/').pop(); var type = (url.indexOf('/game/daily/')>=0)?'daily':'live';
    var endpoint = type==='daily' ? ('https://www.chess.com/callback/daily/game/'+id) : ('https://www.chess.com/callback/live/game/'+id);
    try {
      var resp = UrlFetchApp.fetch(endpoint, { method:'get', muteHttpExceptions:true, headers: { 'User-Agent':'HubSpoke/1.0' }, followRedirects:true });
      var code = resp.getResponseCode(); if (code < 200 || code >= 300) continue;
      var json = JSON.parse(resp.getContentText()||'{}');
      var g = (json && json.game) || {}; var players = json && json.players || {};
      var pgn = (json && json.pgnHeaders) || {};
      var myColor = resolveMyColorFromCallback(pgn.White, pgn.Black);
      // pick exact deltas by color
      var myDelta = '';
      var oppDelta = '';
      if (myColor==='white') { myDelta = (g.ratingChangeWhite!==undefined?g.ratingChangeWhite:(g.ratingChange!==undefined?g.ratingChange:'')); oppDelta = (g.ratingChangeBlack!==undefined?g.ratingChangeBlack:(g.ratingChange!==undefined?-g.ratingChange:'')); }
      else if (myColor==='black') { myDelta = (g.ratingChangeBlack!==undefined?g.ratingChangeBlack:(g.ratingChange!==undefined?g.ratingChange:'')); oppDelta = (g.ratingChangeWhite!==undefined?g.ratingChangeWhite:(g.ratingChange!==undefined?-g.ratingChange:'')); }
      // pregame ratings by pgn color -> players.top/bottom chosen by color
      var myPregame = '';
      var oppPregame = '';
      var meBlock = (players.top && players.top.color===myColor) ? players.top : ((players.bottom && players.bottom.color===myColor) ? players.bottom : {});
      var oppColor = (myColor==='white'?'black':(myColor==='black'?'white':''));
      var oppBlock = (players.top && players.top.color===oppColor) ? players.top : ((players.bottom && players.bottom.color===oppColor) ? players.bottom : {});
      myPregame = meBlock && meBlock.rating || '';
      oppPregame = oppBlock && oppBlock.rating || '';
      // Build row in registry order
      var values = {
        url: url,
        my_rating_change: (myDelta===''?'' : Number(myDelta)),
        opp_rating_change: (oppDelta===''?'' : Number(oppDelta)),
        my_pregame_rating: (myPregame===''?'' : Number(myPregame)),
        opp_pregame_rating: (oppPregame===''?'' : Number(oppPregame)),
        result_message: g.resultMessage || '',
        ply_count: g.plyCount || '',
        base_time1: g.baseTime1 || '',
        time_increment1: g.timeIncrement1 || '',
        move_timestamps_ds: (g.moveTimestamps===undefined||g.moveTimestamps===null||g.moveTimestamps==='')?'':("'"+String(g.moveTimestamps)),
        my_country: meBlock && meBlock.countryName || '',
        my_membership: meBlock && meBlock.membershipCode || '',
        my_default_tab: meBlock && meBlock.defaultTab || '',
        my_post_move_action: meBlock && meBlock.postMoveAction || '',
        opp_country: oppBlock && oppBlock.countryName || '',
        opp_membership: oppBlock && oppBlock.membershipCode || '',
        opp_default_tab: oppBlock && oppBlock.defaultTab || '',
        opp_post_move_action: oppBlock && oppBlock.postMoveAction || ''
      };
      var cbHeader = getHeaderFor('spoke:callback');
      var rowVals = cbHeader.map(function(k){ return values[k]!==undefined ? values[k] : ''; });
      // write into E_Callback row: keep first 4 columns (url,queued_at,applied_at,reason) untouched (except applied_at)
      var appliedTs = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');
      sheet.getRange(picked[i].row, 3, 1, 1).setValue(appliedTs);
      sheet.getRange(picked[i].row, 5, 1, rowVals.length).setValues([rowVals]);
      out.push(rowVals);
      // Update Meta status for this url
      setMetaCallbackApplied(url, appliedTs, 'batch');
    } catch (e) {}
  }
  return { applied: out.length };
}

function enqueueCallbackUrls(urls, reason) {
  var ss = getSpokeSS('callback');
  var sheet = getOrCreateSheet(ss, SPOKES.callback.name, ['url','queued_at','applied_at','reason'].concat(getHeaderFor('spoke:callback')));
  var tz = getDefaultTimezone();
  var nowStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');
  var rows = (urls||[]).map(function(u){ return [u, nowStr, '', reason||'']; });
  if (rows.length) sheet.getRange(sheet.getLastRow()+1, 1, rows.length, 4).setValues(rows);
}

function resolveMyColorFromCallback(pgnWhite, pgnBlack) {
  var me = String(getDefaultUsername()||'').toLowerCase();
  var w = String(pgnWhite||'').toLowerCase();
  var b = String(pgnBlack||'').toLowerCase();
  if (me && w===me) return 'white';
  if (me && b===me) return 'black';
  return '';
}

function queueExports(urls, targets, reason) {
  var hub = getHubSS(); var q = getOrCreateSheet(hub, 'ExportQueue', ['url','target','reason','queued_at']);
  var rows = [];
  var safeUrls = (urls||[]).filter(function(u){ return !!u; });
  var safeTargets = (targets||[]).filter(function(t){ return !!t; });
  for (var i=0;i<safeUrls.length;i++) {
    for (var j=0;j<safeTargets.length;j++) {
      rows.push([safeUrls[i], safeTargets[j], reason||'', new Date()]);
    }
  }
  if (rows.length) q.getRange(q.getLastRow()+1, 1, rows.length, 4).setValues(rows);
}

function setHubEnrichmentStatus(urls, target, status, reason) {
  var ss = getHubSS(); var sh = getOrCreateSheet(ss, HUB.name, getHeaderFor('hub'));
  var last = sh.getLastRow(); if (last < 2) return;
  var header = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  function idx(n){ for (var i=0;i<header.length;i++) if (String(header[i])===n) return i; return -1; }
  var iUrl = 0; // url is first in our header
  var iStatus = idx('enrichment_status'); var iTargets = idx('enrichment_targets'); var iApplied = idx('last_enrichment_applied_at'); var iReason = idx('last_enrichment_reason');
  var map = {}; for (var u=0; u<urls.length; u++) map[String(urls[u])]=true;
  var vals = sh.getRange(2,1,last-1,sh.getLastColumn()).getValues();
  for (var r=0; r<vals.length; r++) {
    var u = String(vals[r][iUrl]||''); if (!map[u]) continue;
    if (iStatus>=0) vals[r][iStatus] = status;
    if (iApplied>=0) vals[r][iApplied] = new Date();
    if (iReason>=0) vals[r][iReason] = reason||'';
  }
  sh.getRange(2,1,last-1,sh.getLastColumn()).setValues(vals);
}

function simpleHash(str) {
  try { var s = String(str||''); var h = 0; for (var i=0;i<s.length;i++) { h = ((h<<5)-h) + s.charCodeAt(i); h |= 0; } return String(h>>>0); } catch(e){ return ''; }
}

