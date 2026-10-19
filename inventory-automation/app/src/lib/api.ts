/* API client for the Bulk Repair backend (code-api.gs v1.1).

   Transports:
   - gas : google.script.run → runApi()            (when served by Apps Script)
   - http: POST JSON to the deployed /exec URL     (static hosting / dev)
   - demo: local fixtures, no network              (UI preview)

   Session token lives in localStorage['ors.token'] and is auto-injected as
   params.token on every call except the public actions. */
import { demoCall } from './demo';

export type Role = 'VIEWER' | 'OPERATOR' | 'MANAGER' | 'ADMIN' | 'OWNER';
export type ApiMode = 'gas' | 'http' | 'demo';

export class ApiError extends Error {
  code: string;
  constructor(message: string, code = 'BACKEND_ERROR') {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

/* ---------------- local storage helpers ---------------- */

function safeGet(key: string): string {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}
function safeSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}
function safeRemove(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

const TOKEN_KEY = 'ors.token';
const URL_KEY = 'ors.apiUrl';
const MODE_KEY = 'ors.mode';
const SHEET_KEY = 'ors.sheet';
const SETUP_KEY = 'ors.setup';

export const getToken = (): string => safeGet(TOKEN_KEY);
export const setToken = (t: string): void => safeSet(TOKEN_KEY, t);
export const clearToken = (): void => safeRemove(TOKEN_KEY);
export const getSheetUrl = (): string => safeGet(SHEET_KEY);
export const setSheetUrl = (url: string): void => safeSet(SHEET_KEY, url.trim());
export const isSetupDone = (): boolean => safeGet(SETUP_KEY) === 'yes';
export const markSetupDone = (done: boolean): void => { if (done) safeSet(SETUP_KEY, 'yes'); else safeRemove(SETUP_KEY); };
export const clearApiUrl = (): void => safeRemove(URL_KEY);

export const getApiUrl = (): string => {
  const stored = safeGet(URL_KEY);
  if (stored) return stored;
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl;
  // Served by the local server (or a packaged desktop/mobile shell) the panel
  // and the API share one origin, so /api/gas is the correct default.
  try {
    if (typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol)) return '/api/gas';
    // Packaged desktop shell (file://) talks to the local server by default.
    if (typeof window !== 'undefined' && window.location.protocol === 'file:') return 'http://localhost:5050/api/gas';
  } catch {
    /* ignore */
  }
  return '';
};
export const setApiUrl = (u: string): void => safeSet(URL_KEY, u.trim());

/* ---------------- mode detection ---------------- */

interface GasRunnerLike {
  runApi: (action: string, params: Record<string, unknown>) => void;
  withSuccessHandler: (fn: (data: unknown) => void) => GasRunnerLike;
  withFailureHandler: (fn: (err: Error) => void) => GasRunnerLike;
}

function getGoogleRunner(): GasRunnerLike | null {
  try {
    const g = (globalThis as { google?: { script?: { run?: GasRunnerLike } } }).google;
    return g?.script?.run ?? null;
  } catch {
    return null;
  }
}

export function getApiMode(): ApiMode {
  const override = safeGet(MODE_KEY);
  if (override === 'demo') return 'demo';
  return getGoogleRunner() ? 'gas' : 'http';
}

export const isDemoMode = (): boolean => getApiMode() === 'demo';
export const setDemoMode = (on: boolean): void => {
  if (on) safeSet(MODE_KEY, 'demo');
  else safeRemove(MODE_KEY);
};

/* ---------------- unauthorized events ---------------- */

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();

export function onUnauthorized(fn: Listener): () => void {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
}
function emitUnauthorized(): void {
  unauthorizedListeners.forEach((fn) => fn());
}

/* ---------------- core call ---------------- */

const PUBLIC_ACTIONS = new Set(['health', 'auth.login', 'auth.logout']);

type Params = Record<string, unknown>;

/* ---------------- offline write queue ---------------- */

const QUEUE_KEY = 'ors.pending';
const OFFLINE_WRITABLE = new Set(['inventory.save', 'inventory.delete']);

export interface QueuedWrite {
  id: string;
  action: string;
  params: Params;
  at: string;
}

function readQueue(): QueuedWrite[] {
  try {
    const raw = safeGet(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedWrite[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedWrite[]): void {
  safeSet(QUEUE_KEY, JSON.stringify(items));
}

export const getQueuedCount = (): number => readQueue().length;

function enqueue(action: string, params: Params): void {
  const items = readQueue();
  items.push({ id: Math.random().toString(36).slice(2), action, params, at: new Date().toISOString() });
  writeQueue(items);
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return ['BACKEND_ERROR', 'NO_URL', 'BAD_RESPONSE', 'NO_TRANSPORT'].includes(error.code);
  }
  return error instanceof TypeError;
}

export async function flushQueuedWrites(): Promise<{ sent: number; left: number }> {
  const items = readQueue();
  if (items.length === 0) return { sent: 0, left: 0 };

  const remaining: QueuedWrite[] = [];
  let sent = 0;
  for (const item of items) {
    try {
      await callApi(item.action, item.params, { bypassQueue: true });
      sent += 1;
    } catch {
      remaining.push(item);
    }
  }
  writeQueue(remaining);
  return { sent, left: remaining.length };
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void flushQueuedWrites();
  });
  window.setTimeout(() => {
    if (navigator.onLine) void flushQueuedWrites();
  }, 1500);
}

export async function callApi<T>(
  action: string,
  params: Params = {},
  options: { bypassQueue?: boolean } = {}
): Promise<T> {
  const mode = getApiMode();
  const token = getToken();
  const args: Params = { ...params };
  if (token && !PUBLIC_ACTIONS.has(action)) args.token = token;
  try {
    if (mode === 'demo') return (await demoCall(action, args)) as T;
    if (mode === 'gas') return await gasCall<T>(action, args);
    return await httpCall<T>(action, args);
  } catch (err) {
    const e =
      err instanceof ApiError
        ? err
        : new ApiError(String((err as Error)?.message || err), 'BACKEND_ERROR');
    if (e.code === 'AUTH_REQUIRED' && token && !PUBLIC_ACTIONS.has(action)) {
      clearToken();
      emitUnauthorized();
    }
    if (!options.bypassQueue && OFFLINE_WRITABLE.has(action) && isNetworkError(e)) {
      enqueue(action, params);
      const queuedItem = (params['item'] ?? {}) as Record<string, unknown>;
      return {
        ok: true,
        queued: true,
        barcode: String(queuedItem['BARCODE'] ?? params['barcode'] ?? ''),
        mode: 'queued',
      } as unknown as T;
    }
    throw e;
  }
}

/* ---------------- gas transport ---------------- */

function gasCall<T>(action: string, params: Params): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const runner = getGoogleRunner();
    if (!runner) {
      reject(new ApiError('Google Apps Script runtime not available. Open the portal from the deployment URL.', 'NO_TRANSPORT'));
      return;
    }
    runner
      .withSuccessHandler((data: unknown) => resolve(data as T))
      .withFailureHandler((err: Error) => reject(normalizeServerError(err)))
      .runApi(action, params);
  });
}

