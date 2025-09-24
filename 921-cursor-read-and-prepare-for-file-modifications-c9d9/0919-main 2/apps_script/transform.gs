/**
 * Module: transform
 * Purpose: Map archive game JSON to canonical Games row and GameMeta row.
 */

function gameJsonToRow(meUsername, game) {
  var url = game.url || (game.pgn && extractPgnHeader(game.pgn, 'Link')) || '';
  var id = extractIdFromUrl(url);
  var timeControl = game.time_control || (game.pgn && extractPgnHeader(game.pgn, 'TimeControl')) || '';
  var tc = parseTimeControl(timeControl);
  var timeClass = game.time_class || '';
  var rules = game.rules || '';
  // Normalize cheap, O(1)
  timeClass = normalizeTimeClass(timeClass);
  rules = normalizeRules(rules);
  var type = (timeClass === 'daily') ? 'daily' : 'live';
  var format = deriveFormat(timeClass, rules, type);
  var startUnix = game.start_time || parsePgnUtcToUnixSeconds(game.pgn);
  var endUnix = game.end_time || null;
  var startLocal = startUnix ? toLocalDateTimeStringFromUnixSeconds(startUnix) : '';
  var endLocal = endUnix ? toLocalDateTimeStringFromUnixSeconds(endUnix) : '';
  var durationSeconds = computeDurationSeconds(startUnix, endUnix);
  // Additional raw/meta fields
  var accuracies = game.accuracies || {};
  var accWhite = accuracies.white !== undefined && accuracies.white !== null ? Number(accuracies.white) : '';
  var accBlack = accuracies.black !== undefined && accuracies.black !== null ? Number(accuracies.black) : '';
  var tcn = game.tcn || '';
  var initialSetup = game.initial_setup || '';
  var fen = game.fen || '';
  var startEpoch = startUnix || '';
  var endEpoch = endUnix || '';
  var tournamentUrl = game.tournament || '';
  var matchUrl = game.match || '';
  var white = game.white || {};
  var black = game.black || {};
  var meColor = pickPlayerColor(meUsername, white.username, black.username);
  var oppColor = (meColor === 'white') ? 'black' : (meColor === 'black' ? 'white' : '');
  var player = meColor === 'white' ? white : (meColor === 'black' ? black : {});
  var opponent = oppColor === 'white' ? white : (oppColor === 'black' ? black : {});
  var playerResult = player && player.result ? String(player.result) : '';
  var playerOutcome = mapResultToOutcome(playerResult);
  var playerScore = scoreFromOutcome(playerOutcome);
  var opponentResult = opponent && opponent.result ? String(opponent.result) : '';
  var opponentOutcome = mapResultToOutcome(opponentResult);
  var opponentScore = scoreFromOutcome(opponentOutcome);
  var ecoCode = (game.pgn && extractPgnHeader(game.pgn, 'ECO')) || '';
  var ecoUrl = (game.pgn && extractPgnHeader(game.pgn, 'ECOUrl')) || game.eco || '';
  var uuid = game.uuid || '';
  // End reason: use the raw result code from the loser (or either if draw)
  var endReason = (playerOutcome === 'win')
    ? (opponentResult || '')
    : (playerOutcome === 'loss'
        ? (playerResult || '')
        : (playerResult || opponentResult || ''));
  var pgnMoves = extractPgnMoves(game.pgn);
  // Build lean Games row
  var dateOnly = endLocal ? Utilities.formatDate(new Date(endUnix * 1000), getProjectTimeZone(), 'yyyy-MM-dd') : '';
  var gamesRow = [
    safe(url),
    safe(dateOnly), safe(startLocal), safe(endLocal),
    safe(timeControl),
    safe(game.rated),
    safe(format),
    safe(meColor), safe(player.rating), safe(playerOutcome),
    safe(opponent.username), safe(opponent.rating),
    safe(endReason)
  ];
  gamesRow._meta = buildGameMetaRow(meUsername, game, {
    url: url, id: id, isLive: (type === 'live'), rated: game.rated, timeClass: timeClass, rules: rules, format: format,
    startUnix: startUnix, endUnix: endUnix,
    tc: tc,
    ecoCode: ecoCode, ecoUrl: ecoUrl,
    pgnMoves: pgnMoves, tcn: tcn, initialSetup: initialSetup, fen: fen,
    meColor: meColor, oppColor: oppColor,
    player: player, opponent: opponent,
    playerResult: playerResult, playerOutcome: playerOutcome, playerScore: playerScore,
    opponentResult: opponentResult, opponentOutcome: opponentOutcome, opponentScore: opponentScore,
    durationSeconds: durationSeconds,
    accWhite: accWhite, accBlack: accBlack
  });
  return gamesRow;
}

