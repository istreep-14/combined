/**
 * Module: unified
 * Purpose: Build a per-game unified record by joining GameMeta, Games, and CallbackStats.
 */

function rebuildUnifiedForActiveMonth() {
  var ss = getOrCreateGamesSpreadsheet();
  var archivesSheet = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.Archives, CONFIG.HEADERS.Archives);
  var last = archivesSheet.getLastRow(); if (last < 2) return 0;
  var vals = archivesSheet.getRange(2, 1, last - 1, archivesSheet.getLastColumn()).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][3]) === 'active') {
      var y = String(vals[i][0]); var m = String(vals[i][1]);
      var monthKey = y + '/' + (m.length === 1 ? ('0' + m) : m);
      return rebuildUnifiedForMonthKey(monthKey);
    }
  }
  return 0;
}

function rebuildUnifiedForMonth(year, month) {
  var y = String(year);
  var m = String(month); if (m.length === 1) m = '0' + m;
  var key = y + '/' + m;
  return rebuildUnifiedForMonthKey(key);
}

function rebuildUnifiedForMonthKey(monthKey) {
  var ss = getOrCreateGamesSpreadsheet();
  var gamesSheet = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.Games, CONFIG.HEADERS.Games);
  var metaSheet = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.GameMeta, CONFIG.HEADERS.GameMeta);
  var cbSheet = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.CallbackStats, CONFIG.HEADERS.CallbackStats);
  var unifiedSheet = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.UnifiedGames, CONFIG.HEADERS.UnifiedGames);
  ensureSheetHeader(gamesSheet, CONFIG.HEADERS.Games);
  ensureSheetHeader(metaSheet, CONFIG.HEADERS.GameMeta);
  ensureSheetHeader(cbSheet, CONFIG.HEADERS.CallbackStats);

  // Index helpers
  function headerIdx(sheet) { return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]; }
  function findIdx(h, name) { for (var i = 0; i < h.length; i++) if (String(h[i]) === name) return i; return -1; }

  // Read GameMeta for the month
  var mLast = metaSheet.getLastRow(); if (mLast < 2) return 0;
  var mHeader = headerIdx(metaSheet);
  var mVals = metaSheet.getRange(2, 1, mLast - 1, metaSheet.getLastColumn()).getValues();
  var mi = {
    url: findIdx(mHeader, 'url'), id: findIdx(mHeader, 'id'), is_live: findIdx(mHeader, 'is_live'), rated: findIdx(mHeader, 'rated'),
    time_class: findIdx(mHeader, 'time_class'), rules: findIdx(mHeader, 'rules'), format: findIdx(mHeader, 'format'),
    start: findIdx(mHeader, 'start_time_epoch'), end: findIdx(mHeader, 'end_time_epoch'), dur: findIdx(mHeader, 'duration_seconds'),
    tc: findIdx(mHeader, 'time_control'), base: findIdx(mHeader, 'base_time'), inc: findIdx(mHeader, 'increment'), corr: findIdx(mHeader, 'correspondence_time'),
    eco: findIdx(mHeader, 'eco_code'), eco_url: findIdx(mHeader, 'eco_url'),
    my_user: findIdx(mHeader, 'my_username'), my_color: findIdx(mHeader, 'my_color'), my_rating: findIdx(mHeader, 'my_rating'), my_result: findIdx(mHeader, 'my_result'), my_outcome: findIdx(mHeader, 'my_outcome'), my_score: findIdx(mHeader, 'my_score'),
    opp_user: findIdx(mHeader, 'opp_username'), opp_color: findIdx(mHeader, 'opp_color'), opp_rating: findIdx(mHeader, 'opp_rating'), opp_result: findIdx(mHeader, 'opp_result'), opp_outcome: findIdx(mHeader, 'opp_outcome'), opp_score: findIdx(mHeader, 'opp_score'),
    acc_w: findIdx(mHeader, 'accuracy_white'), acc_b: findIdx(mHeader, 'accuracy_black'),
    arch: findIdx(mHeader, 'archive_name'),
    my_d_cb: findIdx(mHeader, 'my_rating_change_cb'), opp_d_cb: findIdx(mHeader, 'opp_rating_change_cb'), my_pre_cb: findIdx(mHeader, 'my_pregame_cb'), opp_pre_cb: findIdx(mHeader, 'opp_pregame_cb'),
    my_pre_last: findIdx(mHeader, 'my_pregame_last'), my_d_last: findIdx(mHeader, 'my_delta_last'), opp_pre_last: findIdx(mHeader, 'opp_pregame_last'), opp_d_last: findIdx(mHeader, 'opp_delta_last')
  };

  var metaMonth = [];
  for (var r = 0; r < mVals.length; r++) {
    if (mi.arch >= 0 && String(mVals[r][mi.arch]) === monthKey) metaMonth.push(mVals[r]);
  }
  if (!metaMonth.length) return 0;

  // Read Games for join
  var gLast = gamesSheet.getLastRow();
  var gHeader = headerIdx(gamesSheet);
  var gi = {
    url: findIdx(gHeader, 'url'), date: findIdx(gHeader, 'date'), start_time: findIdx(gHeader, 'start_time'), end_time: findIdx(gHeader, 'end_time'), end_reason: findIdx(gHeader, 'end_reason')
  };
  var gamesByUrl = {};
  if (gLast >= 2) {
    var gVals = gamesSheet.getRange(2, 1, gLast - 1, gamesSheet.getLastColumn()).getValues();
    for (var i2 = 0; i2 < gVals.length; i2++) {
      var u = gVals[i2][gi.url]; if (!u) continue;
      gamesByUrl[String(u)] = gVals[i2];
    }
  }

  // Read CallbackStats for join (minimal fields)
  var cLast = cbSheet.getLastRow();
  var cbByUrl = {};
  if (cLast >= 2) {
    var cHeader = headerIdx(cbSheet);
    function cIdx(n){ return findIdx(cHeader, n); }
    var cu = cIdx('url'); var cPly = cIdx('ply_count'); var cMv = cIdx('move_timestamps_ds');
    var cMyDelta = cIdx('my_rating_change'); var cOppDelta = cIdx('opp_rating_change');
    var cMyPre = cIdx('my_pregame_rating'); var cOppPre = cIdx('opp_pregame_rating');
    var cVals = cbSheet.getRange(2, 1, cLast - 1, cbSheet.getLastColumn()).getValues();
    for (var j = 0; j < cVals.length; j++) {
      var u2 = cVals[j][cu]; if (!u2) continue;
      cbByUrl[String(u2)] = {
        ply: (cPly >= 0 ? cVals[j][cPly] : ''),
        movesDs: (cMv >= 0 ? cVals[j][cMv] : ''),
        myDelta: (cMyDelta >= 0 ? cVals[j][cMyDelta] : ''),
        oppDelta: (cOppDelta >= 0 ? cVals[j][cOppDelta] : ''),
        myPre: (cMyPre >= 0 ? cVals[j][cMyPre] : ''),
        oppPre: (cOppPre >= 0 ? cVals[j][cOppPre] : '')
      };
    }
  }

  // Build unified rows (upsert by URL)
  var unifiedHeader = CONFIG.HEADERS.UnifiedGames;
  var rows = [];
  for (var k = 0; k < metaMonth.length; k++) {
    var m = metaMonth[k];
    var url = m[mi.url]; if (!url) continue;
    var gm = gamesByUrl[String(url)] || null;
    var cb = cbByUrl[String(url)] || {};

    var dateOnly = gm ? gm[gi.date] : '';
    var startLocal = gm ? gm[gi.start_time] : '';
    var endLocal = gm ? gm[gi.end_time] : '';
    var endReason = gm ? gm[gi.end_reason] : '';

    // Prefer meta augment columns; fallback to CallbackStats
    var myDeltaCb = (mi.my_d_cb >= 0 ? m[mi.my_d_cb] : ''); if (myDeltaCb === '' && cb.myDelta !== undefined) myDeltaCb = cb.myDelta;
    var oppDeltaCb = (mi.opp_d_cb >= 0 ? m[mi.opp_d_cb] : ''); if (oppDeltaCb === '' && cb.oppDelta !== undefined) oppDeltaCb = cb.oppDelta;
    var myPregameCb = (mi.my_pre_cb >= 0 ? m[mi.my_pre_cb] : ''); if (myPregameCb === '' && cb.myPre !== undefined) myPregameCb = cb.myPre;
    var oppPregameCb = (mi.opp_pre_cb >= 0 ? m[mi.opp_pre_cb] : ''); if (oppPregameCb === '' && cb.oppPre !== undefined) oppPregameCb = cb.oppPre;

    var myPregameLast = (mi.my_pre_last >= 0 ? m[mi.my_pre_last] : '');
    var myDeltaLast = (mi.my_d_last >= 0 ? m[mi.my_d_last] : '');
    var oppPregameLast = (mi.opp_pre_last >= 0 ? m[mi.opp_pre_last] : '');
    var oppDeltaLast = (mi.opp_d_last >= 0 ? m[mi.opp_d_last] : '');

    var row = [
      safe(m[mi.url]), safe(m[mi.id]), safe(m[mi.is_live]), safe(m[mi.rated]), safe(m[mi.time_class]), safe(m[mi.rules]), safe(m[mi.format]),
      safe(dateOnly), safe(startLocal), safe(endLocal), safe(m[mi.end]), safe(m[mi.dur]),
      safe(m[mi.tc]), safe(m[mi.base]), safe(m[mi.inc]), safe(m[mi.corr]),
      safe(m[mi.eco]), safe(m[mi.eco_url]),
      safe(m[mi.my_user]), safe(m[mi.my_color]), safe(m[mi.my_rating]), safe(m[mi.my_result]), safe(m[mi.my_outcome]), safe(m[mi.my_score]),
      safe(m[mi.opp_user]), safe(m[mi.opp_color]), safe(m[mi.opp_rating]), safe(m[mi.opp_result]), safe(m[mi.opp_outcome]), safe(m[mi.opp_score]),
      safe(m[mi.acc_w]), safe(m[mi.acc_b]),
      safe(myDeltaCb), safe(oppDeltaCb), safe(myPregameCb), safe(oppPregameCb),
      safe(myPregameLast), safe(myDeltaLast), safe(oppPregameLast), safe(oppDeltaLast),
      safe(cb.ply), safe(endReason), safe(cb.movesDs),
      safe(m[mi.arch])
    ];
    rows.push(row);
  }

  if (rows.length) {
    upsertByUrl(unifiedSheet, rows);
  }
  return rows.length;
}

