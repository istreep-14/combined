function discoverArchives(username) {
  const url = playerArchivesListUrl(username);
  const res = fetchJsonWithEtag(url);
  if (res.status !== 'ok' || !res.json || !res.json.archives) {
    throw new Error('Failed to fetch archives list: ' + (res.error || res.code));
  }
  const archives = res.json.archives;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1..12
  const rows = [];
  for (var i = 0; i < archives.length; i++) {
    var aurl = archives[i];
    var parsed = parseYearMonthFromArchiveUrl(aurl);
    if (!parsed) continue;
    var status = (parsed.year === currentYear && parsed.month === currentMonth) ? 'active' : 'inactive';
    rows.push([
      String(parsed.year), pad2(parsed.month), aurl, status,
      '', '', new Date(),
      CONFIG.SCHEMA_VERSION, '', ''
    ]);
  }
  return rows;
}

function parseYearMonthFromArchiveUrl(archiveUrl) {
  try {
    var parts = archiveUrl.split('/');
    var len = parts.length;
    var month = parseInt(parts[len - 1], 10);
    var year = parseInt(parts[len - 2], 10);
    if (!year || !month) return null;
    return { year: year, month: month };
  } catch (e) {
    return null;
  }
}

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

function writeArchivesSheet(ss, rows) {
  const sheet = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.Archives, CONFIG.HEADERS.Archives);
  // Clear existing data except header
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }
  writeRowsChunked(sheet, rows, 2);
}
