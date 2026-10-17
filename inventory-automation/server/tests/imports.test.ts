import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, seedAndLogin, type TestContext } from './helpers.js';

let ctx: TestContext;
let token: string;
let sourceId: number;

const MAPPING = {
  mappings: [
    { sourceColumn: 'Barcode', targetField: 'BARCODE', isRequired: true, outputOrder: 1 },
    { sourceColumn: 'Model', targetField: 'MODEL', outputOrder: 2 },
    { sourceColumn: 'Brand', targetField: 'BRAND', outputOrder: 3 },
    { sourceColumn: 'Status', targetField: 'STATUS', outputOrder: 4 },
    { sourceColumn: 'Age', targetField: 'STOCK_AGE', outputOrder: 5 },
    { sourceColumn: 'Location', targetField: 'LOCATION', outputOrder: 6 }
  ]
};

beforeEach(async () => {
  ctx = await createTestContext();
  token = await seedAndLogin(ctx, { email: 'admin@local.test', password: 'AdminPass123!', role: 'ADMIN' });

  const source = await request(ctx.app)
    .post('/api/sources')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'QC Stock', sourceType: 'QC_STOCK' });
  sourceId = source.body.data.id as number;

  await request(ctx.app)
    .put(`/api/sources/${sourceId}/mapping`)
    .set('Authorization', `Bearer ${token}`)
    .send(MAPPING);

  await request(ctx.app)
    .post('/api/rules/age')
    .set('Authorization', `Bearer ${token}`)
    .send({ minAge: 0, maxAge: 29, bucket: 'Below 30', priority: 'P2' });
  await request(ctx.app)
    .post('/api/rules/age')
    .set('Authorization', `Bearer ${token}`)
    .send({ minAge: 30, maxAge: 59, bucket: '30-60', priority: 'P2' });
  await request(ctx.app)
    .post('/api/rules/age')
    .set('Authorization', `Bearer ${token}`)
    .send({ minAge: 60, maxAge: 999999, bucket: 'Above 60', priority: 'P4' });
  await request(ctx.app)
    .post('/api/rules/status')
    .set('Authorization', `Bearer ${token}`)
    .send({ rawStatus: 'L4', bucket: 'L4', marking: 'Marked L4' });
  await request(ctx.app)
    .post('/api/rules/location')
    .set('Authorization', `Bearer ${token}`)
    .send({ pattern: 'SW01-SW10', bucket: 'BIN-01' });
});

afterEach(() => {
  ctx.cleanup();
});

async function upload(rows: Array<Record<string, unknown>>) {
  return request(ctx.app)
    .post('/api/imports/upload')
    .set('Authorization', `Bearer ${token}`)
    .send({ sourceId, filename: 'daily.csv', rows });
}

