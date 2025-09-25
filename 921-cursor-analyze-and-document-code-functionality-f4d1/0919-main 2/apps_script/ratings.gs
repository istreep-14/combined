/**
 * Module: ratings
 * Purpose: RatingState, RatingsTimeline, DailyRatings, and snapshot loggers.
 */

function ensureRatingSheets() {
  var ss = getOrCreateGamesSpreadsheet();
  getOrCreateSheet(ss, CONFIG.SHEET_NAMES.RatingState, CONFIG.HEADERS.RatingState);
  getOrCreateSheet(ss, CONFIG.SHEET_NAMES.RatingsTimeline, CONFIG.HEADERS.RatingsTimeline);
  getOrCreateSheet(ss, CONFIG.SHEET_NAMES.DailyRatings, CONFIG.HEADERS.DailyRatings);
  getOrCreateSheet(ss, CONFIG.SHEET_NAMES.ManualAdjustments, CONFIG.HEADERS.ManualAdjustments);
  getOrCreateSheet(ss, CONFIG.SHEET_NAMES.LiveStatsMeta, CONFIG.HEADERS.LiveStatsMeta);
  getOrCreateSheet(ss, CONFIG.SHEET_NAMES.PlayerStatsLog, CONFIG.HEADERS.PlayerStatsLog);
}

function normalizeFormatForBuckets(format) {
  var f = String(format || '').toLowerCase();
  // Consolidate live chess960 variants
  if (f.indexOf('chess960-') === 0) {
    if (f === 'chess960-daily') return 'daily960';
    return 'live960';
  }
  // Variants without time class buckets
  if (f === 'bughouse' || f === 'crazyhouse' || f === 'kingofthehill' || f === 'threecheck') return f;
  // Standard
  if (f === 'bullet' || f === 'blitz' || f === 'rapid' || f === 'daily') return f;
  return f;
}

function upsertRatingState(format, tsMs, myPost, oppPost) {
  ensureRatingSheets();
  var ss = getOrCreateGamesSpreadsheet();
  var sheet = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.RatingState, CONFIG.HEADERS.RatingState);
  var last = sheet.getLastRow();
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  function idx(n){ for (var i=0;i<header.length;i++) if (String(header[i])===n) return i; return -1; }
  var iFmt = idx('format'); var iTs = idx('last_event_ts'); var iMy = idx('my_last_post'); var iOpp = idx('opp_last_post');
  var rowByFmt = {};
  if (last >= 2) {
    var vals = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
    for (var r=0;r<vals.length;r++){ var key = String(vals[r][iFmt] || ''); if (key) rowByFmt[key] = 2 + r; }
  }
  var keyFmt = normalizeFormatForBuckets(format);
  if (!keyFmt) return;
  var payload = [keyFmt, Number(tsMs||0),
    (myPost===undefined||myPost===null||myPost==='')?'':Number(myPost),
    (oppPost===undefined||oppPost===null||oppPost==='')?'':Number(oppPost)];
  if (rowByFmt[keyFmt]) {
    var rowIdx = rowByFmt[keyFmt];
    var cur = sheet.getRange(rowIdx, 1, 1, sheet.getLastColumn()).getValues()[0];
    var curTs = Number(cur[iTs] || 0);
    if (!curTs || Number(tsMs||0) >= curTs) {
      sheet.getRange(rowIdx, 1, 1, payload.length).setValues([payload]);
    }
  } else {
    writeRowsChunked(sheet, [payload]);
  }
}

function appendTimelineEvent(tsEpoch, format, source, myRating, oppRating, url, confidence) {
  ensureRatingSheets();
  var ss = getOrCreateGamesSpreadsheet();
  var sheet = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.RatingsTimeline, CONFIG.HEADERS.RatingsTimeline);
  var tz = getProjectTimeZone();
  var localDate = Utilities.formatDate(new Date(Number(tsEpoch||0)*1000), tz, 'yyyy-MM-dd');
  var row = [
    Number(tsEpoch||0), localDate, normalizeFormatForBuckets(format), String(source||''),
    (myRating===undefined||myRating===null||myRating==='')?'':Number(myRating),
    (oppRating===undefined||oppRating===null||oppRating==='')?'':Number(oppRating),
    String(url||''), String(confidence||'')
  ];
  writeRowsChunked(sheet, [row]);
}

