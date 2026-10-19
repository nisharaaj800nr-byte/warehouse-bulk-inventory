import type { Db } from '../db/index.js';
import { applyRules, loadRules, type AppliedRules, type MappedRow, type RuleSets } from './rulesEngine.js';

export const TARGET_FIELDS = [
  'barcode',
  'model',
  'brand',
  'status',
  'stockAge',
  'ageBucket',
  'priority',
  'statusBucket',
  'location',
  'binBucket',
  'sourceType'
] as const;

type TargetField = (typeof TARGET_FIELDS)[number];

export interface MappingEntry {
  source_column: string;
  target_field: string;
  is_required: number;
  is_active: number;
  output_order: number | null;
}

export interface RowError {
  field: string;
  message: string;
}

export interface MappedResult {
  mapped: MappedRow | null;
  errors: RowError[];
}

const TARGET_LOOKUP: Record<string, TargetField> = {
  barcode: 'barcode',
  model: 'model',
  brand: 'brand',
  status: 'status',
  stockage: 'stockAge',
  age: 'stockAge',
  agebucket: 'ageBucket',
  priority: 'priority',
  statusbucket: 'statusBucket',
  location: 'location',
  binbucket: 'binBucket',
  sourcetype: 'sourceType'
};

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function normalizeTargetField(target: string): TargetField | null {
  return TARGET_LOOKUP[normalizeKey(target)] ?? null;
}

export function loadMappings(db: Db, sourceId: number): MappingEntry[] {
  return db
    .prepare(
      `SELECT source_column, target_field, is_required, is_active, output_order
       FROM field_mappings WHERE source_id = ? ORDER BY output_order ASC, id ASC`
    )
    .all(sourceId) as unknown as MappingEntry[];
}

function toIsoOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === '') return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : NaN;
}

/**
 * Maps one raw source row through the configured field mapping.
 * Unknown target fields are ignored on purpose: mapping is configuration,
 * and a typo must not silently become an inventory column.
 */
export function mapRow(raw: Record<string, unknown>, mappings: MappingEntry[], sourceType: string): MappedResult {
  const errors: RowError[] = [];
  const mapped: MappedRow = { barcode: '' };

  for (const mapping of mappings) {
    if (Number(mapping.is_active) !== 1) continue;
    const target = normalizeTargetField(mapping.target_field);

    const rawValue = raw[mapping.source_column];
    const textValue = rawValue === null || rawValue === undefined ? '' : String(rawValue).trim();

    if (Number(mapping.is_required) === 1 && textValue === '') {
      errors.push({ field: mapping.target_field, message: `Required column "${mapping.source_column}" is empty` });
      continue;
    }
    if (textValue === '') continue;
    if (!target) continue;

    if (target === 'stockAge') {
      const age = toIsoOrNull(textValue);
      if (age === null || Number.isNaN(age)) {
        errors.push({ field: mapping.target_field, message: `Age "${textValue}" is not a number` });
        continue;
      }
      mapped.stockAge = Math.max(0, age);
      continue;
    }

    (mapped as Record<string, unknown>)[target] = textValue;
  }

  const barcode = String(mapped.barcode ?? '').trim();
  if (barcode === '') {
    errors.push({ field: 'barcode', message: 'Barcode is required and was empty' });
  } else {
    mapped.barcode = barcode;
  }
  mapped.sourceType = sourceType;

  return { mapped: errors.length > 0 ? null : mapped, errors };
}

function coalesce(value: string | number | null | undefined): string | number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return value;
  const text = value.trim();
  return text === '' ? null : text;
}

/**
 * Inserts or updates one device record. Existing values are preserved when the
 * incoming value is empty, so a partial source can never wipe known data.
 */
export interface UpsertOptions {
  /** When set, the previous inventory state is captured so the job can be rolled back. */
  jobId?: number;
}

