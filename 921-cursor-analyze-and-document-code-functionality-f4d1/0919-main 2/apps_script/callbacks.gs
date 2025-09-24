function runCallbacksBatch() {
  var gamesSS = getOrCreateGamesSpreadsheet();
  var cbSS = getOrCreateCallbacksSpreadsheet();
  var games = getOrCreateSheet(gamesSS, CONFIG.SHEET_NAMES.Games, CONFIG.HEADERS.Games);
  var cb = getOrCreateSheet(cbSS, CONFIG.SHEET_NAMES.CallbackStats, CONFIG.HEADERS.CallbackStats);
  // Ensure header schema is up-to-date (migrate white_/black_ -> my_/opp_)
  ensureSheetHeader(cb, CONFIG.HEADERS.CallbackStats);
  var lastRow = games.getLastRow();
  if (lastRow < 2) return;
  var values = games.getRange(2, 1, lastRow - 1, games.getLastColumn()).getValues();

  // Build a small batch of candidates not yet in CallbackStats
  var existing = buildCallbackUrlIndex(cb);
  var batch = [];
  for (var i = 0; i < values.length && batch.length < 30; i++) {
    var url = values[i][0];
    if (!url || existing.has(url)) continue;
    var id = extractIdFromUrl(url);
    if (!id) continue;
    // Validate ID is numeric-like to avoid accidental date/time strings from Sheets
    if (!/^\d+$/.test(String(id))) continue;
    var type = inferTypeFromUrl(url);
    batch.push({ url: url, type: type, id: id });
  }
  if (!batch.length) return;

  // Parallel fetch callbacks
  var reqs = [];
  for (var j = 0; j < batch.length; j++) {
    var b = batch[j];
    var endpoint = b.type === 'daily' ? callbackDailyGameUrl(b.id) : callbackLiveGameUrl(b.id);
    reqs.push({ url: endpoint, method: 'get', muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'ChessSheets/1.0 (AppsScript)' } });
  }
  var responses = UrlFetchApp.fetchAll(reqs);

  var outRows = [];
  for (var k = 0; k < responses.length; k++) {
    var b2 = batch[k];
    var resp = responses[k];
    var code = 0;
    try { code = resp.getResponseCode(); } catch (e) { code = 0; }
    if (code >= 200 && code < 300) {
      var json = {};
      try { json = JSON.parse(resp.getContentText() || '{}'); } catch (e) { json = {}; }
      var parsed = parseCallbackIdentity(json, b2);
      var cbChange = (parsed.myExactChange === '' || parsed.myExactChange === null || parsed.myExactChange === undefined) ? '' : Number(parsed.myExactChange);
      var oppCbChange = (parsed.oppExactChange === '' || parsed.oppExactChange === null || parsed.oppExactChange === undefined) ? '' : Number(parsed.oppExactChange);

      outRows.push([
        b2.url, b2.id, parsed.isLive,
        parsed.myColor,
        parsed.myUser, parsed.myRating, cbChange, (parsed.myRating === '' || cbChange === '' ? '' : Number(parsed.myRating) - Number(cbChange)), parsed.myCountry, parsed.myMembership, parsed.myDefaultTab, parsed.myPostMove,
        parsed.oppUser, parsed.oppRating, oppCbChange, (parsed.oppRating === '' || oppCbChange === '' ? '' : Number(parsed.oppRating) - Number(oppCbChange)), parsed.oppCountry, parsed.oppMembership, parsed.oppDefaultTab, parsed.oppPostMove,
        parsed.gameEndReason, parsed.resultMessage, parsed.endTime, parsed.plyCount,
        parsed.baseTimeDs, parsed.incrementDs, parsed.moveTimestampsDs,
        new Date()
      ]);
    } else if (code === 404) {
      var total = CONFIG && CONFIG.HEADERS && CONFIG.HEADERS.CallbackStats ? CONFIG.HEADERS.CallbackStats.length : 0;
      var row = [b2.url, b2.id];
      while (row.length < Math.max(0, total - 1)) row.push('');
      row.push(new Date());
      outRows.push(row);
    } else {
      var endpoint2 = b2.type === 'daily' ? callbackDailyGameUrl(b2.id) : callbackLiveGameUrl(b2.id);
      logEvent('WARN', 'CALLBACK_HTTP', 'Non-2xx from callback', {url: endpoint2, code: code});
    }
  }
  if (outRows.length) writeRowsChunked(cb, outRows);
  // Immediately augment GameMeta for these URLs
  try {
    var urls = batch.map(function(b){ return b.url; });
    augmentUnifiedForUrls(urls);
  } catch (e) {}
}

