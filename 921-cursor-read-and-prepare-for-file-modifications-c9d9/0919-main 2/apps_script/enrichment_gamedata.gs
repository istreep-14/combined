// removed legacy migration helper

function buildDailyTotals(options) {
  var tz = (options && options.timezone) || getProjectTimeZone();
  var includeFormats = (options && options.include_formats) || null;
  var excludeFormats = (options && options.exclude_formats) || null;
  var ss = getOrCreateGamesSpreadsheet();
  var ssGames = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.Games, CONFIG.HEADERS.Games);
  var lastG = ssGames.getLastRow(); if (lastG < 2) return;
  var gVals = ssGames.getRange(2, 1, lastG - 1, ssGames.getLastColumn()).getValues();
  var gHeader = ssGames.getRange(1, 1, 1, ssGames.getLastColumn()).getValues()[0];
  function idx(h){ for (var i = 0; i < gHeader.length; i++) if (String(gHeader[i]) === h) return i; return -1; }
  var iDate = idx('date'); var iFmt = idx('format'); var iOutcome = idx('my_outcome'); var iEnd = idx('end_time'); var iMyRating = idx('my_rating');

  // Map url -> duration_seconds for all games via GameMeta
  var urlToDuration = {};
  try {
    var metaSheet = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.GameMeta, CONFIG.HEADERS.GameMeta);
    var lastM = metaSheet.getLastRow();
    if (lastM >= 2) {
      var mHeader = metaSheet.getRange(1, 1, 1, metaSheet.getLastColumn()).getValues()[0];
      function mIdx(h){ for (var i = 0; i < mHeader.length; i++) if (String(mHeader[i]) === h) return i; return -1; }
      var mu = mIdx('url'); var mdur = mIdx('duration_seconds');
      var mVals = metaSheet.getRange(2, 1, lastM - 1, metaSheet.getLastColumn()).getValues();
      for (var r = 0; r < mVals.length; r++) { var u = mVals[r][mu]; if (u) urlToDuration[u] = (mVals[r][mdur] === '' ? 0 : Number(mVals[r][mdur])); }
    }
  } catch (e) {}

  // Group by date and format; also collect date range and formats
  var byDateFmt = {}; var formatsSet = {};
  var minDayMs = null, maxDayMs = null;
  for (var r = 0; r < gVals.length; r++) {
    var row = gVals[r]; var dstr = row[iDate]; var fmt = String(row[iFmt] || ''); var end = row[iEnd]; var url = row[0];
    if (!fmt || !end) continue;
    if (includeFormats && !includeFormats[fmt]) continue;
    if (excludeFormats && excludeFormats[fmt]) continue;
    formatsSet[fmt] = true;
    var d = String(dstr || '');
    if (!d) {
      var dtTmp = new Date(end); d = Utilities.formatDate(dtTmp, tz, 'yyyy-MM-dd');
    }
    var dt = new Date(d + ' 00:00:00'); var dayMs = dt.getTime();
    if (minDayMs === null || dayMs < minDayMs) minDayMs = dayMs;
    if (maxDayMs === null || dayMs > maxDayMs) maxDayMs = dayMs;
    var key = d + '|' + fmt;
    if (!byDateFmt[key]) byDateFmt[key] = { wins:0, losses:0, draws:0, duration:0 };
    var bucket = byDateFmt[key];
    var outcome = String(row[iOutcome] || '');
    if (outcome === 'win') bucket.wins++; else if (outcome === 'loss') bucket.losses++; else if (outcome === 'draw') bucket.draws++;
    if (url && urlToDuration[url]) bucket.duration += Number(urlToDuration[url] || 0);
  }

  // Build rating event timelines
  var eventsByFmt = {};
  for (var r2 = 0; r2 < gVals.length; r2++) {
    var row2 = gVals[r2]; var fmt2 = String(row2[iFmt] || ''); var end2 = row2[iEnd]; var rating2 = row2[iMyRating]; if (!fmt2 || !end2 || rating2 === '' || rating2 === null || rating2 === undefined) continue;
    if (includeFormats && !includeFormats[fmt2]) continue;
    if (excludeFormats && excludeFormats[fmt2]) continue;
    if (!eventsByFmt[fmt2]) eventsByFmt[fmt2] = [];
    eventsByFmt[fmt2].push({ t: new Date(end2).getTime(), r: Number(rating2) });
  }
  for (var kfmt in eventsByFmt) { eventsByFmt[kfmt].sort(function(a,b){ return a.t - b.t; }); }

  // Build snapshot timelines from GameMeta (bullet/blitz/rapid/daily)
  var snapshotEventsByFmt = { bullet: [], blitz: [], rapid: [], daily: [] };
  try {
    var metaSheet2 = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.GameMeta, CONFIG.HEADERS.GameMeta);
    var lastM2 = metaSheet2.getLastRow();
    if (lastM2 >= 2) {
      var mh = metaSheet2.getRange(1, 1, 1, metaSheet2.getLastColumn()).getValues()[0];
      function mi(h){ for (var i = 0; i < mh.length; i++) if (String(mh[i]) === h) return i; return -1; }
      var mFmt = mi('format'); var mEndEpoch = mi('end_time_epoch');
      var iSB = mi('my_snapshot_bullet'); var iSL = mi('my_snapshot_blitz'); var iSR = mi('my_snapshot_rapid'); var iSD = mi('my_snapshot_daily');
      var mvals2 = metaSheet2.getRange(2, 1, lastM2 - 1, metaSheet2.getLastColumn()).getValues();
      for (var rr = 0; rr < mvals2.length; rr++) {
        var t = mvals2[rr][mEndEpoch]; if (t === '' || t === null || t === undefined) continue; var tms = Number(t) * 1000;
        if (iSB >= 0 && mvals2[rr][iSB] !== '' && mvals2[rr][iSB] !== null && mvals2[rr][iSB] !== undefined) snapshotEventsByFmt.bullet.push({ t: tms, r: Number(mvals2[rr][iSB]) });
        if (iSL >= 0 && mvals2[rr][iSL] !== '' && mvals2[rr][iSL] !== null && mvals2[rr][iSL] !== undefined) snapshotEventsByFmt.blitz.push({ t: tms, r: Number(mvals2[rr][iSL]) });
        if (iSR >= 0 && mvals2[rr][iSR] !== '' && mvals2[rr][iSR] !== null && mvals2[rr][iSR] !== undefined) snapshotEventsByFmt.rapid.push({ t: tms, r: Number(mvals2[rr][iSR]) });
        if (iSD >= 0 && mvals2[rr][iSD] !== '' && mvals2[rr][iSD] !== null && mvals2[rr][iSD] !== undefined) snapshotEventsByFmt.daily.push({ t: tms, r: Number(mvals2[rr][iSD]) });
      }
      for (var sf in snapshotEventsByFmt) snapshotEventsByFmt[sf].sort(function(a,b){ return a.t - b.t; });
    }
  } catch (e) {}

  function carryBefore(fmt, ms) {
    var ev = eventsByFmt[fmt]; var last = '';
    if (ev && ev.length) { for (var i3 = 0; i3 < ev.length; i3++) { if (ev[i3].t < ms) last = ev[i3].r; else break; } }
    if (last === '' && snapshotEventsByFmt[fmt]) { var sv = snapshotEventsByFmt[fmt]; for (var s = 0; s < sv.length; s++) { if (sv[s].t < ms) last = sv[s].r; else break; } }
    return last;
  }
  function carryAtOrBefore(fmt, ms) {
    var ev = eventsByFmt[fmt]; var last = '';
    if (ev && ev.length) { for (var i4 = 0; i4 < ev.length; i4++) { if (ev[i4].t <= ms) last = ev[i4].r; else break; } }
    if (last === '' && snapshotEventsByFmt[fmt]) { var sv = snapshotEventsByFmt[fmt]; for (var s2 = 0; s2 < sv.length; s2++) { if (sv[s2].t <= ms) last = sv[s2].r; else break; } }
    return last;
  }

  function startOfDayMsLocal(dateStr) { try { var d0 = new Date(dateStr + ' 00:00:00'); return d0.getTime(); } catch(e){ return 0; } }
  function endOfDayMsLocal(dateStr) { try { var d1 = new Date(dateStr + ' 23:59:59'); return d1.getTime(); } catch(e){ return 0; } }

  // Build date list inclusive from min to max
  if (minDayMs === null || maxDayMs === null) return;
  var dates = [];
  for (var tms = minDayMs; tms <= maxDayMs; tms += 24*60*60*1000) { var dOnly = Utilities.formatDate(new Date(tms), tz, 'yyyy-MM-dd'); dates.push(dOnly); }

  var out = [];
  var big3 = ['bullet','blitz','rapid'];
  var allFormats = {}; allFormats['bullet']=true; allFormats['blitz']=true; allFormats['rapid']=true; for (var ff in formatsSet) allFormats[ff] = true;

  for (var d = 0; d < dates.length; d++) {
    var dateOnly = dates[d]; var sod = startOfDayMsLocal(dateOnly); var eod = endOfDayMsLocal(dateOnly);
    var overall = { wins:0, losses:0, draws:0, beginSum:0, endSum:0, hasBegin:false, hasEnd:false };
    for (var fmt in allFormats) {
      var key = dateOnly + '|' + fmt; var b = byDateFmt[key];
      var begin = carryBefore(fmt, sod);
      var end = carryAtOrBefore(fmt, eod);
      if (b) {
        overall.wins += b.wins; overall.losses += b.losses; overall.draws += b.draws;
        out.push([dateOnly, fmt, b.wins, b.losses, b.draws, (b.duration || 0), begin, end, (begin === '' || end === '' ? '' : (Number(end) - Number(begin)))]);
      } else {
        out.push([dateOnly, fmt, 0, 0, 0, 0, begin, end, (begin === '' || end === '' ? '' : (Number(end) - Number(begin)))]);
      }
      if (begin !== '') { overall.beginSum += Number(begin); overall.hasBegin = true; }
      if (end !== '') { overall.endSum += Number(end); overall.hasEnd = true; }
    }
    var overallChange = (overall.hasBegin && overall.hasEnd) ? (overall.endSum - overall.beginSum) : '';
    out.push([dateOnly, 'overall', overall.wins, overall.losses, overall.draws, '', (overall.hasBegin ? overall.beginSum : ''), (overall.hasEnd ? overall.endSum : ''), overallChange]);
  }

  var dtSheet = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.DailyTotals, CONFIG.HEADERS.DailyTotals);
  if (dtSheet.getLastRow() > 1) dtSheet.getRange(2, 1, dtSheet.getLastRow() - 1, dtSheet.getLastColumn()).clearContent();
  if (out.length) writeRowsChunked(dtSheet, out, 2);
  try {
    // Apply formats
    var lastRow = dtSheet.getLastRow(); var lastCol = dtSheet.getLastColumn();
    if (lastRow >= 2) {
      dtSheet.getRange(2, 1, lastRow - 1, 1).setNumberFormat('yyyy-MM-dd');
      dtSheet.getRange(2, 3, lastRow - 1, 3).setNumberFormat('0');
      dtSheet.getRange(2, 6, lastRow - 1, 4).setNumberFormat('0');
    }
    dtSheet.setFrozenRows(1);
    dtSheet.autoResizeColumns(1, lastCol);
  } catch (e) {}
  appendOpsLog('', 'build_daily_totals', 'ok', '', { rows: out.length, start: dates[0] || '', end: dates.length ? dates[dates.length-1] : '' });
}

