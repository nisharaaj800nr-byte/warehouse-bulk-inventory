import { randomUUID } from 'node:crypto';
import type { Db } from '../db/index.js';
import { hashPassword } from '../auth/password.js';
import { authenticate } from '../services/authService.js';
import { ROLES, type Role } from '../auth/tokens.js';
import { ApiError } from '../lib/errors.js';
import { writeAudit } from '../lib/audit.js';
import { parseWorkbookToRows } from '../services/fileImport.js';
import { upsertInventory } from '../services/importService.js';
import { loadRules } from '../services/rulesEngine.js';
import type { MappedRow } from '../services/rulesEngine.js';
import { stageUpload } from '../services/staging.js';

/**
 * Second half of the panel compatibility bridge: everything that writes
 * configuration or drives the import screen. Kept separate from `legacy.ts`
 * so the read-only surface stays small and easy to audit.
 */

const PANEL_SOURCE_NAME = 'Panel Import';
const MAX_STAGED_ROWS = 5000;

interface StagedFileRow {
  id: string;
  filename: string;
  headers_json: string;
  rows_json: string;
  created_by: string | null;
  created_at: string;
}

function num(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value: unknown, fallback = true): number {
  if (value === undefined || value === null || value === '') return fallback ? 1 : 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const text = String(value).toLowerCase();
  return text === 'true' || text === 'yes' || text === '1' || text === 'on' ? 1 : 0;
}

