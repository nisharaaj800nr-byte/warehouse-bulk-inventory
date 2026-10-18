import type { Db } from '../db/index.js';
import { ApiError } from '../lib/errors.js';

export interface BulkPatch {
  status?: string | null;
  statusBucket?: string | null;
  location?: string | null;
  binBucket?: string | null;
  priority?: string | null;
}

const COLUMNS: Record<keyof BulkPatch, string> = {
  status: 'status',
  statusBucket: 'status_bucket',
  location: 'location',
  binBucket: 'bin_bucket',
  priority: 'priority'
};

export interface BulkResult {
  updated: number;
  matched: number;
}

/**
 * Applies one patch to many inventory rows by id or barcode in a single
 * transaction. Returns both matched and updated counts so the caller can tell
 * "nothing matched" apart from "values were already identical".
 */
export function bulkUpdate(
  db: Db,
  selector: { ids?: number[]; barcodes?: string[] },
  patch: BulkPatch
): BulkResult {
  const fields = Object.keys(patch).filter((key) => (patch as Record<string, unknown>)[key] !== undefined) as Array<
    keyof BulkPatch
  >;
  if (fields.length === 0) throw new ApiError(400, 'VALIDATION_ERROR', 'At least one patch field is required');

  const ids = selector.ids ?? [];
  const barcodes = selector.barcodes ?? [];
  if (ids.length === 0 && barcodes.length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Provide ids or barcodes');
  }

  const clauses: string[] = [];
  const values: Array<string | number> = [];
  if (ids.length > 0) {
    clauses.push(`id IN (${ids.map(() => '?').join(',')})`);
    values.push(...ids);
  }
  if (barcodes.length > 0) {
    clauses.push(`barcode IN (${barcodes.map(() => '?').join(',')})`);
    values.push(...barcodes);
  }
  const where = clauses.join(' OR ');

  const matchedRow = db.prepare(`SELECT COUNT(*) AS c FROM inventory WHERE ${where}`).get(...values) as { c: number };
  const matched = Number(matchedRow.c);
  if (matched === 0) return { updated: 0, matched: 0 };

  const sets = fields.map((field) => `${COLUMNS[field]} = ?`);
  const setValues: Array<string | null> = fields.map((field) => {
    const value = (patch as Record<string, unknown>)[field];
    return value === undefined || value === null ? null : String(value);
  });

  const now = new Date().toISOString();
  const result = db
    .prepare(`UPDATE inventory SET ${sets.join(', ')}, updated_at = ? WHERE ${where}`)
    .run(...setValues, now, ...values);

  return { updated: Number(result.changes), matched };
}