function buildCallbackUrlIndex(cbSheet) {
  var set = new Set();
  try {
    if (!cbSheet || typeof cbSheet.getLastRow !== 'function') return set;
    var last = cbSheet.getLastRow();
    if (last < 2) return set;
    var vals = cbSheet.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      var u = vals[i][0]; if (u) set.add(u);
    }
  } catch (e) {}
  return set;
}

function inferTypeFromUrl(url) {
  if (url.indexOf('/game/daily/') >= 0) return 'daily';
  return 'live';
}

function extractIdFromUrl(url) {
  var segs = url.split('/');
  return segs[segs.length - 1] || '';
}

function parseCallbackIdentity(json, b) {
  var g = (json && json.game) || {};
  var players = json && json.players;
  var top = (players && players.top) || {};
  var bottom = (players && players.bottom) || {};
  var isLive = !!g.isLiveGame;
  var isRated = !!g.isRated;
  var ply = g.plyCount || '';
  var endReason = g.gameEndReason || '';
  var pgn = g.pgnHeaders || {};
  var ecoCode = pgn.ECO || '';
  var pgnDate = pgn.Date || '';
  var pgnTime = pgn.EndTime || '';
  var base1 = g.baseTime1 || '';
  var inc1 = g.timeIncrement1 || '';

  var whiteUser = pgn.White || '';
  var blackUser = pgn.Black || '';

  // Determine my color by matching against configured username
  var me = getConfiguredUsername();
  var myColor = '';
  if (String(whiteUser || '').toLowerCase() === String(me).toLowerCase()) myColor = 'white';
  else if (String(blackUser || '').toLowerCase() === String(me).toLowerCase()) myColor = 'black';

  var myExact = '';
  var myPre = '';
  var oppExact = '';
  var oppPre = '';
  if (myColor === 'white') {
    myExact = (g.ratingChangeWhite !== undefined) ? g.ratingChangeWhite : g.ratingChange;
    myPre = (bottom && bottom.color === 'white') ? bottom.rating : (top && top.color === 'white' ? top.rating : (pgn.WhiteElo || ''));
    oppExact = (g.ratingChangeBlack !== undefined) ? g.ratingChangeBlack : (g.ratingChange !== undefined ? -g.ratingChange : '');
    oppPre = (bottom && bottom.color === 'black') ? bottom.rating : (top && top.color === 'black' ? top.rating : (pgn.BlackElo || ''));
  } else if (myColor === 'black') {
    myExact = (g.ratingChangeBlack !== undefined) ? g.ratingChangeBlack : g.ratingChange;
    myPre = (bottom && bottom.color === 'black') ? bottom.rating : (top && top.color === 'black' ? top.rating : (pgn.BlackElo || ''));
    oppExact = (g.ratingChangeWhite !== undefined) ? g.ratingChangeWhite : (g.ratingChange !== undefined ? -g.ratingChange : '');
    oppPre = (bottom && bottom.color === 'white') ? bottom.rating : (top && top.color === 'white' ? top.rating : (pgn.WhiteElo || ''));
  }

  function pickForColor(color, prop, fallback) {
    try {
      var fromTop = (players && players.top && players.top.color === color) ? players.top[prop] : '';
      var fromBottom = (players && players.bottom && players.bottom.color === color) ? players.bottom[prop] : '';
      var val = (fromTop !== '' && fromTop !== undefined && fromTop !== null) ? fromTop : ((fromBottom !== '' && fromBottom !== undefined && fromBottom !== null) ? fromBottom : '');
      return (val === '' || val === undefined || val === null) ? (fallback || '') : val;
    } catch (e) {
      return fallback || '';
    }
  }

  var oppColor = (myColor === 'white') ? 'black' : (myColor === 'black' ? 'white' : '');
  var myUser = (myColor === 'white') ? whiteUser : ((myColor === 'black') ? blackUser : '');
  var oppUser = (oppColor === 'white') ? whiteUser : ((oppColor === 'black') ? blackUser : '');
  // Choose the player blocks for white/black once, then pull properties consistently
  var whiteBlock = (players && players.top && players.top.color === 'white') ? players.top : ((players && players.bottom && players.bottom.color === 'white') ? players.bottom : {});
  var blackBlock = (players && players.top && players.top.color === 'black') ? players.top : ((players && players.bottom && players.bottom.color === 'black') ? players.bottom : {});
  function from(block, key, fallback) { var v = block && block[key]; return (v === undefined || v === null || v === '') ? (fallback || '') : v; }
  var myBlock = (myColor === 'white') ? whiteBlock : ((myColor === 'black') ? blackBlock : {});
  var oppBlock = (oppColor === 'white') ? whiteBlock : ((oppColor === 'black') ? blackBlock : {});
  var myRating2 = from(myBlock, 'rating', (myColor === 'white') ? (pgn.WhiteElo || '') : ((myColor === 'black') ? (pgn.BlackElo || '') : ''));
  var oppRating2 = from(oppBlock, 'rating', (oppColor === 'white') ? (pgn.WhiteElo || '') : ((oppColor === 'black') ? (pgn.BlackElo || '') : ''));
  var myCountry = from(myBlock, 'countryName', '');
  var oppCountry = from(oppBlock, 'countryName', '');
  var myMembership = from(myBlock, 'membershipCode', '');
  var oppMembership = from(oppBlock, 'membershipCode', '');
  var myDefaultTab = from(myBlock, 'defaultTab', '');
  var oppDefaultTab = from(oppBlock, 'defaultTab', '');
  var myPostMove = from(myBlock, 'postMoveAction', '');
  var oppPostMove = from(oppBlock, 'postMoveAction', '');

  return {
    myColor: myColor,
    myExactChange: (myExact === '' || myExact === null || myExact === undefined) ? '' : Number(myExact),
    myPregameRating: (myPre === '' || myPre === null || myPre === undefined) ? '' : Number(myPre),
    oppColor: oppColor,
    oppPregameRating: (oppPre === '' || oppPre === null || oppPre === undefined) ? '' : Number(oppPre),
    oppExactChange: (oppExact === '' || oppExact === null || oppExact === undefined) ? '' : Number(oppExact),
    isLive: isLive,
    gameEndReason: endReason,
    resultMessage: g.resultMessage || '',
    endTime: g.endTime || '',
    plyCount: g.plyCount || '',
    baseTimeDs: g.baseTime1 || '',
    incrementDs: g.timeIncrement1 || '',
    moveTimestampsDs: (g.moveTimestamps === undefined || g.moveTimestamps === null || g.moveTimestamps === '') ? '' : ("'" + String(g.moveTimestamps)),
    isRated: isRated,
    myUser: myUser,
    myRating: myRating2,
    myCountry: myCountry,
    myMembership: myMembership,
    myDefaultTab: myDefaultTab,
    myPostMove: myPostMove,
    oppUser: oppUser,
    oppRating: oppRating2,
    oppCountry: oppCountry,
    oppMembership: oppMembership,
    oppDefaultTab: oppDefaultTab,
    oppPostMove: oppPostMove,
    ecoCode: ecoCode,
    pgnDate: pgnDate,
    pgnTime: pgnTime,
    baseTime1: base1,
    timeIncrement1: inc1
  };
}

// We only record unified values in CallbackStats; no writes back to Games.

// removed duplicate runCallbacksBatch implementation

function hasCallbackRow(callbackSheet, url) {
  var lastRow = callbackSheet.getLastRow();
  if (lastRow < 2) return false;
  var urls = callbackSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < urls.length; i++) {
    if (urls[i][0] === url) return true;
  }
  return false;
}

function fetchCallback(type, id) {
  var base = type === 'daily' ? 'https://www.chess.com/callback/daily/game/' : 'https://www.chess.com/callback/live/game/';
  var res = fetchJsonWithEtag(base + id);
  if (res.status !== 'ok' || !res.json) throw new Error('Callback fetch failed: ' + (res.error || res.code));
  return res.json;
}

// Removed legacy upgradeCallbackStatsHeaderIfNeeded in favor of ensureSheetHeader
