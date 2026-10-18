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

const CSV = [
  'Barcode,Model,Brand,Status,Age,Location',
  'PX-1,iPhone 13,Apple,L4,45,SW07',
  'PX-2,Galaxy S22,Samsung,L4,12,SW02'
].join('\n');

describe('panel import flow through the bridge', () => {
  it('stages a file, previews it and commits it', async () => {
    await gas('rules.age.save', { token, minAge: 30, maxAge: 59, bucket: '30-60', priority: 'P2' });

    const staged = await gas('import.fileB64', {
      token,
      fileName: 'daily.csv',
      b64: Buffer.from(CSV, 'utf8').toString('base64')
    });
    expect(staged.body.status).toBe('ok');
    expect(staged.body.data.headers).toEqual(['Barcode', 'Model', 'Brand', 'Status', 'Age', 'Location']);
    expect(staged.body.data.totalRows).toBe(2);
    const staging = staged.body.data.staging as string;

    const preview = await gas('import.previewPage', { token, staging, offset: 0, limit: 10 });
    expect(preview.body.data.rows).toHaveLength(2);
    expect(preview.body.data.rows[0][0]).toBe('PX-1');

    const commit = await gas('import.commit', { token, staging });
    expect(commit.body.status).toBe('ok');
    expect(commit.body.data.processed).toBe(2);
    expect(commit.body.data.imported).toBe(2);
    expect(commit.body.data.failed).toBe(0);

    const list = await gas('inventory.list', { token, q: 'PX-1' });
    expect(list.body.data.total).toBe(1);
    const row = list.body.data.rows[0];
    expect(row[0]).toBe('PX-1');
    expect(row[5]).toBe('30-60');
  });

  it('supports an explicit mapping instead of header guessing', async () => {
    const odd = ['SKU,Name,Make', 'MAP-1,Pixel 8,Google'].join('\n');
    const staged = await gas('import.fileB64', {
      token,
      fileName: 'odd.csv',
      b64: Buffer.from(odd, 'utf8').toString('base64')
    });
    const staging = staged.body.data.staging as string;

    const commit = await gas('import.commit', {
      token,
      staging,
      mapping: [
        { sourceColumn: 'SKU', targetField: 'BARCODE', isRequired: true },
        { sourceColumn: 'Name', targetField: 'MODEL' },
        { sourceColumn: 'Make', targetField: 'BRAND' }
      ]
    });
    expect(commit.body.data.imported).toBe(1);

    const list = await gas('inventory.list', { token, q: 'MAP-1' });
    expect(list.body.data.rows[0][1]).toBe('Pixel 8');
    expect(list.body.data.rows[0][2]).toBe('Google');
  });

  it('reports a mapping without barcode as an error', async () => {
    const staged = await gas('import.fileB64', {
      token,
      fileName: 'daily.csv',
      b64: Buffer.from(CSV, 'utf8').toString('base64')
    });
    const response = await gas('import.commit', {
      token,
      staging: staged.body.data.staging,
      mapping: [{ sourceColumn: 'Model', targetField: 'MODEL' }]
    });
    expect(response.body.status).toBe('error');
    expect(response.body.message).toContain('BARCODE');
  });
});

