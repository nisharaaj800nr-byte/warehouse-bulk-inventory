import * as XLSX from 'xlsx';
import { fail } from '../lib/errors.js';

export interface ParsedWorkbook {
  rows: Array<Record<string, unknown>>;
  sheetName: string;
  headers: string[];
}

const CSV_PATTERN = /\.csv$/i;

/**
 * Parses an uploaded .xlsx/.xls/.csv buffer into row objects keyed by the
 * first sheet's header row. Numbers are returned as strings so the mapper
 * owns all coercion (and can report a precise error per row).
 */
export function parseWorkbookToRows(filename: string, buffer: Buffer): ParsedWorkbook {
  if (buffer.length === 0) {
    throw fail.validation([{ path: 'contentBase64', message: 'Uploaded file is empty' }]);
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = CSV_PATTERN.test(filename)
      ? XLSX.read(buffer.toString('utf8'), { type: 'string', raw: false })
      : XLSX.read(buffer, { type: 'buffer' });
  } catch (error) {
    throw fail.validation([{ path: 'contentBase64', message: `Could not read file: ${(error as Error).message}` }]);
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw fail.validation([{ path: 'contentBase64', message: 'Workbook has no sheets' }]);
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw fail.validation([{ path: 'contentBase64', message: `Sheet "${sheetName}" is empty` }]);
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
  if (rows.length === 0) {
    throw fail.validation([{ path: 'contentBase64', message: 'File contains a header but no data rows' }]);
  }

  const headers = rows.length > 0 ? Object.keys(rows[0] as Record<string, unknown>) : [];
  return { rows, sheetName, headers };
}
