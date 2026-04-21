function isMpdHeaderRow(row) {
  const first = cleanCell(row?.values?.[0]).toUpperCase();
  const second = cleanCell(row?.values?.[1]).toUpperCase();
  return first === 'DESCRIPTION' && second === 'SAC CODE';
}

function sheetLooksLikeExampleSheet(sheet) {
  if (!sheet || !Array.isArray(sheet.rows) || !sheet.rows.length) return false;
  if (sheet.rows.some((row) => isMpdHeaderRow(row))) return true;

  let matchingRows = 0;
  for (const row of sheet.rows) {
    const first = cleanCell(row.values[0]);
    const codes = splitSacCodes(row.values[1]);
    if (!first || !codes.length) continue;
    if (SAC_CODE_RE.test(first)) continue;
    matchingRows += 1;
    if (matchingRows >= 3) return true;
  }
  return false;
}

function findMpdSheets(parsedSheets) {
  const explicitSheets = parsedSheets.filter((sheet) => sheetLooksLikeExampleSheet(sheet));
  if (explicitSheets.length) return explicitSheets;

  const byName = parsedSheets.filter((sheet) => /sheet\s*2|mpd|example/i.test(sheet.name));
  if (byName.length) return byName;

  return parsedSheets.length ? [parsedSheets[0]] : [];
}

function extractMpdRowsFromSheet(sheet, fileName) {
  const headerIndex = sheet.rows.findIndex((row) => isMpdHeaderRow(row));
  const startIndex = headerIndex >= 0 ? headerIndex + 1 : 0;
  const rows = [];

  for (const row of sheet.rows.slice(startIndex)) {
    const description = cleanCell(row.values[0]);
    const codes = splitSacCodes(row.values[1]);
    if (!description || !codes.length) continue;
    if (SAC_CODE_RE.test(description)) continue;
    rows.push({
      row: row.rowNumber,
      description,
      sac: codes.join('\n'),
      source: fileName,
      source_ref: `${sheet.name} row ${row.rowNumber}`,
      sheet_name: sheet.name,
    });
  }

  return rows;
}

function buildDbFromWorkbook(workbook, fileName) {
  const parsedSheets = workbook.SheetNames.map((name) => parseSheet(workbook, name));
  const definitions = extractDefinitions(parsedSheets, fileName);
  const mpdSheets = findMpdSheets(parsedSheets);
  const mpd = mpdSheets.flatMap((sheet) => extractMpdRowsFromSheet(sheet, fileName));
  const seen = new Set();
  const dedupedMpd = mpd.filter((row) => {
    const key = `${row.source_ref}|${row.description}|${row.sac}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const sheets = parsedSheets.map((sheet) => ({
    name: sheet.name,
    firstRow: sheet.firstRow,
    lastRow: sheet.lastRow,
    totalRows: sheet.totalRows,
    nonEmptyRows: sheet.nonEmptyRows,
    totalColumns: sheet.totalColumns,
  }));
  const totalRows = sheets.reduce((sum, sheet) => sum + Number(sheet.totalRows || 0), 0);
  const totalNonEmptyRows = sheets.reduce((sum, sheet) => sum + Number(sheet.nonEmptyRows || 0), 0);

  if (!definitions.length) {
    throw new Error('No SAC definition rows were found. Expected codes like CAB-CO_CARPFLO-0 in column A and descriptions in column B.');
  }
  if (!dedupedMpd.length) {
    throw new Error('No example rows with DESCRIPTION and SAC CODE were found across the workbook.');
  }

  return {
    sourceWorkbook: {
      fileName,
      importedAt: new Date().toISOString(),
      rule: 'Every recommendation must cite source_ref such as Sheet2 row 12.',
      sheets,
      totalRows,
      totalNonEmptyRows,
      mpdSheetName: mpdSheets.map((sheet) => sheet.name).join(', '),
      mpdSheetRows: mpdSheets.reduce((sum, sheet) => sum + Number(sheet.totalRows || 0), 0),
      mpdSheetNonEmptyRows: mpdSheets.reduce((sum, sheet) => sum + Number(sheet.nonEmptyRows || 0), 0),
      definitions: definitions.length,
      examples: dedupedMpd.length,
      exampleSheets: mpdSheets.map((sheet) => sheet.name),
    },
    definitions,
    mpd: dedupedMpd,
    apl: [],
    sacdb: [],
    sheet1: [],
  };
}

async function importExcelFile(file) {
  if (!window.XLSX) {
    throw new Error('Excel parser did not load. Check the CDN connection and refresh the page.');
  }
  setMessage(`Reading ${file.name}...`);
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const db = buildDbFromWorkbook(workbook, file.name);
  applyDb(db, file.name, 'Imported Excel', true);

  const sheetNames = Array.isArray(db?.sourceWorkbook?.exampleSheets) ? db.sourceWorkbook.exampleSheets.join(', ') : db?.sourceWorkbook?.mpdSheetName || '';
  const extra = sheetNames ? ` Example sheets: ${sheetNames}.` : '';
  setMessage(`Loaded ${file.name}: ${dbSummary(db)}. ${workbookRowsSummary(db)}.${extra}`);
}
