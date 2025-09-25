/**
 * FIELD_REGISTRY: authoritative definition of all fields.
 * Each entry: { name, source, path, type, description, calc, write_to, is_core, priority }
 */

var FIELD_REGISTRY = (function(){
  var core = [
    { name:'url', source:'archive_json', path:'game.url', type:'string', description:'Canonical game URL', calc:'', write_to:'hub', is_core:true },
    { name:'rated', source:'archive_json', path:'game.rated', type:'boolean', description:'Rated flag', calc:'', write_to:'hub', is_core:true },
    { name:'time_class', source:'archive_json', path:'game.time_class', type:'string', description:'bullet|blitz|rapid|daily', calc:'normalize', write_to:'hub', is_core:true },
    { name:'rules', source:'archive_json', path:'game.rules', type:'string', description:'chess|chess960', calc:'normalize', write_to:'hub', is_core:true },
    { name:'format', source:'derived', path:'', type:'string', description:'normalized label', calc:'from time_class+rules', write_to:'hub', is_core:true },
    { name:'end_time_epoch', source:'archive_json', path:'game.end_time', type:'number', description:'Epoch seconds end', calc:'fallback to PGN UTCDate/UTCTime', write_to:'hub', is_core:true },
    { name:'start_time_local', source:'derived', path:'', type:'string', description:'Local start datetime', calc:'from UTCDate/UTCTime', write_to:'hub', is_core:true },
    { name:'end_time_local', source:'derived', path:'', type:'string', description:'Local end datetime', calc:'from end_time_epoch', write_to:'hub', is_core:true },
    { name:'date', source:'derived', path:'', type:'string', description:'yyyy-MM-dd (local)', calc:'from end_time_local', write_to:'hub', is_core:true },
    { name:'duration_seconds', source:'derived', path:'', type:'number', description:'end-start', calc:'from PGN times', write_to:'hub', is_core:true },
    { name:'time_control', source:'archive_json', path:'game.time_control', type:'string', description:'raw TC', calc:'', write_to:'hub', is_core:true },
    { name:'base_time', source:'derived', path:'', type:'number', description:'base time seconds', calc:'parse time_control', write_to:'hub', is_core:true },
    { name:'increment', source:'derived', path:'', type:'number', description:'increment seconds', calc:'parse time_control', write_to:'hub', is_core:true },
    { name:'correspondence_time', source:'derived', path:'', type:'number', description:'daily seconds per move', calc:'parse time_control', write_to:'hub', is_core:true },
    { name:'my_username', source:'archive_json', path:'game.white/black.username', type:'string', description:'Aligned to me', calc:'pick by configured username', write_to:'hub', is_core:true },
    { name:'my_color', source:'derived', path:'', type:'string', description:'white|black', calc:'compare username', write_to:'hub', is_core:true },
    { name:'my_rating_end', source:'archive_json', path:'player.rating', type:'number', description:'Post-game rating', calc:'aligned to me', write_to:'hub', is_core:true },
    { name:'my_outcome', source:'archive_json', path:'player.result', type:'string', description:'win|loss|draw', calc:'normalized', write_to:'hub', is_core:true },
    { name:'opp_username', source:'archive_json', path:'opponent.username', type:'string', description:'Opponent username', calc:'aligned', write_to:'hub', is_core:true },
    { name:'opp_color', source:'derived', path:'', type:'string', description:'opponent color', calc:'inverse of my_color', write_to:'hub', is_core:true },
    { name:'opp_rating_end', source:'archive_json', path:'opponent.rating', type:'number', description:'Opponent post-game rating', calc:'aligned', write_to:'hub', is_core:true },
    { name:'opp_outcome', source:'archive_json', path:'opponent.result', type:'string', description:'Opponent outcome', calc:'normalized', write_to:'hub', is_core:true },
    { name:'end_reason', source:'derived', path:'', type:'string', description:'Loser raw result or PGN Termination', calc:'policy mapping', write_to:'hub', is_core:true },
    // Hub meta
    { name:'archive_year', source:'derived', path:'', type:'string', description:'YYYY', calc:'from month key', write_to:'hub', is_core:false },
    { name:'archive_month', source:'derived', path:'', type:'string', description:'MM', calc:'from month key', write_to:'hub', is_core:false },
    { name:'archive_etag', source:'state', path:'', type:'string', description:'ETag at ingest', calc:'from month fetch', write_to:'hub', is_core:false },
    { name:'archive_last_modified', source:'state', path:'', type:'string', description:'Last-Modified at ingest', calc:'from month fetch', write_to:'hub', is_core:false },
    { name:'archive_sig', source:'derived', path:'', type:'string', description:'hash of minimal archive fields', calc:'hash', write_to:'hub', is_core:false },
    { name:'pgn_sig', source:'derived', path:'', type:'string', description:'hash of PGN headers/moves used', calc:'hash', write_to:'hub', is_core:false },
    { name:'schema_version', source:'state', path:'', type:'string', description:'schema version', calc:'const', write_to:'hub', is_core:false },
    { name:'ingest_version', source:'state', path:'', type:'string', description:'pipeline version', calc:'const', write_to:'hub', is_core:false },
    { name:'last_ingested_at', source:'state', path:'', type:'date', description:'timestamp', calc:'now', write_to:'hub', is_core:false },
    { name:'last_rechecked_at', source:'state', path:'', type:'date', description:'timestamp', calc:'now when rechecked', write_to:'hub', is_core:false },
    { name:'enrichment_status', source:'state', path:'', type:'string', description:'none|queued|partial|complete|dirty', calc:'state machine', write_to:'hub', is_core:false },
    { name:'enrichment_targets', source:'state', path:'', type:'string', description:'csv of planned targets', calc:'list', write_to:'hub', is_core:false },
    { name:'last_enrichment_applied_at', source:'state', path:'', type:'date', description:'timestamp', calc:'when a target finishes', write_to:'hub', is_core:false },
    { name:'last_enrichment_reason', source:'state', path:'', type:'string', description:'why export/enrichment ran', calc:'reason code', write_to:'hub', is_core:false },
    { name:'notes', source:'state', path:'', type:'string', description:'freeform notes', calc:'', write_to:'hub', is_core:false }
  ];

  var analysis = [
    { name:'eco_code', source:'pgn_header', path:'ECO', type:'string', description:'ECO code', calc:'from PGN', write_to:'spoke:analysis', is_core:false },
    { name:'eco_url', source:'pgn_header', path:'ECOUrl', type:'string', description:'ECO URL', calc:'from PGN', write_to:'spoke:analysis', is_core:false },
    { name:'pgn_moves', source:'pgn_body', path:'moves', type:'text', description:'PGN movetext (or link)', calc:'extract from PGN', write_to:'spoke:analysis', is_core:false },
    { name:'tcn', source:'archive_json', path:'game.tcn', type:'string', description:'TCN', calc:'', write_to:'spoke:analysis', is_core:false },
    { name:'initial_setup', source:'archive_json', path:'game.initial_setup', type:'string', description:'Start FEN for variants', calc:'', write_to:'spoke:analysis', is_core:false },
    { name:'fen', source:'archive_json', path:'game.fen', type:'string', description:'Final FEN', calc:'', write_to:'spoke:analysis', is_core:false },
    { name:'accuracies_white', source:'archive_json', path:'game.accuracies.white', type:'number', description:'White accuracy', calc:'', write_to:'spoke:analysis', is_core:false },
    { name:'accuracies_black', source:'archive_json', path:'game.accuracies.black', type:'number', description:'Black accuracy', calc:'', write_to:'spoke:analysis', is_core:false },
    { name:'tournament_url', source:'archive_json', path:'game.tournament', type:'string', description:'Tournament link', calc:'', write_to:'spoke:analysis', is_core:false },
    { name:'match_url', source:'archive_json', path:'game.match', type:'string', description:'Match link', calc:'', write_to:'spoke:analysis', is_core:false },
    { name:'white_result_raw', source:'archive_json', path:'game.white.result', type:'string', description:'Raw result', calc:'', write_to:'spoke:analysis', is_core:false },
    { name:'black_result_raw', source:'archive_json', path:'game.black.result', type:'string', description:'Raw result', calc:'', write_to:'spoke:analysis', is_core:false },
    { name:'termination_raw', source:'pgn_header', path:'Termination', type:'string', description:'PGN termination', calc:'', write_to:'spoke:analysis', is_core:false }
  ];

  var callback = [
    { name:'my_rating_change', source:'callback_json', path:'game.ratingChange or ratingChangeWhite/Black', type:'number', description:'My exact delta', calc:'normalize per color', write_to:'spoke:callback', is_core:false },
    { name:'opp_rating_change', source:'callback_json', path:'game.ratingChange or ratingChangeWhite/Black', type:'number', description:'Opponent exact delta', calc:'normalize per color', write_to:'spoke:callback', is_core:false },
    { name:'my_pregame_rating', source:'callback_json', path:'players.(top/bottom).rating', type:'number', description:'My pregame rating', calc:'pick by color', write_to:'spoke:callback', is_core:false },
    { name:'opp_pregame_rating', source:'callback_json', path:'players.(top/bottom).rating', type:'number', description:'Opp pregame rating', calc:'pick by color', write_to:'spoke:callback', is_core:false },
    { name:'result_message', source:'callback_json', path:'game.resultMessage', type:'string', description:'Result message', calc:'', write_to:'spoke:callback', is_core:false },
    { name:'ply_count', source:'callback_json', path:'game.plyCount', type:'number', description:'Ply count', calc:'', write_to:'spoke:callback', is_core:false },
    { name:'base_time1', source:'callback_json', path:'game.baseTime1', type:'number', description:'Base time 1', calc:'', write_to:'spoke:callback', is_core:false },
    { name:'time_increment1', source:'callback_json', path:'game.timeIncrement1', type:'number', description:'Increment 1', calc:'', write_to:'spoke:callback', is_core:false },
    { name:'move_timestamps_ds', source:'callback_json', path:'game.moveTimestamps', type:'text', description:'Move timestamps dense string', calc:'quote/prefix for Sheets', write_to:'spoke:callback', is_core:false },
    { name:'my_country', source:'callback_json', path:'players.(top/bottom).countryName', type:'string', description:'My country', calc:'', write_to:'spoke:callback', is_core:false },
    { name:'my_membership', source:'callback_json', path:'players.(top/bottom).membershipCode', type:'string', description:'My membership', calc:'', write_to:'spoke:callback', is_core:false },
    { name:'my_default_tab', source:'callback_json', path:'players.(top/bottom).defaultTab', type:'string', description:'My default tab', calc:'', write_to:'spoke:callback', is_core:false },
    { name:'my_post_move_action', source:'callback_json', path:'players.(top/bottom).postMoveAction', type:'string', description:'My post move', calc:'', write_to:'spoke:callback', is_core:false },
    { name:'opp_country', source:'callback_json', path:'players.(top/bottom).countryName', type:'string', description:'Opp country', calc:'', write_to:'spoke:callback', is_core:false },
    { name:'opp_membership', source:'callback_json', path:'players.(top/bottom).membershipCode', type:'string', description:'Opp membership', calc:'', write_to:'spoke:callback', is_core:false },
    { name:'opp_default_tab', source:'callback_json', path:'players.(top/bottom).defaultTab', type:'string', description:'Opp default tab', calc:'', write_to:'spoke:callback', is_core:false },
    { name:'opp_post_move_action', source:'callback_json', path:'players.(top/bottom).postMoveAction', type:'string', description:'Opp post move', calc:'', write_to:'spoke:callback', is_core:false }
  ];

  return core.concat(analysis).concat(callback);
})();

