function parseTimeControl(tc) {
  if (!tc) return { base: null, inc: null, corr: null };
  if (tc.indexOf('/') >= 0) {
    var parts = tc.split('/');
    var corr = parseInt(parts[1], 10);
    return { base: null, inc: null, corr: isNaN(corr) ? null : corr };
  }
  var base = null, inc = 0;
  var plus = tc.indexOf('+');
  if (plus >= 0) {
    base = parseInt(tc.substring(0, plus), 10);
    inc = parseInt(tc.substring(plus + 1), 10);
    if (isNaN(inc)) inc = 0;
  } else {
    base = parseInt(tc, 10);
    inc = 0;
  }
  return { base: isNaN(base) ? null : base, inc: inc, corr: null };
}

function toLocalDateTimeStringFromUnixSeconds(unixSeconds) {
  if (!unixSeconds && unixSeconds !== 0) return '';
  var tz = getProjectTimeZone();
  var date = new Date(unixSeconds * 1000);
  return Utilities.formatDate(date, tz, 'yyyy-MM-dd HH:mm:ss');
}

function deriveFormat(timeClass, rules, type) {
  timeClass = normalizeTimeClass(timeClass);
  rules = normalizeRules(rules);
  if (rules === 'chess960') {
    return type === 'daily' ? 'daily960' : 'live960';
  }
  if (rules && rules !== 'chess') return rules;
  if (timeClass) return timeClass;
  return '';
}

function computeDurationSeconds(startUnix, endUnix) {
  if (!endUnix || !startUnix) return '';
  var d = Math.max(0, (endUnix - startUnix));
  return d;
}

function pickPlayerColor(meUsername, whiteUsername, blackUsername) {
  if (!meUsername) return '';
  if (meUsername.toLowerCase() === String(whiteUsername || '').toLowerCase()) return 'white';
  if (meUsername.toLowerCase() === String(blackUsername || '').toLowerCase()) return 'black';
  return '';
}

function safe(val) {
  return (val === null || val === undefined) ? '' : val;
}

function normalizeTimeClass(tc) {
  try {
    var v = String(tc || '').trim().toLowerCase();
    if (!v) return '';
    var allowed = { bullet: true, blitz: true, rapid: true, daily: true };
    return allowed[v] ? v : v;
  } catch (e) { return String(tc || ''); }
}

function normalizeRules(r) {
  try {
    var v = String(r || '').trim().toLowerCase();
    if (!v) return '';
    var allowed = { chess: true, chess960: true, threecheck: true, kingofthehill: true, bughouse: true, crazyhouse: true };
    return allowed[v] ? v : v;
  } catch (e) { return String(r || ''); }
}