function appendTimelineTailForToday() {
  ensureRatingSheets();
  var tz = getProjectTimeZone();
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var ss = getOrCreateGamesSpreadsheet();
  var monthKey = getActiveMonthKey(); if (!monthKey) return 0;
  var uniName = getGamesSheetNameForMonthKey(monthKey);
  var uni = getOrCreateSheet(ss, uniName, CONFIG.HEADERS.Games);
  var last = uni.getLastRow(); if (last < 2) return 0;
  var header = uni.getRange(1, 1, 1, uni.getLastColumn()).getValues()[0];
  function idx(h){ for (var i=0;i<header.length;i++) if (String(header[i])===h) return i; return -1; }
  var iEnd = idx('end_time_epoch'); var iFmt = idx('format'); var iMy = idx('my_rating_end'); var iOpp = idx('opp_rating_end'); var iUrl = idx('url');
  var vals = uni.getRange(2, 1, last - 1, uni.getLastColumn()).getValues();
  var count = 0;
  for (var r=0;r<vals.length;r++) {
    var ts = vals[r][iEnd]; if (ts===undefined||ts===null||ts==='') continue;
    var d = Utilities.formatDate(new Date(Number(ts)*1000), tz, 'yyyy-MM-dd');
    if (d !== today) continue;
    var fmt = vals[r][iFmt]; var my = vals[r][iMy]; var opp = vals[r][iOpp]; var url = vals[r][iUrl];
    appendTimelineEvent(Number(ts), fmt, 'last_based', my, opp, url, 'low');
    upsertRatingState(fmt, Number(ts)*1000, my, opp);
    count++;
  }
  // Manual adjustments for today
  try {
    var ma = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.ManualAdjustments, CONFIG.HEADERS.ManualAdjustments);
    var ml = ma.getLastRow();
    if (ml >= 2) {
      var mh = ma.getRange(1,1,1,ma.getLastColumn()).getValues()[0];
      function midx(n){ for (var i=0;i<mh.length;i++) if (String(mh[i])===n) return i; return -1; }
      var mt = midx('ts_epoch'); var mf = midx('format'); var mMy = midx('my_rating'); var mOpp = midx('opp_rating');
      var mvals = ma.getRange(2,1,ml-1,ma.getLastColumn()).getValues();
      for (var j=0;j<mvals.length;j++) {
        var ts2 = mvals[j][mt]; if (ts2===undefined||ts2===null||ts2==='') continue;
        var d2 = Utilities.formatDate(new Date(Number(ts2)*1000), tz, 'yyyy-MM-dd');
        if (d2 !== today) continue;
        var ff = mvals[j][mf]; var my2 = mvals[j][mMy]; var opp2 = mvals[j][mOpp];
        appendTimelineEvent(Number(ts2), ff, 'manual', my2, opp2, '', 'high');
        upsertRatingState(ff, Number(ts2)*1000, my2, opp2);
        count++;
      }
    }
  } catch (e) {}
  return count;
}