/* ---------------- http transport ----------------
   Content-Type text/plain avoids a CORS preflight (Apps Script web apps
   do not answer OPTIONS requests). The server parses the raw body as JSON. */

async function httpCall<T>(action: string, params: Params): Promise<T> {
  const url = getApiUrl();
  if (!url) {
    throw new ApiError('Backend URL is not configured. Open connection settings and paste the /exec URL.', 'NO_URL');
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, params }),
    redirect: 'follow',
  });
  const text = await res.text();
  let parsed: { status?: string; data?: unknown; message?: string; code?: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError('Unexpected response from the backend (not JSON). Check the deployment URL and access settings.', 'BAD_RESPONSE');
  }
  if (parsed.status === 'ok') return parsed.data as T;
  throw new ApiError(parsed.message || 'Backend error', parsed.code || 'BACKEND_ERROR');
}

function normalizeServerError(err: Error): ApiError {
  const msg = String(err?.message || err || 'Request failed');
  const codes = ['AUTH_REQUIRED', 'AUTH_FAILED', 'AUTH_LOCKED', 'FORBIDDEN', 'BACKEND_ERROR', 'BAD_REQUEST'];
  const hit = codes.find((c) => msg.startsWith(c));
  if (hit) return new ApiError(msg, hit);
  if (msg.startsWith('Permission denied')) return new ApiError(msg, 'FORBIDDEN');
  return new ApiError(msg, 'BACKEND_ERROR');
}

