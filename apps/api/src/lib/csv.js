const { AppError } = require('./errors');

const MAX_DATA_ROWS = 2000;

/**
 * RFC 4180 CSV parser (quoted fields, "" escapes, CRLF/LF, UTF-8 BOM). Returns an array of rows,
 * each an array of strings; blank lines are dropped. Files are parsed in memory, so the caller
 * must cap the input size (the JSON body limit does).
 */
function parseCsv(text) {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === '') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (inQuotes) throw AppError.badRequest('The CSV file has an unclosed quote (")');
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

const normalizeHeader = (header) =>
  header
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

/**
 * Parses a CSV with a header row into records keyed by known column names.
 * `columns` = [{ key, required? }]. Unknown or missing required columns are a file-level 400.
 * Each record is { rowNumber, values } where rowNumber is the line as shown in a spreadsheet.
 */
function parseCsvRecords(text, columns, { maxRows = MAX_DATA_ROWS } = {}) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw AppError.badRequest('The file has no data rows below the header');
  if (rows.length - 1 > maxRows) {
    throw AppError.badRequest(
      `A file can have at most ${maxRows} rows. Split it into smaller files.`,
    );
  }

  const known = new Set(columns.map((column) => column.key));
  const headers = rows[0].map(normalizeHeader);
  const unknown = headers.filter((header) => header && !known.has(header));
  const missing = columns
    .filter((column) => column.required && !headers.includes(column.key))
    .map((column) => column.key);
  const duplicated = headers.filter((header, index) => header && headers.indexOf(header) !== index);
  if (unknown.length || missing.length || duplicated.length) {
    throw AppError.badRequest('The header row does not match the template', {
      unknownColumns: unknown,
      missingColumns: missing,
      duplicatedColumns: [...new Set(duplicated)],
    });
  }

  const records = rows.slice(1).map((cells, index) => {
    const values = {};
    headers.forEach((header, column) => {
      if (header) values[header] = (cells[column] ?? '').trim();
    });
    return { rowNumber: index + 2, values };
  });
  return { records };
}

// Values starting with these characters are formulas in spreadsheet apps (CSV injection).
const FORMULA_START = /^[=+\-@\t\r]/;

function toCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((value) => {
          let text = value === null || value === undefined ? '' : String(value);
          if (FORMULA_START.test(text)) text = `'${text}`;
          return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(','),
    )
    .join('\r\n');
}

module.exports = { parseCsv, parseCsvRecords, toCsv, MAX_DATA_ROWS };