function updateDailyRatingsForDates(dates) {
  if (!dates || !dates.length) return 0;
  ensureRatingSheets();
  var ss = getOrCreateGamesSpreadsheet();
  var dr = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.DailyRatings, CONFIG.HEADERS.DailyRatings);
  var tz = getProjectTimeZone();
  var monthKey = getActiveMonthKey();
  var uniName = monthKey ? getGamesSheetNameForMonthKey(monthKey) : '';
  var uni = monthKey ? getOrCreateSheet(ss, uniName, CONFIG.HEADERS.Games) : null;
  var aggregates = {};
  function acc(dateOnly, fmt, outcome, duration) {
    if (!aggregates[dateOnly]) aggregates[dateOnly] = {};
    if (!aggregates[dateOnly][fmt]) aggregates[dateOnly][fmt] = { w:0, l:0, d:0, g:0, dur:0 };
    var b = aggregates[dateOnly][fmt];
    if (outcome==='win') b.w++; else if (outcome==='loss') b.l++; else if (outcome==='draw') b.d++;
    b.g = b.w + b.l + b.d; b.dur += (duration||0);
  }
  if (uni) {
    var last = uni.getLastRow();
    if (last >= 2) {
      var uh = uni.getRange(1,1,1,uni.getLastColumn()).getValues()[0];
      function uidx(n){ for (var i=0;i<uh.length;i++) if (String(uh[i])===n) return i; return -1; }
      var iDate = uidx('date'); var iFmt = uidx('format'); var iOutcome = uidx('my_outcome'); var iDur = uidx('duration_seconds');
      var vals = uni.getRange(2,1,last-1,uni.getLastColumn()).getValues();
      var targetSet = {}; for (var d=0; d<dates.length; d++) targetSet[String(dates[d])] = true;
      for (var r=0;r<vals.length;r++) {
        var dstr = String(vals[r][iDate]||''); if (!dstr || !targetSet[dstr]) continue;
        var fmt = normalizeFormatForBuckets(vals[r][iFmt]);
        var out = String(vals[r][iOutcome]||''); var dur = (vals[r][iDur]===undefined||vals[r][iDur]===null||vals[r][iDur]==='')?0:Number(vals[r][iDur]);
        acc(dstr, fmt, out, dur);
      }
    }
  }
  // RatingsTimeline events for EOD
  var rt = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.RatingsTimeline, CONFIG.HEADERS.RatingsTimeline);
  var rtl = rt.getLastRow(); var eventsByKey = {};
  if (rtl >= 2) {
    var rh = rt.getRange(1,1,1,rt.getLastColumn()).getValues()[0];
    function ridx(n){ for (var i=0;i<rh.length;i++) if (String(rh[i])===n) return i; return -1; }
    var rts = ridx('ts_epoch'); var rf = ridx('format'); var rDate = ridx('local_date'); var rMy = ridx('my_rating');
    var rows = rt.getRange(2,1,rtl-1,rt.getLastColumn()).getValues();
    var dset = {}; for (var d2=0; d2<dates.length; d2++) dset[String(dates[d2])] = true;
    for (var i=0;i<rows.length;i++) {
      var dOnly = String(rows[i][rDate]||''); if (!dOnly || !dset[dOnly]) continue;
      var fmt2 = String(rows[i][rf]||'');
      var ts2 = Number(rows[i][rts]||0);
      var my2 = rows[i][rMy];
      var key = dOnly + '|' + fmt2;
      if (!eventsByKey[key]) eventsByKey[key] = [];
      eventsByKey[key].push({ t: ts2, r: (my2===undefined||my2===null||my2==='')?'':Number(my2) });
    }
    for (var k in eventsByKey) eventsByKey[k].sort(function(a,b){ return a.t - b.t; });
  }
  var mapRowByDate = {}; var lastRow = dr.getLastRow();
  if (lastRow >= 2) {
    var existing = dr.getRange(2,1,lastRow-1,1).getValues();
    for (var r2=0;r2<existing.length;r2++){ var dv=String(existing[r2][0]||''); if (dv) mapRowByDate[dv]=2+r2; }
  }
  function pickEod(dateOnly, fmt) {
    var key = dateOnly + '|' + fmt;
    var arr = eventsByKey[key] || [];
    if (!arr.length) return '';
    return arr[arr.length - 1].r;
  }
  var fmts = ['bullet','blitz','rapid','daily','live960','daily960','bughouse','crazyhouse','kingofthehill','threecheck'];
  for (var d3=0; d3<dates.length; d3++) {
    var dateOnly = String(dates[d3]);
    var rowVals = [dateOnly];
    for (var f=0; f<fmts.length; f++) {
      var fmt = fmts[f];
      var agg = (aggregates[dateOnly] && aggregates[dateOnly][fmt]) ? aggregates[dateOnly][fmt] : { w:0,l:0,d:0,g:0,dur:0 };
      var eod = pickEod(dateOnly, fmt);
      rowVals.push(agg.w, agg.l, agg.d, agg.g, agg.dur, eod);
    }
    if (mapRowByDate[dateOnly]) {
      var at = mapRowByDate[dateOnly];
      dr.getRange(at, 1, 1, rowVals.length).setValues([rowVals]);
    } else {
      dr.insertRowAfter(1);
      dr.getRange(2, 1, 1, rowVals.length).setValues([rowVals]);
    }
  }
  return dates.length;
}

