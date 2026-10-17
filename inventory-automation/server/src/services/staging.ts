import type { Db } from '../db/index.js';
import { fail } from '../lib/errors.js';
import { loadMappings, mapRow } from './importService.js';

export interface StageUploadInput {
  sourceId: number;
  filename: string | null;
  rows: Array<Record<string, unknown>>;
  createdBy: string;
}

export interface StageUploadResult {
  jobId: number;
  rowsTotal: number;
  rowsOk: number;
  rowsFailed: number;
  status: string;
}

/**
 * Validates the source and its mapping, then stages every row of an upload in
 * one transaction. Row-level problems are recorded per row instead of failing
 * the whole file, so the operator can see exactly what to fix.
 */
export function stageUpload(db: Db, input: StageUploadInput): StageUploadResult {
  const source = db.prepare('SELECT id, name, source_type, is_active FROM sources WHERE id = ?').get(input.sourceId) as
    | { id: number; name: string; source_type: string; is_active: number }
    | undefined;
  if (!source) throw fail.notFound(`Source ${input.sourceId} not found`);
  if (Number(source.is_active) !== 1) {
    throw fail.validation([{ path: 'sourceId', message: 'Source is inactive' }]);
  }

  const mappings = loadMappings(db, input.sourceId);
  if (mappings.length === 0) {
    throw fail.validation([{ path: 'sourceId', message: 'Source has no field mapping configured' }]);
  }

  const now = new Date().toISOString();
  let jobId = 0;
  let ok = 0;
  let failedRows = 0;

  db.exec('BEGIN');
  try {
    const jobResult = db
      .prepare(
        `INSERT INTO import_jobs (kind, source_id, status, filename, rows_total, rows_ok, rows_failed, created_by, created_at)
         VALUES ('SINGLE', ?, 'UPLOADED', ?, ?, 0, 0, ?, ?)`
      )
      .run(input.sourceId, input.filename, input.rows.length, input.createdBy, now);
    jobId = Number(jobResult.lastInsertRowid);

    const insertRow = db.prepare(
      'INSERT INTO import_rows (job_id, row_number, barcode, mapped_json, error) VALUES (?, ?, ?, ?, ?)'
    );
    const insertError = db.prepare(
      'INSERT INTO import_errors (job_id, row_number, barcode, field, message) VALUES (?, ?, ?, ?, ?)'
    );

    input.rows.forEach((raw, index) => {
      const rowNumber = index + 1;
      const { mapped, errors } = mapRow(raw, mappings, source.source_type);

      if (!mapped) {
        failedRows += 1;
        insertRow.run(jobId, rowNumber, null, null, errors.map((error) => `${error.field}: ${error.message}`).join('; '));
        for (const error of errors) insertError.run(jobId, rowNumber, null, error.field, error.message);
        return;
      }

      ok += 1;
      insertRow.run(jobId, rowNumber, mapped.barcode, JSON.stringify(mapped), null);
    });

    db.prepare('UPDATE import_jobs SET rows_ok = ?, rows_failed = ? WHERE id = ?').run(ok, failedRows, jobId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { jobId, rowsTotal: input.rows.length, rowsOk: ok, rowsFailed: failedRows, status: 'UPLOADED' };
}