function captureSnapshot(db: Db, jobId: number, barcode: string): void {
  const seen = db
    .prepare('SELECT 1 AS seen FROM import_snapshots WHERE job_id = ? AND barcode = ? LIMIT 1')
    .get(jobId, barcode) as { seen: number } | undefined;
  if (seen) return;

  const existing = db.prepare('SELECT * FROM inventory WHERE barcode = ?').get(barcode) as
    | Record<string, unknown>
    | undefined;
  db.prepare(
    `INSERT INTO import_snapshots (job_id, barcode, existed, snapshot_json, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    jobId,
    barcode,
    existing ? 1 : 0,
    existing ? JSON.stringify(existing) : null,
    new Date().toISOString()
  );
}

export function upsertInventory(
  db: Db,
  mapped: MappedRow,
  rules: RuleSets,
  options: UpsertOptions = {}
): { action: 'inserted' | 'updated'; applied: AppliedRules } {
  if (options.jobId) captureSnapshot(db, options.jobId, mapped.barcode);
  const applied = applyRules(mapped, rules);
  const exists = db.prepare('SELECT id FROM inventory WHERE barcode = ?').get(mapped.barcode) as { id: number } | undefined;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO inventory
       (barcode, model, brand, status, stock_age, age_bucket, priority, status_bucket, location, bin_bucket, source_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(barcode) DO UPDATE SET
       model = COALESCE(excluded.model, inventory.model),
       brand = COALESCE(excluded.brand, inventory.brand),
       status = COALESCE(excluded.status, inventory.status),
       stock_age = COALESCE(excluded.stock_age, inventory.stock_age),
       age_bucket = COALESCE(excluded.age_bucket, inventory.age_bucket),
       priority = COALESCE(excluded.priority, inventory.priority),
       status_bucket = COALESCE(excluded.status_bucket, inventory.status_bucket),
       location = COALESCE(excluded.location, inventory.location),
       bin_bucket = COALESCE(excluded.bin_bucket, inventory.bin_bucket),
       source_type = COALESCE(excluded.source_type, inventory.source_type),
       updated_at = excluded.updated_at`
  ).run(
    mapped.barcode,
    coalesce(mapped.model),
    coalesce(mapped.brand),
    coalesce(mapped.status),
    mapped.stockAge === undefined ? null : coalesce(mapped.stockAge),
    coalesce(applied.ageBucket),
    coalesce(applied.priority),
    coalesce(applied.statusBucket),
    coalesce(mapped.location),
    coalesce(applied.binBucket),
    coalesce(mapped.sourceType),
    now,
    now
  );

  return { action: exists ? 'updated' : 'inserted', applied };
}

export interface RollbackResult {
  restored: number;
  removed: number;
}

/**
 * Restores every inventory row an import job touched to its pre-commit state.
 * Cars that the job created are deleted; rows that already existed are restored
 * from their snapshot.
 */
