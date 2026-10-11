/* Demo mode: local fixtures so the portal can be previewed without a backend.
   Enabled from the login screen ("Explore demo"); never talks to the network. */
import { ApiError } from './api';

interface DemoSession {
  active: boolean;
  email: string;
  role: string;
  expiresAt: string;
}

const session: DemoSession = { active: false, email: '', role: 'ADMIN', expiresAt: '' };

const HEADERS = [
  'BARCODE', 'MODEL', 'BRAND', 'CATEGORY', 'MOD_AGE', 'STOCK_AGE', 'STATUS',
  'STATUS_BUCKET', 'AGE_BUCKET', 'PRIORITY', 'LOCATION', 'BIN_BUCKET', 'SOURCE',
];
const BRANDS = ['Apple', 'Samsung', 'Xiaomi', 'OnePlus', 'Realme', 'Vivo'];
const CATEGORIES = ['Phone', 'Tablet', 'Watch', 'Accessory'];
const STATUSES = ['QC_PASS', 'QC_FAIL', 'PENDING', 'IN_REPAIR'];

function ageBucket(age: number): string {
  if (age < 30) return 'Below 30';
  if (age < 60) return '30-60';
  if (age < 75) return '60-75';
  return 'Above 75';
}

function statusBucket(status: string): string {
  if (status === 'QC_PASS') return 'Ready';
  if (status === 'QC_FAIL') return 'QC Failed';
  if (status === 'IN_REPAIR') return 'In Repair';
  return 'Approval Pending';
}

function priorityFor(ageB: string): string {
  if (ageB === 'Above 75') return 'P4';
  if (ageB === '60-75') return 'P3';
  return 'P2';
}

let INVENTORY: string[][] = (() => {
  const rows: string[][] = [];
  for (let i = 1; i <= 137; i++) {
    const brand = BRANDS[i % BRANDS.length];
    const category = CATEGORIES[i % CATEGORIES.length];
    const modAge = (i * 37) % 240;
    const stockAge = (i * 13) % 200;
    const status = STATUSES[i % STATUSES.length];
    const ageB = ageBucket(modAge);
    const location = 'SW' + String((i % 20) + 1).padStart(2, '0');
    rows.push([
      'BR' + String(10000 + i),
      brand + ' ' + category + ' ' + String((i % 9) + 1),
      brand,
      category,
      String(modAge),
      String(stockAge),
      status,
      statusBucket(status),
      ageB,
      priorityFor(ageB),
      location,
      'BIN-' + String((Math.floor(i / 10) % 4) + 1).padStart(2, '0'),
      ['QC_STOCK', 'TRC', 'INVENTORY'][i % 3],
    ]);
  }
  return rows;
})();

const TREND_HEADERS = ['Run ID', 'Date', 'Below 30', '30-60', '60-75', 'Above 75', 'Total'];

function buildTrends(): unknown[][] {
  const rows: unknown[][] = [];
  const today = Date.now();
  for (let d = 20; d >= 0; d--) {
    const date = new Date(today - d * 86400000).toISOString().slice(0, 10);
    const below = 96 + ((20 - d) * 3) % 18;
    const m30 = 42 + ((20 - d) * 2) % 9;
    const m60 = 18 + (20 - d) % 6;
    const above = 7 + (20 - d) % 4;
    rows.push(['RUN-' + String(1000 + (20 - d)), date, below, m30, m60, above, below + m30 + m60 + above]);
  }
  return rows;
}

function buildRuns(): (string | number)[][] {
  const now = Date.now();
  const rows: (string | number)[][] = [];
  for (let i = 0; i < 6; i++) {
    const t = new Date(now - i * 26 * 3600 * 1000).toISOString();
    const input = 380 + i * 27;
    rows.push([
      'RUN-' + String(1024 - i),
      t,
      ['Daily Raw Data', 'QC Stock', 'TRC'][i % 3],
      input,
      input - 3,
      input - 8,
      3 + (i % 4),
      (9.4 + i).toFixed(1),
      i === 0 ? 'OK' : i % 4 === 1 ? 'PARTIAL' : 'OK',
    ]);
  }
  return rows;
}

