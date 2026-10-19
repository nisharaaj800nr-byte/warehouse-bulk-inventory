import type { Db } from '../db/index.js';

export interface AssistantFilters {
  brand?: string;
  location?: string;
  status?: string;
  ageBucket?: string;
  minAge?: number;
  maxAge?: number;
}

export type AssistantIntent = 'count' | 'list' | 'summary';

export interface AssistantPlan {
  intent: AssistantIntent;
  filters: AssistantFilters;
  limit: number;
  source: 'rules' | 'llm';
}

export interface AssistantResult {
  success: boolean;
  message: string;
  intent: AssistantIntent;
  filters: AssistantFilters;
  limit: number;
  source: 'rules' | 'llm';
  count?: number;
  rows?: Array<Record<string, unknown>>;
  summary?: Record<string, unknown>;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function distinct(db: Db, column: string): string[] {
  const rows = db
    .prepare(`SELECT DISTINCT ${column} AS value FROM inventory WHERE ${column} IS NOT NULL AND TRIM(${column}) <> ''`)
    .all() as unknown as Array<{ value: string }>;
  return rows.map((row) => String(row.value));
}

function findMatch(values: string[], text: string): string | undefined {
  const haystack = ` ${text.toLowerCase()} `;
  let best: string | undefined;
  for (const value of values) {
    const needle = value.toLowerCase().trim();
    if (needle.length < 2) continue;
    if (haystack.includes(needle) && (!best || needle.length > best.length)) best = value;
  }
  return best;
}

/** Deterministic Hindi/English parser used when no LLM is configured. */
export function planFromRules(db: Db, text: string): AssistantPlan {
  const lower = text.toLowerCase();
  const filters: AssistantFilters = {};

  const brand = findMatch(distinct(db, 'brand'), text);
  if (brand) filters.brand = brand;

  const location = findMatch(distinct(db, 'location'), text);
  if (location) filters.location = location;

  const status = findMatch(distinct(db, 'status'), text);
  if (status) filters.status = status;

  const ageBucket = findMatch(distinct(db, 'age_bucket'), text);
  if (ageBucket) filters.ageBucket = ageBucket;

  const ageMatch = lower.match(/(\d+)\s*(?:days?|din|दिन|દિવસ)/);
  if (ageMatch) {
    const value = Number(ageMatch[1]);
    if (/below|under|less than|se kam|से कम|થી ઓછા/.test(lower)) filters.maxAge = value;
    else filters.minAge = value;
  }

  let intent: AssistantIntent = 'list';
  if (/summary|overview|snapshot|saransh|सारांश|સારાંશ/.test(lower)) intent = 'summary';
  else if (/kitne|how many|count|number of|कितने|કેટલા/.test(lower)) intent = 'count';

  const limitMatch = lower.match(/(?:top|first|pehle|पहले)\s*(\d+)/);
  const limit = limitMatch ? Math.min(MAX_LIMIT, Math.max(1, Number(limitMatch[1]))) : DEFAULT_LIMIT;

  return { intent, filters, limit, source: 'rules' };
}

function buildWhere(filters: AssistantFilters): { where: string; params: Array<string | number> } {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (filters.brand) {
    clauses.push('brand = ?');
    params.push(filters.brand);
  }
  if (filters.location) {
    clauses.push('location = ?');
    params.push(filters.location);
  }
  if (filters.status) {
    clauses.push('status = ?');
    params.push(filters.status);
  }
  if (filters.ageBucket) {
    clauses.push('age_bucket = ?');
    params.push(filters.ageBucket);
  }
  if (filters.minAge !== undefined) {
    clauses.push('stock_age >= ?');
    params.push(filters.minAge);
  }
  if (filters.maxAge !== undefined) {
    clauses.push('stock_age <= ?');
    params.push(filters.maxAge);
  }

  return { where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export function executePlan(db: Db, plan: AssistantPlan): AssistantResult {
  const { where, params } = buildWhere(plan.filters);

  if (plan.intent === 'summary') {
    const total = db.prepare(`SELECT COUNT(*) AS count FROM inventory ${where}`).get(...params) as { count: number };
    const byStatus = db
      .prepare(
        `SELECT COALESCE(status, '(empty)') AS key, COUNT(*) AS count
           FROM inventory ${where}
          GROUP BY key ORDER BY count DESC LIMIT 10`
      )
      .all(...params) as unknown as Array<{ key: string; count: number }>;
    const byAge = db
      .prepare(
        `SELECT COALESCE(age_bucket, '(empty)') AS key, COUNT(*) AS count
           FROM inventory ${where}
          GROUP BY key ORDER BY count DESC LIMIT 10`
      )
      .all(...params) as unknown as Array<{ key: string; count: number }>;

    return {
      success: true,
      message: `${Number(total.count)} items match.`,
      intent: plan.intent,
      filters: plan.filters,
      limit: plan.limit,
      source: plan.source,
      summary: {
        total: Number(total.count),
        byStatus: byStatus.map((row) => ({ key: row.key, count: Number(row.count) })),
        byAgeBucket: byAge.map((row) => ({ key: row.key, count: Number(row.count) }))
      }
    };
  }

  if (plan.intent === 'count') {
    const total = db.prepare(`SELECT COUNT(*) AS count FROM inventory ${where}`).get(...params) as { count: number };
    return {
      success: true,
      message: `${Number(total.count)} items match.`,
      intent: plan.intent,
      filters: plan.filters,
      limit: plan.limit,
      source: plan.source,
      count: Number(total.count)
    };
  }

  const rows = db
    .prepare(
      `SELECT barcode, model, brand, status, stock_age, age_bucket, priority, status_bucket, location, bin_bucket
         FROM inventory ${where}
        ORDER BY stock_age DESC, barcode ASC
        LIMIT ?`
    )
    .all(...params, plan.limit) as unknown as Array<Record<string, unknown>>;

  return {
    success: true,
    message: `${rows.length} item(s) shown.`,
    intent: plan.intent,
    filters: plan.filters,
    limit: plan.limit,
    source: plan.source,
    count: rows.length,
    rows: rows.map((row) => ({
      barcode: row.barcode,
      model: row.model,
      brand: row.brand,
      status: row.status,
      stockAge: row.stock_age,
      ageBucket: row.age_bucket,
      priority: row.priority,
      statusBucket: row.status_bucket,
      location: row.location,
      binBucket: row.bin_bucket
    }))
  };
}

interface LlmSettings {
  url: string;
  key: string;
  model: string;
}

function readLlmSettings(db: Db): LlmSettings | null {
  const rows = db.prepare('SELECT key, value FROM settings').all() as unknown as Array<{ key: string; value: string }>;
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const url = (map.get('LLM_API_URL') ?? '').trim();
  const key = (map.get('LLM_API_KEY') ?? '').trim();
  const model = (map.get('LLM_MODEL') ?? 'gpt-4o-mini').trim();
  if (!url || !key) return null;
  return { url, key, model };
}

function sanitizePlan(raw: unknown): AssistantPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const intent = String(value.intent ?? '').toLowerCase();
  if (!['count', 'list', 'summary'].includes(intent)) return null;

  const rawFilters = (value.filters ?? {}) as Record<string, unknown>;
  const filters: AssistantFilters = {};
  for (const key of ['brand', 'location', 'status', 'ageBucket'] as const) {
    const entry = rawFilters[key];
    if (typeof entry === 'string' && entry.trim()) filters[key] = entry.trim();
  }
  for (const key of ['minAge', 'maxAge'] as const) {
    const entry = rawFilters[key];
    if (entry !== undefined && Number.isFinite(Number(entry))) {
      const numeric = Number(entry);
      if (numeric >= 0 && numeric <= 100000) filters[key] = numeric;
    }
  }

  const limit = Number(value.limit ?? DEFAULT_LIMIT);
  return {
    intent: intent as AssistantIntent,
    filters,
    limit: Number.isFinite(limit) ? Math.min(MAX_LIMIT, Math.max(1, limit)) : DEFAULT_LIMIT,
    source: 'llm'
  };
}

/**
 * Optional LLM planner. Any failure (no config, timeout, bad JSON, unknown
 * shape) silently falls back to the deterministic parser, so the assistant
 * always works offline.
 */
export async function planWithLlm(db: Db, text: string): Promise<AssistantPlan | null> {
  const settings = readLlmSettings(db);
  if (!settings) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(settings.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${settings.key}`
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You translate warehouse inventory questions into JSON. ' +
              'Reply with {"intent":"count|list|summary","filters":{"brand?":"","location?":"","status?":"","ageBucket?":"","minAge?":0,"maxAge?":0},"limit":25}. ' +
              'Only use filters that appear in the question. minAge means "older than N days", maxAge means "younger than N days".'
          },
          { role: 'user', content: text }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) return null;
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return null;
    return sanitizePlan(JSON.parse(content));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function runAssistant(db: Db, text: string): Promise<AssistantResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      success: false,
      message: 'Type a command first.',
      intent: 'list',
      filters: {},
      limit: DEFAULT_LIMIT,
      source: 'rules'
    };
  }

  const plan = (await planWithLlm(db, trimmed)) ?? planFromRules(db, trimmed);
  return executePlan(db, plan);
}
