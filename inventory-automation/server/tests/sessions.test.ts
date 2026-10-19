import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, loginAs, seedAndLogin, seedUser, type TestContext } from './helpers.js';

let ctx: TestContext;
let adminToken: string;

beforeEach(async () => {
  ctx = await createTestContext();
  adminToken = await seedAndLogin(ctx, { email: 'admin@local.test', password: 'AdminPass123!', role: 'ADMIN' });
});

afterEach(() => {
  ctx.cleanup();
});

function gas(action: string, params: Record<string, unknown> = {}) {
  return request(ctx.app).post('/api/gas').send({ action, params });
}

describe('sessions & login audit', () => {
  it('lists active sessions for administrators', async () => {
    const response = await gas('auth.sessions', { token: adminToken });

    expect(response.body.status).toBe('ok');
    expect(response.body.data.sessions.length).toBeGreaterThan(0);
    expect(response.body.data.sessions[0].email).toBe('admin@local.test');
    expect(response.body.data.sessions[0].id).toBeGreaterThan(0);
  });

  it('revokes a single session by id', async () => {
    await seedUser(ctx, { email: 'viewer@local.test', password: 'ViewerPass123!', role: 'VIEWER' });
    const viewerToken = await loginAs(ctx, 'viewer@local.test', 'ViewerPass123!');

    const sessions = await gas('auth.sessions', { token: adminToken });
    const target = (sessions.body.data.sessions as Array<{ id: number; email: string }>).find(
      (session) => session.email === 'viewer@local.test'
    );
    expect(target).toBeTruthy();

    const revoke = await gas('auth.revokeSession', { token: adminToken, id: target?.id });
    expect(revoke.body.data.revoked).toBe(true);

    const whoami = await gas('auth.whoami', { token: viewerToken });
    expect(whoami.body.code).toBe('AUTH_REQUIRED');
  });

  it('revokes every session for a user', async () => {
    await seedUser(ctx, { email: 'operator@local.test', password: 'OperatorPass123!', role: 'OPERATOR' });
    const first = await loginAs(ctx, 'operator@local.test', 'OperatorPass123!');
    const second = await loginAs(ctx, 'operator@local.test', 'OperatorPass123!');

    const revoke = await gas('auth.revokeSessions', { token: adminToken, email: 'operator@local.test' });
    expect(revoke.body.data.revoked).toBe(2);

    for (const token of [first, second]) {
      const whoami = await gas('auth.whoami', { token });
      expect(whoami.body.code).toBe('AUTH_REQUIRED');
    }
  });

  it('returns auth events in the login history', async () => {
    const response = await gas('auth.loginHistory', { token: adminToken, limit: 20 });

    expect(response.body.status).toBe('ok');
    const events = response.body.data.entries as Array<{ event: string; email: string }>;
    expect(events.some((entry) => entry.event === 'LOGIN_OK' && entry.email === 'admin@local.test')).toBe(true);
  });

  it('rejects session management for non-admins', async () => {
    await seedUser(ctx, { email: 'manager@local.test', password: 'ManagerPass123!', role: 'MANAGER' });
    const managerToken = await loginAs(ctx, 'manager@local.test', 'ManagerPass123!');

    const sessions = await gas('auth.sessions', { token: managerToken });
    expect(sessions.body.code).toBe('FORBIDDEN');

    const history = await gas('auth.loginHistory', { token: managerToken });
    expect(history.body.code).toBe('FORBIDDEN');
  });
});
