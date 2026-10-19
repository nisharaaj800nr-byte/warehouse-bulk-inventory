import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, loginAs, seedAndLogin, seedUser, type TestContext } from './helpers.js';
import { isDue, type ScheduledReportRow } from '../src/services/scheduledReports.js';

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

describe('scheduled reports', () => {
  it('creates, lists and deletes a schedule', async () => {
    const created = await gas('scheduled.save', {
      token,
      name: 'Weekly status',
      groupBy: 'status',
      frequency: 'WEEKLY',
      format: 'PDF',
      recipients: 'ops@example.com',
      filters: { brand: 'Apple' }
    });
    expect(created.body.status).toBe('ok');
    const id = Number(created.body.data.id);
    expect(id).toBeGreaterThan(0);

    const list = await gas('scheduled.list', { token });
    expect(list.body.status).toBe('ok');
    const row = (list.body.data as Array<{ id: number; name: string; active: boolean; filters: Record<string, string> }>).find(
      (entry) => entry.id === id
    );
    expect(row?.name).toBe('Weekly status');
    expect(row?.active).toBe(true);
    expect(row?.filters.brand).toBe('Apple');

    const removed = await gas('scheduled.delete', { token, id });
    expect(removed.body.data.deleted).toBe(true);

    const after = await gas('scheduled.list', { token });
    expect((after.body.data as unknown[]).length).toBe(0);
  });

  it('reports an actionable error when SMTP is not configured', async () => {
    const created = await gas('scheduled.save', {
      token,
      name: 'Daily brand',
      groupBy: 'brand',
      frequency: 'DAILY',
      format: 'XLSX',
      recipients: 'ops@example.com'
    });
    const id = Number(created.body.data.id);

    const run = await gas('scheduled.run', { token, id });
    expect(run.body.status).toBe('error');
    expect(String(run.body.message)).toMatch(/not configured/i);
  });

  it('rejects invalid schedules and non-admin writes', async () => {
    const bad = await gas('scheduled.save', {
      token,
      name: 'Bad',
      groupBy: 'nope',
      frequency: 'WEEKLY',
      format: 'PDF',
      recipients: 'ops@example.com'
    });
    expect(bad.body.status).toBe('error');

    await seedUser(ctx, { email: 'manager@local.test', password: 'ManagerPass123!', role: 'MANAGER' });
    const managerToken = await loginAs(ctx, 'manager@local.test', 'ManagerPass123!');

    const list = await gas('scheduled.list', { token: managerToken });
    expect(list.body.status).toBe('ok');

    const write = await gas('scheduled.save', {
      token: managerToken,
      name: 'Manager attempt',
      groupBy: 'status',
      frequency: 'WEEKLY',
      format: 'PDF',
      recipients: 'ops@example.com'
    });
    expect(write.body.code).toBe('FORBIDDEN');
  });
});

describe('isDue', () => {
  const base: ScheduledReportRow = {
    id: 1,
    name: 'x',
    group_by: 'status',
    filters_json: null,
    frequency: 'DAILY',
    format: 'PDF',
    recipients: 'a@b.c',
    is_active: 1,
    last_run_at: null,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  it('runs when it has never run before', () => {
    expect(isDue(base)).toBe(true);
  });

  it('waits for the period to elapse', () => {
    const now = Date.parse('2026-10-19T10:00:00.000Z');
    const recent = { ...base, last_run_at: '2026-10-19T09:00:00.000Z' };
    const old = { ...base, last_run_at: '2026-10-17T09:00:00.000Z' };
    expect(isDue(recent, now)).toBe(false);
    expect(isDue(old, now)).toBe(true);
  });

  it('never runs when inactive', () => {
    expect(isDue({ ...base, is_active: 0 })).toBe(false);
  });
});
