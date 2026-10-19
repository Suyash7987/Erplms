// Values starting with these characters run as formulas in spreadsheet apps (CSV injection).
const FORMULA_START = /^[=+\-@\t\r]/;

export function toCsv(rows) {
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

/** Saves a Blob as a file. The BOM makes Excel open UTF-8 (Hindi names) correctly. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(rows, filename) {
  saveBlob(new Blob([`\uFEFF${toCsv(rows)}\r\n`], { type: 'text/csv;charset=utf-8' }), filename);
}