export function rollbackImport(db: Db, jobId: number): RollbackResult {
  const job = db
    .prepare('SELECT id, status, rolled_back_at FROM import_jobs WHERE id = ?')
    .get(jobId) as { id: number; status: string; rolled_back_at: string | null } | undefined;
  if (!job) throw new Error(`Import job ${jobId} not found`);
  if (job.rolled_back_at) throw new Error(`Import job ${jobId} was already rolled back`);
  if (job.status !== 'COMPLETE' && job.status !== 'PARTIAL_FAILURE') {
    throw new Error(`Import job ${jobId} is ${job.status} and cannot be rolled back`);
  }

  const snapshots = db
    .prepare('SELECT barcode, existed, snapshot_json FROM import_snapshots WHERE job_id = ? ORDER BY id DESC')
    .all(jobId) as unknown as Array<{ barcode: string; existed: number; snapshot_json: string | null }>;

  const now = new Date().toISOString();
  let restored = 0;
  let removed = 0;

  db.exec('BEGIN');
  try {
    for (const snapshot of snapshots) {
      if (Number(snapshot.existed) === 1 && snapshot.snapshot_json) {
        const row = JSON.parse(snapshot.snapshot_json) as Record<string, unknown>;
        const text = (value: unknown): string | null =>
          value === null || value === undefined ? null : String(value);
        const numeric = (value: unknown): number | null =>
          value === null || value === undefined ? null : Number(value);

        db.prepare(
          `UPDATE inventory
             SET model = ?, brand = ?, status = ?, stock_age = ?, age_bucket = ?, priority = ?,
                 status_bucket = ?, location = ?, bin_bucket = ?, source_type = ?, updated_at = ?
           WHERE barcode = ?`
        ).run(
          text(row.model),
          text(row.brand),
          text(row.status),
          numeric(row.stock_age),
          text(row.age_bucket),
          text(row.priority),
          text(row.status_bucket),
          text(row.location),
          text(row.bin_bucket),
          text(row.source_type),
          now,
          snapshot.barcode
        );
        restored += 1;
      } else {
        db.prepare('DELETE FROM inventory WHERE barcode = ?').run(snapshot.barcode);
        removed += 1;
      }
    }
    db.prepare('UPDATE import_jobs SET rolled_back_at = ? WHERE id = ?').run(now, jobId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { restored, removed };
}

export interface MergeBatchInput {
  sourceId: number;
  rows: Array<Record<string, unknown>>;
}

export interface MergeResult {
  devices: number;
  inserted: number;
  updated: number;
  conflicts: number;
  errors: Array<{ sourceId: number; row: number; field: string; message: string }>;
}

interface Candidate {
  value: string | number;
  sourceType: string;
  sourceId: number;
  rank: number;
  row: number;
}

const MERGE_FIELDS: Array<{ field: 'model' | 'brand' | 'status' | 'stockAge' | 'location'; target: string }> = [
  { field: 'model', target: 'MODEL' },
  { field: 'brand', target: 'BRAND' },
  { field: 'status', target: 'STATUS' },
  { field: 'stockAge', target: 'STOCK_AGE' },
  { field: 'location', target: 'LOCATION' }
];

/**
 * Consolidates several sources into one record per barcode. Field values are
 * chosen by the configured source priority (lower rank wins); every
 * disagreement is written to data_conflicts with the winning value.
 */
export function mergeSources(db: Db, batches: MergeBatchInput[]): MergeResult {
  const rules = loadRules(db);
  const ranks = new Map<string, number>();
  const priorityRows = db.prepare('SELECT field, source_type, rank FROM priority_rules').all() as unknown as Array<{
    field: string;
    source_type: string;
    rank: number;
  }>;
  for (const row of priorityRows) {
    ranks.set(`${normalizeKey(row.field)}|${row.source_type}`, Number(row.rank));
  }

  const result: MergeResult = { devices: 0, inserted: 0, updated: 0, conflicts: 0, errors: [] };
  const byBarcode = new Map<string, Map<string, Candidate[]>>();

  for (const batch of batches) {
    const source = db.prepare('SELECT id, name, source_type FROM sources WHERE id = ?').get(batch.sourceId) as
      | { id: number; name: string; source_type: string }
      | undefined;
    if (!source) {
      result.errors.push({ sourceId: batch.sourceId, row: 0, field: 'sourceId', message: 'Source not found' });
      continue;
    }

    const mappings = loadMappings(db, batch.sourceId);
    if (mappings.length === 0) {
      result.errors.push({ sourceId: batch.sourceId, row: 0, field: 'mapping', message: 'Source has no field mapping' });
      continue;
    }

    batch.rows.forEach((raw, index) => {
      const { mapped, errors } = mapRow(raw, mappings, source.source_type);
      if (!mapped) {
        for (const error of errors) {
          result.errors.push({ sourceId: batch.sourceId, row: index + 1, field: error.field, message: error.message });
        }
        return;
      }

      const fields = byBarcode.get(mapped.barcode) ?? new Map<string, Candidate[]>();
      for (const { field, target } of MERGE_FIELDS) {
        const value = coalesce(mapped[field] as string | number | null | undefined);
        if (value === null) continue;
        const rank = ranks.get(`${normalizeKey(field)}|${source.source_type}`) ?? ranks.get(`${normalizeKey(target)}|${source.source_type}`) ?? 1000;
        const list = fields.get(field) ?? [];
        list.push({ value, sourceType: source.source_type, sourceId: batch.sourceId, rank, row: index + 1 });
        fields.set(field, list);
      }
      byBarcode.set(mapped.barcode, fields);
    });
  }

  db.exec('BEGIN');
  try {
    for (const [barcode, fields] of byBarcode) {
      const merged: MappedRow = { barcode, sourceType: 'MULTI' };

      for (const { field } of MERGE_FIELDS) {
        const candidates = fields.get(field);
        if (!candidates || candidates.length === 0) continue;

        const sorted = [...candidates].sort((a, b) => a.rank - b.rank || a.sourceId - b.sourceId);
        const winner = sorted[0] as Candidate;
        (merged as Record<string, unknown>)[field] = winner.value;

        const distinct = new Map<string, Candidate>();
        for (const candidate of candidates) {
          const key = String(candidate.value).trim().toLowerCase();
          if (!distinct.has(key)) distinct.set(key, candidate);
        }
        if (distinct.size > 1) {
          const others = [...distinct.values()].filter((candidate) => candidate !== winner);
          const opponent = others[0] as Candidate;
          db.prepare(
            `INSERT INTO data_conflicts (barcode, field, source_a, value_a, source_b, value_b, final_value, rule, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            barcode,
            field,
            winner.sourceType,
            String(winner.value),
            opponent.sourceType,
            String(opponent.value),
            String(winner.value),
            `source_priority(rank=${winner.rank})`,
            new Date().toISOString()
          );
          result.conflicts += 1;
        }
      }

      const { action } = upsertInventory(db, merged, rules);
      result.devices += 1;
      if (action === 'inserted') result.inserted += 1;
      else result.updated += 1;
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return result;
}
