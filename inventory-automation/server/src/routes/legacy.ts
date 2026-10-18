import { Router } from 'express';
import type { Db } from '../db/index.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { resolveSession, revokeSession, type Role } from '../auth/tokens.js';
import { ApiError } from '../lib/errors.js';
import { writeAudit } from '../lib/audit.js';
import { authenticate } from '../services/authService.js';
import { dispatchExtended } from './legacyExtended.js';
import { upsertInventory } from '../services/importService.js';
import { loadRules } from '../services/rulesEngine.js';

/**
 * Compatibility bridge for the existing React panel.
 *
 * The panel was written against the Apps Script contract:
 *   POST body  { action, params }   (token travels inside params.token)
 *   response   { status: 'ok', data } | { status: 'error', code, message }
 *
 * This router serves that exact contract from the local SQLite backend, so the
 * panel needs zero code changes - only its API URL has to point at /api/gas.
 * HTTP status is always 200 for handled actions because the panel decides by
 * the body, exactly like it did with Apps Script.
 */

const INVENTORY_HEADERS = [
  'BARCODE',
  'MODEL',
  'BRAND',
  'STATUS',
  'STOCK_AGE',
  'AGE_BUCKET',
  'PRIORITY',
  'STATUS_BUCKET',
  'LOCATION',
  'BIN_BUCKET',
  'SOURCE_TYPE'
] as const;

const FILTER_COLUMNS: Record<string, string> = {
  STATUS: 'status',
  STATUS_BUCKET: 'status_bucket',
  AGE_BUCKET: 'age_bucket',
  BRAND: 'brand',
  PRIORITY: 'priority',
  BIN_BUCKET: 'bin_bucket',
  LOCATION: 'location',
  SOURCE: 'source_type',
  SOURCE_TYPE: 'source_type'
};

const PUBLIC_ACTIONS = new Set(['health', 'auth.login', 'auth.logout', 'auth.bootstrap']);

interface InventoryRow {
  id: number;
  barcode: string;
  model: string | null;
  brand: string | null;
  status: string | null;
  stock_age: number | null;
  age_bucket: string | null;
  priority: string | null;
  status_bucket: string | null;
  location: string | null;
  bin_bucket: string | null;
  source_type: string | null;
  created_at: string;
  updated_at: string;
}

