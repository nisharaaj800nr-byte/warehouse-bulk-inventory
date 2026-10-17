import type { Db } from '../db/index.js';
import { logger } from '../lib/logger.js';

export interface AuditEntry {
  actorEmail?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | number | null;
  details?: unknown;
  ip?: string | null;
}

/**
 * Writes an audit row. Audit failures are logged but never hide the original
 * operation result, because the audit table is observability, not the source of truth.
 */
export function writeAudit(db: Db, entry: AuditEntry): void {
  try {
    db.prepare(
      `INSERT INTO audit_log (at, actor_email, action, entity, entity_id, details, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      new Date().toISOString(),
      entry.actorEmail ?? null,
      entry.action,
      entry.entity ?? null,
      entry.entityId === undefined || entry.entityId === null ? null : String(entry.entityId),
      entry.details === undefined ? null : JSON.stringify(entry.details),
      entry.ip ?? null
    );
  } catch (error) {
    logger.error('audit_write_failed', { action: entry.action, message: (error as Error).message });
  }
}
