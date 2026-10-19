import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, seedAndLogin, type TestContext } from './helpers.js';

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

describe('stock movement ledger', () => {
  it('records inserts and field-level updates', async () => {
    const created = await gas('inventory.save', {
      token,
      item: { BARCODE: 'MV-1', MODEL: 'Phone X', BRAND: 'Acme', STATUS: 'READY', LOCATION: 'A1' }
    });
    expect(created.body.status).toBe('ok');

    const updated = await gas('inventory.save', {
      token,
      item: { BARCODE: 'MV-1', MODEL: 'Phone X', BRAND: 'Acme', STATUS: 'QC_FAIL', LOCATION: 'B2' }
    });
    expect(updated.body.status).toBe('ok');

    const history = await gas('inventory.history', { token, barcode: 'MV-1' });
    expect(history.body.status).toBe('ok');

    const movements = history.body.data.movements as Array<{
      action: string;
      field: string | null;
      oldValue: string | null;
      newValue: string | null;
    }>;

    expect(movements.some((row) => row.action === 'INSERT')).toBe(true);
    expect(
      movements.some(
        (row) => row.action === 'UPDATE' && row.field === 'status' && row.oldValue === 'READY' && row.newValue === 'QC_FAIL'
      )
    ).toBe(true);
    expect(
      movements.some(
        (row) => row.action === 'UPDATE' && row.field === 'location' && row.oldValue === 'A1' && row.newValue === 'B2'
      )
    ).toBe(true);
  });

  it('does not record a movement when nothing changes', async () => {
    await gas('inventory.save', { token, item: { BARCODE: 'MV-2', STATUS: 'READY' } });
    const before = await gas('inventory.history', { token, barcode: 'MV-2' });
    const count = (before.body.data.movements as unknown[]).length;

    await gas('inventory.save', { token, item: { BARCODE: 'MV-2', STATUS: 'READY' } });

    const after = await gas('inventory.history', { token, barcode: 'MV-2' });
    expect((after.body.data.movements as unknown[]).length).toBe(count);
  });

  it('records deletes and serves the REST history route', async () => {
    await gas('inventory.save', { token, item: { BARCODE: 'MV-3', STATUS: 'READY' } });
    const removed = await gas('inventory.delete', { token, barcode: 'MV-3' });
    expect(removed.body.status).toBe('ok');

    const rest = await request(ctx.app)
      .get('/api/inventory/MV-3/history?limit=10')
      .set('Authorization', `Bearer ${token}`);

    expect(rest.status).toBe(200);
    const actions = (rest.body.data.movements as Array<{ action: string }>).map((row) => row.action);
    expect(actions).toContain('INSERT');
    expect(actions).toContain('DELETE');
  });
});
