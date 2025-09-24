/**
 * Hub-and-spoke skeleton: structure first, no timelines/dailies.
 */

var HUB = { name: 'Games' };
var SPOKES = {
  analysis: { name: 'AnalysisStaging' },
  callback: { name: 'CallbackRaw' }
};

var STATE = {
  SCHEMA_VERSION: 'v1.0',
  INGEST_VERSION: 'v1.0'
};

function setupProject() {
  var hubSS = SpreadsheetApp.create('Hub - Games');
  var analysisSS = SpreadsheetApp.create('Spoke - Analysis');
  var callbackSS = SpreadsheetApp.create('Spoke - Callback');

  var hubSheet = getOrCreateSheet(hubSS, HUB.name, getHeaderFor('hub'));
  var analysisSheet = getOrCreateSheet(analysisSS, SPOKES.analysis.name, getHeaderFor('spoke:analysis'));
  var callbackSheet = getOrCreateSheet(callbackSS, SPOKES.callback.name, getHeaderFor('spoke:callback'));

  PropertiesService.getScriptProperties().setProperty('HUB_ID', hubSS.getId());
  PropertiesService.getScriptProperties().setProperty('SPOKE_ANALYSIS_ID', analysisSS.getId());
  PropertiesService.getScriptProperties().setProperty('SPOKE_CALLBACK_ID', callbackSS.getId());

  return {
    hubUrl: hubSS.getUrl(), analysisUrl: analysisSS.getUrl(), callbackUrl: callbackSS.getUrl()
  };
}

function getHubSS() {
  var id = PropertiesService.getScriptProperties().getProperty('HUB_ID');
  return SpreadsheetApp.openById(id);
}