// Backward-compatible alias
function buildDailyTotalsForActiveMonth() { return buildDailyTotals({}); }

function updateDailyTotalsForDates(dates, options) {
  if (!dates || !dates.length) return;
  var tz = (options && options.timezone) || getProjectTimeZone();
  var includeFormats = (options && options.include_formats) || null;
  var excludeFormats = (options && options.exclude_formats) || null;
  var ss = getOrCreateGamesSpreadsheet();
  var ssGames = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.Games, CONFIG.HEADERS.Games);
  var lastG = ssGames.getLastRow(); if (lastG < 2) return;
  var gVals = ssGames.getRange(2, 1, lastG - 1, ssGames.getLastColumn()).getValues();
  var gHeader = ssGames.getRange(1, 1, 1, ssGames.getLastColumn()).getValues()[0];
  function idx(h){ for (var i = 0; i < gHeader.length; i++) if (String(gHeader[i]) === h) return i; return -1; }
  var iDate = idx('date'); var iFmt = idx('format'); var iOutcome = idx('my_outcome'); var iEnd = idx('end_time'); var iMyRating = idx('my_rating');

  // durations via GameMeta
  var urlToDuration = {};
  try {
    var metaSheet = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.GameMeta, CONFIG.HEADERS.GameMeta);
    var lastM = metaSheet.getLastRow();
    if (lastM >= 2) {
      var mHeader = metaSheet.getRange(1, 1, 1, metaSheet.getLastColumn()).getValues()[0];
      function mIdx(h){ for (var i = 0; i < mHeader.length; i++) if (String(mHeader[i]) === h) return i; return -1; }
      var mu = mIdx('url'); var mdur = mIdx('duration_seconds');
      var mVals = metaSheet.getRange(2, 1, lastM - 1, metaSheet.getLastColumn()).getValues();
      for (var r = 0; r < mVals.length; r++) { var u = mVals[r][mu]; if (u) urlToDuration[u] = (mVals[r][mdur] === '' ? 0 : Number(mVals[r][mdur])); }
    }
  } catch (e) {}

  // Group by date|format for quick counts on targeted dates
  var byDateFmt = {}; var formatsSet = {};
  var datesSet = {}; for (var d0 = 0; d0 < dates.length; d0++) datesSet[String(dates[d0])] = true;
  for (var r2 = 0; r2 < gVals.length; r2++) {
    var row = gVals[r2]; var dstr = row[iDate]; var fmt = String(row[iFmt] || ''); var end = row[iEnd]; var url = row[0];
    if (!fmt || !end) continue;
    if (includeFormats && !includeFormats[fmt]) continue;
    if (excludeFormats && excludeFormats[fmt]) continue;
    var d = String(dstr || '');
    if (!d) { var dtTmp = new Date(end); d = Utilities.formatDate(dtTmp, tz, 'yyyy-MM-dd'); }
    if (!datesSet[d]) continue;
    formatsSet[fmt] = true;
    var key = d + '|' + fmt;
    if (!byDateFmt[key]) byDateFmt[key] = { wins:0, losses:0, draws:0, duration:0 };
    var bucket = byDateFmt[key];
    var outcome = String(row[iOutcome] || '');
    if (outcome === 'win') bucket.wins++; else if (outcome === 'loss') bucket.losses++; else if (outcome === 'draw') bucket.draws++;
    if (url && urlToDuration[url]) bucket.duration += Number(urlToDuration[url] || 0);
  }

  // Build events timeline for carry-forward across all games (not just targeted dates)
  var eventsByFmt = {};
  for (var r3 = 0; r3 < gVals.length; r3++) {
    var row2 = gVals[r3]; var fmt2 = String(row2[iFmt] || ''); var end2 = row2[iEnd]; var rating2 = row2[iMyRating]; if (!fmt2 || !end2 || rating2 === '' || rating2 === null || rating2 === undefined) continue;
    if (includeFormats && !includeFormats[fmt2]) continue;
    if (excludeFormats && excludeFormats[fmt2]) continue;
    if (!eventsByFmt[fmt2]) eventsByFmt[fmt2] = [];
    eventsByFmt[fmt2].push({ t: new Date(end2).getTime(), r: Number(rating2) });
  }
  for (var kfmt in eventsByFmt) { eventsByFmt[kfmt].sort(function(a,b){ return a.t - b.t; }); }

  // Snapshot fallback from GameMeta
  var snapshotEventsByFmt = { bullet: [], blitz: [], rapid: [], daily: [] };
  try {
    var metaSheet2 = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.GameMeta, CONFIG.HEADERS.GameMeta);
    var lastM2 = metaSheet2.getLastRow();
    if (lastM2 >= 2) {
      var mh = metaSheet2.getRange(1, 1, 1, metaSheet2.getLastColumn()).getValues()[0];
      function mi(h){ for (var i = 0; i < mh.length; i++) if (String(mh[i]) === h) return i; return -1; }
      var mEndEpoch = mi('end_time_epoch');
      var iSB = mi('my_snapshot_bullet'); var iSL = mi('my_snapshot_blitz'); var iSR = mi('my_snapshot_rapid'); var iSD = mi('my_snapshot_daily');
      var mvals2 = metaSheet2.getRange(2, 1, lastM2 - 1, metaSheet2.getLastColumn()).getValues();
      for (var rr = 0; rr < mvals2.length; rr++) {
        var t = mvals2[rr][mEndEpoch]; if (t === '' || t === null || t === undefined) continue; var tms = Number(t) * 1000;
        if (iSB >= 0 && mvals2[rr][iSB] !== '' && mvals2[rr][iSB] !== null && mvals2[rr][iSB] !== undefined) snapshotEventsByFmt.bullet.push({ t: tms, r: Number(mvals2[rr][iSB]) });
        if (iSL >= 0 && mvals2[rr][iSL] !== '' && mvals2[rr][iSL] !== null && mvals2[rr][iSL] !== undefined) snapshotEventsByFmt.blitz.push({ t: tms, r: Number(mvals2[rr][iSL]) });
        if (iSR >= 0 && mvals2[rr][iSR] !== '' && mvals2[rr][iSR] !== null && mvals2[rr][iSR] !== undefined) snapshotEventsByFmt.rapid.push({ t: tms, r: Number(mvals2[rr][iSR]) });
        if (iSD >= 0 && mvals2[rr][iSD] !== '' && mvals2[rr][iSD] !== null && mvals2[rr][iSD] !== undefined) snapshotEventsByFmt.daily.push({ t: tms, r: Number(mvals2[rr][iSD]) });
      }
      for (var sf in snapshotEventsByFmt) snapshotEventsByFmt[sf].sort(function(a,b){ return a.t - b.t; });
    }
  } catch (e) {}

  function carryBefore(fmt, ms) {
    var ev = eventsByFmt[fmt]; var last = '';
    if (ev && ev.length) { for (var i3 = 0; i3 < ev.length; i3++) { if (ev[i3].t < ms) last = ev[i3].r; else break; } }
    if (last === '' && snapshotEventsByFmt[fmt]) { var sv = snapshotEventsByFmt[fmt]; for (var s = 0; s < sv.length; s++) { if (sv[s].t < ms) last = sv[s].r; else break; } }
    return last;
  }
  function carryAtOrBefore(fmt, ms) {
    var ev = eventsByFmt[fmt]; var last = '';
    if (ev && ev.length) { for (var i4 = 0; i4 < ev.length; i4++) { if (ev[i4].t <= ms) last = ev[i4].r; else break; } }
    if (last === '' && snapshotEventsByFmt[fmt]) { var sv2 = snapshotEventsByFmt[fmt]; for (var s2 = 0; s2 < sv2.length; s2++) { if (sv2[s2].t <= ms) last = sv2[s2].r; else break; } }
    return last;
  }

  function endOfDayMsLocal(dateStr) { try { var d1 = new Date(dateStr + ' 23:59:59'); return d1.getTime(); } catch(e){ return 0; } }
  function startOfDayMsLocal(dateStr) { try { var d0 = new Date(dateStr + ' 00:00:00'); return d0.getTime(); } catch(e){ return 0; } }

  var dtSheet = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.DailyTotals, CONFIG.HEADERS.DailyTotals);
  // Delete existing rows for these dates (bottom-up)
  try {
    var lastR = dtSheet.getLastRow();
    if (lastR >= 2) {
      var existing = dtSheet.getRange(2, 1, lastR - 1, 1).getValues();
      for (var irow = existing.length - 1; irow >= 0; irow--) {
        var dval = String(existing[irow][0] || '');
        if (datesSet[dval]) dtSheet.deleteRow(2 + irow);
      }
    }
  } catch (e) {}

  // Build and append rows for targeted dates
  var allFormats = {}; allFormats['bullet']=true; allFormats['blitz']=true; allFormats['rapid']=true; for (var ff in formatsSet) allFormats[ff] = true;
  var toAppend = [];
  for (var d5 = 0; d5 < dates.length; d5++) {
    var dateOnly = String(dates[d5]); var sod = startOfDayMsLocal(dateOnly); var eod = endOfDayMsLocal(dateOnly);
    var overall = { wins:0, losses:0, draws:0, beginSum:0, endSum:0, hasBegin:false, hasEnd:false };
    for (var fmt in allFormats) {
      var key = dateOnly + '|' + fmt; var b = byDateFmt[key];
      var begin = carryBefore(fmt, sod);
      var end = carryAtOrBefore(fmt, eod);
      if (b) {
        overall.wins += b.wins; overall.losses += b.losses; overall.draws += b.draws;
        toAppend.push([dateOnly, fmt, b.wins, b.losses, b.draws, (b.duration || 0), begin, end, (begin === '' || end === '' ? '' : (Number(end) - Number(begin)))]);
      } else {
        toAppend.push([dateOnly, fmt, 0, 0, 0, 0, begin, end, (begin === '' || end === '' ? '' : (Number(end) - Number(begin)))]);
      }
      if (begin !== '') { overall.beginSum += Number(begin); overall.hasBegin = true; }
      if (end !== '') { overall.endSum += Number(end); overall.hasEnd = true; }
    }
    var overallChange = (overall.hasBegin && overall.hasEnd) ? (overall.endSum - overall.beginSum) : '';
    toAppend.push([dateOnly, 'overall', overall.wins, overall.losses, overall.draws, '', (overall.hasBegin ? overall.beginSum : ''), (overall.hasEnd ? overall.endSum : ''), overallChange]);
  }
  if (toAppend.length) writeRowsChunked(dtSheet, toAppend);
}