function buildGameMetaRow(meUsername, game, ctx) {
  var oppColor = ctx.oppColor || ((ctx.meColor === 'white') ? 'black' : (ctx.meColor === 'black' ? 'white' : ''));
  return [
    safe(ctx.url), safe(ctx.id), safe(!!ctx.isLive), safe(!!ctx.rated), safe(ctx.timeClass), safe(ctx.rules), safe(ctx.format),
    safe(ctx.startUnix), safe(ctx.endUnix), safe(ctx.durationSeconds),
    safe(game.time_control), safe(ctx.tc.base), safe(ctx.tc.inc), safe(ctx.tc.corr),
    safe(ctx.ecoCode), safe(ctx.ecoUrl),
    safe(ctx.player && ctx.player.username), safe(ctx.meColor || ''), safe(ctx.player && ctx.player.rating), safe(ctx.playerResult), safe(ctx.playerOutcome), safe(ctx.playerScore),
    safe(ctx.opponent.username), safe(oppColor), safe(ctx.opponent.rating), safe(ctx.opponentResult), safe(ctx.opponentOutcome), safe(ctx.opponentScore),
    safe(ctx.accWhite), safe(ctx.accBlack),
    safe(ctx.pgnMoves), safe(ctx.tcn), safe(ctx.initialSetup), safe(ctx.fen),
    safe(ctx.archiveName),
    '', '', '', '', '', '', '', ''
  ];
}

function extractPgnHeader(pgn, key) {
  try {
    var re = new RegExp('\\[' + key + ' "([\\s\\S]*?)"\\]');
    var m = pgn.match(re);
    return m && m[1] ? m[1] : '';
  } catch (e) {
    return '';
  }
}

function parsePgnUtcToUnixSeconds(pgn) {
  try {
    if (!pgn) return null;
    var d = extractPgnHeader(pgn, 'UTCDate'); // e.g., 2025.08.02
    var t = extractPgnHeader(pgn, 'UTCTime'); // e.g., 13:52:33
    if (!d || !t) return null;
    var ds = d.replace(/\./g, '-');
    var iso = ds + 'T' + t + 'Z';
    var ms = Date.parse(iso);
    if (isNaN(ms)) return null;
    return Math.floor(ms / 1000);
  } catch (e) {
    return null;
  }
}

function extractPgnMoves(pgn) {
  try {
    if (!pgn) return '';
    var lines = String(pgn).split(/\r?\n/);
    var i = 0;
    // Skip header lines starting with [
    while (i < lines.length && /^\s*\[/.test(lines[i])) i++;
    // Skip blank line after headers
    if (i < lines.length && /^\s*$/.test(lines[i])) i++;
    return lines.slice(i).join(' ').trim();
  } catch (e) {
    return '';
  }
}

function mapResultToOutcome(result) {
  if (!result) return '';
  if (result === 'win') return 'win';
  if (result === 'agreed' || result === 'repetition' || result === 'stalemate' || result === 'insufficient' || result === '50move' || result === 'timevsinsufficient') return 'draw';
  return 'loss';
}

function scoreFromOutcome(outcome) {
  if (outcome === 'win') return 1;
  if (outcome === 'draw') return 0.5;
  if (outcome === 'loss') return 0;
  return '';
}

// normalizeEndReason removed per simplified spec

function transformArchiveToRows(meUsername, archiveJson) {
  if (!archiveJson || !archiveJson.games || !archiveJson.games.length) return [];
  var rows = [];
  for (var i = 0; i < archiveJson.games.length; i++) {
    rows.push(gameJsonToRow(meUsername, archiveJson.games[i]));
  }
  return rows;
}
