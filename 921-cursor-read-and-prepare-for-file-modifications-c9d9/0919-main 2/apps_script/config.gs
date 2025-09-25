/**
 * Module: config
 * Purpose: Centralized configuration, sheet names, and canonical headers.
 */

// SETUP: Fill these values, run setupProject(), then set DONE to true.
const SETUP = {
  DONE: false, // set to true after setup is applied successfully
  CHESS_USERNAME: 'ians141',
  TIMEZONE: 'America/New_York', // optional; leave empty to use project timezone
  SPREADSHEET_NAME_GAMES: 'Chess Data - Games',
  SPREADSHEET_NAME_CALLBACKS: 'Chess Data - Callbacks',
  SPREADSHEET_NAME_RATINGS: 'Chess Data - Ratings',
  SPREADSHEET_NAME_STATS: 'Chess Data - Stats',
  SPREADSHEET_NAME_LIVESTATS: 'Chess Data - LiveStats',
  SPREADSHEET_NAME_ARCHIVES: 'Chess Data - Archives',
  SPREADSHEET_NAME_LOGS: 'Chess Data - Logs'
};

function applySetupFromCode() {
  if (!SETUP || SETUP.DONE !== false) return;
  const props = PropertiesService.getScriptProperties();
  if (SETUP.CHESS_USERNAME) props.setProperty('CHESS_USERNAME', SETUP.CHESS_USERNAME);
  if (SETUP.TIMEZONE) props.setProperty('TIMEZONE', SETUP.TIMEZONE);
  if (SETUP.SPREADSHEET_NAME_GAMES) props.setProperty('SPREADSHEET_NAME_GAMES', SETUP.SPREADSHEET_NAME_GAMES);
  if (SETUP.SPREADSHEET_NAME_CALLBACKS) props.setProperty('SPREADSHEET_NAME_CALLBACKS', SETUP.SPREADSHEET_NAME_CALLBACKS);
  if (SETUP.SPREADSHEET_NAME_RATINGS) props.setProperty('SPREADSHEET_NAME_RATINGS', SETUP.SPREADSHEET_NAME_RATINGS);
  if (SETUP.SPREADSHEET_NAME_STATS) props.setProperty('SPREADSHEET_NAME_STATS', SETUP.SPREADSHEET_NAME_STATS);
  if (SETUP.SPREADSHEET_NAME_LIVESTATS) props.setProperty('SPREADSHEET_NAME_LIVESTATS', SETUP.SPREADSHEET_NAME_LIVESTATS);
  if (SETUP.SPREADSHEET_NAME_ARCHIVES) props.setProperty('SPREADSHEET_NAME_ARCHIVES', SETUP.SPREADSHEET_NAME_ARCHIVES);
  if (SETUP.SPREADSHEET_NAME_LOGS) props.setProperty('SPREADSHEET_NAME_LOGS', SETUP.SPREADSHEET_NAME_LOGS);
}