function augmentGameMetaForUrls(urls) {
  if (!urls || !urls.length) return;
  var ss = getOrCreateGamesSpreadsheet();
  var gamesSheet = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.Games, CONFIG.HEADERS.Games);
  var metaSheet = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.GameMeta, CONFIG.HEADERS.GameMeta);

  var gLast = gamesSheet.getLastRow(); if (gLast < 2) return;
  var gHeader = gamesSheet.getRange(1, 1, 1, gamesSheet.getLastColumn()).getValues()[0];
  function gIdx(h){ for (var i = 0; i < gHeader.length; i++) if (String(gHeader[i]) === h) return i; return -1; }
  var giUrl = gIdx('url'); var giEnd = gIdx('end_time'); var giFmt = gIdx('format'); var giMy = gIdx('my_rating'); var giOpp = gIdx('opponent_rating');
  var gVals = gamesSheet.getRange(2, 1, gLast - 1, gamesSheet.getLastColumn()).getValues();
  // Map url -> post-game ratings from Games
  var urlToPost = {};
  for (var gi = 0; gi < gVals.length; gi++) {
    var uu = gVals[gi][giUrl]; if (!uu) continue;
    urlToPost[String(uu)] = { my: gVals[gi][giMy], opp: gVals[gi][giOpp] };
  }

  // Build per-format chronological timeline
  var byFmt = {};
  for (var i = 0; i < gVals.length; i++) {
    var u = gVals[i][giUrl]; var end = gVals[i][giEnd]; var fmt = String(gVals[i][giFmt] || ''); var myr = gVals[i][giMy]; var oppr = gVals[i][giOpp];
    if (!u || !end || !fmt) continue;
    if (!byFmt[fmt]) byFmt[fmt] = [];
    byFmt[fmt].push({ u: String(u), t: new Date(end).getTime(), my: myr, opp: oppr });
  }
  for (var f in byFmt) byFmt[f].sort(function(a,b){ return a.t - b.t; });

  // Compute last-based pregame for each URL in all formats
  var lastPregame = {}; var lastOppPregame = {}; var lastDelta = {}; var lastOppDelta = {};
  for (var f2 in byFmt) {
    var lastMy = null; var lastOpp = null;
    for (var j = 0; j < byFmt[f2].length; j++) {
      var row = byFmt[f2][j];
      var pre = (lastMy === null || lastMy === undefined || lastMy === '') ? '' : Number(lastMy);
      var delta = (pre === '' || row.my === '' || row.my === null || row.my === undefined) ? '' : (Number(row.my) - Number(pre));
      lastPregame[row.u] = pre;
      lastDelta[row.u] = delta;
      var oppPre = (row.opp === '' || row.opp === null || row.opp === undefined || delta === '' ? '' : (Number(row.opp) - Number(-Number(delta))));
      lastOppPregame[row.u] = oppPre;
      lastOppDelta[row.u] = (delta === '' ? '' : -Number(delta));
      lastMy = row.my; lastOpp = row.opp;
    }
  }

  // Build callback map
  var cbSheet = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.CallbackStats, CONFIG.HEADERS.CallbackStats);
  var cbLast = cbSheet.getLastRow();
  var cbMap = {};
  if (cbLast >= 2) {
    var cbHeader = cbSheet.getRange(1, 1, 1, cbSheet.getLastColumn()).getValues()[0];
    function cIdx(h){ for (var i = 0; i < cbHeader.length; i++) if (String(cbHeader[i]) === h) return i; return -1; }
    var cu = cIdx('url');
    var cMy = cIdx('my_rating');
    var cCh = cIdx('my_rating_change');
    var cOpp = cIdx('opp_rating');
    var cOppCh = cIdx('opp_rating_change');
    if (cu < 0 || cMy < 0 || cCh < 0 || cOpp < 0 || cOppCh < 0) return 0;
    var cbVals = cbSheet.getRange(2, 1, cbLast - 1, cbSheet.getLastColumn()).getValues();
    for (var r2 = 0; r2 < cbVals.length; r2++) {
      var u2 = cbVals[r2][cu]; if (!u2) continue;
      cbMap[String(u2)] = {
        my: cbVals[r2][cMy],
        dmy: cbVals[r2][cCh],
        opp: cbVals[r2][cOpp],
        dopp: cbVals[r2][cOppCh]
      };
    }
  }

  // Write augment columns for provided URLs, also maintain per-format snapshots
  var mLast = metaSheet.getLastRow(); if (mLast < 2) return;
  var mHeader = metaSheet.getRange(1, 1, 1, metaSheet.getLastColumn()).getValues()[0];
  function mIdx(h){ for (var i = 0; i < mHeader.length; i++) if (String(mHeader[i]) === h) return i; return -1; }
  var mu = mIdx('url');
  var cStart = mIdx('my_rating_change_cb'); if (cStart < 0) return;
  var iSnapBullet = mIdx('my_snapshot_bullet');
  var iSnapBlitz = mIdx('my_snapshot_blitz');
  var iSnapRapid = mIdx('my_snapshot_rapid');
  var iSnapDaily = mIdx('my_snapshot_daily');
  var iFormat = mIdx('format');
  var iMyPost = mIdx('my_rating');
  var mUrls = metaSheet.getRange(2, mu + 1, mLast - 1, 1).getValues();
  var rowByUrl = {}; for (var r3 = 0; r3 < mUrls.length; r3++) { var uu = mUrls[r3][0]; if (uu) rowByUrl[String(uu)] = 2 + r3; }
  var updated = 0;

  for (var x = 0; x < urls.length; x++) {
    var u3 = String(urls[x]); var rowIdx = rowByUrl[u3]; if (!rowIdx) continue;
    var myDeltaCb = (cbMap[u3] && cbMap[u3].dmy !== '' && cbMap[u3].dmy !== null && cbMap[u3].dmy !== undefined) ? Number(cbMap[u3].dmy) : '';
    var oppDeltaCb = (cbMap[u3] && cbMap[u3].dopp !== '' && cbMap[u3].dopp !== null && cbMap[u3].dopp !== undefined) ? Number(cbMap[u3].dopp) : '';
    var myRatingNow = (urlToPost[u3] && urlToPost[u3].my !== '' && urlToPost[u3].my !== null && urlToPost[u3].my !== undefined)
      ? Number(urlToPost[u3].my)
      : (lastPregame[u3] === undefined ? '' : (lastPregame[u3] === '' ? '' : Number(lastPregame[u3]) + (lastDelta[u3] === '' ? 0 : Number(lastDelta[u3]))));
    var myPregameCb = (myDeltaCb === '' || myRatingNow === '' ? '' : (Number(myRatingNow) - Number(myDeltaCb)));
    var oppRatingNow = (urlToPost[u3] && urlToPost[u3].opp !== '' && urlToPost[u3].opp !== null && urlToPost[u3].opp !== undefined)
      ? Number(urlToPost[u3].opp)
      : (lastOppPregame[u3] === undefined ? '' : (lastOppPregame[u3] === '' ? '' : Number(lastOppPregame[u3]) + (lastOppDelta[u3] === '' ? 0 : Number(lastOppDelta[u3]))));
    var oppPregameCb = (oppDeltaCb === '' || oppRatingNow === '' ? '' : (Number(oppRatingNow) - Number(oppDeltaCb)));
    var values = [
      myDeltaCb, oppDeltaCb, myPregameCb, oppPregameCb,
      (lastPregame[u3] === undefined ? '' : lastPregame[u3]), (lastDelta[u3] === undefined ? '' : lastDelta[u3]), (lastOppPregame[u3] === undefined ? '' : lastOppPregame[u3]), (lastOppDelta[u3] === undefined ? '' : lastOppDelta[u3])
    ];
    metaSheet.getRange(rowIdx, cStart + 1, 1, values.length).setValues([values]);
    updated++;

    // Maintain snapshots: carry prior snapshots and update the played format's rating
    if (iSnapBullet >= 0 && iSnapBlitz >= 0 && iSnapRapid >= 0 && iSnapDaily >= 0) {
      var currentRowVals = metaSheet.getRange(rowIdx, 1, 1, metaSheet.getLastColumn()).getValues()[0];
      var snap = {
        bullet: currentRowVals[iSnapBullet] || '',
        blitz: currentRowVals[iSnapBlitz] || '',
        rapid: currentRowVals[iSnapRapid] || '',
        daily: currentRowVals[iSnapDaily] || ''
      };
      var fmtNow = String(currentRowVals[iFormat] || '');
      var myPostNow = currentRowVals[iMyPost];
      if (fmtNow && myPostNow !== '' && myPostNow !== null && myPostNow !== undefined) {
        if (fmtNow === 'bullet') snap.bullet = Number(myPostNow);
        else if (fmtNow === 'blitz') snap.blitz = Number(myPostNow);
        else if (fmtNow === 'rapid') snap.rapid = Number(myPostNow);
        else if (fmtNow === 'daily') snap.daily = Number(myPostNow);
      }
      metaSheet.getRange(rowIdx, iSnapBullet + 1, 1, 4).setValues([[snap.bullet, snap.blitz, snap.rapid, snap.daily]]);
    }
  }
  return updated;
}
function runGameDataBatch() {
  // Stub: iterate a small batch of Games rows lacking extra game data.
  // Read-only selection and external fetch to be implemented later.
}

// removed legacy Ratings timeline builder