function logLiveStatsMetaSnapshot(format, rawJson) {
  try {
    ensureRatingSheets();
    var ss = getOrCreateGamesSpreadsheet();
    var sheet = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.LiveStatsMeta, CONFIG.HEADERS.LiveStatsMeta);
    writeRowsChunked(sheet, [[new Date(), String(format||''), JSON.stringify(rawJson||{})]]);
  } catch (e) {}
}

function logPlayerStats(format, playerStatsJson) {
  try {
    ensureRatingSheets();
    var ss = getOrCreateGamesSpreadsheet();
    var sheet = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.PlayerStatsLog, CONFIG.HEADERS.PlayerStatsLog);
    var lastObj = (playerStatsJson && playerStatsJson.last) || {};
    var bestObj = (playerStatsJson && playerStatsJson.best) || {};
    var recObj = (playerStatsJson && playerStatsJson.record) || {};
    var row = [
      new Date(), String(format||''),
      (lastObj.rating===undefined||lastObj.rating===null||lastObj.rating==='')?'':Number(lastObj.rating),
      (lastObj.date===undefined||lastObj.date===null||lastObj.date==='')?'':Number(lastObj.date),
      (lastObj.rd===undefined||lastObj.rd===null||lastObj.rd==='')?'':Number(lastObj.rd),
      (bestObj.rating===undefined||bestObj.rating===null||bestObj.rating==='')?'':Number(bestObj.rating),
      (bestObj.date===undefined||bestObj.date===null||bestObj.date==='')?'':Number(bestObj.date),
      String(bestObj.game||''),
      (recObj.win===undefined||recObj.win===null||recObj.win==='')?'':Number(recObj.win),
      (recObj.loss===undefined||recObj.loss===null||recObj.loss==='')?'':Number(recObj.loss),
      (recObj.draw===undefined||recObj.draw===null||recObj.draw==='')?'':Number(recObj.draw),
      JSON.stringify(playerStatsJson||{})
    ];
    writeRowsChunked(sheet, [row]);
    if (lastObj && lastObj.rating!==undefined && lastObj.date!==undefined) {
      appendTimelineEvent(Number(lastObj.date), normalizeFormatForBuckets(format), 'player_stats_last', Number(lastObj.rating), '', '', 'medium');
    }
  } catch (e) {}
}

function runPlayerStatsSnapshot() {
  try {
    var username = getConfiguredUsername();
    var res = fetchJsonWithEtag(playerStatsUrl(username), null);
    if (res.status !== 'ok' || !res.json) return 0;
    var json = res.json || {};
    // Map Chess.com sections to normalized formats
    var mapping = [
      { key: 'chess_bullet', fmt: 'bullet' },
      { key: 'chess_blitz', fmt: 'blitz' },
      { key: 'chess_rapid', fmt: 'rapid' },
      { key: 'chess_daily', fmt: 'daily' },
      { key: 'chess960', fmt: 'live960' }
    ];
    var count = 0;
    for (var i = 0; i < mapping.length; i++) {
      var sec = json[mapping[i].key];
      if (sec) { logPlayerStats(mapping[i].fmt, sec); count++; }
    }
    appendOpsLog('', 'player_stats_snapshot', 'ok', 200, { sections: count });
    return count;
  } catch (e) { logWarn('PLAYER_STATS_SNAP_FAIL', 'runPlayerStatsSnapshot failed', { error: String(e && e.message || e) }); return 0; }
}

function runLiveStatsMetaSnapshots() {
  try {
    var username = getConfiguredUsername();
    var formats = ['bullet','blitz','rapid'];
    var urls = [];
    for (var i = 0; i < formats.length; i++) urls.push(liveStatsUrl(formats[i], username));
    var results = fetchJsonBatchWithEtag(urls, []);
    var logged = 0;
    for (var j = 0; j < results.length; j++) {
      var r = results[j];
      if (r.status === 'ok' && r.json) { logLiveStatsMetaSnapshot(formats[j], r.json); logged++; }
    }
    appendOpsLog('', 'live_stats_meta_snapshot', 'ok', 200, { formats: logged });
    return logged;
  } catch (e) { logWarn('LIVE_STATS_SNAP_FAIL', 'runLiveStatsMetaSnapshots failed', { error: String(e && e.message || e) }); return 0; }
}

function runStatsSnapshots() {
  var a = runPlayerStatsSnapshot();
  var b = runLiveStatsMetaSnapshots();
  return a + b;
}

