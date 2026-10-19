import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, seedAndLogin, type TestContext } from './helpers.js';

let ctx: TestContext;
let token: string;

beforeEach(async () => {
  ctx = await createTestContext();
  token = await seedAndLogin(ctx, { email: 'admin@local.test', password: 'AdminPass123!', role: 'ADMIN' });

  for (const item of [
    { BARCODE: 'AI-1', MODEL: 'iPhone 13', BRAND: 'Apple', STATUS: 'READY', STOCK_AGE: '90', LOCATION: 'A1' },
    { BARCODE: 'AI-2', MODEL: 'Galaxy S22', BRAND: 'Samsung', STATUS: 'READY', STOCK_AGE: '10', LOCATION: 'B2' },
    { BARCODE: 'AI-3', MODEL: 'iPhone 14', BRAND: 'Apple', STATUS: 'QC_FAIL', STOCK_AGE: '5', LOCATION: 'A1' }
  ]) {
    const response = await gas('inventory.save', { token, item });
    expect(response.body.status).toBe('ok');
  }
});

afterEach(() => {
  ctx.cleanup();
});

function gas(action: string, params: Record<string, unknown> = {}) {
  return request(ctx.app).post('/api/gas').send({ action, params });
}

describe('assistant (rules engine)', () => {
  it('lists devices by brand and minimum age', async () => {
    const response = await gas('ai.command', { token, text: '90 days se upar wale Apple devices dikhao' });

    expect(response.body.status).toBe('ok');
    expect(response.body.data.source).toBe('rules');
    expect(response.body.data.intent).toBe('list');
    expect(response.body.data.filters.brand).toBe('Apple');
    expect(response.body.data.filters.minAge).toBe(90);
    expect(response.body.data.rows).toHaveLength(1);
    expect(response.body.data.rows[0].barcode).toBe('AI-1');
  });

  it('counts devices in a location', async () => {
    const response = await gas('ai.command', { token, text: 'A1 me kitne devices hain' });

    expect(response.body.data.intent).toBe('count');
    expect(response.body.data.filters.location).toBe('A1');
    expect(response.body.data.count).toBe(2);
  });

  it('summarises the filtered inventory', async () => {
    const response = await gas('ai.command', { token, text: 'Apple inventory summary' });

    expect(response.body.data.intent).toBe('summary');
    expect(response.body.data.summary.total).toBe(2);
    expect(Array.isArray(response.body.data.summary.byStatus)).toBe(true);
  });
});

describe('assistant (LLM planner)', () => {
  it('uses the configured LLM and falls back to rules on bad JSON', async () => {
    let mode: 'good' | 'bad' = 'good';
    const server = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        const content =
          mode === 'good'
            ? JSON.stringify({ intent: 'count', filters: { brand: 'Samsung' }, limit: 10 })
            : 'not-json';
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content } }] }));
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      await gas('settings.save', {
        token,
        settings: {
          LLM_API_URL: `http://127.0.0.1:${port}/v1/chat/completions`,
          LLM_API_KEY: 'test-key',
          LLM_MODEL: 'test-model'
        }
      });

      const good = await gas('ai.command', { token, text: 'how many samsung devices' });
      expect(good.body.data.source).toBe('llm');
      expect(good.body.data.filters.brand).toBe('Samsung');
      expect(good.body.data.count).toBe(1);

      mode = 'bad';
      const fallback = await gas('ai.command', { token, text: 'A1 me kitne devices hain' });
      expect(fallback.body.data.source).toBe('rules');
      expect(fallback.body.data.filters.location).toBe('A1');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