/* ---------------- typed actions ---------------- */

export interface SessionInfo {
  email: string;
  role: Role;
  expiresAt: string | null;
  legacy: boolean;
}
export interface LoginResult {
  token: string;
  email: string;
  role: Role;
  expiresAt: string;
}
export interface SheetData {
  headers: string[];
  data: unknown[][];
}
export interface DashboardData {
  inventoryCount: number;
  headers: string[];
  recentRuns: unknown[][];
  recentErrors: unknown[][];
  sourcesActive: number;
  reportsActive: number;
  byStatus?: { key: string; count: number }[];
  byAgeBucket?: { key: string; count: number }[];
  byStatusBucket?: { key: string; count: number }[];
  topBrands?: { key: string; count: number }[];
}
export interface InventoryListResult {
  rows: unknown[][];
  total: number;
  headers: string[];
  page: number;
  perPage: number;
}
export type Row = Record<string, unknown>;
export interface ImportStaged {
  ok: boolean;
  fileName: string;
  format?: string;
  staging?: string;
  headers: string[];
  totalRows: number;
  totalCols?: number;
  preview?: string[][];
  tabs?: { name: string; rows: number; cols: number }[];
  activeTab?: string;
  isPdf?: boolean;
  warnings?: string[];
}
export interface ImportCommitResult {
  ok: boolean;
  dryRun: boolean;
  jobId?: number;
  processed: number;
  valid: number;
  imported: number;
  failed: number;
  skipped: number;
  warnings: string[];
  errorSample: { row: number; errors: string[] }[];
}

export type ScheduleFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type ScheduleFormat = 'PDF' | 'XLSX';

export interface ScheduledReport {
  id: number;
  name: string;
  groupBy: string;
  filters: Record<string, string>;
  frequency: ScheduleFrequency;
  format: ScheduleFormat;
  recipients: string;
  active: boolean;
  lastRunAt: string;
  createdAt: string;
}

export interface StockMovement {
  id: number;
  at: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
}

