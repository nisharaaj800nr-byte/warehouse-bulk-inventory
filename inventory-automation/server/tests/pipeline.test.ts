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
});

afterEach(() => {
  ctx.cleanup();
});

async function createSource(name: string, sourceType = 'QC_STOCK') {
  return request(ctx.app)
    .post('/api/sources')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name, sourceType });
}

describe('sources and mapping', () => {
  it('lists the supported source types', async () => {
    const response = await request(ctx.app).get('/api/sources/types').set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(['QC_STOCK', 'TRC', 'INVENTORY', 'LOCATION', 'OTHER']);
  });

  it('creates a source and rejects a duplicate name', async () => {
    const created = await createSource('QC Stock');
    expect(created.status).toBe(201);
    expect(created.body.data.name).toBe('QC Stock');
    expect(created.body.data.joinKey).toBe('barcode');

    const duplicate = await createSource('qc stock');
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('DUPLICATE');
  });

  it('replaces the field mapping for a source', async () => {
    const source = await createSource('QC Stock');
    const sourceId = source.body.data.id as number;

    const mapping = await request(ctx.app)
      .put(`/api/sources/${sourceId}/mapping`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        mappings: [
          { sourceColumn: 'Barcode', targetField: 'BARCODE', isRequired: true, outputOrder: 1 },
          { sourceColumn: 'Model', targetField: 'MODEL', outputOrder: 2 },
          { sourceColumn: 'Age', targetField: 'STOCK_AGE', outputOrder: 3 }
        ]
      });
    expect(mapping.status).toBe(200);

    const list = await request(ctx.app)
      .get(`/api/sources/${sourceId}/mapping`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(3);
    expect(list.body.data[0].targetField).toBe('BARCODE');

    const duplicateColumn = await request(ctx.app)
      .put(`/api/sources/${sourceId}/mapping`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ mappings: [{ sourceColumn: 'X', targetField: 'BARCODE' }, { sourceColumn: 'x', targetField: 'MODEL' }] });
    expect(duplicateColumn.status).toBe(409);
  });

  it('blocks VIEWER from creating sources', async () => {
    const response = await request(ctx.app)
      .post('/api/sources')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'Nope', sourceType: 'TRC' });
    expect(response.status).toBe(403);
  });
});

describe('rules configuration', () => {
  it('creates and rejects inconsistent age rules', async () => {
    const created = await request(ctx.app)
      .post('/api/rules/age')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ minAge: 30, maxAge: 59, bucket: '30-60', priority: 'P2' });
    expect(created.status).toBe(201);

    const invalid = await request(ctx.app)
      .post('/api/rules/age')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ minAge: 80, maxAge: 10, bucket: 'bad', priority: 'P1' });
    expect(invalid.status).toBe(400);
  });

  it('creates status and location rules', async () => {
    const status = await request(ctx.app)
      .post('/api/rules/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rawStatus: 'Marked L4', bucket: 'L4', marking: 'Marked L4' });
    expect(status.status).toBe(201);

    const duplicate = await request(ctx.app)
      .post('/api/rules/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rawStatus: 'marked l4', bucket: 'L4' });
    expect(duplicate.status).toBe(409);

    const location = await request(ctx.app)
      .post('/api/rules/location')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pattern: 'SW01-SW10', bucket: 'BIN-01' });
    expect(location.status).toBe(201);
  });

  it('replaces source priority rules', async () => {
    const response = await request(ctx.app)
      .put('/api/rules/priority')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        rules: [
          { field: 'status', sourceType: 'QC_STOCK', rank: 1 },
          { field: 'status', sourceType: 'TRC', rank: 2 }
        ]
      });
    expect(response.status).toBe(200);
    expect(response.body.data.replaced).toBe(2);

    const list = await request(ctx.app).get('/api/rules/priority').set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.data).toHaveLength(2);
    expect(list.body.data[0].rank).toBe(1);
  });
});