function ensurePanelSource(db: Db): { id: number; source_type: string } {
  const existing = db.prepare('SELECT id, source_type FROM sources WHERE name = ?').get(PANEL_SOURCE_NAME) as
    | { id: number; source_type: string }
    | undefined;
  if (existing) return existing;

  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO sources (name, source_type, sheet_name, join_key, is_active, created_at, updated_at)
       VALUES (?, 'OTHER', NULL, 'barcode', 1, ?, ?)`
    )
    .run(PANEL_SOURCE_NAME, now, now);
  return { id: Number(result.lastInsertRowid), source_type: 'OTHER' };
}

function loadStagedFile(db: Db, staging: string): StagedFileRow {
  const row = db.prepare('SELECT * FROM import_files WHERE id = ?').get(staging) as StagedFileRow | undefined;
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Uploaded file was not found or already expired');
  return row;
}

export async function dispatchExtended(
  db: Db,
  action: string,
  params: Record<string, unknown>,
  role: Role | null,
  email: string | null,
  ip: string | undefined,
  ttlHours: number
): Promise<unknown> {
  const adminOnly = (): void => {
    if (!role || !['ADMIN', 'OWNER'].includes(role)) {
      throw new ApiError(403, 'FORBIDDEN', 'Administrator role required');
    }
  };
  const writerOnly = (): void => {
    if (!role || !['ADMIN', 'OWNER', 'MANAGER', 'OPERATOR'].includes(role)) {
      throw new ApiError(403, 'FORBIDDEN', 'Your role cannot change data');
    }
  };

  switch (action) {
    /* ---------------- panel import flow ---------------- */
    case 'import.fileB64': {
      writerOnly();
      const base64 = String(params.b64 ?? '');
      const fileName = String(params.fileName ?? 'upload');
      if (!base64) throw new ApiError(400, 'BAD_REQUEST', 'File content is required');

      const parsed = parseWorkbookToRows(fileName, Buffer.from(base64, 'base64'));
      if (parsed.rows.length > MAX_STAGED_ROWS) {
        throw new ApiError(400, 'BAD_REQUEST', `File has ${parsed.rows.length} rows; the limit is ${MAX_STAGED_ROWS}`);
      }

      const staging = randomUUID();
      db.prepare(
        'INSERT INTO import_files (id, filename, headers_json, rows_json, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(
        staging,
        fileName,
        JSON.stringify(parsed.headers),
        JSON.stringify(parsed.rows),
        email,
        new Date().toISOString()
      );

      const preview = parsed.rows
        .slice(0, 20)
        .map((row) => parsed.headers.map((header) => String((row as Record<string, unknown>)[header] ?? '')));

      return {
        ok: true,
        fileName,
        format: fileName.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx',
        staging,
        headers: parsed.headers,
        totalRows: parsed.rows.length,
        totalCols: parsed.headers.length,
        preview,
        activeTab: parsed.sheetName,
        warnings: [] as string[]
      };
    }

    case 'import.previewPage': {
      const staging = String(params.staging ?? '');
      if (!staging) throw new ApiError(400, 'BAD_REQUEST', 'staging id is required');
      const file = loadStagedFile(db, staging);
      const headers = JSON.parse(file.headers_json) as string[];
      const rows = JSON.parse(file.rows_json) as Array<Record<string, unknown>>;
      const offset = Math.max(0, num(params.offset, 0));
      const limit = Math.min(500, Math.max(1, num(params.limit, 100)));
      const page = rows.slice(offset, offset + limit);

      return {
        headers,
        rows: page.map((row) => headers.map((header) => String(row[header] ?? ''))),
        offset,
        totalRows: rows.length
      };
    }

    case 'import.commit': {
      writerOnly();
      const staging = String(params.staging ?? '');
      if (!staging) throw new ApiError(400, 'BAD_REQUEST', 'staging id is required');
      const file = loadStagedFile(db, staging);
      const headers = JSON.parse(file.headers_json) as string[];

      const rawRows = JSON.parse(file.rows_json) as Array<Record<string, unknown>>;
      const dryRun = params.dryRun === true;

      const supplied = Array.isArray(params.mapping) ? (params.mapping as Array<Record<string, unknown>>) : [];
      const mapping = supplied.length > 0
        ? supplied.map((entry) => ({
            sourceColumn: String(entry.sourceColumn ?? entry.column ?? ''),
            targetField: String(entry.targetField ?? entry.field ?? ''),
            isRequired: bool(entry.isRequired, false),
            active: bool(entry.active, true)
          }))
        : headers.map((header) => ({
            sourceColumn: header,
            targetField: /barcode|sku|imei/i.test(header)
              ? 'BARCODE'
              : /model/i.test(header)
                ? 'MODEL'
                : /brand/i.test(header)
                  ? 'BRAND'
                  : /status/i.test(header)
                    ? 'STATUS'
                    : /age/i.test(header)
                      ? 'STOCK_AGE'
                      : /loc|bin/i.test(header)
                        ? 'LOCATION'
                        : header,
            isRequired: /barcode|sku|imei/i.test(header) ? 1 : 0,
            active: 1
          }));

      if (mapping.length === 0 || !mapping.some((entry) => entry.targetField.toUpperCase() === 'BARCODE')) {
        throw new ApiError(400, 'BAD_REQUEST', 'Mapping must include a BARCODE target field');
      }

      const source = ensurePanelSource(db);
      const now = new Date().toISOString();
      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM field_mappings WHERE source_id = ?').run(source.id);
        const insertMapping = db.prepare(
          `INSERT INTO field_mappings (source_id, source_column, target_field, is_required, output_order, is_active)
           VALUES (?, ?, ?, ?, ?, ?)`
        );
        mapping.forEach((entry, index) => {
          insertMapping.run(source.id, entry.sourceColumn, entry.targetField.toUpperCase(), entry.isRequired, index + 1, entry.active);
        });
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }

      if (dryRun) {
        const staged = stageUpload(db, { sourceId: source.id, filename: file.filename, rows: rawRows, createdBy: email ?? 'panel' });
        db.prepare('DELETE FROM import_rows WHERE job_id = ?').run(staged.jobId);
        db.prepare('DELETE FROM import_errors WHERE job_id = ?').run(staged.jobId);
        db.prepare('DELETE FROM import_jobs WHERE id = ?').run(staged.jobId);
        return {
          ok: true,
          dryRun: true,
          processed: staged.rowsTotal,
          valid: staged.rowsOk,
          imported: 0,
          failed: staged.rowsFailed,
          skipped: 0,
          warnings: [] as string[],
          errorSample: [] as Array<{ row: number; errors: string[] }>
        };
      }

      const staged = stageUpload(db, { sourceId: source.id, filename: file.filename, rows: rawRows, createdBy: email ?? 'panel' });
      const rules = loadRules(db);
      const rows = db
        .prepare('SELECT mapped_json FROM import_rows WHERE job_id = ? AND mapped_json IS NOT NULL')
        .all(staged.jobId) as unknown as Array<{ mapped_json: string }>;

      let inserted = 0;
      let updated = 0;
      db.exec('BEGIN');
      try {
        for (const row of rows) {
          const mapped = JSON.parse(row.mapped_json) as MappedRow;
          const result = upsertInventory(db, mapped, rules);
          if (result.action === 'inserted') inserted += 1;
          else updated += 1;
        }
        db.prepare('UPDATE import_jobs SET status = ?, finished_at = ? WHERE id = ?').run(
          staged.rowsFailed > 0 ? 'PARTIAL_FAILURE' : 'COMPLETE',
          new Date().toISOString(),
          staged.jobId
        );
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }

      const errorSample = db
        .prepare('SELECT row_number, message FROM import_errors WHERE job_id = ? ORDER BY row_number ASC LIMIT 20')
        .all(staged.jobId) as unknown as Array<{ row_number: number; message: string }>;

      db.prepare('DELETE FROM import_files WHERE id = ?').run(staging);
      writeAudit(db, {
        actorEmail: email,
        action: 'IMPORT_COMMITTED',
        entity: 'import_job',
        entityId: staged.jobId,
        details: { file: file.filename, imported: inserted + updated, failed: staged.rowsFailed },
        ip
      });

      return {
        ok: true,
        dryRun: false,
        processed: staged.rowsTotal,
        valid: staged.rowsOk,
        imported: inserted + updated,
        failed: staged.rowsFailed,
        skipped: 0,
        warnings: [] as string[],
        errorSample: errorSample.map((row) => ({ row: Number(row.row_number), errors: [row.message] }))
      };
    }

    case 'import.discard': {
      writerOnly();
      const staging = String(params.staging ?? '');
      if (staging) db.prepare('DELETE FROM import_files WHERE id = ?').run(staging);
      return { ok: true };
    }

    /* ---------------- sources & mapping ---------------- */
    case 'sources.save': {
      adminOnly();
      const id = params.id !== undefined && params.id !== '' ? num(params.id, 0) : 0;
      const name = String(params.name ?? params.sourceName ?? '').trim();
      const sourceType = String(params.sourceType ?? params.type ?? 'OTHER').toUpperCase();
      const sheetName = params.sheetName === undefined ? null : String(params.sheetName);
      const joinKey = String(params.joinKey ?? 'barcode');
      const active = bool(params.active, true);
      if (!name) throw new ApiError(400, 'BAD_REQUEST', 'Source name is required');
      if (!['QC_STOCK', 'TRC', 'INVENTORY', 'LOCATION', 'OTHER'].includes(sourceType)) {
        throw new ApiError(400, 'BAD_REQUEST', `Unknown source type ${sourceType}`);
      }

      const now = new Date().toISOString();
      if (id > 0) {
        const existing = db.prepare('SELECT id FROM sources WHERE id = ?').get(id) as { id: number } | undefined;
        if (!existing) throw new ApiError(404, 'NOT_FOUND', `Source ${id} not found`);
        db.prepare(
          'UPDATE sources SET name = ?, source_type = ?, sheet_name = ?, join_key = ?, is_active = ?, updated_at = ? WHERE id = ?'
        ).run(name, sourceType, sheetName, joinKey, active, now, id);
        return { id: String(id) };
      }

      const duplicate = db.prepare('SELECT id FROM sources WHERE name = ?').get(name) as { id: number } | undefined;
      if (duplicate) throw new ApiError(409, 'DUPLICATE', `Source ${name} already exists`);

      const result = db
        .prepare(
          `INSERT INTO sources (name, source_type, sheet_name, join_key, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(name, sourceType, sheetName, joinKey, active, now, now);
      return { id: String(Number(result.lastInsertRowid)) };
    }

    case 'mapping.list': {
      const rows = db
        .prepare(
          `SELECT m.*, s.name AS source_name, s.id AS source_id
           FROM field_mappings m JOIN sources s ON s.id = m.source_id
           ORDER BY s.name ASC, m.output_order ASC`
        )
        .all() as unknown as Array<{
        source_id: number;
        source_name: string;
        source_column: string;
        target_field: string;
        is_required: number;
        is_active: number;
      }>;
      return rows.map((row) => ({
        sourceId: String(row.source_id),
        source: row.source_name,
        sourceColumn: row.source_column,
        targetField: row.target_field,
        isRequired: Number(row.is_required) === 1,
        active: Number(row.is_active) === 1
      }));
    }

    case 'mapping.headers': {
      const file = db.prepare('SELECT headers_json FROM import_files ORDER BY created_at DESC LIMIT 1').get() as
        | { headers_json: string }
        | undefined;
      return { headers: file ? (JSON.parse(file.headers_json) as string[]) : [] };
    }

    case 'mapping.save': {
      adminOnly();
      const incoming = Array.isArray(params.mappings) ? (params.mappings as Array<Record<string, unknown>>) : [];
      if (incoming.length === 0) throw new ApiError(400, 'BAD_REQUEST', 'No mappings supplied');

      const bySource = new Map<number, Array<Record<string, unknown>>>();
      for (const entry of incoming) {
        const sourceId = num(entry.sourceId, 0);
        if (sourceId <= 0) throw new ApiError(400, 'BAD_REQUEST', 'Each mapping needs a sourceId');
        const list = bySource.get(sourceId) ?? [];
        list.push(entry);
        bySource.set(sourceId, list);
      }

      const now = new Date().toISOString();
      let saved = 0;
      db.exec('BEGIN');
      try {
        const insert = db.prepare(
          `INSERT INTO field_mappings (source_id, source_column, target_field, is_required, output_order, is_active)
           VALUES (?, ?, ?, ?, ?, ?)`
        );
        for (const [sourceId, entries] of bySource) {
          const source = db.prepare('SELECT id FROM sources WHERE id = ?').get(sourceId) as { id: number } | undefined;
          if (!source) throw new ApiError(404, 'NOT_FOUND', `Source ${sourceId} not found`);
          db.prepare('DELETE FROM field_mappings WHERE source_id = ?').run(sourceId);
          entries.forEach((entry, index) => {
            insert.run(
              sourceId,
              String(entry.sourceColumn ?? ''),
              String(entry.targetField ?? '').toUpperCase(),
              bool(entry.isRequired, false),
              index + 1,
              bool(entry.active, true)
            );
            saved += 1;
          });
          db.prepare('UPDATE sources SET updated_at = ? WHERE id = ?').run(now, sourceId);
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return { saved };
    }

    /* ---------------- rules ---------------- */
    case 'rules.age.save': {
      adminOnly();
      const id = num(params.id, 0);
      const minAge = num(params.minAge ?? params.min_age, -1);
      const maxAge = num(params.maxAge ?? params.max_age, -1);
      const bucket = String(params.bucket ?? '').trim();
      const priority = String(params.priority ?? 'P2').trim();
      if (minAge < 0 || maxAge < minAge || !bucket) {
        throw new ApiError(400, 'BAD_REQUEST', 'minAge, maxAge and bucket are required (maxAge >= minAge)');
      }
      const active = bool(params.active, true);
      if (id > 0) {
        db.prepare('UPDATE age_rules SET min_age = ?, max_age = ?, bucket = ?, priority = ?, is_active = ? WHERE id = ?').run(
          minAge,
          maxAge,
          bucket,
          priority,
          active,
          id
        );
      } else {
        db.prepare('INSERT INTO age_rules (min_age, max_age, bucket, priority, is_active) VALUES (?, ?, ?, ?, ?)').run(
          minAge,
          maxAge,
          bucket,
          priority,
          active
        );
      }
      return { saved: true };
    }

    case 'rules.status.save': {
      adminOnly();
      const id = num(params.id, 0);
      const rawStatus = String(params.rawStatus ?? params.raw_status ?? '').trim();
      const bucket = String(params.bucket ?? '').trim();
      if (!rawStatus || !bucket) throw new ApiError(400, 'BAD_REQUEST', 'rawStatus and bucket are required');
      const marking = params.marking === undefined ? null : String(params.marking);
      const active = bool(params.active, true);

      if (id > 0) {
        db.prepare('UPDATE status_rules SET raw_status = ?, bucket = ?, marking = ?, is_active = ? WHERE id = ?').run(
          rawStatus,
          bucket,
          marking,
          active,
          id
        );
        return { saved: true };
      }
      const duplicate = db.prepare('SELECT id FROM status_rules WHERE raw_status = ?').get(rawStatus) as
        | { id: number }
        | undefined;
      if (duplicate) {
        db.prepare('UPDATE status_rules SET bucket = ?, marking = ?, is_active = ? WHERE id = ?').run(
          bucket,
          marking,
          active,
          duplicate.id
        );
        return { saved: true };
      }
      db.prepare('INSERT INTO status_rules (raw_status, bucket, marking, is_active) VALUES (?, ?, ?, ?)').run(
        rawStatus,
        bucket,
        marking,
        active
      );
      return { saved: true };
    }

    case 'rules.location.save': {
      adminOnly();
      const id = num(params.id, 0);
      const pattern = String(params.pattern ?? '').trim();
      const bucket = String(params.bucket ?? '').trim();
      if (!pattern || !bucket) throw new ApiError(400, 'BAD_REQUEST', 'pattern and bucket are required');
      const condition = params.condition === undefined ? null : String(params.condition);
      const active = bool(params.active, true);
      if (id > 0) {
        db.prepare('UPDATE location_rules SET pattern = ?, bucket = ?, condition = ?, is_active = ? WHERE id = ?').run(
          pattern,
          bucket,
          condition,
          active,
          id
        );
      } else {
        db.prepare('INSERT INTO location_rules (pattern, bucket, condition, is_active) VALUES (?, ?, ?, ?)').run(
          pattern,
          bucket,
          condition,
          active
        );
      }
      return { saved: true };
    }

    /* ---------------- alerts ---------------- */
    case 'alerts.save': {
      adminOnly();
      const name = String(params.name ?? '').trim();
      const type = String(params.type ?? 'AGE_OVER').toUpperCase();
      const thresholdValue = num(params.thresholdValue ?? params.threshold, 0);
      if (!name) throw new ApiError(400, 'BAD_REQUEST', 'Alert name is required');
      if (!['AGE_OVER', 'STATUS_BUCKET_COUNT', 'MISSING_FIELD'].includes(type)) {
        throw new ApiError(400, 'BAD_REQUEST', `Unknown alert type ${type}`);
      }
      const filters = params.filters ? JSON.stringify(params.filters) : null;
      const active = bool(params.active, true);
      const now = new Date().toISOString();

      const existing = db.prepare('SELECT id FROM alerts WHERE name = ?').get(name) as { id: number } | undefined;
      if (existing) {
        db.prepare(
          'UPDATE alerts SET type = ?, threshold_value = ?, filters_json = ?, is_active = ?, updated_at = ? WHERE id = ?'
        ).run(type, thresholdValue, filters, active, now, existing.id);
      } else {
        db.prepare(
          `INSERT INTO alerts (name, type, threshold_value, filters_json, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(name, type, thresholdValue, filters, active, now, now);
      }
      return { saved: name };
    }

    case 'alerts.delete': {
      adminOnly();
      const name = String(params.name ?? '').trim();
      const result = db.prepare('DELETE FROM alerts WHERE name = ?').run(name);
      if (Number(result.changes) === 0) throw new ApiError(404, 'NOT_FOUND', `Alert ${name} not found`);
      return { deleted: name };
    }

    /* ---------------- users ---------------- */
    case 'users.save': {
      adminOnly();
      const userEmail = String(params.email ?? '').trim().toLowerCase();
      if (!userEmail) throw new ApiError(400, 'BAD_REQUEST', 'Email is required');
      const newRole = String(params.role ?? 'VIEWER').toUpperCase() as Role;
      if (!ROLES.includes(newRole)) throw new ApiError(400, 'BAD_REQUEST', `Unknown role ${newRole}`);
      const active = bool(params.active, true);
      const password = params.password === undefined ? '' : String(params.password);
      const now = new Date().toISOString();

      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(userEmail) as { id: number } | undefined;
      if (existing) {
        db.prepare('UPDATE users SET role = ?, is_active = ?, updated_at = ? WHERE id = ?').run(
          newRole,
          active,
          now,
          existing.id
        );
        if (password) {
          if (password.length < 8) throw new ApiError(400, 'BAD_REQUEST', 'Password must be at least 8 characters');
          db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
            await hashPassword(password),
            now,
            existing.id
          );
        }
        if (active === 0) {
          db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(now, existing.id);
        }
        return { saved: true, updated: true, passwordSet: password.length > 0 };
      }

      if (password.length < 8) throw new ApiError(400, 'BAD_REQUEST', 'A password of at least 8 characters is required');
      db.prepare(
        `INSERT INTO users (email, password_hash, role, is_active, failed_attempts, locked_until, last_login_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, NULL, NULL, ?, ?)`
      ).run(userEmail, await hashPassword(password), newRole, active, now, now);
      writeAudit(db, { actorEmail: email, action: 'USER_CREATED', entity: 'user', details: { email: userEmail, role: newRole }, ip });
      return { saved: true, updated: false, passwordSet: true };
    }

    case 'auth.resetPassword': {
      adminOnly();
      const userEmail = String(params.email ?? '').trim().toLowerCase();
      const newPassword = String(params.newPassword ?? '');
      if (!userEmail || newPassword.length < 8) {
        throw new ApiError(400, 'BAD_REQUEST', 'email and a password of at least 8 characters are required');
      }
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(userEmail) as { id: number } | undefined;
      if (!existing) throw new ApiError(404, 'NOT_FOUND', `User ${userEmail} not found`);
      db.prepare('UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?').run(
        await hashPassword(newPassword),
        new Date().toISOString(),
        existing.id
      );
      db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(
        new Date().toISOString(),
        existing.id
      );
      return { reset: true };
    }

    /* ---------------- first-run bootstrap ---------------- */
    case 'auth.bootstrap': {
      const userCount = Number((db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c);
      if (userCount > 0) {
        throw new ApiError(409, 'DUPLICATE', 'Setup already completed on this server â€” sign in instead');
      }

      const bootstrapEmail = String(params.email ?? '').trim().toLowerCase();
      const bootstrapPassword = String(params.password ?? '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(bootstrapEmail)) {
        throw new ApiError(400, 'BAD_REQUEST', 'Enter a valid email address');
      }
      if (bootstrapPassword.length < 8) {
        throw new ApiError(400, 'BAD_REQUEST', 'Password must be at least 8 characters');
      }

      const createdAt = new Date().toISOString();
      db.prepare(
        `INSERT INTO users (email, password_hash, role, is_active, failed_attempts, locked_until, last_login_at, created_at, updated_at)
         VALUES (?, ?, 'OWNER', 1, 0, NULL, NULL, ?, ?)`
      ).run(bootstrapEmail, await hashPassword(bootstrapPassword), createdAt, createdAt);

      writeAudit(db, {
        actorEmail: bootstrapEmail,
        action: 'OWNER_BOOTSTRAPPED',
        entity: 'user',
        details: { surface: 'setup-wizard' },
        ip
      });

      const session = await authenticate(db, { email: bootstrapEmail, password: bootstrapPassword, ip }, ttlHours);
      return {
        token: session.token,
        email: session.user.email,
        role: session.user.role,
        expiresAt: session.expiresAt
      };
    }

    /* ---------------- settings ---------------- */
    case 'settings.get': {
      const rows = db.prepare('SELECT key, value FROM settings').all() as unknown as Array<{ key: string; value: string }>;
      const result: Record<string, string> = {};
      for (const row of rows) result[row.key] = row.value;
      return result;
    }

    case 'settings.save': {
      adminOnly();
      const incoming = (params.settings ?? {}) as Record<string, string>;
      const now = new Date().toISOString();
      const statement = db.prepare(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
      );
      db.exec('BEGIN');
      try {
        for (const [key, value] of Object.entries(incoming)) statement.run(key, String(value), now);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return { saved: true };
    }

    /* ---------------- reports ---------------- */
    case 'reports.generate': {
      const groupBy = String(params.groupBy ?? 'status');
      const allowed: Record<string, string> = {
        status: 'status',
        brand: 'brand',
        age_bucket: 'age_bucket',
        status_bucket: 'status_bucket',
        location: 'location',
        bin_bucket: 'bin_bucket',
        model: 'model'
      };
      const column = allowed[groupBy.toLowerCase()];
      if (!column) throw new ApiError(400, 'BAD_REQUEST', `Unknown groupBy ${groupBy}`);

      const groups = db
        .prepare(
          `SELECT COALESCE(${column}, '(empty)') AS key, COUNT(*) AS count
           FROM inventory GROUP BY key ORDER BY count DESC, key ASC`
        )
        .all() as unknown as Array<{ key: string; count: number }>;
      const total = groups.reduce((sum, group) => sum + Number(group.count), 0);

      return {
        report: `inventory by ${groupBy}`,
        rows: total,
        groupBy,
        groups: groups.map((group) => ({ key: group.key, count: Number(group.count) }))
      };
    }

    default:
      throw new ApiError(501, 'UNSUPPORTED', `Action ${action} is not available on the local server yet`);
  }
}
