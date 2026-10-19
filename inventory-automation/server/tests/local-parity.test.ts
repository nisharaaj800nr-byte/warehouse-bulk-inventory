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

describe('local parity: sources', () => {
  it('saves and lists sources in the panel shape', async () => {
    const created = await gas('sources.save', {
      token,
      name: 'Daily Raw Data',
      type: 'Google Sheet',
      role: 'PRIMARY',
      sheet: 'Sheet1',
      sheetId: '',
      joinKey: 'BARCODE',
      joinFields: 'STOCK_AGE,LOCATION',
      active: 'ON'
    });
    expect(created.body.status).toBe('ok');
    const id = String(created.body.data.id);

    const list = await gas('sources.list', { token });
    const row = (list.body.data as Array<Record<string, string>>).find((entry) => entry['Source ID'] === id);
    expect(row?.['Source Name']).toBe('Daily Raw Data');
    expect(row?.Type).toBe('Google Sheet');
    expect(row?.Role).toBe('PRIMARY');
    expect(row?.['Join Fields']).toBe('STOCK_AGE,LOCATION');
    expect(row?.Active).toBe('ON');
  });

  it('deletes a source and keeps its mappings removable', async () => {
    const created = await gas('sources.save', {
      token,
      name: 'Temp Source',
      type: 'TRC',
      role: 'JOIN',
      active: 'ON'
    });
    const id = String(created.body.data.id);

    await gas('mapping.save', {
      token,
      mappings: [{ source: 'Temp Source', sourceColumn: 'Barcode', target: 'BARCODE', required: 'YES', active: 'ON', order: 1 }]
    });

    const removed = await gas('sources.delete', { token, id });
    expect(removed.body.data.deleted).toBe('Temp Source');

    const list = await gas('sources.list', { token });
    expect((list.body.data as unknown[]).some((entry) => (entry as Record<string, string>)['Source ID'] === id)).toBe(false);

    const mappings = await gas('mapping.list', { token });
    expect((mappings.body.data as unknown[]).length).toBe(0);
  });
});

describe('local parity: mapping', () => {
  it('saves mappings by source name and lists panel columns', async () => {
    await gas('sources.save', { token, name: 'QC Stock', type: 'QC_STOCK', role: 'JOIN', active: 'ON' });

    const saved = await gas('mapping.save', {
      token,
      mappings: [
        { source: 'QC Stock', sourceColumn: 'Barcode', target: 'BARCODE', required: 'YES', active: 'ON', order: 1 },
        { source: 'QC Stock', sourceColumn: 'Age', target: 'STOCK_AGE', required: 'NO', active: 'ON', order: 2 }
      ]
    });
    expect(saved.body.data.saved).toBe(2);

    const list = await gas('mapping.list', { token });
    const rows = list.body.data as Array<Record<string, string>>;
    expect(rows).toHaveLength(2);
    expect(rows[0].Source).toBe('QC Stock');
    expect(rows[0]['Target Field']).toBe('BARCODE');
    expect(rows[0].Required).toBe('YES');
    expect(rows[0].Active).toBe('ON');
  });
});

describe('local parity: priority rules and templates', () => {
  it('stores priority rules per field and returns them as panel rows', async () => {
    const saved = await gas('priorityRules.save', {
      token,
      rules: [
        { field: 'STATUS', p1: 'QC_STOCK', p2: 'TRC', p3: 'INVENTORY', p4: '', p5: '' },
        { field: 'LOCATION', p1: 'LOCATION', p2: 'INVENTORY', p3: '', p4: '', p5: '' }
      ],
      clear: true
    });
    expect(saved.body.data.saved).toBe(5);

    const list = await gas('priorityRules.list', { token });
    const rows = list.body.data as Array<Record<string, string>>;
    const status = rows.find((row) => row.FIELD === 'STATUS');
    expect(status?.['Priority 1']).toBe('QC_STOCK');
    expect(status?.['Priority 2']).toBe('TRC');
    expect(status?.['Priority 3']).toBe('INVENTORY');
  });

  it('creates, updates, lists and deletes report templates', async () => {
    const created = await gas('reports.templates.save', {
      token,
      name: 'Weekly status',
      configJson: JSON.stringify({ groupBy: 'status' }),
      active: 'ON'
    });
    expect(created.body.data.saved).toBe('Weekly status');

    await gas('reports.templates.save', {
      token,
      name: 'Weekly status',
      configJson: JSON.stringify({ groupBy: 'brand' }),
      active: 'OFF'
    });

    const list = await gas('reports.templates.list', { token });
    const row = (list.body.data as Array<Record<string, string>>).find((entry) => entry.Name === 'Weekly status');
    expect(row?.Active).toBe('OFF');
    expect(row?.['Config JSON']).toContain('brand');

    const bad = await gas('reports.templates.save', {
      token,
      name: 'Broken',
      configJson: 'not-json',
      active: 'ON'
    });
    expect(bad.body.status).toBe('error');

    const removed = await gas('reports.templates.delete', { token, name: 'Weekly status' });
    expect(removed.body.data.deleted).toBe('Weekly status');
  });
});
