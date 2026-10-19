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

async function stage(sourceType: string, fileName: string, csv: string) {
  const response = await gas('import.multiSource.stage', {
    token,
    sourceType,
    fileName,
    b64: Buffer.from(csv, 'utf8').toString('base64')
  });
  expect(response.body.status).toBe('ok');
  return response.body.data as { staging: string; sourceId: string; totalRows: number };
}

describe('local multi-source merge', () => {
  it('merges files by barcode and rolls the job back', async () => {
    const qc = await stage('QC_STOCK', 'qc.csv', 'Barcode,Status,Age\nMX-1,QC_FAIL,80\nMX-2,READY,10');
    const trc = await stage('TRC', 'trc.csv', 'Barcode,Location\nMX-1,SW07\nMX-2,SW02');

    const run = await gas('import.multiSource.run', {
      token,
      stagings: [
        { staging: qc.staging, sourceId: qc.sourceId },
        { staging: trc.staging, sourceId: trc.sourceId }
      ]
    });

    expect(run.body.status).toBe('ok');
    expect(run.body.data.devices).toBe(2);
    expect(run.body.data.inserted).toBe(2);
    const jobId = Number(run.body.data.jobId);
    expect(jobId).toBeGreaterThan(0);

    const inventory = await gas('inventory.list', { token, q: 'MX-1' });
    const row = inventory.body.data.rows[0];
    expect(row[0]).toBe('MX-1');
    expect(row[3]).toBe('QC_FAIL');
    expect(row[8]).toBe('SW07');

    const rollback = await gas('import.rollback', { token, jobId });
    expect(rollback.body.status).toBe('ok');
    expect(rollback.body.data.removed).toBe(2);

    const after = await gas('inventory.list', { token, q: 'MX-1' });
    expect(after.body.data.total).toBe(0);
  });

  it('records conflicts when sources disagree', async () => {
    const qc = await stage('QC_STOCK', 'qc.csv', 'Barcode,Status\nCF-1,QC_FAIL');
    const trc = await stage('TRC', 'trc.csv', 'Barcode,Status\nCF-1,READY');

    const run = await gas('import.multiSource.run', {
      token,
      stagings: [
        { staging: qc.staging, sourceId: qc.sourceId },
        { staging: trc.staging, sourceId: trc.sourceId }
      ]
    });
    expect(run.body.status).toBe('ok');
    expect(run.body.data.conflicts).toBe(1);

    const conflicts = await gas('conflicts.list', { token });
    expect(conflicts.body.status).toBe('ok');
    expect((conflicts.body.data.rows as unknown[]).length).toBeGreaterThan(0);
    expect(conflicts.body.data.total).toBeGreaterThan(0);
  });

  it('rejects unknown source types', async () => {
    const bad = await gas('import.multiSource.stage', {
      token,
      sourceType: 'NOPE',
      fileName: 'x.csv',
      b64: Buffer.from('Barcode\nX', 'utf8').toString('base64')
    });
    expect(bad.body.status).toBe('error');
    expect(bad.body.code).toBe('BAD_REQUEST');
  });
});
