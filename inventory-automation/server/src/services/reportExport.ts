import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import type { Db } from '../db/index.js';

export const GROUPABLE: Record<string, string> = {
  status: 'status',
  brand: 'brand',
  age_bucket: 'age_bucket',
  status_bucket: 'status_bucket',
  location: 'location',
  bin_bucket: 'bin_bucket',
  model: 'model'
};

export interface GroupRow {
  key: string;
  count: number;
}

export interface ReportFilters {
  status?: string;
  brand?: string;
  ageBucket?: string;
  statusBucket?: string;
  location?: string;
}

export function buildWhere(filters: ReportFilters): { where: string; params: string[] } {
  const clauses: string[] = [];
  const params: string[] = [];

  if (filters.status) {
    clauses.push('status = ?');
    params.push(filters.status);
  }
  if (filters.brand) {
    clauses.push('brand = ?');
    params.push(filters.brand);
  }
  if (filters.ageBucket) {
    clauses.push('age_bucket = ?');
    params.push(filters.ageBucket);
  }
  if (filters.statusBucket) {
    clauses.push('status_bucket = ?');
    params.push(filters.statusBucket);
  }
  if (filters.location) {
    clauses.push('location = ?');
    params.push(filters.location);
  }

  return { where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export function groupInventory(db: Db, groupBy: string, filters: ReportFilters): { total: number; groups: GroupRow[] } {
  const column = GROUPABLE[groupBy];
  if (!column) throw new Error(`Unknown groupBy ${groupBy}`);

  const { where, params } = buildWhere(filters);
  const groups = db
    .prepare(
      `SELECT COALESCE(${column}, '(empty)') AS key, COUNT(*) AS count
       FROM inventory ${where}
       GROUP BY key ORDER BY count DESC, key ASC`
    )
    .all(...params) as unknown as GroupRow[];

  const totalRow = db.prepare(`SELECT COUNT(*) AS total FROM inventory ${where}`).get(...params) as { total: number };

  return {
    total: Number(totalRow.total),
    groups: groups.map((row) => ({ key: String(row.key), count: Number(row.count) }))
  };
}

export function inventoryRows(db: Db): Array<Record<string, unknown>> {
  return db
    .prepare(
      `SELECT barcode, model, brand, status, stock_age, age_bucket, priority, status_bucket, location, bin_bucket, source_type, updated_at
       FROM inventory ORDER BY barcode ASC`
    )
    .all() as unknown as Array<Record<string, unknown>>;
}

export function toXlsxBuffer(db: Db, groupBy: string, filters: ReportFilters): Buffer {
  const { total, groups } = groupInventory(db, groupBy, filters);
  const rows = inventoryRows(db);

  const workbook = XLSX.utils.book_new();

  const summary = XLSX.utils.aoa_to_sheet([
    ['Bulk Repair inventory report'],
    ['Generated at', new Date().toISOString()],
    ['Grouped by', groupBy],
    ['Total devices', total],
    ['Groups', groups.length]
  ]);
  XLSX.utils.book_append_sheet(workbook, summary, 'Summary');

  const groupSheet = XLSX.utils.aoa_to_sheet([['Group', 'Count'], ...groups.map((g) => [g.key, g.count])]);
  XLSX.utils.book_append_sheet(workbook, groupSheet, 'Groups');

  const header = [
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
    'SOURCE_TYPE',
    'UPDATED_AT'
  ];
  const data = rows.map((row) => [
    row['barcode'],
    row['model'],
    row['brand'],
    row['status'],
    row['stock_age'],
    row['age_bucket'],
    row['priority'],
    row['status_bucket'],
    row['location'],
    row['bin_bucket'],
    row['source_type'],
    row['updated_at']
  ]);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([header, ...data]), 'Inventory');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function toPdfBuffer(db: Db, groupBy: string, filters: ReportFilters): Promise<Buffer> {
  const { total, groups } = groupInventory(db, groupBy, filters);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text('Bulk Repair — Inventory report', { align: 'left' });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#555').text(`Generated: ${new Date().toISOString()}`);
    doc.text(`Grouped by: ${groupBy}`);
    doc.text(`Total devices: ${total}`);
    doc.moveDown(0.8);

    doc.fillColor('#000').fontSize(12).text('Breakdown', { underline: true });
    doc.moveDown(0.4);

    const startX = 48;
    const colWidth = 240;
    doc.fontSize(10);
    for (const group of groups.slice(0, 200)) {
      if (doc.y > 760) doc.addPage();
      doc.text(String(group.key), startX, doc.y, { width: colWidth, continued: true });
      doc.text(String(group.count), startX + colWidth, doc.y, { width: 80, align: 'right' });
      doc.moveDown(0.15);
    }

    doc.moveDown(1);
    doc.fontSize(8).fillColor('#777').text('Generated locally by the Bulk Repair server. Data never leaves the machine.');

    doc.end();
  });
}