function buildErrors(): (string | number)[][] {
  const now = Date.now();
  const errs: string[][] = [
    ['BR10034', 'QC Stock', 'STOCK_AGE', 'Invalid number: "n/a"'],
    ['BR10071', 'TRC', 'BARCODE', 'Missing required field'],
    ['BR10102', 'Daily Raw Data', 'STATUS', 'Unknown status: "HOLD-2"'],
    ['BR10145', 'QC Stock', 'LOCATION', 'Location not mapped: "ZZ-99"'],
    ['BR10188', 'TRC', 'MOD_AGE', 'Invalid number: "old"'],
  ];
  return errs.map((e, i) => [
    'RUN-' + String(1024 - (i % 2)),
    12 + i * 7,
    e[0],
    e[1],
    e[2],
    e[3],
    new Date(now - i * 40 * 60000).toISOString(),
  ]);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let demoStaged = false;

export async function demoCall(action: string, params: Record<string, unknown>): Promise<unknown> {
  await sleep(120 + Math.random() * 160);
  switch (action) {
    case 'health':
      return { app: 'Bulk Repair', version: '1.1.0-demo', role: session.role, mode: 'demo' };

    case 'auth.login': {
      const email = String(params.email || 'admin@demo.local');
      const password = String(params.password || '');
      if (password.length < 4) {
        throw new ApiError('AUTH_FAILED: Invalid email or password. (Demo: use any password with 4+ characters.)', 'AUTH_FAILED');
      }
      session.active = true;
      session.email = email;
      session.role = 'ADMIN';
      session.expiresAt = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
      return { token: 'demo-' + Math.random().toString(36).slice(2), email, role: session.role, expiresAt: session.expiresAt };
    }

    case 'auth.logout':
      session.active = false;
      return { revoked: true };

    case 'auth.whoami':
      if (!session.active) throw new ApiError('AUTH_REQUIRED: Login required.', 'AUTH_REQUIRED');
      return { email: session.email, role: session.role, expiresAt: session.expiresAt, legacy: false };

    case 'auth.changePassword':
      return { changed: true };

    case 'dashboard':
      return {
        inventoryCount: INVENTORY.length,
        headers: HEADERS,
        recentRuns: buildRuns(),
        recentErrors: buildErrors(),
        sourcesActive: 4,
        reportsActive: 6,
      };

    case 'inventory.list': {
      let rows = INVENTORY.slice();
      const q = String(params.q || '').toLowerCase();
      if (q) rows = rows.filter((r) => r.join(' ').toLowerCase().includes(q));
      const filters = (params.filters || {}) as Record<string, string>;
      Object.keys(filters).forEach((key) => {
        const val = String(filters[key] || '').toLowerCase();
        if (!val) return;
        const idx = HEADERS.indexOf(key);
        if (idx < 0) return;
        rows = rows.filter((r) => String(r[idx] || '').toLowerCase() === val);
      });
      const total = rows.length;
      const page = Math.max(1, Number(params.page) || 1);
      const perPage = Math.max(1, Number(params.perPage) || 50);
      return { rows: rows.slice((page - 1) * perPage, page * perPage), total, headers: HEADERS, page, perPage };
    }

    case 'inventory.export': {
      const cols = String(params.columns || '')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      const headers = cols.length ? cols : HEADERS;
      const out = [headers.join(',')];
      INVENTORY.forEach((row) =>
        out.push(
          headers
            .map((h) => {
              const i = HEADERS.indexOf(h);
              return '"' + String(i >= 0 ? row[i] : '').replace(/"/g, '""') + '"';
            })
            .join(','),
        ),
      );
      return { csv: out.join('\n'), rows: INVENTORY.length };
    }

    case 'inventory.save': {
      const item = (params.item || {}) as Record<string, string>;
      const barcode = String(item.BARCODE || '');
      if (!barcode) throw new ApiError('BARCODE is required.', 'BACKEND_ERROR');
      const idx = INVENTORY.findIndex((r) => r[0] === barcode);
      const row = HEADERS.map((h) => String(item[h] ?? ''));
      if (idx >= 0) {
        INVENTORY[idx] = row;
        return { ok: true, barcode, mode: 'updated' };
      }
      INVENTORY.unshift(row);
      return { ok: true, barcode, mode: 'added' };
    }

    case 'inventory.delete': {
      const barcode = String(params.barcode || '');
      INVENTORY = INVENTORY.filter((r) => r[0] !== barcode);
      return { ok: true, barcode };
    }

    case 'trends.list':
      return { headers: TREND_HEADERS, data: buildTrends() };

    case 'process.run': {
      await sleep(600);
      return { ok: true, message: 'Daily process completed (demo) — ' + INVENTORY.length + ' items processed.' };
    }

    /* ---- stage 2/3 screens (demo fixtures) ---- */
    case 'sources.list':
      return [
        { 'Source ID': 'SRC001', 'Source Name': 'Daily Raw Data', Type: 'Google Sheet', Role: 'PRIMARY', 'Sheet Name': 'Daily Raw Data', 'Sheet ID': '', 'Join Key': 'BARCODE', 'Join Fields': '', Active: 'ON' },
        { 'Source ID': 'SRC002', 'Source Name': 'QC Stock', Type: 'QC_STOCK', Role: 'JOIN', 'Sheet Name': 'QC Stock', 'Sheet ID': '', 'Join Key': 'BARCODE', 'Join Fields': 'STOCK_AGE, LOCATION', Active: 'ON' },
        { 'Source ID': 'SRC003', 'Source Name': 'TRC', Type: 'TRC', Role: 'JOIN', 'Sheet Name': 'TRC', 'Sheet ID': '', 'Join Key': 'BARCODE', 'Join Fields': 'STATUS', Active: 'ON' },
      ];
    case 'sources.save':
      return { id: String(params.id || 'SRC-DEMO') };
    case 'sources.types':
      return ['QC_STOCK', 'TRC', 'INVENTORY', 'LOCATION', 'OTHER'];
    case 'mapping.list':
      return [
        { Source: 'QC_STOCK', 'Source Column': 'Barcode', 'Target Field': 'BARCODE', Required: 'YES', Active: 'ON', 'Output Order': 1 },
        { Source: 'QC_STOCK', 'Source Column': 'Model', 'Target Field': 'MODEL', Required: 'YES', Active: 'ON', 'Output Order': 2 },
        { Source: 'QC_STOCK', 'Source Column': 'Brand', 'Target Field': 'BRAND', Required: 'YES', Active: 'ON', 'Output Order': 3 },
        { Source: 'TRC', 'Source Column': 'Status', 'Target Field': 'STATUS', Required: 'NO', Active: 'ON', 'Output Order': 4 },
        { Source: 'LOCATION', 'Source Column': 'Bin', 'Target Field': 'LOCATION', Required: 'NO', Active: 'ON', 'Output Order': 5 },
      ];
    case 'mapping.headers':
      return { headers: HEADERS };
    case 'mapping.save':
      return { saved: Array.isArray(params.mappings) ? params.mappings.length : 0 };
    case 'rules.age.list':
      return [
        { Min: 0, Max: 29, Bucket: 'Below 30', Priority: 'P2', Active: 'ON' },
        { Min: 30, Max: 59, Bucket: '30-60', Priority: 'P2', Active: 'ON' },
        { Min: 60, Max: 74, Bucket: '60-75', Priority: 'P3', Active: 'ON' },
        { Min: 75, Max: 999999, Bucket: 'Above 75', Priority: 'P4', Active: 'ON' },
      ];
    case 'rules.age.save':
    case 'rules.status.save':
    case 'rules.location.save':
      return { saved: true };
    case 'rules.status.list':
      return [
        { 'Raw Status': 'L4', Bucket: 'L4', Marking: 'Marked L4', Active: 'ON' },
        { 'Raw Status': 'Pending Approval', Bucket: 'Approval Pending', Marking: 'Pending', Active: 'ON' },
      ];
    case 'rules.location.list':
      return [
        { Pattern: 'SW01-SW10', Bucket: 'BIN-01', Condition: 'STATUS_BUCKET=Bin Storage', Active: 'ON' },
        { Pattern: 'SW11-SW20', Bucket: 'BIN-02', Condition: 'STATUS_BUCKET=Bin Storage', Active: 'ON' },
      ];
    case 'reports.list':
      return [
        { 'Report Name': 'Apple L4 Bin Storage', 'Filter Field': 'BRAND', 'Filter Value': 'Apple', 'Report Columns': 'BARCODE,MODEL,STATUS_BUCKET,BIN_BUCKET', Active: 'ON' },
        { 'Report Name': '75+ Days Devices', 'Filter Field': 'AGE_BUCKET', 'Filter Value': 'Above 75', 'Report Columns': 'BARCODE,MODEL,AGE_BUCKET,LOCATION', Active: 'ON' },
        { 'Report Name': 'Daily Summary', 'Filter Field': '', 'Filter Value': '', 'Report Columns': 'STATUS_BUCKET,AGE_BUCKET,PRIORITY', Active: 'ON' },
      ];
    case 'reports.save':
      return { saved: String(params.name || 'report') };
    case 'reports.delete':
      return { deleted: String(params.name || '') };
    case 'reports.generate': {
      await sleep(500);
      return { report: String(params.name || 'Demo Report'), rows: 42 };
    }
    case 'reports.bulkCreate': {
      const list = Array.isArray(params.reports) ? (params.reports as { name?: string }[]) : [];
      return { created: list.map((r) => String(r.name || 'report')) };
    }
    case 'reports.exportToSheet':
      return { exported: 3 };
    case 'reports.templates.list':
      return [];
    case 'reports.templates.save':
      return { saved: String(params.name || 'template') };
    case 'reports.templates.delete':
      return { deleted: String(params.name || '') };
    case 'alerts.list':
      return [
        { 'Alert Name': 'Low Stock Alert', 'Filter Field': 'BRAND', 'Filter Value': 'Apple', Operator: 'LT', Threshold: 10, 'Email To': 'ops@example.com', Telegram: 'ON', Active: 'ON' },
        { 'Alert Name': 'Ageing Check', 'Filter Field': 'AGE_BUCKET', 'Filter Value': 'Above 75', Operator: 'GT', Threshold: 5, 'Email To': '', Telegram: 'OFF', Active: 'ON' },
      ];
    case 'alerts.save':
      return { saved: String(params.name || 'alert') };
    case 'alerts.delete':
      return { deleted: String(params.name || '') };
    case 'alerts.check': {
      await sleep(400);
      return { triggered: [], total: 2 };
    }
    case 'auth.users':
      return {
        users: [
          { email: session.email || 'admin@demo.local', role: 'ADMIN', active: 'ON', hasPassword: true, lockedUntil: '', lastLogin: new Date(Date.now() - 3600e3).toISOString() },
          { email: 'viewer@demo.local', role: 'VIEWER', active: 'ON', hasPassword: true, lockedUntil: '', lastLogin: '' },
        ],
      };
    case 'users.save':
      return { saved: true, updated: false, passwordSet: Boolean(params.password) };
    case 'auth.resetPassword':
      return { reset: true };
    case 'security.list':
      return [
        { Sheet: 'INVENTORY', Access: 'LOCKED', 'Can Edit': 'NO' },
        { Sheet: 'PROCESSED_DATA', Access: 'LOCKED', 'Can Edit': 'NO' },
        { Sheet: 'RAW_DATA', Access: 'PARTIAL', 'Can Edit': 'YES' },
      ];
    case 'security.unlock':
    case 'security.lock':
      return { ok: true };
    case 'activity.list':
      return {
        headers: ['Timestamp', 'User', 'Action', 'Object', 'Result'],
        data: buildRuns().slice(0, 6).map((r, i) => [r[1], 'admin@demo.local', ['PROCESS_RUN', 'IMPORT_COMMIT', 'REPORT_GENERATED'][i % 3], String(r[0]), 'OK']),
      };
    case 'history.list':
      return { headers: ['Run ID', 'Timestamp', 'Source', 'Input Rows', 'Processed Rows', 'Success Count', 'Error Count', 'Duration (sec)', 'Status'], data: buildRuns() };
    case 'errors.list':
      return { headers: ['Run ID', 'Row Number', 'Barcode', 'Source', 'Field', 'Error', 'Timestamp'], data: buildErrors() };
    case 'quality.summary':
      return { totalErrors: 9, bySource: { 'QC Stock': 4, TRC: 3, 'Daily Raw Data': 2 } };
    case 'settings.get':
      return { TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '', AUTO_BACKUP: 'OFF', BACKUP_FOLDER_ID: '' };
    case 'settings.save':
      return { saved: true };
    case 'telegram.test':
      return { ok: true };
    case 'email.test':
      return { sentTo: 'demo@example.com' };
    case 'backup.run':
      return { backupId: 'DEMO-BACKUP', name: 'Backup_demo' };
    case 'selftest.run':
      return {
        ok: true,
        authVersion: 'demo',
        checks: [
          { name: 'Spreadsheet readable', ok: true, detail: 'Demo spreadsheet' },
          { name: 'Password hash roundtrip', ok: true, detail: 'ok' },
          { name: 'Sessions sheet writable', ok: true, detail: 'probe ok' },
          { name: 'Inventory readable', ok: true, detail: INVENTORY.length + ' rows' },
        ],
      };
    case 'import.fileB64':
    case 'import.sheets': {
      demoStaged = true;
      return {
        ok: true,
        fileName: action === 'import.fileB64' ? String(params.fileName || 'demo-upload.csv') : 'Google Sheet',
        format: action === 'import.fileB64' ? 'CSV/TSV' : 'Google Sheets',
        headers: HEADERS,
        totalRows: 120,
        warnings: [],
      };
    }
    case 'import.tabs':
      return [{ name: 'Sheet1', rows: 120, cols: HEADERS.length }];
    case 'import.previewPage': {
      const offset = Number(params.offset) || 0;
      const limit = Math.min(50, Number(params.limit) || 20);
      const rows = demoStaged ? INVENTORY.slice(offset, offset + limit) : [];
      return { headers: HEADERS, rows, offset, totalRows: demoStaged ? INVENTORY.length : 0 };
    }
    case 'import.commit': {
      await sleep(600);
      const dry = Boolean(params.dryRun);
      return {
        ok: true,
        dryRun: dry,
        processed: 120,
        valid: 118,
        imported: dry ? 0 : 118,
        failed: 2,
        skipped: 0,
        warnings: ['2 row(s) failed validation (demo).'],
        errorSample: [
          { row: 14, errors: ['Missing required field: BARCODE'] },
          { row: 88, errors: ['Invalid number in "MOD_AGE": "old"'] },
        ],
      };
    }
    case 'import.discard':
      demoStaged = false;
      return { ok: true };
    case 'import.fileToSource':
      return { sheetName: String(params.sheetName || 'demo_source'), headers: HEADERS, totalRows: 90, format: 'CSV' };
    case 'import.multiSource.validate':
      return (Array.isArray(params.sources) ? params.sources : []);
    case 'import.multiSource.create':
      return { jobId: 'JOB-DEMO-1', sourceCount: Array.isArray(params.sources) ? params.sources.length : 0, status: 'READY', sources: [] };
    case 'import.multiSource.run': {
      await sleep(800);
      return { jobId: String(params.jobId || 'JOB-DEMO-1'), status: 'COMPLETE', totalRows: 240, devices: 220, conflicts: 4 };
    }
    case 'import.multiSource.status':
      return { 'Job ID': 'JOB-DEMO-1', Status: 'COMPLETE' };
    case 'sourceData.list': {
      const q = String(params.q || '').toLowerCase();
      let rows = INVENTORY.slice(0, 60);
      if (q) rows = rows.filter((r) => r.join(' ').toLowerCase().includes(q));
      return { headers: HEADERS, rows, total: rows.length };
    }
    case 'sourceData.history':
      return {
        headers: ['Run ID', 'Source', 'Rows', 'Status', 'When'],
        data: [
          ['IMP-001', 'QC Stock', 120, 'OK', new Date(Date.now() - 86400e3).toISOString()],
          ['IMP-002', 'TRC', 96, 'OK', new Date(Date.now() - 82800e3).toISOString()],
        ],
      };
    case 'conflicts.list':
      return {
        headers: ['Barcode', 'Field', 'Source A', 'Value A', 'Source B', 'Value B', 'Final', 'Rule'],
        rows: [
          ['BR10034', 'STATUS', 'QC_STOCK', 'QC_PASS', 'TRC', 'IN_REPAIR', 'QC_PASS', 'QC_STOCK > TRC'],
          ['BR10071', 'LOCATION', 'QC_STOCK', 'SW04', 'LOCATION', 'SW09', 'SW04', 'QC_STOCK > LOCATION'],
          ['BR10102', 'STOCK_AGE', 'QC_STOCK', '32', 'INVENTORY', '45', '32', 'QC_STOCK > INVENTORY'],
        ],
        total: 3,
      };
    case 'conflicts.clear':
      return { cleared: 3 };
    case 'priorityRules.list':
      return [
        { FIELD: 'STATUS', 'Priority 1': 'QC_STOCK', 'Priority 2': 'TRC', 'Priority 3': 'INVENTORY', 'Priority 4': 'LOCATION', 'Priority 5': 'OTHER' },
        { FIELD: 'LOCATION', 'Priority 1': 'QC_STOCK', 'Priority 2': 'LOCATION', 'Priority 3': 'TRC', 'Priority 4': '', 'Priority 5': '' },
      ];
    case 'priorityRules.save':
      return { saved: Array.isArray(params.rules) ? params.rules.length : 0 };
    case 'ai.command': {
      await sleep(400);
      return { success: true, message: 'Demo: command parsed — ' + String(params.text || '').slice(0, 80) };
    }

    default:
      throw new ApiError('Demo mode: action not implemented — ' + action, 'BACKEND_ERROR');
  }
}
