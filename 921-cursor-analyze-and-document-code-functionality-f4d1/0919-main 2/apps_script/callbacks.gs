function runCallbacksBatch() {
  // Fetch a small batch of missing callbacks and write results directly into Unified sheet columns
  var ss = getOrCreateGamesSpreadsheet();
  var monthKey = getActiveMonthKey(); if (!monthKey) return 0;
  var uniName = getGamesSheetNameForMonthKey(monthKey);
  var uni = getOrCreateSheet(ss, uniName, CONFIG.HEADERS.Games);
  var last = uni.getLastRow(); if (last < 2) return 0;
  var uh = uni.getRange(1, 1, 1, uni.getLastColumn()).getValues()[0];
  function uidx(n){ for (var i=0;i<uh.length;i++) if (String(uh[i])===n) return i; return -1; }
  var iUrl = uidx('url');
  var iMyDeltaCb = uidx('my_rating_change_cb'); var iOppDeltaCb = uidx('opp_rating_change_cb');
  var iMyPreCb = uidx('my_pregame_cb'); var iOppPreCb = uidx('opp_pregame_cb');
  var iPly = uidx('ply_count'); var iMoves = uidx('move_timestamps_ds');
  var iResMsg = uidx('result_message');
  var iMyCountry = uidx('my_country'); var iMyMember = uidx('my_membership'); var iMyTab = uidx('my_default_tab'); var iMyPost = uidx('my_post_move_action');
  var iOppCountry = uidx('opp_country'); var iOppMember = uidx('opp_membership'); var iOppTab = uidx('opp_default_tab'); var iOppPost = uidx('opp_post_move_action');
  var vals = uni.getRange(2, 1, last - 1, uni.getLastColumn()).getValues();
  var batch = [];
  for (var r=0; r<vals.length && batch.length < 30; r++) {
    var url = vals[r][iUrl]; if (!url) continue;
    var have = (vals[r][iMyDeltaCb]!=='' && vals[r][iMyDeltaCb]!==null && vals[r][iMyDeltaCb]!==undefined);
    if (have) continue;
    var id = extractIdFromUrl(url); if (!id || !/^\d+$/.test(String(id))) continue;
    var type = inferTypeFromUrl(url);
    batch.push({ url: url, type: type, id: id, rowIndex: 2 + r });
  }
  if (!batch.length) return 0;
  var reqs = [];
  for (var j=0;j<batch.length;j++) {
    var b = batch[j]; var endpoint = b.type === 'daily' ? callbackDailyGameUrl(b.id) : callbackLiveGameUrl(b.id);
    reqs.push({ url: endpoint, method: 'get', muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'ChessSheets/1.0 (AppsScript)' } });
  }
  var responses = UrlFetchApp.fetchAll(reqs);
  var applied = 0;
  for (var k=0;k<responses.length;k++) {
    var b2 = batch[k]; var resp = responses[k]; var code = 0; try { code = resp.getResponseCode(); } catch (e) { code = 0; }
    if (code >= 200 && code < 300) {
      var json = {}; try { json = JSON.parse(resp.getContentText() || '{}'); } catch (e) { json = {}; }
      var parsed = parseCallbackIdentity(json, b2);
      var cbChange = (parsed.myExactChange === '' || parsed.myExactChange === null || parsed.myExactChange === undefined) ? '' : Number(parsed.myExactChange);
      var oppCbChange = (parsed.oppExactChange === '' || parsed.oppExactChange === null || parsed.oppExactChange === undefined) ? '' : Number(parsed.oppExactChange);
      var myPre = (parsed.myPregameRating === '' || parsed.myPregameRating === null || parsed.myPregameRating === undefined) ? '' : Number(parsed.myPregameRating);
      var oppPre = (parsed.oppPregameRating === '' || parsed.oppPregameRating === null || parsed.oppPregameRating === undefined) ? '' : Number(parsed.oppPregameRating);
      var ply = parsed.plyCount || '';
      var mv = parsed.moveTimestampsDs || '';
      var row = uni.getRange(b2.rowIndex, 1, 1, uni.getLastColumn()).getValues()[0];
      row[iMyDeltaCb] = cbChange; row[iOppDeltaCb] = oppCbChange; row[iMyPreCb] = myPre; row[iOppPreCb] = oppPre; row[iPly] = ply; row[iMoves] = mv;
      if (iResMsg >= 0) row[iResMsg] = parsed.resultMessage || '';
      if (iMyCountry >= 0) row[iMyCountry] = parsed.myCountry || '';
      if (iMyMember >= 0) row[iMyMember] = parsed.myMembership || '';
      if (iMyTab >= 0) row[iMyTab] = parsed.myDefaultTab || '';
      if (iMyPost >= 0) row[iMyPost] = parsed.myPostMove || '';
      if (iOppCountry >= 0) row[iOppCountry] = parsed.oppCountry || '';
      if (iOppMember >= 0) row[iOppMember] = parsed.oppMembership || '';
      if (iOppTab >= 0) row[iOppTab] = parsed.oppDefaultTab || '';
      if (iOppPost >= 0) row[iOppPost] = parsed.oppPostMove || '';
      uni.getRange(b2.rowIndex, 1, 1, row.length).setValues([row]);
      applied++;
    }
  }
  // Update Archives counters for active month
  try {
    var archivesSS = getOrCreateArchivesSpreadsheet();
    var aSheet = getOrCreateSheet(archivesSS, CONFIG.SHEET_NAMES.Archives, CONFIG.HEADERS.Archives);
    var alast = aSheet.getLastRow(); if (alast >= 2) {
      var ah = aSheet.getRange(1,1,1,aSheet.getLastColumn()).getValues()[0];
      function aidx(n){ for (var i=0;i<ah.length;i++) if (String(ah[i])===n) return i; return -1; }
      var iY = 0, iM = 1, iStatus = 3; var iCbCnt = aidx('callback_applied_count');
      var av = aSheet.getRange(2,1,alast-1,aSheet.getLastColumn()).getValues();
      for (var rr=0; rr<av.length; rr++) {
        if (String(av[rr][iStatus]) === 'active') {
          var rowIndex = 2 + rr; var cur = (iCbCnt>=0 ? av[rr][iCbCnt] : 0);
          if (iCbCnt>=0) aSheet.getRange(rowIndex, iCbCnt+1).setValue(Number(cur||0) + Number(applied||0));
          break;
        }
      }
    }
  } catch (e) {}
  appendOpsLog('', 'callbacks_applied', 'ok', 200, { applied: applied });
  return applied;
}

// buildCallbackUrlIndex removed (CallbackStats deprecated)

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

// CallbackStats legacy helpers removed