describe('configuration writes through the bridge', () => {
  it('creates a source and rejects duplicates', async () => {
    const created = await gas('sources.save', { token, name: 'QC Stock', sourceType: 'QC_STOCK' });
    expect(created.body.data.id).toBeTruthy();

    const duplicate = await gas('sources.save', { token, name: 'qc stock', sourceType: 'QC_STOCK' });
    expect(duplicate.body.status).toBe('error');
    expect(duplicate.body.code).toBe('DUPLICATE');
  });

  it('saves and lists age rules', async () => {
    await gas('rules.age.save', { token, minAge: 0, maxAge: 29, bucket: 'Below 30', priority: 'P2' });
    const list = await gas('rules.age.list', { token });
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].bucket).toBe('Below 30');
  });

  it('creates a user that can log in, then resets the password', async () => {
    const created = await gas('users.save', {
      token,
      email: 'operator@local.test',
      password: 'OperatorPass123!',
      role: 'OPERATOR'
    });
    expect(created.body.data.saved).toBe(true);

    const login = await gas('auth.login', { email: 'operator@local.test', password: 'OperatorPass123!' });
    expect(login.body.status).toBe('ok');
    expect(login.body.data.role).toBe('OPERATOR');

    const reset = await gas('auth.resetPassword', {
      token,
      email: 'operator@local.test',
      newPassword: 'NewOperatorPass123!'
    });
    expect(reset.body.data.reset).toBe(true);

    const oldLogin = await gas('auth.login', { email: 'operator@local.test', password: 'OperatorPass123!' });
    expect(oldLogin.body.status).toBe('error');

    const newLogin = await gas('auth.login', { email: 'operator@local.test', password: 'NewOperatorPass123!' });
    expect(newLogin.body.status).toBe('ok');
  });

  it('stores and returns settings', async () => {
    await gas('settings.save', { token, settings: { companyName: 'GMH', currency: 'INR' } });
    const response = await gas('settings.get', { token });
    expect(response.body.data.companyName).toBe('GMH');
  });

  it('generates a grouped report', async () => {
    await gas('inventory.save', { token, item: { BARCODE: 'RG-1', BRAND: 'Apple' } });
    await gas('inventory.save', { token, item: { BARCODE: 'RG-2', BRAND: 'Apple' } });

    const response = await gas('reports.generate', { token, groupBy: 'brand' });
    expect(response.body.status).toBe('ok');
    expect(response.body.data.rows).toBe(2);
    expect(response.body.data.groups[0].key).toBe('Apple');
  });
});

describe('first-run bootstrap', () => {
  it('creates the first owner once and returns a working token', async () => {
    const fresh = await createTestContext();
    try {
      const first = await request(fresh.app)
        .post('/api/gas')
        .send({ action: 'auth.bootstrap', params: { email: 'owner@shop.local', password: 'OwnerPass123!' } });

      expect(first.body.status).toBe('ok');
      expect(first.body.data.role).toBe('OWNER');
      expect(first.body.data.token).toMatch(/^[0-9a-f]{64}$/);

      const whoami = await request(fresh.app)
        .post('/api/gas')
        .send({ action: 'auth.whoami', params: { token: first.body.data.token } });
      expect(whoami.body.data.email).toBe('owner@shop.local');

      const second = await request(fresh.app)
        .post('/api/gas')
        .send({ action: 'auth.bootstrap', params: { email: 'other@shop.local', password: 'OtherPass123!' } });
      expect(second.body.status).toBe('error');
      expect(second.body.code).toBe('DUPLICATE');
    } finally {
      fresh.cleanup();
    }
  });

  it('rejects weak bootstrap credentials', async () => {
    const fresh = await createTestContext();
    try {
      const response = await request(fresh.app)
        .post('/api/gas')
        .send({ action: 'auth.bootstrap', params: { email: 'bad', password: '123' } });
      expect(response.body.status).toBe('error');
      expect(response.body.code).toBe('BAD_REQUEST');
    } finally {
      fresh.cleanup();
    }
  });
});

describe('backup', () => {
  it('creates an online SQLite backup file', async () => {
    const response = await request(ctx.app)
      .post('/api/gas')
      .send({ action: 'backup.run', params: { token } });

    expect(response.body.status).toBe('ok');
    expect(response.body.data.ok).toBe(true);
    expect(response.body.data.bytes).toBeGreaterThan(0);
    expect(require('node:fs').existsSync(response.body.data.file)).toBe(true);
  });

  it('rejects backup for non-admin roles', async () => {
    const viewer = await seedAndLogin(ctx, { email: 'v2@local.test', password: 'ViewerPass123!', role: 'VIEWER' });
    const response = await request(ctx.app)
      .post('/api/gas')
      .send({ action: 'backup.run', params: { token: viewer } });
    expect(response.body.status).toBe('error');
    expect(response.body.code).toBe('FORBIDDEN');
  });
});
