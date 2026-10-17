import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, loginAs, seedAndLogin, seedUser, type TestContext } from './helpers.js';

const EMAIL = 'admin@local.test';
const PASSWORD = 'AdminPass123!';

let ctx: TestContext;

beforeEach(async () => {
  ctx = await createTestContext();
});

afterEach(() => {
  ctx.cleanup();
});

describe('health', () => {
  it('reports a real database-backed health check', async () => {
    const response = await request(ctx.app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.data.db).toBe('connected');
    expect(response.body.data.schemaVersion).toBe(3);
  });

  it('returns the error envelope for unknown routes', async () => {
    const response = await request(ctx.app).get('/api/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body.ok).toBe(false);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});

describe('auth', () => {
  it('logs in a seeded user and returns a working token', async () => {
    await seedUser(ctx, { email: EMAIL, password: PASSWORD, role: 'ADMIN' });
    const login = await request(ctx.app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD });

    expect(login.status).toBe(200);
    expect(login.body.data.token).toMatch(/^[0-9a-f]{64}$/);
    expect(login.body.data.user.role).toBe('ADMIN');

    const whoami = await request(ctx.app)
      .get('/api/auth/whoami')
      .set('Authorization', `Bearer ${login.body.data.token}`);
    expect(whoami.status).toBe(200);
    expect(whoami.body.data.user.email).toBe(EMAIL);
  });

  it('rejects a wrong password with a generic message', async () => {
    await seedUser(ctx, { email: EMAIL, password: PASSWORD });
    const response = await request(ctx.app).post('/api/auth/login').send({ email: EMAIL, password: 'wrong-pass' });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
    expect(response.body.error.message).toBe('Invalid email or password');
  });

  it('rejects unknown emails with the same message as a wrong password', async () => {
    const response = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'nobody@local.test', password: 'whatever1' });
    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Invalid email or password');
  });

  it('validates the login payload', async () => {
    const response = await request(ctx.app).post('/api/auth/login').send({ email: 'not-an-email' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(response.body.error.details)).toBe(true);
  });

  it('revokes the session on logout', async () => {
    const token = await seedAndLogin(ctx, { email: EMAIL, password: PASSWORD });

    const logout = await request(ctx.app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(logout.status).toBe(200);

    const whoami = await request(ctx.app).get('/api/auth/whoami').set('Authorization', `Bearer ${token}`);
    expect(whoami.status).toBe(401);
  });

  it('rejects an expired session', async () => {
    const token = await seedAndLogin(ctx, { email: EMAIL, password: PASSWORD });
    ctx.db.prepare('UPDATE sessions SET expires_at = ?').run(new Date(Date.now() - 60_000).toISOString());

    const whoami = await request(ctx.app).get('/api/auth/whoami').set('Authorization', `Bearer ${token}`);
    expect(whoami.status).toBe(401);
  });

  it('locks the account after five failed attempts and blocks the correct password', async () => {
    await seedUser(ctx, { email: EMAIL, password: PASSWORD });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await request(ctx.app).post('/api/auth/login').send({ email: EMAIL, password: `wrong-${attempt}` });
      expect(response.status).toBe(401);
    }

    const locked = await request(ctx.app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD });
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(locked.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('allows login again once the lock window has passed', async () => {
    await seedUser(ctx, { email: EMAIL, password: PASSWORD });
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await request(ctx.app).post('/api/auth/login').send({ email: EMAIL, password: `wrong-${attempt}` });
    }
    ctx.db
      .prepare('UPDATE users SET locked_until = ?, failed_attempts = 0 WHERE email = ?')
      .run(new Date(Date.now() - 1000).toISOString(), EMAIL);

    const response = await request(ctx.app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD });
    expect(response.status).toBe(200);
    expect(response.body.data.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes the password and revokes other sessions', async () => {
    const tokenA = await seedAndLogin(ctx, { email: EMAIL, password: PASSWORD });
    const tokenB = await loginAs(ctx, EMAIL, PASSWORD);

    const wrong = await request(ctx.app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ currentPassword: 'nope', newPassword: 'NewPassword123!' });
    expect(wrong.status).toBe(401);

    const changed = await request(ctx.app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ currentPassword: PASSWORD, newPassword: 'NewPassword123!' });
    expect(changed.status).toBe(200);
    expect(changed.body.data.otherSessionsRevoked).toBe(1);

    const revoked = await request(ctx.app).get('/api/auth/whoami').set('Authorization', `Bearer ${tokenB}`);
    expect(revoked.status).toBe(401);

    const stillValid = await request(ctx.app).get('/api/auth/whoami').set('Authorization', `Bearer ${tokenA}`);
    expect(stillValid.status).toBe(200);

    const oldPassword = await request(ctx.app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD });
    expect(oldPassword.status).toBe(401);

    const newPassword = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: EMAIL, password: 'NewPassword123!' });
    expect(newPassword.status).toBe(200);
  });

  it('requires a bearer token for protected routes', async () => {
    const response = await request(ctx.app).get('/api/inventory');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });
});
