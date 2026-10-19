import type { Db } from '../db/index.js';
import { sendMailWithAttachment } from './mailer.js';
import { GROUPABLE, toPdfBuffer, toXlsxBuffer, type ReportFilters } from './reportExport.js';

export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type ReportFormat = 'PDF' | 'XLSX';

export interface ScheduledReportRow {
  id: number;
  name: string;
  group_by: string;
  filters_json: string | null;
  frequency: Frequency;
  format: ReportFormat;
  recipients: string;
  is_active: number;
  last_run_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_MS: Record<Frequency, number> = {
  DAILY: DAY_MS,
  WEEKLY: 7 * DAY_MS,
  MONTHLY: 30 * DAY_MS
};

const CONTENT_TYPES: Record<ReportFormat, string> = {
  PDF: 'application/pdf',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

export function isDue(row: ScheduledReportRow, now = Date.now()): boolean {
  if (Number(row.is_active) !== 1) return false;
  if (!row.last_run_at) return true;
  const last = Date.parse(row.last_run_at);
  if (Number.isNaN(last)) return true;
  return last + PERIOD_MS[row.frequency] <= now;
}

export function filtersOf(row: ScheduledReportRow): ReportFilters {
  if (!row.filters_json) return {};
  try {
    return JSON.parse(row.filters_json) as ReportFilters;
  } catch {
    return {};
  }
}

export async function runScheduledReport(
  db: Db,
  row: ScheduledReportRow
): Promise<{ sentTo: string; format: ReportFormat; bytes: number }> {
  if (!GROUPABLE[row.group_by]) {
    throw new Error(`Unknown group by: ${row.group_by}`);
  }

  const filters = filtersOf(row);
  const buffer =
    row.format === 'XLSX' ? toXlsxBuffer(db, row.group_by, filters) : await toPdfBuffer(db, row.group_by, filters);

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `inventory-${row.group_by}-${stamp}.${row.format.toLowerCase()}`;

  await sendMailWithAttachment(db, {
    to: row.recipients,
    subject: `Scheduled report: ${row.name} (${stamp})`,
    text: `Your scheduled inventory report is attached.\nGrouped by: ${row.group_by}\nGenerated: ${new Date().toISOString()}`,
    attachment: {
      filename,
      content: buffer,
      contentType: CONTENT_TYPES[row.format]
    }
  });

  const now = new Date().toISOString();
  db.prepare('UPDATE scheduled_reports SET last_run_at = ?, updated_at = ? WHERE id = ?').run(now, now, row.id);

  return { sentTo: row.recipients, format: row.format, bytes: buffer.length };
}

export interface DueRunResult {
  id: number;
  name: string;
  ok: boolean;
  detail: string;
}

/** Runs every active schedule that is due. Individual failures never abort the batch. */
export async function runDueReports(db: Db): Promise<DueRunResult[]> {
  const rows = db
    .prepare('SELECT * FROM scheduled_reports WHERE is_active = 1 ORDER BY id ASC')
    .all() as unknown as ScheduledReportRow[];

  const results: DueRunResult[] = [];
  const now = Date.now();

  for (const row of rows) {
    if (!isDue(row, now)) continue;
    try {
      const result = await runScheduledReport(db, row);
      results.push({ id: row.id, name: row.name, ok: true, detail: `${result.bytes} bytes to ${result.sentTo}` });
    } catch (error) {
      results.push({ id: row.id, name: row.name, ok: false, detail: (error as Error).message });
    }
  }

  return results;
}