function transformArchiveToUnifiedRows(meUsername, archiveJson) {
  if (!archiveJson || !archiveJson.games || !archiveJson.games.length) return [];
  var unifiedHeader = CONFIG.HEADERS.UnifiedGames;
  var metaHeader = CONFIG.HEADERS.GameMeta;
  var out = [];
  var tz = getProjectTimeZone();
  // Reuse transform to compute normalized meta
  var rows = transformArchiveToRows(meUsername, archiveJson);
  for (var i = 0; i < rows.length; i++) {
    var g = rows[i];
    var m = g && g._meta; if (!m) continue;
    // Map fields from meta and derive date/start/end strings
    var mi = {};
    for (var j = 0; j < metaHeader.length; j++) mi[metaHeader[j]] = m[j];
    var endEpoch = mi['end_time_epoch'];
    var startEpoch = mi['start_time_epoch'];
    var endLocal = endEpoch ? toLocalDateTimeStringFromUnixSeconds(Number(endEpoch)) : '';
    var startLocal = startEpoch ? toLocalDateTimeStringFromUnixSeconds(Number(startEpoch)) : '';
    var dateOnly = endEpoch ? Utilities.formatDate(new Date(Number(endEpoch) * 1000), tz, 'yyyy-MM-dd') : '';
    var row = [
      mi['url'], mi['id'], mi['is_live'], mi['rated'], mi['time_class'], mi['rules'], mi['format'],
      dateOnly, startLocal, endLocal, mi['end_time_epoch'], mi['duration_seconds'],
      mi['time_control'], mi['base_time'], mi['increment'], mi['correspondence_time'],
      mi['eco_code'], mi['eco_url'],
      mi['my_username'], mi['my_color'], mi['my_rating'], mi['my_result'], mi['my_outcome'], mi['my_score'],
      mi['opp_username'], mi['opp_color'], mi['opp_rating'], mi['opp_result'], mi['opp_outcome'], mi['opp_score'],
      mi['accuracy_white'], mi['accuracy_black'],
      '', '', '', '', // callback deltas/pregame not known at ingest
      '', '', '', '', // last-based deltas/pregame will be computed later
      '', '', '',     // ply_count, end_reason, move_timestamps_ds
      ''              // archive_name (filled by orchestrator)
    ];
    out.push(row);
  }
  return out;
}

