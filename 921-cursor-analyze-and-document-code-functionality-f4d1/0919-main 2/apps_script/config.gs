/**
 * Module: config
 * Purpose: Centralized configuration, sheet names, and canonical headers.
 */

// Removed legacy SETUP constants and applySetupFromCode()

const CONFIG = {
  PROJECT_NAME: 'Chess Ingest',
  FOLDER_NAME: 'Chess Ingest',
  SPREADSHEET_NAME: 'Chess Ingest',
  SCHEMA_VERSION: '1.0.0',
  SHEET_NAMES: {
    Archives: 'Archives',
    // Games and GameMeta removed in unified-only mode
    GameOpsLog: 'GameOpsLog',
    Games: 'Games',
    // Aggregations and live stats removed
    Logs: 'Logs',
    RatingState: 'RatingState',
    RatingsTimeline: 'RatingsTimeline',
    DailyRatings: 'DailyRatings',
    ManualAdjustments: 'ManualAdjustments',
    LiveStatsMeta: 'LiveStatsMeta',
    PlayerStatsLog: 'PlayerStatsLog'
  },
  HEADERS: {
    Archives: [
      'year', 'month', 'archive_url', 'status', 'etag', 'last_modified', 'last_checked',
      'schema_version', 'finalized', 'last_url_seen',
      'written_count', 'callback_applied_count', 'finalized_at'
    ],
    // Renamed unified monthly table to Games (Games_YYYY_MM)
    Games: [
      'url','id','is_live','rated','time_class','rules','format',
      'date','start_time','end_time','end_time_epoch','duration_seconds',
      'time_control','base_time','increment','correspondence_time',
      'eco_code','eco_url',
      'my_username','my_color','my_rating_end','my_result','my_outcome','my_score',
      'opp_username','opp_color','opp_rating_end','opp_result','opp_outcome','opp_score',
      'accuracy_white','accuracy_black',
      'my_rating_change_cb','opp_rating_change_cb','my_pregame_cb','opp_pregame_cb',
      'my_pregame_last','my_delta_last','opp_pregame_last','opp_delta_last',
      'ply_count','end_reason','move_timestamps_ds',
      'result_message',
      'my_country','my_membership','my_default_tab','my_post_move_action',
      'opp_country','opp_membership','opp_default_tab','opp_post_move_action',
      'archive_name'
    ],
    GameOpsLog: [
      'timestamp', 'url', 'operation', 'status', 'http_code', 'details_json'
    ],
    // Ratings/Stats/Live headers removed
    Logs: ['timestamp', 'level', 'code', 'message', 'context_json'],
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
    RatingState: [
      'format', 'last_event_ts', 'my_last_post', 'opp_last_post'
    ],
    RatingsTimeline: [
      'ts_epoch', 'local_date', 'format', 'source', 'my_rating', 'opp_rating', 'url', 'confidence'
    ],
    DailyRatings: [
      'date',
      'bullet_wins','bullet_losses','bullet_draws','bullet_games','bullet_duration_seconds','bullet_eod_rating',
      'blitz_wins','blitz_losses','blitz_draws','blitz_games','blitz_duration_seconds','blitz_eod_rating',
      'rapid_wins','rapid_losses','rapid_draws','rapid_games','rapid_duration_seconds','rapid_eod_rating',
      'daily_wins','daily_losses','daily_draws','daily_games','daily_duration_seconds','daily_eod_rating',
      'live960_wins','live960_losses','live960_draws','live960_games','live960_duration_seconds','live960_eod_rating',
      'daily960_wins','daily960_losses','daily960_draws','daily960_games','daily960_duration_seconds','daily960_eod_rating',
      'bughouse_wins','bughouse_losses','bughouse_draws','bughouse_games','bughouse_duration_seconds','bughouse_eod_rating',
      'crazyhouse_wins','crazyhouse_losses','crazyhouse_draws','crazyhouse_games','crazyhouse_duration_seconds','crazyhouse_eod_rating',
      'kingofthehill_wins','kingofthehill_losses','kingofthehill_draws','kingofthehill_games','kingofthehill_duration_seconds','kingofthehill_eod_rating',
      'threecheck_wins','threecheck_losses','threecheck_draws','threecheck_games','threecheck_duration_seconds','threecheck_eod_rating'
    ],
    ManualAdjustments: [
      'ts_epoch', 'local_date', 'format', 'source', 'my_rating', 'opp_rating', 'note'
    ],
    LiveStatsMeta: [
      'fetched_at', 'format', 'raw_json'
    ],
    PlayerStatsLog: [
      'fetched_at', 'format', 'last_rating', 'last_date_epoch', 'rd', 'best_rating', 'best_date_epoch', 'best_game_url', 'win', 'loss', 'draw', 'raw_json'
    ]
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
