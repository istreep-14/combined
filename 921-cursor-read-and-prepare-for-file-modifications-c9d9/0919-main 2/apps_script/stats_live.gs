function updateLiveStatsAll() {
  updateLiveStatsForFormat('bullet');
  updateLiveStatsForFormat('blitz');
  updateLiveStatsForFormat('rapid');
}

function updateLiveStatsForFormat(format) {
  if (!format) return;
  var username = getConfiguredUsername();
  var url = liveStatsUrl(format, username);
  try {
    // Always fetch to capture a fresh meta snapshot each run
    var res = fetchJsonWithEtag(url, null);
    if (res.status !== 'ok') { logWarn('LIVESTATS_HTTP', 'Non-2xx fetching live stats', { format: format, code: res.code, url: url }); return; }
    var json = res.json || {};
    if (!json || !json.stats) {
      logWarn('LIVESTATS_EMPTY', 'No stats payload', { format: format });
      return;
    }
    appendLiveStatsMeta(format, json);
    appendLiveStatsHistory(format, json);
  } catch (e) {
    logError('LIVESTATS_ERR', String(e && e.message || e), { format: format, url: url });
  }
}

// moved to endpoints.gs: liveStatsUrl

function fetchPlayerStatsSnapshot() {
  var statsSS = getOrCreateStatsSpreadsheet();
  var sheet = getOrCreateSheet(statsSS, CONFIG.SHEET_NAMES.PlayerStats, CONFIG.HEADERS.PlayerStats);
  var username = getConfiguredUsername();
  var url = playerStatsUrl(username);
  try {
    var res = fetchJsonWithEtag(url, null); if (res.status !== 'ok') { logWarn('STATS_HTTP', 'Non-2xx from player stats', { code: res.code }); return; }
    var json = res.json || {};
    var now = new Date();
    var formatMap = {
      bullet: 'chess_bullet',
      blitz: 'chess_blitz',
      rapid: 'chess_rapid',
      daily: 'chess_daily',
      live960: 'chess960',
      daily960: 'chess960_daily'
    };
    var rows = [];
    Object.keys(formatMap).forEach(function(fmt){
      var key = formatMap[fmt];
      var obj = json && json[key];
      if (!obj || !obj.last) return;
      var rating = obj.last && obj.last.rating;
      var rd = obj.last && obj.last.rd;
      rows.push([now, fmt, (rating === undefined || rating === null ? '' : Number(rating)), (rd === undefined || rd === null ? '' : Number(rd)), 'player_stats', JSON.stringify(obj)]);
    });
    if (rows.length) writeRowsChunked(sheet, rows);
  } catch (e) {
    logError('STATS_ERR', String(e && e.message || e), {});
  }
}

function appendLiveStatsMeta(format, payload) {
  try {
    var liveSS = getOrCreateLiveStatsSpreadsheet();
    var sheet = getOrCreateSheet(liveSS, CONFIG.SHEET_NAMES.LiveStatsMeta, CONFIG.HEADERS.LiveStatsMeta);
    var s = payload.stats || {};
    var row = [
      new Date(),
      String(format || ''),
      safe(s.count), safe(s.rated_count),
      safe(s.opponent_rating_avg), safe(s.opponent_rating_win_avg), safe(s.opponent_rating_draw_avg), safe(s.opponent_rating_loss_avg),
      safe(s.white_game_count), safe(s.black_game_count), safe(s.white_win_count), safe(s.white_draw_count), safe(s.white_loss_count), safe(s.black_win_count), safe(s.black_draw_count), safe(s.black_loss_count),
      safe(s.rating_last), safe(s.rating_first), safe(s.rating_max), safe(s.rating_max_timestamp),
      safe(s.moves_count), safe(s.streak_last), safe(s.streak_max), safe(s.streak_max_timestamp),
      safe(s.opponent_rating_max), safe(s.opponent_rating_max_timestamp), safe(s.opponent_rating_max_uuid),
      safe(s.accuracy_count), safe(s.accuracy_avg), safe(s.starting_day),
      safe(payload.progress), safe(payload.rank), safe(payload.percentile), safe(payload.playersCount), safe(payload.friendRank), safe(payload.friendRankIsExpired)
    ];
    writeRowsChunked(sheet, [row]);
  } catch (e) {
    logWarn('LIVESTATS_META_FAIL', 'Failed writing LiveStatsMeta', { format: format, error: String(e) });
  }
}

function appendLiveStatsHistory(format, payload) {
  var stats = payload && payload.stats;
  var hist = stats && stats.history;
  if (!hist || !hist.length) return;

  var props = getScriptProps();
  var cursorKey = 'CURSOR_LIVESTATS_' + String(format).toUpperCase() + '_MAX_TS';
  var lastTsStr = props.getProperty(cursorKey);
  var lastTs = lastTsStr ? parseInt(lastTsStr, 10) : 0;

  // Filter new entries strictly greater than cursor timestamp
  var newEntries = [];
  for (var i = 0; i < hist.length; i++) {
    var h = hist[i] || {};
    var ts = Number(h.timestamp || 0); // appears to be ms epoch in callback response
    if (!ts) continue;
    if (lastTs && ts <= lastTs) continue;
    newEntries.push(h);
  }
  if (!newEntries.length) return;

  // Sort ascending by timestamp so we append in chronological order
  newEntries.sort(function(a, b){ return Number(a.timestamp || 0) - Number(b.timestamp || 0); });

  var liveSS = getOrCreateLiveStatsSpreadsheet();
  var sheet = getOrCreateSheet(liveSS, CONFIG.SHEET_NAMES.LiveStatsEOD, CONFIG.HEADERS.LiveStatsEOD);
  var tz = getProjectTimeZone();
  var rows = [];
  var maxTs = lastTs;
  for (var j = 0; j < newEntries.length; j++) {
    var e = newEntries[j];
    var tsMs = Number(e.timestamp || 0);
    if (tsMs > maxTs) maxTs = tsMs;
    var dateStr = Utilities.formatDate(new Date(tsMs), tz, 'yyyy-MM-dd');
    var ratingRaw = e.rating;
    var dayCloseRaw = e.day_close_rating;
    var eod = (dayCloseRaw !== undefined && dayCloseRaw !== null && Number(dayCloseRaw) !== 0)
      ? Number(dayCloseRaw)
      : (ratingRaw !== undefined && ratingRaw !== null ? Number(ratingRaw) : '');
    var dayIndex = (e.day !== undefined && e.day !== null) ? Number(e.day) : '';
    rows.push([dateStr, String(format || ''), eod, safe(ratingRaw), safe(dayCloseRaw), tsMs, dayIndex]);
  }
  if (rows.length) writeRowsChunked(sheet, rows);
  if (maxTs && maxTs > lastTs) props.setProperty(cursorKey, String(maxTs));
}

