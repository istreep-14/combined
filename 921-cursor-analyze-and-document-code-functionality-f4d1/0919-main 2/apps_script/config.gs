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
    UnifiedGames: 'UnifiedGames',
    CallbackStats: 'CallbackStats',
    // Aggregations and live stats removed
    Logs: 'Logs'
  },
  HEADERS: {
    Archives: [
      'year', 'month', 'archive_url', 'status', 'etag', 'last_modified', 'last_checked',
      'schema_version', 'finalized', 'last_url_seen'
    ],
    // Games and GameMeta headers removed in unified-only mode
    UnifiedGames: [
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
      'archive_name'
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
    // Ratings/Stats/Live headers removed
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