export interface SessionRecord {
  id: number;
  email: string;
  role: Role;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

export interface LoginEvent {
  at: string;
  email: string;
  event: string;
  ip: string;
}

export const api = {
  health: () => callApi<Record<string, unknown>>('health'),
  login: (email: string, password: string, rememberMe: boolean) =>
    callApi<LoginResult>('auth.login', { email, password, rememberMe }),
  bootstrapOwner: (email: string, password: string) =>
    callApi<LoginResult>('auth.bootstrap', { email, password }),
  logout: () => callApi<{ revoked: boolean }>('auth.logout', { token: getToken() }),
  whoami: () => callApi<SessionInfo>('auth.whoami'),
  changePassword: (oldPassword: string, newPassword: string) =>
    callApi<{ changed: boolean }>('auth.changePassword', { oldPassword, newPassword }),
  dashboard: () => callApi<DashboardData>('dashboard'),
  inventoryList: (params: Params) => callApi<InventoryListResult>('inventory.list', params),
  inventoryExport: (columns: string[]) =>
    callApi<{ csv: string; rows: number }>('inventory.export', { columns: columns.join(',') }),
  inventorySave: (item: Record<string, string>) =>
    callApi<{ ok: boolean; barcode: string; mode: string }>('inventory.save', { item }),
  inventoryHistory: (barcode: string, limit = 50) =>
    callApi<{ barcode: string; movements: StockMovement[] }>('inventory.history', { barcode, limit }),
  inventoryDelete: (barcode: string) =>
    callApi<{ ok: boolean; barcode: string }>('inventory.delete', { barcode }),
  trends: () => callApi<SheetData>('trends.list'),
  runProcess: () => callApi<Record<string, unknown>>('process.run'),

  /* Sources & mapping */
  sourcesList: (all = false) => callApi<Row[]>('sources.list', all ? { all: true } : {}),
  sourcesSave: (params: Record<string, unknown>) => callApi<{ id: string }>('sources.save', params),
  sourcesTypes: () => callApi<string[]>('sources.types'),
  mappingList: (all = false) => callApi<Row[]>('mapping.list', all ? { all: true } : {}),
  mappingHeaders: () => callApi<{ headers: string[] }>('mapping.headers'),
  mappingSave: (mappings: Record<string, unknown>[]) =>
    callApi<{ saved: number }>('mapping.save', { mappings }),

  /* Rules */
  ageRules: () => callApi<Row[]>('rules.age.list'),
  ageRuleSave: (params: Record<string, unknown>) => callApi<{ saved: boolean }>('rules.age.save', params),
  statusRules: () => callApi<Row[]>('rules.status.list'),
  statusRuleSave: (params: Record<string, unknown>) => callApi<{ saved: boolean }>('rules.status.save', params),
  locationRules: () => callApi<Row[]>('rules.location.list'),
  locationRuleSave: (params: Record<string, unknown>) => callApi<{ saved: boolean }>('rules.location.save', params),

  /* Reports */
  reportsList: () => callApi<Row[]>('reports.list'),
  reportSave: (params: Record<string, unknown>) => callApi<{ saved: string }>('reports.save', params),
  reportDelete: (name: string) => callApi<{ deleted: string }>('reports.delete', { name }),
  reportGenerate: (params: Record<string, unknown>) =>
    callApi<{ report: string; rows: number }>('reports.generate', params),
  reportsBulkCreate: (reports: Record<string, unknown>[]) =>
    callApi<{ created: string[] }>('reports.bulkCreate', { reports }),
  reportsExportAll: () => callApi<Record<string, unknown>>('reports.exportToSheet'),
  templatesList: () => callApi<Row[]>('reports.templates.list'),
  templateSave: (params: Record<string, unknown>) =>
    callApi<{ saved: string }>('reports.templates.save', params),
  templateDelete: (name: string) => callApi<{ deleted: string }>('reports.templates.delete', { name }),

  /* Alerts */
  alertsList: (all = false) => callApi<Row[]>('alerts.list', all ? { all: true } : {}),
  alertSave: (params: Record<string, unknown>) => callApi<{ saved: string }>('alerts.save', params),
  alertDelete: (name: string) => callApi<{ deleted: string }>('alerts.delete', { name }),
  alertsCheck: () => callApi<{ triggered: Row[]; total: number }>('alerts.check'),

  scheduledList: () => callApi<ScheduledReport[]>('scheduled.list'),
  scheduledSave: (params: Record<string, unknown>) =>
    callApi<{ saved: boolean; id: number }>('scheduled.save', params),
  scheduledDelete: (id: number) => callApi<{ deleted: boolean }>('scheduled.delete', { id }),
  scheduledRun: (id: number) =>
    callApi<{ ok: boolean; sentTo: string; format: ScheduleFormat; bytes: number }>('scheduled.run', { id }),
  scheduledCheck: () => callApi<{ ran: number; results: unknown[] }>('scheduled.check'),

  /* Users & security */
  authUsers: () =>
    callApi<{
      users: {
        email: string;
        role: Role;
        active: string;
        hasPassword: boolean;
        lockedUntil: string;
        lastLogin: string;
      }[];
    }>('auth.users'),
  userSave: (params: Record<string, unknown>) =>
    callApi<{ saved: boolean; updated: boolean; passwordSet: boolean }>('users.save', params),
  resetPassword: (email: string, newPassword: string) =>
    callApi<{ reset: boolean }>('auth.resetPassword', { email, newPassword }),
  authSessions: () => callApi<{ sessions: SessionRecord[] }>('auth.sessions'),
  revokeSession: (id: number) => callApi<{ revoked: boolean }>('auth.revokeSession', { id }),
  revokeUserSessions: (email: string) => callApi<{ revoked: number }>('auth.revokeSessions', { email }),
  loginHistory: (limit = 100) => callApi<{ entries: LoginEvent[] }>('auth.loginHistory', { limit }),
  securityList: () => callApi<Row[]>('security.list'),
  securityUnlock: (sheet: string) => callApi<unknown>('security.unlock', { sheet }),
  securityLock: (sheet: string) => callApi<unknown>('security.lock', { sheet }),

  /* Activity & audit */
  activityList: () => callApi<SheetData>('activity.list'),
  historyList: () => callApi<SheetData>('history.list'),
  errorsList: () => callApi<SheetData>('errors.list'),
  qualitySummary: () => callApi<{ totalErrors: number; bySource: Record<string, number> }>('quality.summary'),

  /* Settings & ops */
  settingsGet: () => callApi<Record<string, string>>('settings.get'),
  settingsSave: (settings: Record<string, string>) =>
    callApi<{ saved: boolean }>('settings.save', { settings }),
  telegramTest: () => callApi<{ ok: boolean }>('telegram.test'),
  emailTest: () => callApi<{ sentTo: string }>('email.test'),
  backupRun: () => callApi<Record<string, unknown>>('backup.run'),
  selftest: () =>
    callApi<{ ok: boolean; checks: { name: string; ok: boolean; detail: string }[]; authVersion?: string }>(
      'selftest.run',
    ),

  /* Imports */
  importFileB64: (b64: string, fileName: string) => callApi<ImportStaged>('import.fileB64', { b64, fileName }),
  importSheets: (sheetId: string, tab?: string) => callApi<ImportStaged>('import.sheets', { sheetId, tab }),
  importTabs: (sheetId: string) =>
    callApi<{ name: string; rows: number; cols: number }[]>('import.tabs', { sheetId }),
  importPreviewPage: (offset: number, limit: number) =>
    callApi<{ headers: string[]; rows: unknown[][]; offset: number; totalRows: number }>(
      'import.previewPage',
      { offset, limit },
    ),
  importCommit: (params: Record<string, unknown>) => callApi<ImportCommitResult>('import.commit', params),
  importRollback: (jobId: number) =>
    callApi<{ ok: boolean; restored: number; removed: number }>('import.rollback', { jobId }),
  importDiscard: () => callApi<{ ok: boolean }>('import.discard'),
  importFileToSource: (b64: string, fileName: string, sheetName: string) =>
    callApi<{ sheetName: string; headers: string[]; totalRows: number; format: string }>('import.fileToSource', {
      b64,
      fileName,
      sheetName,
    }),
  multiValidate: (sources: Record<string, unknown>[]) =>
    callApi<Row[]>('import.multiSource.validate', { sources }),
  multiCreate: (sources: Record<string, unknown>[]) =>
    callApi<{ jobId: string; sourceCount: number; status: string; sources: unknown[] }>(
      'import.multiSource.create',
      { sources },
    ),
  multiRun: (jobId: string) => callApi<Record<string, unknown>>('import.multiSource.run', { jobId }),
  multiStatus: (jobId: string) => callApi<Row>('import.multiSource.status', { jobId }),
  sourceDataList: (filters: Record<string, unknown>) =>
    callApi<{ headers: string[]; rows: unknown[][]; total: number }>('sourceData.list', filters),
  sourceDataHistory: () => callApi<SheetData>('sourceData.history'),
  conflictsList: (limit?: number) =>
    callApi<{ headers: string[]; rows: unknown[][]; total: number }>('conflicts.list', { limit: limit ?? 500 }),
  conflictsClear: () => callApi<{ cleared: number }>('conflicts.clear'),
  priorityRulesList: () => callApi<Row[]>('priorityRules.list'),
  priorityRulesSave: (rules: Record<string, unknown>[], clear: boolean) =>
    callApi<{ saved: number }>('priorityRules.save', { rules, clear }),

  /* AI */
  aiCommand: (text: string) => callApi<Record<string, unknown>>('ai.command', { text }),
};
