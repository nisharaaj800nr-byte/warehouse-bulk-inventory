import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, loginAs, seedAndLogin, type TestContext } from './helpers.js';
import { totpCode } from '../src/auth/totp.js';

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

function currentCode(secret: string): string {
  return totpCode(secret, Math.floor(Date.now() / 1000 / 30));
}

describe('TOTP', () => {
  it('matches the RFC 6238 SHA-1 test vector', () => {
    // "12345678901234567890" base32-encoded, counter 1 (T = 59s)
    expect(totpCode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1)).toBe('287082');
  });

  it('enables 2FA and requires the code on the next login', async () => {
    const setup = await gas('auth.totpSetup', { token });
    expect(setup.body.status).toBe('ok');
    const secret = String(setup.body.data.secret);
    expect(setup.body.data.otpauthUri).toContain('otpauth://totp/');

    const enabled = await gas('auth.totpEnable', { token, code: currentCode(secret) });
    expect(enabled.body.status).toBe('ok');
    expect(enabled.body.data.enabled).toBe(true);
    const recoveryCodes = enabled.body.data.recoveryCodes as string[];
    expect(recoveryCodes).toHaveLength(8);

    const missing = await gas('auth.login', { email: 'admin@local.test', password: 'AdminPass123!' });
    expect(missing.body.code).toBe('TOTP_REQUIRED');

    const wrong = await gas('auth.login', { email: 'admin@local.test', password: 'AdminPass123!', code: '000000' });
    expect(wrong.body.code).toBe('TOTP_INVALID');

    const ok = await gas('auth.login', {
      email: 'admin@local.test',
      password: 'AdminPass123!',
      code: currentCode(secret)
    });
    expect(ok.body.status).toBe('ok');
    expect(typeof ok.body.data.token).toBe('string');
  });

  it('accepts a recovery code exactly once', async () => {
    const setup = await gas('auth.totpSetup', { token });
    const secret = String(setup.body.data.secret);
    const enabled = await gas('auth.totpEnable', { token, code: currentCode(secret) });
    const recovery = enabled.body.data.recoveryCodes[0] as string;

    const first = await gas('auth.login', {
      email: 'admin@local.test',
      password: 'AdminPass123!',
      code: recovery
    });
    expect(first.body.status).toBe('ok');

    const second = await gas('auth.login', {
      email: 'admin@local.test',
      password: 'AdminPass123!',
      code: recovery
    });
    expect(second.body.code).toBe('TOTP_INVALID');
  });

  it('disables 2FA with password and code', async () => {
    const setup = await gas('auth.totpSetup', { token });
    const secret = String(setup.body.data.secret);
    await gas('auth.totpEnable', { token, code: currentCode(secret) });

    const disabled = await gas('auth.totpDisable', {
      token,
      password: 'AdminPass123!',
      code: currentCode(secret)
    });
    expect(disabled.body.status).toBe('ok');
    expect(disabled.body.data.enabled).toBe(false);

    const login = await gas('auth.login', { email: 'admin@local.test', password: 'AdminPass123!' });
    expect(login.body.status).toBe('ok');
  });

  it('lets an admin reset another user TOTP', async () => {
    await gas('users.save', {
      token,
      email: 'ops@local.test',
      role: 'OPERATOR',
      password: 'OperatorPass123!',
      active: true
    });

    const opsToken = await loginAs(ctx, 'ops@local.test', 'OperatorPass123!');
    const setup = await gas('auth.totpSetup', { token: opsToken });
    const secret = String(setup.body.data.secret);
    await gas('auth.totpEnable', { token: opsToken, code: currentCode(secret) });

    const reset = await gas('auth.totpReset', { token, email: 'ops@local.test' });
    expect(reset.body.data.reset).toBe(true);

    const login = await gas('auth.login', { email: 'ops@local.test', password: 'OperatorPass123!' });
    expect(login.body.status).toBe('ok');
  });
});

describe('password policy', () => {
  it('rejects short or letter-only passwords for new users', async () => {
    const short = await gas('users.save', {
      token,
      email: 'short@local.test',
      role: 'VIEWER',
      password: 'abc123',
      active: true
    });
    expect(short.body.status).toBe('error');

    const letters = await gas('users.save', {
      token,
      email: 'letters@local.test',
      role: 'VIEWER',
      password: 'onlylettershere',
      active: true
    });
    expect(letters.body.status).toBe('error');
  });

  it('rejects a weak password on change', async () => {
    const response = await gas('auth.changePassword', {
      token,
      oldPassword: 'AdminPass123!',
      newPassword: 'weakpass'
    });
    expect(response.body.status).toBe('error');
    expect(String(response.body.message)).toMatch(/at least 10|letters and numbers/i);
  });
});
