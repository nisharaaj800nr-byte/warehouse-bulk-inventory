import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, seedAndLogin, type TestContext } from './helpers.js';

let ctx: TestContext;
let adminToken: string;
let viewerToken: string;

beforeEach(async () => {
  ctx = await createTestContext();
  adminToken = await seedAndLogin(ctx, { email: 'admin@local.test', password: 'AdminPass123!', role: 'ADMIN' });
  viewerToken = await seedAndLogin(ctx, { email: 'viewer@local.test', password: 'ViewerPass123!', role: 'VIEWER' });

  const items = [
    { barcode: 'INS-1', model: 'iPhone 13', brand: 'Apple', status: 'L4', stockAge: 40, ageBucket: '30-60' },
    { barcode: 'INS-2', model: 'iPhone 15', brand: 'Apple', status: 'L4', stockAge: 90, ageBucket: 'Above 60' },
    { barcode: 'INS-3', model: 'Pixel 8', brand: 'Google', status: 'Pending Approval', stockAge: 10, ageBucket: 'Below 30' }
  ];
  for (const item of items) {
    const response = await request(ctx.app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(item);
    expect(response.status).toBe(201);
  }
});

afterEach(() => {
  ctx.cleanup();
});

describe('reports', () => {
  it('groups inventory by a whitelisted column', async () => {
    const response = await request(ctx.app)
      .post('/api/reports/run')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ groupBy: 'brand' });

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(3);
    expect(response.body.data.groups[0]).toEqual({ key: 'Apple', count: 2 });
  });

  it('applies filters and rejects unknown grouping columns', async () => {
    const filtered = await request(ctx.app)
      .post('/api/reports/run')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ groupBy: 'status', filters: { brand: 'Apple' } });
    expect(filtered.body.data.total).toBe(2);

    const invalid = await request(ctx.app)
      .post('/api/reports/run')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ groupBy: 'password' });
    expect(invalid.status).toBe(400);
  });

  it('exports the grouped report as CSV', async () => {
    const response = await request(ctx.app)
      .get('/api/reports/export.csv?groupBy=brand')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    const lines = (response.text as string).trim().split('\r\n');
    expect(lines[0]).toBe('group_key,count');
    expect(lines[1]).toBe('Apple,2');
  });

  it('stores report templates', async () => {
    const created = await request(ctx.app)
      .post('/api/reports/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Brand split', config: { groupBy: 'brand' } });
    expect(created.status).toBe(201);

    const list = await request(ctx.app).get('/api/reports/templates').set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].config.groupBy).toBe('brand');
  });
});

describe('alerts', () => {
  it('fires an age alert when the threshold is crossed', async () => {
    const created = await request(ctx.app)
      .post('/api/alerts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Aging stock', type: 'AGE_OVER', thresholdValue: 60 });
    expect(created.status).toBe(201);

    const check = await request(ctx.app).post('/api/alerts/check').set('Authorization', `Bearer ${adminToken}`);
    expect(check.status).toBe(200);
    expect(check.body.data.checked).toBe(1);
    expect(check.body.data.firing).toBe(1);
    expect(check.body.data.results[0].value).toBe(1);
  });

  it('does not fire when nothing matches', async () => {
    await request(ctx.app)
      .post('/api/alerts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Ancient stock', type: 'AGE_OVER', thresholdValue: 5000 });

    const check = await request(ctx.app).post('/api/alerts/check').set('Authorization', `Bearer ${adminToken}`);
    expect(check.body.data.firing).toBe(0);
  });

  it('validates the alert payload', async () => {
    const response = await request(ctx.app)
      .post('/api/alerts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Bad', type: 'NOT_A_TYPE', thresholdValue: 1 });
    expect(response.status).toBe(400);
  });
});

describe('insights', () => {
  it('returns dashboard aggregates', async () => {
    const response = await request(ctx.app).get('/api/dashboard').set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data.inventoryTotal).toBe(3);
    expect(response.body.data.byStatus.length).toBeGreaterThan(0);
  });

  it('returns a data quality summary', async () => {
    const response = await request(ctx.app).get('/api/quality').set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data.inventoryTotal).toBe(3);
    expect(response.body.data.missingLocation).toBe(3);
    expect(response.body.data.score).toBeGreaterThanOrEqual(0);
  });

  it('returns a trends series', async () => {
    const response = await request(ctx.app).get('/api/trends?days=7').set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data.series)).toBe(true);
    expect(response.body.data.series[0].count).toBe(3);
  });
});

describe('user administration', () => {
  it('creates a user through the API and lists users without password hashes', async () => {
    const created = await request(ctx.app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'manager@local.test', password: 'ManagerPass123!', role: 'MANAGER' });
    expect(created.status).toBe(201);

    const list = await request(ctx.app).get('/api/users').set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    const serialized = JSON.stringify(list.body);
    expect(serialized).not.toContain('password');
    expect(list.body.data.some((user: { email: string }) => user.email === 'manager@local.test')).toBe(true);
  });

  it('blocks VIEWER from user administration', async () => {
    const response = await request(ctx.app).get('/api/users').set('Authorization', `Bearer ${viewerToken}`);
    expect(response.status).toBe(403);
  });

  it('prevents an admin from deactivating their own account', async () => {
    const me = await request(ctx.app).get('/api/auth/whoami').set('Authorization', `Bearer ${adminToken}`);
    const response = await request(ctx.app)
      .put(`/api/users/${me.body.data.user.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(response.status).toBe(403);
  });

  it('deactivating a user revokes their sessions', async () => {
    const created = await request(ctx.app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'temp@local.test', password: 'TempPass123!', role: 'VIEWER' });

    const login = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'temp@local.test', password: 'TempPass123!' });
    expect(login.status).toBe(200);
    const tempToken = login.body.data.token as string;

    const updated = await request(ctx.app)
      .put(`/api/users/${created.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(updated.status).toBe(200);

    const whoami = await request(ctx.app).get('/api/auth/whoami').set('Authorization', `Bearer ${tempToken}`);
    expect(whoami.status).toBe(401);
  });
});
