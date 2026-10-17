import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, seedAndLogin, type TestContext } from './helpers.js';

let ctx: TestContext;
let adminToken: string;
let viewerToken: string;

const TOTAL = { email: 'admin@local.test', password: 'AdminPass123!' as const };
const VIEWER = { email: 'viewer@local.test', password: 'ViewerPass123!' as const };

beforeEach(async () => {
  ctx = await createTestContext();
  adminToken = await seedAndLogin(ctx, { ...TOTAL, role: 'ADMIN' });
  viewerToken = await seedAndLogin(ctx, { ...VIEWER, role: 'VIEWER' });
});

afterEach(() => {
  ctx.cleanup();
});

async function createItem(barcode: string, overrides: Record<string, unknown> = {}) {
  return request(ctx.app)
    .post('/api/inventory')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ barcode, model: 'iPhone 13', brand: 'Apple', status: 'L4', stockAge: 42, ...overrides });
}

describe('inventory CRUD', () => {
  it('creates an item and returns it', async () => {
    const response = await createItem('BC-0001');
    expect(response.status).toBe(201);
    expect(response.body.data.id).toBeGreaterThan(0);
    expect(response.body.data.barcode).toBe('BC-0001');
    expect(response.body.data.stockAge).toBe(42);
  });

  it('rejects a duplicate barcode with 409', async () => {
    await createItem('BC-0002');
    const duplicate = await createItem('BC-0002');
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('DUPLICATE');
  });

  it('rejects an invalid payload with 400 and field details', async () => {
    const response = await request(ctx.app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ barcode: '', stockAge: -5 });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    const paths = (response.body.error.details as Array<{ path: string }>).map((detail) => detail.path);
    expect(paths).toContain('barcode');
  });

  it('reads, updates and deletes an item', async () => {
    const created = await createItem('BC-0003', { model: 'Galaxy S22' });
    const id = created.body.data.id as number;

    const read = await request(ctx.app).get(`/api/inventory/${id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(read.status).toBe(200);
    expect(read.body.data.model).toBe('Galaxy S22');

    const update = await request(ctx.app)
      .put(`/api/inventory/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Marked L4', binBucket: 'BIN-01' });
    expect(update.status).toBe(200);
    expect(update.body.data.status).toBe('Marked L4');
    expect(update.body.data.binBucket).toBe('BIN-01');

    const remove = await request(ctx.app).delete(`/api/inventory/${id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(remove.status).toBe(200);

    const gone = await request(ctx.app).get(`/api/inventory/${id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(gone.status).toBe(404);
  });

  it('returns 404 for a missing item', async () => {
    const response = await request(ctx.app).get('/api/inventory/9999').set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(404);
  });

  it('blocks VIEWER from mutating inventory', async () => {
    const response = await request(ctx.app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ barcode: 'BC-0403' });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('allows VIEWER to read inventory', async () => {
    await createItem('BC-0404');
    const response = await request(ctx.app).get('/api/inventory').set('Authorization', `Bearer ${viewerToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(1);
  });
});

describe('inventory listing', () => {
  beforeEach(async () => {
    await createItem('BC-1001', { model: 'iPhone 14', status: 'L4', ageBucket: '30-60' });
    await createItem('BC-1002', { model: 'iPhone 15', status: 'L4', ageBucket: '60-75' });
    await createItem('BC-1003', { model: 'Pixel 8', brand: 'Google', status: 'Pending Approval', ageBucket: 'Below 30' });
  });

  it('paginates and reports meta', async () => {
    const response = await request(ctx.app)
      .get('/api/inventory?page=1&pageSize=2')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(2);
    expect(response.body.data.total).toBe(3);
    expect(response.body.data.pages).toBe(2);

    const page2 = await request(ctx.app)
      .get('/api/inventory?page=2&pageSize=2')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(page2.body.data.items).toHaveLength(1);
  });

  it('searches across barcode, model and brand', async () => {
    const byModel = await request(ctx.app)
      .get('/api/inventory?q=Pixel')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(byModel.body.data.total).toBe(1);
    expect(byModel.body.data.items[0].barcode).toBe('BC-1003');

    const byBrand = await request(ctx.app)
      .get('/api/inventory?q=Apple')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(byBrand.body.data.total).toBe(2);
  });

  it('filters by status and age bucket', async () => {
    const response = await request(ctx.app)
      .get('/api/inventory?status=L4&ageBucket=30-60')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(response.body.data.total).toBe(1);
    expect(response.body.data.items[0].barcode).toBe('BC-1001');
  });

  it('sorts by barcode ascending and descending', async () => {
    const asc = await request(ctx.app)
      .get('/api/inventory?sort=barcode&dir=asc')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(asc.body.data.items.map((item: { barcode: string }) => item.barcode)).toEqual([
      'BC-1001',
      'BC-1002',
      'BC-1003'
    ]);

    const desc = await request(ctx.app)
      .get('/api/inventory?sort=barcode&dir=desc')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(desc.body.data.items[0].barcode).toBe('BC-1003');
  });

  it('rejects invalid query parameters', async () => {
    const response = await request(ctx.app)
      .get('/api/inventory?sort=password&pageSize=9999')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(400);
  });
});

describe('inventory CSV export', () => {
  it('exports real rows and escapes commas and quotes', async () => {
    await createItem('BC-CSV1', { model: 'Phone, "Pro" edition' });

    const response = await request(ctx.app)
      .get('/api/inventory/export.csv')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    const text = response.text as string;
    const lines = text.trim().split('\r\n');
    expect(lines[0]).toBe(
      'barcode,model,brand,status,stock_age,age_bucket,priority,status_bucket,location,bin_bucket,source_type,created_at,updated_at'
    );
    expect(lines[1]).toContain('BC-CSV1');
    expect(lines[1]).toContain('"Phone, ""Pro"" edition"');
    expect(text.endsWith('\r\n')).toBe(true);
  });
});
