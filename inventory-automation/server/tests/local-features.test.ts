import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, seedAndLogin, type TestContext } from './helpers.js';

let ctx: TestContext;
let token: string;

beforeEach(async () => {
  ctx = await createTestContext();
  token = await seedAndLogin(ctx, { email: 'admin@local.test', password: 'AdminPass123!', role: 'ADMIN' });

  for (const item of [
    { BARCODE: 'LF-1', BRAND: 'Apple', STATUS: 'READY' },
    { BARCODE: 'LF-2', BRAND: 'Apple', STATUS: 'READY' },
    { BARCODE: 'LF-3', BRAND: 'Samsung', STATUS: 'READY' }
  ]) {
    await gas('inventory.save', { token, item });
  }
});

afterEach(() => {
  ctx.cleanup();
});

function gas(action: string, params: Record<string, unknown> = {}) {
  return request(ctx.app).post('/api/gas').send({ action, params });
}

describe('local alerts', () => {
  it('saves panel-shaped alerts and evaluates them', async () => {
    const saved = await gas('alerts.save', {
      token,
      name: 'Low Apple',
      filterField: 'BRAND',
      filterValue: 'Apple',
      operator: 'LT',
      threshold: 3,
      emailTo: 'ops@example.com',
      telegram: 'ON',
      active: 'ON'
    });
    expect(saved.body.data.saved).toBe('Low Apple');

    const list = await gas('alerts.list', { token });
    const row = (list.body.data as Array<Record<string, string>>).find((entry) => entry['Alert Name'] === 'Low Apple');
    expect(row?.['Filter Field']).toBe('BRAND');
    expect(row?.Threshold).toBe('3');
    expect(row?.Telegram).toBe('ON');
    expect(row?.Active).toBe('ON');

    const check = await gas('alerts.check', { token });
    expect(check.body.data.total).toBe(1);
    const triggered = check.body.data.triggered as Array<{ name: string; count: number }>;
    expect(triggered[0].name).toBe('Low Apple');
    expect(triggered[0].count).toBe(2);
  });
});

describe('local report definitions', () => {
  it('creates, lists, bulk-creates and deletes reports', async () => {
    const created = await gas('reports.save', {
      token,
      name: 'Apple status',
      filterField: 'BRAND',
      filterValue: 'Apple',
      columns: 'STATUS,AGE_BUCKET',
      active: 'ON'
    });
    expect(created.body.data.saved).toBe('Apple status');

    const list = await gas('reports.list', { token });
    const row = (list.body.data as Array<Record<string, string>>).find((entry) => entry['Report Name'] === 'Apple status');
    expect(row?.['Filter Field']).toBe('BRAND');
    expect(row?.['Report Columns']).toBe('STATUS,AGE_BUCKET');
    expect(row?.Active).toBe('ON');

    const bulk = await gas('reports.bulkCreate', {
      token,
      reports: [
        { name: 'By location', filterField: 'LOCATION', filterValue: 'A1', columns: 'STATUS' },
        { name: 'By brand', columns: 'BRAND' }
      ]
    });
    expect((bulk.body.data.created as string[]).length).toBe(2);

    const removed = await gas('reports.delete', { token, name: 'Apple status' });
    expect(removed.body.data.deleted).toBe('Apple status');
  });
});

describe('local source data browser', () => {
  it('shows staged rows and import history after a commit', async () => {
    const csv = 'Barcode,Model,Brand,Status\nSD-1,Phone X,Acme,READY';
    const staged = await gas('import.fileB64', {
      token,
      fileName: 'source.csv',
      b64: Buffer.from(csv, 'utf8').toString('base64')
    });
    await gas('import.commit', { token, staging: staged.body.data.staging });

    const list = await gas('sourceData.list', { token });
    expect(list.body.status).toBe('ok');
    expect(list.body.data.total).toBeGreaterThan(0);
    expect(list.body.data.headers).toContain('BARCODE');

    const history = await gas('sourceData.history', { token });
    expect(history.body.data.headers).toContain('FILE');
    expect((history.body.data.data as unknown[]).length).toBeGreaterThan(0);
  });
});

describe('local selftest', () => {
  it('returns structured checks', async () => {
    const response = await gas('selftest.run', { token });
    expect(response.body.status).toBe('ok');
    expect(response.body.data.authVersion).toBe('local-2');
    const checks = response.body.data.checks as Array<{ name: string; ok: boolean }>;
    expect(checks.length).toBeGreaterThan(3);
    expect(checks.find((check) => check.name === 'User accounts')?.ok).toBe(true);
  });
});
