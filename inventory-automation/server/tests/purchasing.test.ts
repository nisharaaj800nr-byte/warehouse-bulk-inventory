import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, loginAs, seedAndLogin, seedUser, type TestContext } from './helpers.js';

let ctx: TestContext;
let token: string;

beforeEach(async () => {
  ctx = await createTestContext();
  token = await seedAndLogin(ctx, { email: 'admin@local.test', password: 'AdminPass123!', role: 'ADMIN' });
});

afterEach(() => {
  ctx.cleanup();
});

function gas(action: string, params: Record<string, unknown> = {}) {
  return request(ctx.app).post('/api/gas').send({ action, params });
}

async function createVendor(name = 'Acme Supplies'): Promise<number> {
  const response = await gas('vendors.save', { token, name, email: 'vendor@example.com' });
  expect(response.body.status).toBe('ok');
  return Number(response.body.data.id);
}

describe('vendors', () => {
  it('creates, updates, lists and deletes a vendor', async () => {
    const id = await createVendor();

    const list = await gas('vendors.list', { token });
    expect(list.body.status).toBe('ok');
    expect((list.body.data as Array<{ id: number; name: string }>).some((vendor) => vendor.id === id)).toBe(true);

    const updated = await gas('vendors.save', { token, id, name: 'Acme Supplies Ltd', phone: '12345', active: false });
    expect(updated.body.status).toBe('ok');

    const afterUpdate = await gas('vendors.list', { token });
    const row = (afterUpdate.body.data as Array<{ id: number; name: string; active: boolean }>).find(
      (vendor) => vendor.id === id
    );
    expect(row?.name).toBe('Acme Supplies Ltd');
    expect(row?.active).toBe(false);

    const removed = await gas('vendors.delete', { token, id });
    expect(removed.body.data.deleted).toBe(true);
  });

  it('refuses to delete a vendor with purchase orders', async () => {
    const vendorId = await createVendor();
    await gas('po.save', {
      token,
      vendorId,
      status: 'DRAFT',
      lines: [{ model: 'Phone', quantity: 1 }]
    });

    const removed = await gas('vendors.delete', { token, id: vendorId });
    expect(removed.body.status).toBe('error');
    expect(String(removed.body.message)).toMatch(/purchase orders/i);
  });
});

describe('purchase orders', () => {
  it('receives stock, updates the status and writes inventory', async () => {
    const vendorId = await createVendor('Beta Traders');

    const created = await gas('po.save', {
      token,
      vendorId,
      status: 'ORDERED',
      expectedAt: '2026-11-01',
      lines: [
        { barcode: 'PO-DEV-1', model: 'Phone X', brand: 'Acme', quantity: 1, unitCost: 250 },
        { model: 'Cable', brand: 'Acme', quantity: 5, unitCost: 10 }
      ]
    });
    expect(created.body.status).toBe('ok');
    const poId = Number(created.body.data.id);

    const detail = await gas('po.get', { token, id: poId });
    expect(detail.body.data.lines).toHaveLength(2);
    const deviceLine = (detail.body.data.lines as Array<{ id: number; barcode: string }>).find(
      (line) => line.barcode === 'PO-DEV-1'
    );
    const cableLine = (detail.body.data.lines as Array<{ id: number; barcode: string }>).find(
      (line) => line.barcode === ''
    );

    const partial = await gas('po.receive', {
      token,
      id: poId,
      lines: [{ lineId: deviceLine?.id, quantity: 1 }]
    });
    expect(partial.body.status).toBe('ok');
    expect(partial.body.data.status).toBe('PARTIAL');

    const inventory = await gas('inventory.list', { token, q: 'PO-DEV-1' });
    expect(inventory.body.data.total).toBe(1);
    expect(inventory.body.data.rows[0][3]).toBe('IN_STOCK');

    const over = await gas('po.receive', {
      token,
      id: poId,
      lines: [{ lineId: cableLine?.id, quantity: 99 }]
    });
    expect(over.body.status).toBe('error');

    const complete = await gas('po.receive', {
      token,
      id: poId,
      lines: [{ lineId: cableLine?.id, quantity: 5 }]
    });
    expect(complete.body.data.status).toBe('RECEIVED');
  });

  it('validates input and enforces roles', async () => {
    const vendorId = await createVendor();

    const empty = await gas('po.save', { token, vendorId, lines: [] });
    expect(empty.body.status).toBe('error');

    const badVendor = await gas('po.save', {
      token,
      vendorId: 999,
      lines: [{ model: 'X', quantity: 1 }]
    });
    expect(badVendor.body.status).toBe('error');

    await seedUser(ctx, { email: 'viewer@local.test', password: 'ViewerPass123!', role: 'VIEWER' });
    const viewerToken = await loginAs(ctx, 'viewer@local.test', 'ViewerPass123!');
    const denied = await gas('po.list', { token: viewerToken });
    expect(denied.body.code).toBe('FORBIDDEN');

    await seedUser(ctx, { email: 'manager@local.test', password: 'ManagerPass123!', role: 'MANAGER' });
    const managerToken = await loginAs(ctx, 'manager@local.test', 'ManagerPass123!');
    const allowed = await gas('po.list', { token: managerToken });
    expect(allowed.body.status).toBe('ok');
  });

  it('cancels draft orders and blocks cancelling received ones', async () => {
    const vendorId = await createVendor();
    const created = await gas('po.save', {
      token,
      vendorId,
      status: 'DRAFT',
      lines: [{ model: 'X', quantity: 1 }]
    });
    const poId = Number(created.body.data.id);

    const cancelled = await gas('po.cancel', { token, id: poId });
    expect(cancelled.body.data.cancelled).toBe(true);

    const received = await gas('po.save', {
      token,
      vendorId,
      status: 'RECEIVED',
      lines: [{ model: 'Y', quantity: 1 }]
    });
    const receivedId = Number(received.body.data.id);
    const blocked = await gas('po.cancel', { token, id: receivedId });
    expect(blocked.body.status).toBe('error');
  });
});