const CONFIG = {
  PROJECT_NAME: 'Chess Ingest',
  FOLDER_NAME: 'Chess Ingest',
  SPREADSHEET_NAME: 'Chess Ingest',
  SCHEMA_VERSION: '1.0.0',
  CALLBACKS: { BATCH_SIZE: 30 },
  SHEET_NAMES: {
    Archives: 'Archives',
    Games: 'Games',
    GameMeta: 'GameMeta',
    GameOpsLog: 'GameOpsLog',
    CallbackStats: 'CallbackStats',
    DailyTotals: 'DailyTotals',
    // Ratings and Adjustments removed
    PlayerStats: 'PlayerStats',
    LiveStatsEOD: 'LiveStatsEOD',
    LiveStatsMeta: 'LiveStatsMeta',
    Logs: 'Logs'
  },
  HEADERS: {
    Archives: [
      'year', 'month', 'archive_url', 'status', 'etag', 'last_modified', 'last_checked',
      'schema_version', 'finalized', 'last_url_seen'
    ],
    Games: [
      'url',
      'date', 'start_time', 'end_time',
      'time_control',
      'rated',
      'format',
      'my_color', 'my_rating', 'my_outcome',
      'opponent_username', 'opponent_rating',
      'end_reason'
    ],
    GameMeta: [
      'url', 'id', 'is_live', 'rated', 'time_class', 'rules', 'format',
      'start_time_epoch', 'end_time_epoch', 'duration_seconds',
      'time_control', 'base_time', 'increment', 'correspondence_time',
      'eco_code', 'eco_url',
      'my_username', 'my_color', 'my_rating', 'my_result', 'my_outcome', 'my_score',
      'opp_username', 'opp_color', 'opp_rating', 'opp_result', 'opp_outcome', 'opp_score',
      'accuracy_white', 'accuracy_black',
      'pgn_moves', 'tcn', 'initial_setup', 'fen',
      'archive_name',
      'my_rating_change_cb', 'opp_rating_change_cb', 'my_pregame_cb', 'opp_pregame_cb',
      'my_pregame_last', 'my_delta_last', 'opp_pregame_last', 'opp_delta_last',
      'my_snapshot_bullet', 'my_snapshot_blitz', 'my_snapshot_rapid', 'my_snapshot_daily'
    ],
    GameOpsLog: [
      'timestamp', 'url', 'operation', 'status', 'http_code', 'details_json'
    ],
    CallbackStats: [
      'url', 'id', 'is_live',
      'my_color',
      'my_username', 'my_rating', 'my_rating_change', 'my_pregame_rating', 'my_country', 'my_membership', 'my_default_tab', 'my_post_move_action',
      'opp_username', 'opp_rating', 'opp_rating_change', 'opp_pregame_rating', 'opp_country', 'opp_membership', 'opp_default_tab', 'opp_post_move_action',
      'game_end_reason', 'result_message', 'end_time_epoch', 'ply_count',
      'base_time_ds', 'increment_ds', 'move_timestamps_ds',
      'fetched_at'
    ],
    DailyTotals: [
      'date', 'format', 'wins', 'losses', 'draws', 'duration_seconds', 'rating_begin_day', 'rating_end_day', 'rating_change'
    ],
    // Adjustments removed
    PlayerStats: [
      'timestamp', 'format', 'rating', 'rd', 'source', 'raw_json'
    ],
    LiveStatsEOD: [
      'date', 'format', 'eod_rating', 'rating_raw', 'day_close_rating_raw', 'timestamp_ms', 'day_index'
    ],
    LiveStatsMeta: [
      'fetched_at', 'format',
      'count', 'rated_count',
      'opponent_rating_avg', 'opponent_rating_win_avg', 'opponent_rating_draw_avg', 'opponent_rating_loss_avg',
      'white_game_count', 'black_game_count', 'white_win_count', 'white_draw_count', 'white_loss_count', 'black_win_count', 'black_draw_count', 'black_loss_count',
      'rating_last', 'rating_first', 'rating_max', 'rating_max_timestamp',
      'moves_count', 'streak_last', 'streak_max', 'streak_max_timestamp',
      'opponent_rating_max', 'opponent_rating_max_timestamp', 'opponent_rating_max_uuid',
      'accuracy_count', 'accuracy_avg', 'starting_day',
      'progress', 'rank', 'percentile', 'playersCount', 'friendRank', 'friendRankIsExpired'
    ],
    Logs: ['timestamp', 'level', 'code', 'message', 'context_json']
  }
};

function getScriptProps() {
  return PropertiesService.getScriptProperties();
}

function getConfiguredUsername() {
  const value = getScriptProps().getProperty('CHESS_USERNAME');
  if (!value) {
    throw new Error('Set CHESS_USERNAME in Script Properties.');
  }
  return value;
}

function getProjectTimeZone() {
  const tz = getScriptProps().getProperty('TIMEZONE');
  return tz || Session.getScriptTimeZone() || 'Etc/UTC';
}

function getProjectRootFolderName() {
  const overrideName = getScriptProps().getProperty('PROJECT_FOLDER_NAME');
  return overrideName || CONFIG.FOLDER_NAME;
}

function getSpreadsheetNameGames() {
  const props = getScriptProps();
  return props.getProperty('SPREADSHEET_NAME_GAMES') || (CONFIG.SPREADSHEET_NAME + ' - Data-Games');
}

function getSpreadsheetNameCallbacks() { const props = getScriptProps(); return props.getProperty('SPREADSHEET_NAME_CALLBACKS') || (CONFIG.SPREADSHEET_NAME + ' - Callbacks'); }
function getSpreadsheetNameRatings() { const props = getScriptProps(); return props.getProperty('SPREADSHEET_NAME_RATINGS') || (CONFIG.SPREADSHEET_NAME + ' - Ratings'); }
function getSpreadsheetNameStats() { const props = getScriptProps(); return props.getProperty('SPREADSHEET_NAME_STATS') || (CONFIG.SPREADSHEET_NAME + ' - Stats'); }
function getSpreadsheetNameLiveStats() { const props = getScriptProps(); return props.getProperty('SPREADSHEET_NAME_LIVESTATS') || (CONFIG.SPREADSHEET_NAME + ' - LiveStats'); }
function getSpreadsheetNameArchives() { const props = getScriptProps(); return props.getProperty('SPREADSHEET_NAME_ARCHIVES') || (CONFIG.SPREADSHEET_NAME + ' - Archives'); }
// Removed: getSpreadsheetNameDailyTotals
function getSpreadsheetNameLogs() { const props = getScriptProps(); return props.getProperty('SPREADSHEET_NAME_LOGS') || (CONFIG.SPREADSHEET_NAME + ' - Logs'); }

function setProjectProperties(obj) {
  const props = getScriptProps();
  Object.keys(obj || {}).forEach(function(k){
    if (obj[k] === undefined || obj[k] === null) return;
    props.setProperty(String(k), String(obj[k]));
  });
}