function getUnifiedSheetNameForMonthKey(monthKey) {
  return 'Unified_' + String(monthKey).replace('/', '_');
}

function getActiveMonthKey() {
  var ss = getOrCreateGamesSpreadsheet();
  var archivesSheet = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.Archives, CONFIG.HEADERS.Archives);
  var last = archivesSheet.getLastRow(); if (last < 2) return '';
  var vals = archivesSheet.getRange(2, 1, last - 1, archivesSheet.getLastColumn()).getValues();
  for (var i = 0; i < vals.length; i++) if (String(vals[i][3]) === 'active') return String(vals[i][0]) + '/' + String(vals[i][1]);
  return '';
}

function getFormatCursorKey(monthKey, format) {
  return 'CURSOR_FMT_' + String(monthKey).replace('/', '_') + '_' + String(format).toUpperCase();
}

function getFormatCursor(monthKey, format) {
  var key = getFormatCursorKey(monthKey, format);
  var props = getScriptProps();
  var raw = props.getProperty(key);
  if (!raw) return { ts: 0, my: '', opp: '' };
  try {
    var obj = JSON.parse(raw);
    return { ts: Number(obj.ts || 0), my: (obj.my === '' ? '' : Number(obj.my)), opp: (obj.opp === '' ? '' : Number(obj.opp)) };
  } catch (e) {
    return { ts: 0, my: '', opp: '' };
  }
}