function rowToArray(row: InventoryRow): string[] {
  return [
    row.barcode,
    row.model ?? '',
    row.brand ?? '',
    row.status ?? '',
    row.stock_age === null ? '' : String(row.stock_age),
    row.age_bucket ?? '',
    row.priority ?? '',
    row.status_bucket ?? '',
    row.location ?? '',
    row.bin_bucket ?? '',
    row.source_type ?? ''
  ];
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function ok(data: unknown): { status: 'ok'; data: unknown } {
  return { status: 'ok', data };
}

export function legacyRouter(db: Db, sessionTtlHours: number): Router {
  const router = Router();

  router.post('/gas', async (req, res) => {
    let parsedBody: unknown = req.body;
    if (typeof parsedBody === 'string') {
      try {
        parsedBody = JSON.parse(parsedBody);
      } catch {
        res.status(200).json({ status: 'error', code: 'BAD_REQUEST', message: 'Body is not valid JSON' });
        return;
      }
    }
    const body = (parsedBody ?? {}) as { action?: string; params?: Record<string, unknown> };
    const action = String(body.action ?? '');
    const params = (body.params ?? {}) as Record<string, unknown>;

    try {
      if (!action) throw new ApiError(400, 'BAD_REQUEST', 'Missing action');

      const token = typeof params.token === 'string' ? params.token : '';
      const session = token ? resolveSession(db, token) : null;
      if (!PUBLIC_ACTIONS.has(action) && !session) {
        res.status(200).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'Please sign in again' });
        return;
      }

      const data = await dispatch(action, params, session?.role ?? null, session?.email ?? null, req.ip);
      res.status(200).json(ok(data));
    } catch (error) {
      if (error instanceof ApiError) {
        const code = error.status === 401 ? 'AUTH_REQUIRED' : error.code;
        res.status(200).json({ status: 'error', code, message: error.message });
        return;
      }
      res.status(200).json({
        status: 'error',
        code: 'BACKEND_ERROR',
        message: error instanceof Error ? error.message : 'Unexpected server error'
      });
    }
  });

  async function dispatch(
    action: string,
    params: Record<string, unknown>,
    role: Role | null,
    email: string | null,
    ip: string | undefined
  ): Promise<unknown> {
    switch (action) {
      case 'health':
        return {
          ok: true,
          db: 'connected',
          users: Number((db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c),
          version: 'local-1.0'
        };

      case 'auth.login': {
        const loginEmail = String(params.email ?? '');
        const password = String(params.password ?? '');
        if (!loginEmail || !password) throw new ApiError(400, 'BAD_REQUEST', 'Email and password are required');
        const result = await authenticate(db, { email: loginEmail, password, ip }, sessionTtlHours);
        return {
          token: result.token,
          email: result.user.email,
          role: result.user.role,
          expiresAt: result.expiresAt
        };
      }

      case 'auth.logout':
        if (typeof params.token === 'string' && params.token) revokeSession(db, params.token);
        return { revoked: true };

      case 'auth.whoami':
        return { email, role, expiresAt: null, legacy: false };

      case 'auth.changePassword': {
        if (!email) throw new ApiError(401, 'AUTH_REQUIRED', 'Not signed in');
        const currentPassword = String(params.oldPassword ?? params.currentPassword ?? '');
        const newPassword = String(params.newPassword ?? '');
        if (newPassword.length < 8) throw new ApiError(400, 'BAD_REQUEST', 'New password must be at least 8 characters');
        const row = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email) as
          | { id: number; password_hash: string }
          | undefined;
        if (!row) throw new ApiError(401, 'AUTH_REQUIRED', 'User no longer exists');
        if (!(await verifyPassword(currentPassword, row.password_hash))) {
          throw new ApiError(401, 'AUTH_REQUIRED', 'Current password is incorrect');
        }
        db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
          await hashPassword(newPassword),
          new Date().toISOString(),
          row.id
        );
        return { changed: true };
      }

      case 'dashboard': {
        const total = Number((db.prepare('SELECT COUNT(*) AS c FROM inventory').get() as { c: number }).c);
        const sourcesActive = Number(
          (db.prepare('SELECT COUNT(*) AS c FROM sources WHERE is_active = 1').get() as { c: number }).c
        );
        const reportsActive = Number(
          (db.prepare('SELECT COUNT(*) AS c FROM report_templates').get() as { c: number }).c
        );
        const runs = db
          .prepare(
            `SELECT kind, status, rows_total, rows_ok, rows_failed, created_at
             FROM import_jobs ORDER BY created_at DESC LIMIT 8`
          )
          .all() as unknown as Array<{
          kind: string;
          status: string;
          rows_total: number;
          rows_ok: number;
          rows_failed: number;
          created_at: string;
        }>;
        const errors = db
          .prepare('SELECT row_number, field, message FROM import_errors ORDER BY id DESC LIMIT 8')
          .all() as unknown as Array<{ row_number: number; field: string; message: string }>;

        return {
          inventoryCount: total,
          headers: [...INVENTORY_HEADERS],
          recentRuns: runs.map((run) => [run.kind, run.status, String(run.rows_ok), String(run.rows_failed), run.created_at]),
          recentErrors: errors.map((error) => [String(error.row_number), error.field, error.message]),
          sourcesActive,
          reportsActive
        };
      }

      case 'inventory.list': {
        const page = Math.max(1, Number(params.page ?? 1));
        const perPage = Math.min(200, Math.max(1, Number(params.perPage ?? params.pageSize ?? 50)));
        const q = String(params.q ?? '').trim();
        const filters = (params.filters ?? {}) as Record<string, string>;

        const clauses: string[] = [];
        const values: Array<string | number> = [];

        if (q) {
          clauses.push('(barcode LIKE ? OR model LIKE ? OR brand LIKE ?)');
          const like = `%${q}%`;
          values.push(like, like, like);
        }
        for (const [key, value] of Object.entries(filters)) {
          if (!value) continue;
          const column = FILTER_COLUMNS[key.toUpperCase()];
          if (!column) continue;
          clauses.push(`${column} = ?`);
          values.push(value);
        }

        const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
        const totalRow = db.prepare(`SELECT COUNT(*) AS c FROM inventory ${where}`).get(...values) as { c: number };
        const rows = db
          .prepare(`SELECT * FROM inventory ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
          .all(...values, perPage, (page - 1) * perPage) as unknown as InventoryRow[];

        return {
          rows: rows.map(rowToArray),
          total: Number(totalRow.c),
          headers: [...INVENTORY_HEADERS],
          page,
          perPage
        };
      }

      case 'inventory.save': {
        assertWriter(role);
        const item = (params.item ?? {}) as Record<string, string>;
        const barcode = String(item.BARCODE ?? item.barcode ?? '').trim();
        if (!barcode) throw new ApiError(400, 'BAD_REQUEST', 'Barcode is required');

        const mapped = {
          barcode,
          model: item.MODEL ?? item.model ?? null,
          brand: item.BRAND ?? item.brand ?? null,
          status: item.STATUS ?? item.status ?? null,
          stockAge: item.STOCK_AGE !== undefined && item.STOCK_AGE !== '' ? Number(item.STOCK_AGE) : null,
          location: item.LOCATION ?? item.location ?? null,
          sourceType: 'MANUAL'
        };
        const { action: mode } = upsertInventory(db, mapped, loadRules(db));
        writeAudit(db, { actorEmail: email, action: 'INVENTORY_SAVED', entity: 'inventory', entityId: barcode, ip });
        return { ok: true, barcode, mode };
      }

      case 'inventory.delete': {
        assertWriter(role);
        const barcode = String(params.barcode ?? '').trim();
        if (!barcode) throw new ApiError(400, 'BAD_REQUEST', 'Barcode is required');
        const result = db.prepare('DELETE FROM inventory WHERE barcode = ?').run(barcode);
        if (Number(result.changes) === 0) throw new ApiError(404, 'NOT_FOUND', `Barcode ${barcode} not found`);
        return { ok: true, barcode };
      }

      case 'inventory.export': {
        const requested = String(params.columns ?? '')
          .split(',')
          .map((column) => column.trim().toUpperCase())
          .filter((column) => (INVENTORY_HEADERS as readonly string[]).includes(column));
        const columns = requested.length > 0 ? requested : [...INVENTORY_HEADERS];

        const rows = db.prepare('SELECT * FROM inventory ORDER BY updated_at DESC').all() as unknown as InventoryRow[];
        const toObject = (row: InventoryRow): Record<string, string> => {
          const array = rowToArray(row);
          const record: Record<string, string> = {};
          INVENTORY_HEADERS.forEach((header, index) => {
            record[header] = array[index] as string;
          });
          return record;
        };

        const lines = [columns.join(',')];
        for (const row of rows) {
          const record = toObject(row);
          lines.push(columns.map((column) => csvCell(record[column])).join(','));
        }
        return { csv: lines.join('\r\n') + '\r\n', rows: rows.length };
      }

      case 'trends.list': {
        const series = db
          .prepare(
            `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count
             FROM inventory GROUP BY day ORDER BY day ASC LIMIT 90`
          )
          .all() as unknown as Array<{ day: string; count: number }>;
        return { headers: ['DAY', 'COUNT'], data: series.map((row) => [row.day, String(row.count)]) };
      }

      case 'sources.list': {
        const rows = db.prepare('SELECT * FROM sources ORDER BY name ASC').all() as unknown as Array<{
          id: number;
          name: string;
          source_type: string;
          sheet_name: string | null;
          join_key: string;
          is_active: number;
        }>;
        return rows.map((row) => ({
          id: String(row.id),
          name: row.name,
          sourceType: row.source_type,
          sheetName: row.sheet_name ?? '',
          joinKey: row.join_key,
          active: Number(row.is_active) === 1
        }));
      }

      case 'sources.types':
        return ['QC_STOCK', 'TRC', 'INVENTORY', 'LOCATION', 'OTHER'];

      case 'rules.age.list':
        return (db.prepare('SELECT * FROM age_rules ORDER BY min_age ASC').all() as unknown as Array<{
          id: number;
          min_age: number;
          max_age: number;
          bucket: string;
          priority: string;
          is_active: number;
        }>).map((row) => ({
          id: String(row.id),
          minAge: row.min_age,
          maxAge: row.max_age,
          bucket: row.bucket,
          priority: row.priority,
          active: Number(row.is_active) === 1
        }));

      case 'rules.status.list':
        return (db.prepare('SELECT * FROM status_rules ORDER BY raw_status ASC').all() as unknown as Array<{
          id: number;
          raw_status: string;
          bucket: string;
          marking: string | null;
          is_active: number;
        }>).map((row) => ({
          id: String(row.id),
          rawStatus: row.raw_status,
          bucket: row.bucket,
          marking: row.marking ?? '',
          active: Number(row.is_active) === 1
        }));

      case 'rules.location.list':
        return (db.prepare('SELECT * FROM location_rules ORDER BY id ASC').all() as unknown as Array<{
          id: number;
          pattern: string;
          bucket: string;
          condition: string | null;
          is_active: number;
        }>).map((row) => ({
          id: String(row.id),
          pattern: row.pattern,
          bucket: row.bucket,
          condition: row.condition ?? '',
          active: Number(row.is_active) === 1
        }));

      case 'alerts.list':
        return (db.prepare('SELECT * FROM alerts ORDER BY name ASC').all() as unknown as Array<{
          id: number;
          name: string;
          type: string;
          threshold_value: number;
          is_active: number;
        }>).map((row) => ({
          id: String(row.id),
          name: row.name,
          type: row.type,
          thresholdValue: row.threshold_value,
          active: Number(row.is_active) === 1
        }));

      case 'reports.list':
        return (db.prepare('SELECT * FROM report_templates ORDER BY name ASC').all() as unknown as Array<{
          id: number;
          name: string;
          config_json: string;
        }>).map((row) => ({ id: String(row.id), name: row.name, config: JSON.parse(row.config_json) }));

      case 'quality.summary': {
        const totalRow = db.prepare('SELECT COUNT(*) AS c FROM inventory').get() as { c: number };
        const total = Number(totalRow.c);
        const missing = Number(
          (
            db
              .prepare(
                `SELECT COUNT(*) AS c FROM inventory
                 WHERE model IS NULL OR TRIM(model) = '' OR brand IS NULL OR TRIM(brand) = ''`
              )
              .get() as { c: number }
          ).c
        );
        return { totalErrors: missing, bySource: { inventoryTotal: total } };
      }

      case 'activity.list': {
        const rows = db
          .prepare('SELECT at, actor_email, action, entity, entity_id FROM audit_log ORDER BY id DESC LIMIT 200')
          .all() as unknown as Array<{
          at: string;
          actor_email: string | null;
          action: string;
          entity: string | null;
          entity_id: string | null;
        }>;
        return {
          headers: ['AT', 'ACTOR', 'ACTION', 'ENTITY', 'ENTITY ID'],
          data: rows.map((row) => [row.at, row.actor_email ?? '', row.action, row.entity ?? '', row.entity_id ?? ''])
        };
      }

      case 'history.list': {
        const rows = db
          .prepare(
            'SELECT created_at, kind, status, rows_total, rows_ok, rows_failed FROM import_jobs ORDER BY id DESC LIMIT 200'
          )
          .all() as unknown as Array<{
          created_at: string;
          kind: string;
          status: string;
          rows_total: number;
          rows_ok: number;
          rows_failed: number;
        }>;
        return {
          headers: ['CREATED', 'KIND', 'STATUS', 'TOTAL', 'OK', 'FAILED'],
          data: rows.map((row) => [
            row.created_at,
            row.kind,
            row.status,
            String(row.rows_total),
            String(row.rows_ok),
            String(row.rows_failed)
          ])
        };
      }

      case 'errors.list': {
        const rows = db
          .prepare('SELECT row_number, field, message FROM import_errors ORDER BY id DESC LIMIT 200')
          .all() as unknown as Array<{ row_number: number; field: string; message: string }>;
        return {
          headers: ['ROW', 'FIELD', 'MESSAGE'],
          data: rows.map((row) => [String(row.row_number), row.field, row.message])
        };
      }

      case 'auth.users': {
        assertAdmin(role);
        const rows = db
          .prepare('SELECT email, role, is_active, last_login_at, locked_until, password_hash FROM users ORDER BY email ASC')
          .all() as unknown as Array<{
          email: string;
          role: Role;
          is_active: number;
          last_login_at: string | null;
          locked_until: string | null;
          password_hash: string;
        }>;
        return {
          users: rows.map((row) => ({
            email: row.email,
            role: row.role,
            active: Number(row.is_active) === 1 ? 'YES' : 'NO',
            hasPassword: row.password_hash.length > 0,
            lockedUntil: row.locked_until ?? '',
            lastLogin: row.last_login_at ?? ''
          }))
        };
      }

      default:
        return dispatchExtended(db, action, params, role, email, ip, sessionTtlHours);
    }
  }

  function assertWriter(role: Role | null): void {
    if (!role || !['ADMIN', 'OWNER', 'MANAGER', 'OPERATOR'].includes(role)) {
      throw new ApiError(403, 'FORBIDDEN', 'Your role cannot change inventory');
    }
  }

  function assertAdmin(role: Role | null): void {
    if (!role || !['ADMIN', 'OWNER'].includes(role)) {
      throw new ApiError(403, 'FORBIDDEN', 'Administrator role required');
    }
  }

  return router;
}
