import type { Db } from '../db/index.js';
import { ApiError } from '../lib/errors.js';
import { upsertInventory } from './importService.js';
import { loadRules } from './rulesEngine.js';

export interface VendorInput {
  id?: number;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  active?: boolean;
}

export interface PoLineInput {
  id?: number;
  barcode?: string;
  model?: string;
  brand?: string;
  quantity: number;
  unitCost?: number;
}

export interface PurchaseOrderInput {
  id?: number;
  poNumber?: string;
  vendorId: number;
  status?: string;
  expectedAt?: string;
  notes?: string;
  lines: PoLineInput[];
}

const PO_STATUSES = ['DRAFT', 'ORDERED', 'PARTIAL', 'RECEIVED', 'CANCELLED'] as const;

interface VendorRow {
  id: number;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function vendorToApi(row: VendorRow) {
  return {
    id: Number(row.id),
    name: row.name,
    contactName: row.contact_name ?? '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    address: row.address ?? '',
    notes: row.notes ?? '',
    active: Number(row.is_active) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function listVendors(db: Db) {
  const rows = db.prepare('SELECT * FROM vendors ORDER BY name ASC').all() as unknown as VendorRow[];
  return rows.map(vendorToApi);
}

export function saveVendor(db: Db, input: VendorInput): { id: number } {
  const name = String(input.name ?? '').trim();
  if (!name) throw new ApiError(400, 'BAD_REQUEST', 'Vendor name is required');

  const now = new Date().toISOString();
  const active = input.active === false ? 0 : 1;

  if (input.id) {
    const existing = db.prepare('SELECT id FROM vendors WHERE id = ?').get(input.id);
    if (!existing) throw new ApiError(404, 'NOT_FOUND', `Vendor ${input.id} not found`);
    db.prepare(
      `UPDATE vendors
          SET name = ?, contact_name = ?, email = ?, phone = ?, address = ?, notes = ?, is_active = ?, updated_at = ?
        WHERE id = ?`
    ).run(
      name,
      input.contactName ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.address ?? null,
      input.notes ?? null,
      active,
      now,
      input.id
    );
    return { id: Number(input.id) };
  }

  const duplicate = db.prepare('SELECT id FROM vendors WHERE name = ?').get(name);
  if (duplicate) throw new ApiError(409, 'DUPLICATE', `Vendor ${name} already exists`);

  const result = db
    .prepare(
      `INSERT INTO vendors (name, contact_name, email, phone, address, notes, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(name, input.contactName ?? null, input.email ?? null, input.phone ?? null, input.address ?? null, input.notes ?? null, active, now, now);
  return { id: Number(result.lastInsertRowid) };
}

export function deleteVendor(db: Db, id: number): void {
  const used = db.prepare('SELECT COUNT(*) AS count FROM purchase_orders WHERE vendor_id = ?').get(id) as {
    count: number;
  };
  if (Number(used.count) > 0) {
    throw new ApiError(409, 'DUPLICATE', 'Vendor has purchase orders and cannot be deleted');
  }
  const result = db.prepare('DELETE FROM vendors WHERE id = ?').run(id);
  if (Number(result.changes) === 0) throw new ApiError(404, 'NOT_FOUND', `Vendor ${id} not found`);
}

interface PoRow {
  id: number;
  po_number: string;
  vendor_id: number;
  vendor_name: string;
  status: string;
  expected_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  line_count: number;
  ordered_quantity: number;
  received_quantity: number;
}

interface PoLineRow {
  id: number;
  po_id: number;
  barcode: string | null;
  model: string | null;
  brand: string | null;
  quantity: number;
  received_quantity: number;
  unit_cost: number | null;
  created_at: string;
}

function poToApi(row: PoRow) {
  return {
    id: Number(row.id),
    poNumber: row.po_number,
    vendorId: Number(row.vendor_id),
    vendorName: row.vendor_name,
    status: row.status,
    expectedAt: row.expected_at ?? '',
    notes: row.notes ?? '',
    createdBy: row.created_by ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lineCount: Number(row.line_count),
    orderedQuantity: Number(row.ordered_quantity),
    receivedQuantity: Number(row.received_quantity)
  };
}

function lineToApi(row: PoLineRow) {
  return {
    id: Number(row.id),
    barcode: row.barcode ?? '',
    model: row.model ?? '',
    brand: row.brand ?? '',
    quantity: Number(row.quantity),
    receivedQuantity: Number(row.received_quantity),
    unitCost: row.unit_cost === null ? null : Number(row.unit_cost)
  };
}

export function listPurchaseOrders(db: Db) {
  const rows = db
    .prepare(
      `SELECT po.*, v.name AS vendor_name,
              COUNT(l.id) AS line_count,
              COALESCE(SUM(l.quantity), 0) AS ordered_quantity,
              COALESCE(SUM(l.received_quantity), 0) AS received_quantity
         FROM purchase_orders po
         JOIN vendors v ON v.id = po.vendor_id
         LEFT JOIN purchase_order_lines l ON l.po_id = po.id
        GROUP BY po.id
        ORDER BY po.created_at DESC`
    )
    .all() as unknown as PoRow[];
  return rows.map(poToApi);
}

export function getPurchaseOrder(db: Db, id: number) {
  const row = db
    .prepare(
      `SELECT po.*, v.name AS vendor_name,
              COUNT(l.id) AS line_count,
              COALESCE(SUM(l.quantity), 0) AS ordered_quantity,
              COALESCE(SUM(l.received_quantity), 0) AS received_quantity
         FROM purchase_orders po
         JOIN vendors v ON v.id = po.vendor_id
         LEFT JOIN purchase_order_lines l ON l.po_id = po.id
        WHERE po.id = ?
        GROUP BY po.id`
    )
    .get(id) as PoRow | undefined;
  if (!row) throw new ApiError(404, 'NOT_FOUND', `Purchase order ${id} not found`);

  const lines = db
    .prepare('SELECT * FROM purchase_order_lines WHERE po_id = ? ORDER BY id ASC')
    .all(id) as unknown as PoLineRow[];

  return { ...poToApi(row), lines: lines.map(lineToApi) };
}

function nextPoNumber(db: Db): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM purchase_orders WHERE po_number LIKE ?")
    .get(`PO-${stamp}-%`) as { count: number };
  return `PO-${stamp}-${String(Number(row.count) + 1).padStart(3, '0')}`;
}

export function savePurchaseOrder(db: Db, input: PurchaseOrderInput, actor: string | null): { id: number } {
  const vendorId = Number(input.vendorId);
  const vendor = db.prepare('SELECT id FROM vendors WHERE id = ?').get(vendorId);
  if (!vendor) throw new ApiError(400, 'BAD_REQUEST', 'A valid vendor is required');

  const lines = Array.isArray(input.lines) ? input.lines : [];
  if (lines.length === 0) throw new ApiError(400, 'BAD_REQUEST', 'At least one line is required');
  for (const line of lines) {
    if (!Number.isInteger(Number(line.quantity)) || Number(line.quantity) <= 0) {
      throw new ApiError(400, 'BAD_REQUEST', 'Line quantities must be positive integers');
    }
  }

  const now = new Date().toISOString();
  const status = String(input.status ?? 'DRAFT').toUpperCase();
  if (!PO_STATUSES.includes(status as (typeof PO_STATUSES)[number])) {
    throw new ApiError(400, 'BAD_REQUEST', `Unknown purchase order status ${status}`);
  }

  if (input.id) {
    const existing = db.prepare('SELECT id, status FROM purchase_orders WHERE id = ?').get(input.id) as
      | { id: number; status: string }
      | undefined;
    if (!existing) throw new ApiError(404, 'NOT_FOUND', `Purchase order ${input.id} not found`);

    const received = db
      .prepare('SELECT COALESCE(SUM(received_quantity), 0) AS total FROM purchase_order_lines WHERE po_id = ?')
      .get(input.id) as { total: number };
    if (Number(received.total) > 0) {
      throw new ApiError(409, 'DUPLICATE', 'Received purchase orders can no longer be edited');
    }

    db.prepare(
      'UPDATE purchase_orders SET vendor_id = ?, status = ?, expected_at = ?, notes = ?, updated_at = ? WHERE id = ?'
    ).run(vendorId, status, input.expectedAt ?? null, input.notes ?? null, now, input.id);

    db.prepare('DELETE FROM purchase_order_lines WHERE po_id = ?').run(input.id);
    const insertLine = db.prepare(
      `INSERT INTO purchase_order_lines (po_id, barcode, model, brand, quantity, received_quantity, unit_cost, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
    );
    for (const line of lines) {
      insertLine.run(
        input.id,
        line.barcode?.trim() || null,
        line.model?.trim() || null,
        line.brand?.trim() || null,
        Number(line.quantity),
        line.unitCost ?? null,
        now
      );
    }
    return { id: Number(input.id) };
  }

  const poNumber = String(input.poNumber ?? '').trim() || nextPoNumber(db);
  const duplicate = db.prepare('SELECT id FROM purchase_orders WHERE po_number = ?').get(poNumber);
  if (duplicate) throw new ApiError(409, 'DUPLICATE', `Purchase order ${poNumber} already exists`);

  const result = db
    .prepare(
      `INSERT INTO purchase_orders (po_number, vendor_id, status, expected_at, notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(poNumber, vendorId, status, input.expectedAt ?? null, input.notes ?? null, actor, now, now);
  const id = Number(result.lastInsertRowid);

  const insertLine = db.prepare(
    `INSERT INTO purchase_order_lines (po_id, barcode, model, brand, quantity, received_quantity, unit_cost, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
  );
  for (const line of lines) {
    insertLine.run(
      id,
      line.barcode?.trim() || null,
      line.model?.trim() || null,
      line.brand?.trim() || null,
      Number(line.quantity),
      line.unitCost ?? null,
      now
    );
  }

  return { id };
}

export interface ReceiptLine {
  lineId: number;
  quantity: number;
}

export function receivePurchaseOrder(
  db: Db,
  id: number,
  receipts: ReceiptLine[],
  actor: string | null
): { status: string; received: number } {
  const po = db.prepare('SELECT id, status FROM purchase_orders WHERE id = ?').get(id) as
    | { id: number; status: string }
    | undefined;
  if (!po) throw new ApiError(404, 'NOT_FOUND', `Purchase order ${id} not found`);
  if (!['ORDERED', 'PARTIAL'].includes(po.status)) {
    throw new ApiError(400, 'BAD_REQUEST', `Purchase order is ${po.status} and cannot receive stock`);
  }
  if (!Array.isArray(receipts) || receipts.length === 0) {
    throw new ApiError(400, 'BAD_REQUEST', 'At least one receipt line is required');
  }

  const rules = loadRules(db);
  const now = new Date().toISOString();
  let receivedUnits = 0;

  db.exec('BEGIN');
  try {
    for (const receipt of receipts) {
      const quantity = Number(receipt.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new ApiError(400, 'BAD_REQUEST', 'Receipt quantities must be positive integers');
      }

      const line = db
        .prepare('SELECT * FROM purchase_order_lines WHERE id = ? AND po_id = ?')
        .get(Number(receipt.lineId), id) as PoLineRow | undefined;
      if (!line) throw new ApiError(404, 'NOT_FOUND', `Line ${receipt.lineId} not found on this purchase order`);

      const remaining = Number(line.quantity) - Number(line.received_quantity);
      if (quantity > remaining) {
        throw new ApiError(400, 'BAD_REQUEST', `Cannot receive ${quantity}; only ${remaining} remain on line ${line.id}`);
      }

      db.prepare('UPDATE purchase_order_lines SET received_quantity = received_quantity + ? WHERE id = ?').run(
        quantity,
        line.id
      );
      receivedUnits += quantity;

      if (line.barcode) {
        upsertInventory(
          db,
          {
            barcode: line.barcode,
            model: line.model,
            brand: line.brand,
            status: 'IN_STOCK',
            sourceType: 'PURCHASE'
          },
          rules
        );
      }
    }

    const totals = db
      .prepare(
        `SELECT COALESCE(SUM(quantity), 0) AS ordered, COALESCE(SUM(received_quantity), 0) AS received
           FROM purchase_order_lines WHERE po_id = ?`
      )
      .get(id) as { ordered: number; received: number };

    const status = Number(totals.received) >= Number(totals.ordered) ? 'RECEIVED' : 'PARTIAL';
    db.prepare('UPDATE purchase_orders SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);
    db.exec('COMMIT');

    return { status, received: receivedUnits };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function cancelPurchaseOrder(db: Db, id: number): void {
  const po = db.prepare('SELECT status FROM purchase_orders WHERE id = ?').get(id) as { status: string } | undefined;
  if (!po) throw new ApiError(404, 'NOT_FOUND', `Purchase order ${id} not found`);
  if (po.status === 'RECEIVED') throw new ApiError(409, 'DUPLICATE', 'Received orders cannot be cancelled');

  const received = db
    .prepare('SELECT COALESCE(SUM(received_quantity), 0) AS total FROM purchase_order_lines WHERE po_id = ?')
    .get(id) as { total: number };
  if (Number(received.total) > 0) {
    throw new ApiError(409, 'DUPLICATE', 'Orders with received stock cannot be cancelled');
  }

  db.prepare("UPDATE purchase_orders SET status = 'CANCELLED', updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    id
  );
}