function getHeaderFor(target) {
  var arr;
  if (target === 'hub') {
    arr = FIELD_REGISTRY.filter(function(f){ return f.write_to==='hub'; });
  } else if (target === 'spoke:analysis') {
    arr = FIELD_REGISTRY.filter(function(f){ return f.write_to==='spoke:analysis'; });
  } else if (target === 'spoke:callback') {
    arr = FIELD_REGISTRY.filter(function(f){ return f.write_to==='spoke:callback'; });
  } else if (target === 'allgames_core') {
    arr = FIELD_REGISTRY.filter(function(f){ return f.write_to==='hub' && f.is_core; });
  } else if (target === 'all') {
    // union: hub + analysis + callback (unique names)
    var names = {};
    var out = [];
    ['hub','spoke:analysis','spoke:callback'].forEach(function(t){
      FIELD_REGISTRY.forEach(function(f){
        if ((t==='hub' && f.write_to==='hub') || (t!=='hub' && f.write_to===t)) {
          if (!names[f.name]) { names[f.name]=true; out.push(f.name); }
        }
      });
    });
    // Ensure url is first
    out = out.filter(function(n){ return n!=='url'; });
    out.unshift('url');
    return out;
  } else if (target === 'all_no_callback') {
    var names2 = {};
    var out2 = [];
    ['hub','spoke:analysis'].forEach(function(t){
      FIELD_REGISTRY.forEach(function(f){
        if ((t==='hub' && f.write_to==='hub') || (t!=='hub' && f.write_to===t)) {
          if (!names2[f.name]) { names2[f.name]=true; out2.push(f.name); }
        }
      });
    });
    out2 = out2.filter(function(n){ return n!=='url'; });
    out2.unshift('url');
    return out2;
  } else {
    arr = [];
  }
  return arr.map(function(f){ return f.name; });
}

function getMetaHeader() {
  return [
    'url',
    'archive_year','archive_month','archive_etag','archive_last_modified',
    'archive_sig','pgn_sig','schema_version','ingest_version',
    'last_ingested_at','last_rechecked_at',
    'enrichment_status','enrichment_targets','last_enrichment_applied_at','last_enrichment_reason','notes',
    // per-enrichment status blocks (start with callback)
    'callback_status','callback_queued_at','callback_applied_at','callback_reason'
  ];
}

