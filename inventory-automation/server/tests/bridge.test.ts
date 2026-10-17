import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, seedAndLogin, seedUser, type TestContext } from './helpers.js';

let ctx: TestContext;

beforeEach(async () => {
  ctx = await createTestContext();
});

afterEach(() => {
  ctx.cleanup();
});

function gas(action: string, params: Record<string, unknown> = {}) {
  return request(ctx.app).post('/api/gas').send({ action, params });
}

describe('panel compatibility bridge', () => {
  it('answers health without a token', async () => {
    const response = await gas('health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.data.db).toBe('connected');
  });

  it('requires a token for protected actions', async () => {
    const response = await gas('inventory.list');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('error');
    expect(response.body.code).toBe('AUTH_REQUIRED');
  });

  it('logs in with the panel contract and returns a usable token', async () => {
    await seedUser(ctx, { email: 'panel@local.test', password: 'PanelPass123!', role: 'ADMIN' });

    const login = await gas('auth.login', { email: 'panel@local.test', password: 'PanelPass123!' });
    expect(login.body.status).toBe('ok');
    expect(login.body.data.role).toBe('ADMIN');
    expect(login.body.data.token).toMatch(/^[0-9a-f]{64}$/);

    const whoami = await gas('auth.whoami', { token: login.body.data.token });
    expect(whoami.body.data.email).toBe('panel@local.test');
  });

  it('rejects a wrong password with the panel error shape', async () => {
    await seedUser(ctx, { email: 'panel@local.test', password: 'PanelPass123!' });
    const response = await gas('auth.login', { email: 'panel@local.test', password: 'nope' });
    expect(response.body.status).toBe('error');
    expect(response.body.message).toBe('Invalid email or password');
  });

  it('serves dashboard counters in the legacy shape', async () => {
    const token = await seedAndLogin(ctx, { email: 'admin@local.test', password: 'AdminPass123!', role: 'ADMIN' });
    const response = await gas('dashboard', { token });
    expect(response.body.status).toBe('ok');
    expect(response.body.data.inventoryCount).toBe(0);
    expect(response.body.data.headers).toContain('BARCODE');
    expect(Array.isArray(response.body.data.recentRuns)).toBe(true);
  });

  it('creates and lists inventory rows as arrays', async () => {
    const token = await seedAndLogin(ctx, { email: 'admin@local.test', password: 'AdminPass123!', role: 'ADMIN' });

    const saved = await gas('inventory.save', {
      token,
      item: { BARCODE: 'BR-1', MODEL: 'iPhone 13', BRAND: 'Apple', STATUS: 'L4', STOCK_AGE: '45', LOCATION: 'SW07' }
    });
    expect(saved.body.status).toBe('ok');
    expect(saved.body.data.barcode).toBe('BR-1');

    const list = await gas('inventory.list', { token, page: 1, perPage: 10, q: 'BR-1' });
    expect(list.body.data.total).toBe(1);
    expect(list.body.data.headers[0]).toBe('BARCODE');
    expect(list.body.data.rows[0][0]).toBe('BR-1');
    expect(list.body.data.rows[0][1]).toBe('iPhone 13');

    const filtered = await gas('inventory.list', { token, filters: { STATUS: 'L4' } });
    expect(filtered.body.data.total).toBe(1);
    const empty = await gas('inventory.list', { token, filters: { STATUS: 'L3' } });
    expect(empty.body.data.total).toBe(0);
  });

  it('exports inventory as CSV', async () => {
    const token = await seedAndLogin(ctx, { email: 'admin@local.test', password: 'AdminPass123!', role: 'ADMIN' });
    await gas('inventory.save', { token, item: { BARCODE: 'BR-2', MODEL: 'Phone, "Pro"', BRAND: 'Apple' } });

    const response = await gas('inventory.export', { token, columns: 'BARCODE,MODEL' });
    expect(response.body.status).toBe('ok');
    expect(response.body.data.csv.split('\r\n')[0]).toBe('BARCODE,MODEL');
    expect(response.body.data.csv).toContain('"Phone, ""Pro"""');
  });

  it('blocks viewers from writing through the bridge', async () => {
    const token = await seedAndLogin(ctx, { email: 'viewer@local.test', password: 'ViewerPass123!', role: 'VIEWER' });
    const response = await gas('inventory.save', { token, item: { BARCODE: 'NOPE' } });
    expect(response.body.status).toBe('error');
    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('reports unsupported actions explicitly instead of pretending', async () => {
    const token = await seedAndLogin(ctx, { email: 'admin@local.test', password: 'AdminPass123!', role: 'ADMIN' });
    const response = await gas('telegram.test', { token });
    expect(response.body.status).toBe('error');
    expect(response.body.code).toBe('UNSUPPORTED');
  });
});