describe('single source import', () => {
  it('stages valid rows and records row-level errors', async () => {
    const response = await upload([
      { Barcode: 'IMP-1', Model: 'iPhone 13', Brand: 'Apple', Status: 'L4', Age: '45', Location: 'SW07' },
      { Barcode: 'IMP-2', Model: 'Galaxy S22', Brand: 'Samsung', Status: 'L4', Age: '12', Location: 'SW02' },
      { Barcode: '', Model: 'Broken row', Brand: 'Apple', Status: 'L4', Age: '10', Location: 'SW03' }
    ]);

    expect(response.status).toBe(201);
    expect(response.body.data.rowsTotal).toBe(3);
    expect(response.body.data.rowsOk).toBe(2);
    expect(response.body.data.rowsFailed).toBe(1);
    expect(response.body.data.status).toBe('UPLOADED');
  });

  it('previews staged rows with mapped values', async () => {
    const job = await upload([
      { Barcode: 'IMP-3', Model: 'iPhone 14', Brand: 'Apple', Status: 'L4', Age: '45', Location: 'SW07' }
    ]);
    const jobId = job.body.data.id as number;

    const preview = await request(ctx.app)
      .get(`/api/imports/${jobId}/preview`)
      .set('Authorization', `Bearer ${token}`);

    expect(preview.status).toBe(200);
    expect(preview.body.data.rows).toHaveLength(1);
    expect(preview.body.data.rows[0].mapped.barcode).toBe('IMP-3');
    expect(preview.body.data.rows[0].mapped.stockAge).toBe(45);
  });

  it('commits a job, applies rules and cannot be committed twice', async () => {
    const job = await upload([
      { Barcode: 'IMP-4', Model: 'iPhone 15', Brand: 'Apple', Status: 'L4', Age: '45', Location: 'SW07' },
      { Barcode: 'IMP-5', Model: 'Pixel 8', Brand: 'Google', Status: 'L4', Age: '90', Location: 'SW40' }
    ]);
    const jobId = job.body.data.id as number;

    const commit = await request(ctx.app)
      .post(`/api/imports/${jobId}/commit`)
      .set('Authorization', `Bearer ${token}`);
    expect(commit.status).toBe(200);
    expect(commit.body.data.inserted).toBe(2);
    expect(commit.body.data.job.status).toBe('COMPLETE');

    const list = await request(ctx.app)
      .get('/api/inventory?sort=barcode&dir=asc')
      .set('Authorization', `Bearer ${token}`);
    expect(list.body.data.total).toBe(2);

    const first = list.body.data.items[0];
    expect(first.ageBucket).toBe('30-60');
    expect(first.priority).toBe('P2');
    expect(first.statusBucket).toBe('L4');
    expect(first.binBucket).toBe('BIN-01');

    const second = list.body.data.items[1];
    expect(second.ageBucket).toBe('Above 60');
    expect(second.binBucket).toBeNull();

    const again = await request(ctx.app)
      .post(`/api/imports/${jobId}/commit`)
      .set('Authorization', `Bearer ${token}`);
    expect(again.status).toBe(409);
  });

  it('discards an uploaded job and removes its staged rows', async () => {
    const job = await upload([{ Barcode: 'IMP-6', Model: 'X', Brand: 'Y', Status: 'L4', Age: '10', Location: 'SW01' }]);
    const jobId = job.body.data.id as number;

    const discard = await request(ctx.app)
      .post(`/api/imports/${jobId}/discard`)
      .set('Authorization', `Bearer ${token}`);
    expect(discard.status).toBe(200);

    const preview = await request(ctx.app)
      .get(`/api/imports/${jobId}/preview`)
      .set('Authorization', `Bearer ${token}`);
    expect(preview.body.data.total).toBe(0);
    expect(preview.body.data.job.status).toBe('DISCARDED');
  });

  it('rejects uploads for a source without mapping', async () => {
    const empty = await request(ctx.app)
      .post('/api/sources')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'No Mapping', sourceType: 'TRC' });

    const response = await request(ctx.app)
      .post('/api/imports/upload')
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceId: empty.body.data.id, rows: [{ Barcode: 'X' }] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('multi source merge', () => {
  it('resolves field conflicts by configured source priority', async () => {
    const trc = await request(ctx.app)
      .post('/api/sources')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'TRC Stock', sourceType: 'TRC' });
    const trcId = trc.body.data.id as number;

    await request(ctx.app)
      .put(`/api/sources/${trcId}/mapping`)
      .set('Authorization', `Bearer ${token}`)
      .send(MAPPING);

    await request(ctx.app)
      .put('/api/rules/priority')
      .set('Authorization', `Bearer ${token}`)
      .send({
        rules: [
          { field: 'brand', sourceType: 'QC_STOCK', rank: 1 },
          { field: 'brand', sourceType: 'TRC', rank: 5 }
        ]
      });

    const merge = await request(ctx.app)
      .post('/api/imports/merge')
      .set('Authorization', `Bearer ${token}`)
      .send({
        batches: [
          {
            sourceId,
            rows: [{ Barcode: 'MRG-1', Model: 'iPhone 13', Brand: 'Apple', Status: 'L4', Age: '40', Location: 'SW05' }]
          },
          {
            sourceId: trcId,
            rows: [{ Barcode: 'MRG-1', Model: 'iPhone 13', Brand: 'Apple Inc', Status: 'Marked L4', Age: '41', Location: 'SW06' }]
          }
        ]
      });

    expect(merge.status).toBe(200);
    expect(merge.body.data.devices).toBe(1);
    expect(merge.body.data.inserted).toBe(1);
    expect(merge.body.data.conflicts).toBeGreaterThan(0);

    const inventory = await request(ctx.app)
      .get('/api/inventory?q=MRG-1')
      .set('Authorization', `Bearer ${token}`);
    expect(inventory.body.data.items[0].brand).toBe('Apple');
    expect(inventory.body.data.items[0].sourceType).toBe('MULTI');

    const conflicts = await request(ctx.app).get('/api/conflicts').set('Authorization', `Bearer ${token}`);
    expect(conflicts.status).toBe(200);
    expect(conflicts.body.data.length).toBeGreaterThan(0);
    expect(conflicts.body.data[0].barcode).toBe('MRG-1');

    const cleared = await request(ctx.app).post('/api/conflicts/clear').set('Authorization', `Bearer ${token}`);
    expect(cleared.status).toBe(200);
  });
});
