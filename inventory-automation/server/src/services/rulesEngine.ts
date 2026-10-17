import type { Db } from '../db/index.js';

export interface AgeRule {
  id: number;
  min_age: number;
  max_age: number;
  bucket: string;
  priority: string;
  is_active: number;
}

export interface StatusRule {
  id: number;
  raw_status: string;
  bucket: string;
  marking: string | null;
  is_active: number;
}

export interface LocationRule {
  id: number;
  pattern: string;
  bucket: string;
  condition: string | null;
  is_active: number;
}

export interface PriorityRule {
  id: number;
  field: string;
  source_type: string;
  rank: number;
}

export interface RuleSets {
  age: AgeRule[];
  status: StatusRule[];
  location: LocationRule[];
}

export interface MappedRow {
  barcode: string;
  model?: string | null;
  brand?: string | null;
  status?: string | null;
  stockAge?: number | null;
  ageBucket?: string | null;
  priority?: string | null;
  statusBucket?: string | null;
  location?: string | null;
  binBucket?: string | null;
  sourceType?: string | null;
  [key: string]: unknown;
}

export interface AppliedRules {
  ageBucket: string | null;
  priority: string | null;
  statusBucket: string | null;
  binBucket: string | null;
}

export function loadRules(db: Db): RuleSets {
  const age = db
    .prepare('SELECT * FROM age_rules WHERE is_active = 1 ORDER BY min_age ASC')
    .all() as unknown as AgeRule[];
  const status = db
    .prepare('SELECT * FROM status_rules WHERE is_active = 1')
    .all() as unknown as StatusRule[];
  const location = db
    .prepare('SELECT * FROM location_rules WHERE is_active = 1 ORDER BY id ASC')
    .all() as unknown as LocationRule[];
  return { age, status, location };
}

function norm(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

export function matchAgeRule(stockAge: number | null | undefined, rules: AgeRule[]): AgeRule | null {
  if (stockAge === null || stockAge === undefined || Number.isNaN(Number(stockAge))) return null;
  const age = Number(stockAge);

  const matches = rules.filter((rule) => age >= Number(rule.min_age) && age <= Number(rule.max_age));
  if (matches.length === 0) return null;

  // Narrowest bucket wins, so overlapping config ranges never produce ambiguity.
  return [...matches].sort((a, b) => {
    const spanA = Number(a.max_age) - Number(a.min_age);
    const spanB = Number(b.max_age) - Number(b.min_age);
    if (spanA !== spanB) return spanA - spanB;
    return Number(a.min_age) - Number(b.min_age);
  })[0] as AgeRule;
}

export function matchStatusRule(status: string | null | undefined, rules: StatusRule[]): StatusRule | null {
  const value = norm(status).toLowerCase();
  if (!value) return null;
  return rules.find((rule) => norm(rule.raw_status).toLowerCase() === value) ?? null;
}

function parseRangePattern(pattern: string): { prefix: string; start: number; end: number } | null {
  const match = /^([A-Za-z]*)(\d+)\s*-\s*([A-Za-z]*)(\d+)$/.exec(pattern.trim());
  if (!match) return null;
  const [, prefixA, startText, prefixB, endText] = match;
  const prefix = (prefixA || '').toUpperCase();
  if (prefixB && prefixB.toUpperCase() !== prefix) return null;
  return { prefix, start: Number(startText), end: Number(endText) };
}

function matchesLocationPattern(pattern: string, location: string): boolean {
  const target = location.trim();
  if (!target) return false;

  const range = parseRangePattern(pattern);
  if (range) {
    const match = /^([A-Za-z]*)(\d+)$/.exec(target);
    if (!match) return false;
    const [, prefixRaw, numberRaw] = match;
    const prefix = (prefixRaw || '').toUpperCase();
    const number = Number(numberRaw);
    if (range.prefix && prefix !== range.prefix) return false;
    return number >= range.start && number <= range.end;
  }

  const trimmed = pattern.trim();
  if (trimmed.endsWith('*')) {
    return target.toUpperCase().startsWith(trimmed.slice(0, -1).toUpperCase());
  }

  return target.toLowerCase() === trimmed.toLowerCase();
}

function conditionHolds(condition: string, row: MappedRow): boolean {
  const clause = condition.trim();
  if (clause === '') return true;

  const [fieldRaw, expectedRaw] = clause.split('=');
  if (fieldRaw === undefined || expectedRaw === undefined) return false;

  const field = fieldRaw.trim();
  const expected = expectedRaw.trim().toLowerCase();
  const actual = norm((row as Record<string, unknown>)[field]).toLowerCase();
  return actual === expected;
}

export function matchLocationRule(
  location: string | null | undefined,
  rules: LocationRule[],
  row: MappedRow = { barcode: '' }
): LocationRule | null {
  const value = norm(location);
  if (!value) return null;

  for (const rule of rules) {
    if (rule.condition && !conditionHolds(rule.condition, row)) continue;
    if (matchesLocationPattern(rule.pattern, value)) return rule;
  }
  return null;
}

/** Applies age, status and location configuration to one mapped row. */
export function applyRules(row: MappedRow, rules: RuleSets): AppliedRules {
  const stockAge = row.stockAge === undefined || row.stockAge === null ? null : Number(row.stockAge);
  const ageRule = matchAgeRule(stockAge, rules.age);
  const statusRule = matchStatusRule(row.status, rules.status);

  const enriched: MappedRow = {
    ...row,
    ageBucket: ageRule ? ageRule.bucket : null,
    priority: ageRule ? ageRule.priority : null,
    statusBucket: statusRule ? statusRule.bucket : null
  };

  const locationRule = matchLocationRule(row.location, rules.location, enriched);

  return {
    ageBucket: enriched.ageBucket ?? null,
    priority: enriched.priority ?? null,
    statusBucket: enriched.statusBucket ?? null,
    binBucket: locationRule ? locationRule.bucket : null
  };
}
