import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, seedAndLogin, type TestContext } from './helpers.js';

let ctx: TestContext;
let token: string;

beforeEach(async () => {
  ctx = await createTestContext();
  token = await seedAndLogin(ctx, { email: 'admin@local.test', password: 'AdminPass123!', role: 'ADMIN' });

  for (const [barcode, brand] of [
    ['EX-1', 'Apple'],
    ['EX-2', 'Apple'],
    ['EX-3', 'Samsung']
  ] as const) {
    const created = await request(ctx.app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send({ barcode, model: 'Model ' + barcode, brand, status: 'L4', stockAge: 40 });
    expect(created.status).toBe(201);
  }
});

afterEach(() => {
  ctx.cleanup();
});

describe('report exports', () => {
  it('exports an XLSX workbook with the expected MIME type and magic bytes', async () => {
    const response = await request(ctx.app)
      .get('/api/reports/export.xlsx?groupBy=brand')
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('spreadsheetml.sheet');
    const body = response.body as Buffer;
    expect(body.length).toBeGreaterThan(1000);
    expect(body.subarray(0, 2).toString('utf8')).toBe('PK');
  });

  it('exports a PDF document', async () => {
    const response = await request(ctx.app)
      .get('/api/reports/export.pdf?groupBy=brand')
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    const body = response.body as Buffer;
    expect(body.subarray(0, 4).toString('utf8')).toBe('%PDF');
    expect(body.length).toBeGreaterThan(500);
  });

  it('rejects an unknown grouping column', async () => {
    const response = await request(ctx.app)
      .get('/api/reports/export.xlsx?groupBy=password')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(400);
  });
});

describe('bulk edit', () => {
  it('updates several rows by barcode', async () => {
    const response = await request(ctx.app)
      .post('/api/inventory/bulk')
      .set('Authorization', `Bearer ${token}`)
      .send({ barcodes: ['EX-1', 'EX-2', 'MISSING'], patch: { statusBucket: 'BIN-X', location: 'SW09' } });

    expect(response.status).toBe(200);
    expect(response.body.data.matched).toBe(2);
    expect(response.body.data.updated).toBe(2);

    const list = await request(ctx.app)
      .get('/api/inventory?statusBucket=BIN-X')
      .set('Authorization', `Bearer ${token}`);
    expect(list.body.data.total).toBe(2);
    expect(list.body.data.items[0].location).toBe('SW09');
  });

  it('rejects an empty selector', async () => {
    const response = await request(ctx.app)
      .post('/api/inventory/bulk')
      .set('Authorization', `Bearer ${token}`)
      .send({ patch: { status: 'L4' } });
    expect(response.status).toBe(400);
  });
});

describe('email test', () => {
  it('explains that SMTP is not configured instead of failing silently', async () => {
    const response = await request(ctx.app)
      .post('/api/alerts/email-test')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('SMTP');
  });
});

describe('bridge exports', () => {
  it('returns a base64 xlsx through the panel contract', async () => {
    const response = await request(ctx.app)
      .post('/api/gas')
      .send({ action: 'reports.exportExcel', params: { token, groupBy: 'brand' } });

    expect(response.body.status).toBe('ok');
    const decoded = Buffer.from(response.body.data.base64, 'base64');
    expect(decoded.subarray(0, 2).toString('utf8')).toBe('PK');
    expect(response.body.data.fileName).toContain('brand');
  });

  it('bulk updates through the panel contract', async () => {
    const response = await request(ctx.app)
      .post('/api/gas')
      .send({
        action: 'inventory.bulkUpdate',
        params: { token, barcodes: ['EX-3'], patch: { STATUS_BUCKET: 'L4-BULK' } }
      });

    expect(response.body.status).toBe('ok');
    expect(response.body.data.updated).toBe(1);
  });
});

describe('external integrations are explicit when unconfigured', () => {
  it('reports WhatsApp as not configured', async () => {
    const response = await request(ctx.app)
      .post('/api/alerts/whatsapp-test')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('WHATSAPP_TOKEN');
  });

  it('reports Google login as not configured', async () => {
    const response = await request(ctx.app)
      .post('/api/gas')
      .send({ action: 'auth.google', params: { idToken: 'dummy-token' } });
    expect(response.body.status).toBe('error');
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.message).toContain('GOOGLE_CLIENT_ID');
  });

  it('rejects a Google login without a credential', async () => {
    const response = await request(ctx.app).post('/api/gas').send({ action: 'auth.google', params: {} });
    expect(response.body.status).toBe('error');
    expect(response.body.code).toBe('BAD_REQUEST');
  });
});