function getSpokeSS(kind) {
  var key = (kind === 'analysis') ? 'SPOKE_ANALYSIS_ID' : 'SPOKE_CALLBACK_ID';
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

function fetchMonthArchive(username, year, month, etagOpt) {
  var mm = (month < 10 ? '0' : '') + String(month);
  var url = 'https://api.chess.com/pub/player/' + encodeURIComponent(username) + '/games/' + String(year) + '/' + mm;
  var headers = { 'User-Agent': 'HubSpoke/1.0', 'Accept': 'application/json' };
  if (etagOpt) headers['If-None-Match'] = etagOpt;
  var resp = UrlFetchApp.fetch(url, { method:'get', muteHttpExceptions:true, headers:headers, followRedirects:true });
  var code = resp.getResponseCode();
  var hdrs = resp.getAllHeaders();
  var etag = hdrs['ETag'] || hdrs['Etag'] || hdrs['etag'] || null;
  if (code === 304) return { status:'not_modified', etag: etag || etagOpt };
  if (code >= 200 && code < 300) return { status:'ok', etag: etag, json: JSON.parse(resp.getContentText() || '{}') };
  return { status:'error', code: code };
}

function flattenArchiveToRows(username, archiveJson) {
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
    if (utcDate && utcTime) {
      var iso = utcDate.replace(/\./g,'-') + 'T' + utcTime + 'Z';
      var ms = Date.parse(iso); if (!isNaN(ms)) startLocal = new Date(ms).toISOString();
    }
    if (endEpoch) { endLocal = new Date(Number(endEpoch)*1000).toISOString(); dateOnly = endLocal.slice(0,10); }
    var baseInc = parseTimeControl(g.time_control || '');
    var meColor = ''; var myUser=''; var myRating='', myOutcome='';
    var oppUser='', oppRating='', oppOutcome='';
    // Pick colors by username later; for now, store as-is
    myUser = g.white && g.white.username || '';
    myRating = g.white && g.white.rating; myOutcome = g.white && g.white.result || '';
    oppUser = g.black && g.black.username || '';
    oppRating = g.black && g.black.rating; oppOutcome = g.black && g.black.result || '';

    var hubRow = projectFields('hub', {
      url: url, rated: g.rated || false, time_class: timeClass, rules: rules, format: format,
      end_time_epoch: endEpoch, start_time_local: startLocal, end_time_local: endLocal, date: dateOnly,
      duration_seconds: (endEpoch && startLocal ? Math.round((Number(endEpoch)*1000 - Date.parse(startLocal))/1000) : ''),
      time_control: g.time_control || '', base_time: baseInc.base, increment: baseInc.inc, correspondence_time: baseInc.corr,
      my_username: myUser, my_color: '', my_rating_end: myRating, my_outcome: myOutcome,
      opp_username: oppUser, opp_color: '', opp_rating_end: oppRating, opp_outcome: oppOutcome,
      end_reason: deriveEndReason(g)
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
  var ss = getSpokeSS(kind); var sheetName = SPOKES[kind].name; var sh = getOrCreateSheet(ss, sheetName, getHeaderFor('spoke:'+kind));
  if (rows && rows.length) sh.getRange(sh.getLastRow()+1, 1, rows.length, rows[0].length).setValues(rows);
}

function exportNewGames(username, year, month) {
  var res = fetchMonthArchive(username, year, month, null);
  if (res.status !== 'ok' || !res.json) return { written:0 };
  var flat = flattenArchiveToRows(username, res.json);
  writeHub(flat.hub);
  writeSpoke('analysis', flat.analysis);
  return { written: flat.hub.length };
}

function enqueueForCallback(urls) {
  var ss = getSpokeSS('callback'); var sh = getOrCreateSheet(ss, 'CallbackQueue', ['url','queued_at']);
  var rows = (urls||[]).map(function(u){ return [u, new Date()]; });
  if (rows.length) sh.getRange(sh.getLastRow()+1, 1, rows.length, 2).setValues(rows);
}

function processCallbackBatch(maxN) {
  var ss = getSpokeSS('callback'); var queue = getOrCreateSheet(ss, 'CallbackQueue', ['url','queued_at']);
  var last = queue.getLastRow(); if (last < 2) return { applied:0 };
  var n = Math.min(Math.max(1, maxN||20), last-1);
  var urls = queue.getRange(2,1,n,1).getValues().map(function(r){ return r[0]; }).filter(Boolean);
  if (!urls.length) return { applied: 0 };
  var out = [];
  for (var i=0;i<urls.length;i++) {
    var url = urls[i]; var id = url.split('/').pop(); var type = (url.indexOf('/game/daily/')>=0)?'daily':'live';
    var endpoint = type==='daily' ? ('https://www.chess.com/callback/daily/game/'+id) : ('https://www.chess.com/callback/live/game/'+id);
    try {
      var resp = UrlFetchApp.fetch(endpoint, { method:'get', muteHttpExceptions:true, headers: { 'User-Agent':'HubSpoke/1.0' }, followRedirects:true });
      var code = resp.getResponseCode(); if (code < 200 || code >= 300) continue;
      var json = JSON.parse(resp.getContentText()||'{}');
      var g = (json && json.game) || {}; var players = json && json.players || {};
      var top = players.top || {}; var bottom = players.bottom || {};
      // Build row in registry order
      var values = {
        url: url,
        my_rating_change: (g.ratingChangeWhite!==undefined?g.ratingChangeWhite:(g.ratingChange!==undefined?g.ratingChange:'')),
        opp_rating_change: (g.ratingChangeBlack!==undefined?g.ratingChangeBlack:(g.ratingChange!==undefined?-g.ratingChange:'')),
        my_pregame_rating: top.rating || bottom.rating || '',
        opp_pregame_rating: '',
        result_message: g.resultMessage || '',
        ply_count: g.plyCount || '',
        base_time1: g.baseTime1 || '',
        time_increment1: g.timeIncrement1 || '',
        move_timestamps_ds: (g.moveTimestamps===undefined||g.moveTimestamps===null||g.moveTimestamps==='')?'':("'"+String(g.moveTimestamps)),
        my_country: (top.countryName||bottom.countryName||''),
        my_membership: (top.membershipCode||bottom.membershipCode||''),
        my_default_tab: (top.defaultTab||bottom.defaultTab||''),
        my_post_move_action: (top.postMoveAction||bottom.postMoveAction||''),
        opp_country: '', opp_membership:'', opp_default_tab:'', opp_post_move_action:''
      };
      var row = projectFields('spoke:callback', values);
      out.push(row);
    } catch (e) {}
  }
  if (out.length) {
    var raw = getOrCreateSheet(ss, SPOKES.callback.name, getHeaderFor('spoke:callback'));
    raw.getRange(raw.getLastRow()+1, 1, out.length, out[0].length).setValues(out);
    // Drop processed queue lines
    queue.deleteRows(2, urls.length);
  }
  return { applied: out.length };
}