function setFormatCursor(monthKey, format, ts, myRatingEnd, oppRatingEnd) {
  var key = getFormatCursorKey(monthKey, format);
  var props = getScriptProps();
  var payload = { ts: Number(ts || 0), my: (myRatingEnd === '' ? '' : Number(myRatingEnd)), opp: (oppRatingEnd === '' ? '' : Number(oppRatingEnd)) };
  props.setProperty(key, JSON.stringify(payload));
}

function computeLastBasedForRows(rows, monthKey) {
  if (!rows || !rows.length) return rows;
  var uh = CONFIG.HEADERS.UnifiedGames;
  var idx = {
    fmt: uh.indexOf('format'), end: uh.indexOf('end_time_epoch'), myPost: uh.indexOf('my_rating_end'), oppPost: uh.indexOf('opp_rating_end'),
    myPreLast: uh.indexOf('my_pregame_last'), myDeltaLast: uh.indexOf('my_delta_last'), oppPreLast: uh.indexOf('opp_pregame_last'), oppDeltaLast: uh.indexOf('opp_delta_last')
  };
  rows.sort(function(a,b){ return Number(a[idx.end] || 0) - Number(b[idx.end] || 0); });
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i]; var fmt = String(r[idx.fmt] || ''); var ts = Number(r[idx.end] || 0);
    var cur = getFormatCursor(monthKey, fmt);
    var myPre = (cur.my === '' ? '' : Number(cur.my));
    var myPost = (r[idx.myPost] === '' || r[idx.myPost] === null || r[idx.myPost] === undefined) ? '' : Number(r[idx.myPost]);
    var myDelta = (myPre === '' || myPost === '' ? '' : (myPost - myPre));
    var oppPost = (r[idx.oppPost] === '' || r[idx.oppPost] === null || r[idx.oppPost] === undefined) ? '' : Number(r[idx.oppPost]);
    var oppPre = (myDelta === '' || oppPost === '' ? '' : (oppPost - (-Number(myDelta))));
    r[idx.myPreLast] = myPre;
    r[idx.myDeltaLast] = myDelta;
    r[idx.oppPreLast] = oppPre;
    r[idx.oppDeltaLast] = (myDelta === '' ? '' : -Number(myDelta));
    if (!cur.ts || ts >= cur.ts) setFormatCursor(monthKey, fmt, ts, myPost, oppPost);
  }
  return rows;
}

