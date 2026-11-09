// CSV export for the admin panel's tables, built in the browser (RFC 4180, CRLF line ends).

export type CsvValue = string | number | null | undefined;

const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/**
 * One cell: quoted when it holds a separator, quote or line break. Text that a spreadsheet would
 * run as a formula (= + - @, tab, carriage return at the start) gets a leading apostrophe.
 */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: CsvValue[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/**
 * Saves the rows as a .csv file. The byte order mark makes spreadsheet apps read the file as
 * UTF-8, so Turkish letters survive.
 */
export function downloadCsv(fileName: string, rows: CsvValue[][]) {
  const url = URL.createObjectURL(
    new Blob([BYTE_ORDER_MARK, toCsv(rows)], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