function augmentUnifiedForUrls(urls, monthKeyOpt) {
  if (!urls || !urls.length) return;
  var ss = getOrCreateGamesSpreadsheet();
  var monthKey = monthKeyOpt || getActiveMonthKey();
  if (!monthKey) return;
  var sheetName = getUnifiedSheetNameForMonthKey(monthKey);
  var uni = getOrCreateSheet(ss, sheetName, CONFIG.HEADERS.UnifiedGames);
  ensureSheetHeader(uni, CONFIG.HEADERS.UnifiedGames);

  var uh = uni.getRange(1, 1, 1, uni.getLastColumn()).getValues()[0];
  function uIdx(n){ for (var i = 0; i < uh.length; i++) if (String(uh[i]) === n) return i; return -1; }
  var ui = { url: uIdx('url'), myPost: uIdx('my_rating_end'), oppPost: uIdx('opp_rating_end'), myDeltaCb: uIdx('my_rating_change_cb'), oppDeltaCb: uIdx('opp_rating_change_cb'), myPreCb: uIdx('my_pregame_cb'), oppPreCb: uIdx('opp_pregame_cb') };
  var last = uni.getLastRow(); if (last < 2) return;
  var uVals = uni.getRange(2, 1, last - 1, uni.getLastColumn()).getValues();
  var rowByUrl = {}; for (var i0 = 0; i0 < uVals.length; i0++) { var u = uVals[i0][ui.url]; if (u) rowByUrl[String(u)] = 2 + i0; }

  // Build Callback map
  var cb = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.CallbackStats, CONFIG.HEADERS.CallbackStats);
  ensureSheetHeader(cb, CONFIG.HEADERS.CallbackStats);
  var clast = cb.getLastRow();
  var cbMap = {};
  if (clast >= 2) {
    var ch = cb.getRange(1, 1, 1, cb.getLastColumn()).getValues()[0];
    function cIdx(n){ for (var i = 0; i < ch.length; i++) if (String(ch[i]) === n) return i; return -1; }
    var cu = cIdx('url'), cMy = cIdx('my_rating_change'), cOpp = cIdx('opp_rating_change');
    var cVals = cb.getRange(2, 1, clast - 1, cb.getLastColumn()).getValues();
    for (var r2 = 0; r2 < cVals.length; r2++) { var uu = cVals[r2][cu]; if (!uu) continue; cbMap[String(uu)] = { dmy: cVals[r2][cMy], dopp: cVals[r2][cOpp] }; }
  }

  // Update Unified per URL (callback-based only)
  var startCol = ui.myDeltaCb; if (startCol < 0) return;
  for (var x = 0; x < urls.length; x++) {
    var key = String(urls[x]); var rowIdx = rowByUrl[key]; if (!rowIdx) continue;
    var row = uni.getRange(rowIdx, 1, 1, uni.getLastColumn()).getValues()[0];
    var myPost = row[ui.myPost]; var oppPost = row[ui.oppPost];
    var dmy = (cbMap[key] && cbMap[key].dmy !== '' && cbMap[key].dmy !== null && cbMap[key].dmy !== undefined) ? Number(cbMap[key].dmy) : '';
    var dopp = (cbMap[key] && cbMap[key].dopp !== '' && cbMap[key].dopp !== null && cbMap[key].dopp !== undefined) ? Number(cbMap[key].dopp) : '';
    var preMy = (dmy === '' || myPost === '' ? '' : (Number(myPost) - Number(dmy)));
    var preOpp = (dopp === '' || oppPost === '' ? '' : (Number(oppPost) - Number(dopp)));
    uni.getRange(rowIdx, ui.myDeltaCb + 1, 1, 4).setValues([[dmy, dopp, preMy, preOpp]]);
  }
}

