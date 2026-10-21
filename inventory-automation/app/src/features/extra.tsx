import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Download, PlayCircle, ShieldCheck } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { api, getApiUrl, getToken } from '../lib/api';
import { errorMessage } from '../lib/query';
import { downloadText, fmtDateTime, hasRole } from '../lib/utils';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorPanel,
  Field,
  Input,
  PageHeader,
  Skeleton
} from '../ui/base';
import { ConfirmDialog, useToast } from '../ui/overlay';
import { useAuth } from './auth';

function SheetTable({ data, loading }: { data?: { headers: string[]; data: unknown[][] }; loading?: boolean }) {
  if (loading) return <Skeleton h={160} />;
  if (!data || data.data.length === 0) return <EmptyState title="Nothing here yet" hint="Run a process or import data first." />;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {data.headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.data.slice(0, 200).map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell === null || cell === undefined ? '' : String(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Ageing trends ---------------- */

export function AgeingTrendsPage() {
  const trends = useQuery({ queryKey: ['trends'], queryFn: () => api.trends() });
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => api.dashboard() });

  const model = (() => {
    const sheet = trends.data;
    if (!sheet || sheet.data.length === 0) return { points: [] as Array<Record<string, string | number>>, series: [] as string[] };
    const headers = sheet.headers.map(String);
    const dateIndex = headers.findIndex((h) => /^(date|day)$/i.test(h));
    const countsIndex = headers.findIndex((h) => /^count$/i.test(h));
    const buckets = ['Below 30', '30-60', '60-75', 'Above 75'];
    const hasBuckets = buckets.every((bucket) => headers.includes(bucket));

    if (hasBuckets) {
      return {
        series: buckets,
        points: sheet.data.map((row) => {
          const cells = row as unknown[];
          const point: Record<string, string | number> = { date: String(cells[dateIndex >= 0 ? dateIndex : 0] ?? '') };
          for (const bucket of buckets) point[bucket] = Number(cells[headers.indexOf(bucket)] ?? 0) || 0;
          return point;
        })
      };
    }

    return {
      series: ['Items added'],
      points: sheet.data.map((row) => {
        const cells = row as unknown[];
        return {
          date: String(cells[dateIndex >= 0 ? dateIndex : 0] ?? ''),
          'Items added': Number(cells[countsIndex >= 0 ? countsIndex : 1] ?? 0) || 0
        };
      })
    };
  })();

  return (
    <div className="stack">
      <PageHeader title="Ageing Trends" subtitle="Daily stock ageing and bucket distribution." />
      <Card title="Ageing trend">
        {trends.isLoading ? (
          <Skeleton h={280} />
        ) : trendModelEmpty(model.points) ? (
          <EmptyState title="No trend data yet" hint="Trend snapshots are recorded when the daily process runs." />
        ) : (
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={model.points} margin={{ top: 6, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} allowDecimals={false} width={36} />
                <Tooltip />
                {model.series.map((series, index) => (
                  <Line
                    key={series}
                    type="monotone"
                    dataKey={series}
                    stroke={['#0078FF', '#10B981', '#F59E0B', '#EF4444'][index % 4]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card title="Current age buckets">
        {dash.data?.byAgeBucket && dash.data.byAgeBucket.length > 0 ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Bucket</th><th className="num">Items</th></tr>
              </thead>
              <tbody>
                {dash.data.byAgeBucket.map((row) => (
                  <tr key={row.key}><td>{row.key}</td><td className="num">{row.count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No inventory yet" hint="Import inventory to see ageing buckets." />
        )}
      </Card>
    </div>
  );
}

function trendModelEmpty(points: unknown[]): boolean {
  return points.length === 0;
}

/* ---------------- Processing ---------------- */

export function ProcessingPage() {
  const toast = useToast();
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => api.dashboard() });
  const [confirm, setConfirm] = useState(false);
  const run = useMutation({
    mutationFn: () => api.runProcess(),
    onSuccess: () => {
      toast.ok('Daily process completed.');
      setConfirm(false);
      void dash.refetch();
    },
    onError: (error) => toast.error(errorMessage(error))
  });

  return (
    <div className="stack">
      <PageHeader
        title="Processing"
        subtitle="Run the daily rules pipeline and review the latest runs."
        actions={
          <Button variant="primary" icon={<PlayCircle size={14} />} onClick={() => setConfirm(true)}>
            Run daily process
          </Button>
        }
      />
      <Card title="Recent runs" noBody>
        <SheetTable data={dash.data ? { headers: ['Run', 'When', 'Rows', 'Status'], data: (dash.data.recentRuns ?? []).map((row, i) => {
          const cells = row as unknown[];
          return cells.length >= 8 ? [cells[0], cells[1], cells[4], cells[8]] : [`#${i + 1}`, cells[4] ?? '', cells[2] ?? '', cells[1] ?? ''];
        }) } : undefined} loading={dash.isLoading} />
      </Card>
      <ConfirmDialog
        open={confirm}
        title="Run daily process"
        confirmLabel="Run now"
        tone="primary"
        loading={run.isPending}
        message="This applies all rules to the inventory and writes a trend snapshot."
        onCancel={() => setConfirm(false)}
        onConfirm={() => run.mutate()}
      />
    </div>
  );
}

/* ---------------- Exports ---------------- */

const GROUPS = ['status', 'brand', 'age_bucket', 'status_bucket', 'location', 'bin_bucket', 'model'];

export function ExportsPage() {
  const toast = useToast();
  const [groupBy, setGroupBy] = useState('status');
  const [busy, setBusy] = useState('');

  const download = async (format: 'csv' | 'xlsx' | 'pdf') => {
    setBusy(format);
    try {
      const base = getApiUrl().replace(/\/gas$/, '');
      const response = await fetch(`${base}/reports/export.${format}?groupBy=${groupBy}`, {
        headers: { authorization: `Bearer ${getToken()}` }
      });
      if (!response.ok) throw new Error(`Export failed (${response.status})`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `inventory-${groupBy}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.ok(`${format.toUpperCase()} exported.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy('');
    }
  };

  const inventoryCsv = useMutation({
    mutationFn: () => api.inventoryExport([]),
    onSuccess: (data) => {
      downloadText('inventory.csv', data.csv);
      toast.ok(`${data.rows} rows exported.`);
    },
    onError: (error) => toast.error(errorMessage(error))
  });

  return (
    <div className="stack">
      <PageHeader title="Exports" subtitle="Download grouped reports or the full inventory." actions={
        <Button icon={<Download size={14} />} loading={inventoryCsv.isPending} onClick={() => inventoryCsv.mutate()}>
          Inventory CSV
        </Button>
      } />
      <Card title="Grouped report">
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Group by">
            <select className="input" value={groupBy} onChange={(event) => setGroupBy(event.target.value)}>
              {GROUPS.map((group) => <option key={group} value={group}>{group.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Button icon={<Download size={14} />} loading={busy === 'csv'} onClick={() => void download('csv')}>CSV</Button>
          <Button icon={<Download size={14} />} loading={busy === 'xlsx'} onClick={() => void download('xlsx')}>Excel</Button>
          <Button icon={<Download size={14} />} loading={busy === 'pdf'} onClick={() => void download('pdf')}>PDF</Button>
        </div>
      </Card>
    </div>
  );
}

/* ---------------- Email settings ---------------- */

const SMTP_FIELDS = [
  { key: 'SMTP_HOST', label: 'SMTP host', placeholder: 'smtp.gmail.com' },
  { key: 'SMTP_PORT', label: 'SMTP port', placeholder: '587' },
  { key: 'SMTP_USER', label: 'SMTP user', placeholder: 'you@company.com' },
  { key: 'SMTP_PASS', label: 'SMTP password', placeholder: 'App password' },
  { key: 'SMTP_FROM', label: 'From address', placeholder: 'alerts@company.com' },
  { key: 'ALERT_EMAIL_TO', label: 'Alert recipients', placeholder: 'ops@company.com' }
];

export function EmailSettingsPage() {
  const toast = useToast();
  const { session } = useAuth();
  const canAdmin = hasRole(session?.role, 'ADMIN');
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.settingsGet() });
  const [draft, setDraft] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: () => api.settingsSave(draft),
    onSuccess: () => {
      toast.ok('Email settings saved.');
      setDraft({});
      void settings.refetch();
    },
    onError: (error) => toast.error(errorMessage(error))
  });

  const test = useMutation({
    mutationFn: () => api.emailTest(),
    onSuccess: (data) => toast.ok(`Test email sent to ${data.sentTo}`),
    onError: (error) => toast.error(errorMessage(error))
  });

  const value = (key: string) => draft[key] ?? settings.data?.[key] ?? '';

  return (
    <div className="stack">
      <PageHeader
        title="Email Settings"
        subtitle="SMTP configuration for alerts and scheduled reports."
        actions={
          <>
            <Button loading={test.isPending} onClick={() => test.mutate()} disabled={!canAdmin}>Send test</Button>
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()} disabled={!canAdmin || Object.keys(draft).length === 0}>
              Save
            </Button>
          </>
        }
      />
      {!canAdmin && <span className="hint">Admin role required to change these settings.</span>}
      <Card title="SMTP">
        <div className="form-grid">
          {SMTP_FIELDS.map((field) => (
            <Field key={field.key} label={field.label}>
              <Input
                type={field.key === 'SMTP_PASS' ? 'password' : 'text'}
                value={value(field.key)}
                placeholder={field.placeholder}
                disabled={!canAdmin}
                onChange={(event) => setDraft((prev) => ({ ...prev, [field.key]: event.target.value }))}
              />
            </Field>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ---------------- Security ---------------- */

export function SecurityPage() {
  const toast = useToast();
  const { session } = useAuth();
  const canAdmin = hasRole(session?.role, 'ADMIN');
  const totp = useQuery({ queryKey: ['totpStatus'], queryFn: () => api.totpStatus() });
  const sessions = useQuery({ queryKey: ['authSessions'], queryFn: () => api.authSessions() });
  const [revoke, setRevoke] = useState<number | null>(null);

  const revokeMutation = useMutation({
    mutationFn: (id: number) => api.revokeSession(id),
    onSuccess: () => {
      toast.ok('Session signed out.');
      setRevoke(null);
      void sessions.refetch();
    },
    onError: (error) => toast.error(errorMessage(error))
  });

  return (
    <div className="stack">
      <PageHeader title="Security" subtitle="Two-factor authentication, active sessions and password policy." />
      <div className="grid-2">
        <Card title={<span className="row" style={{ gap: 8 }}><ShieldCheck size={16} /> Two-factor authentication</span>}>
          <p className="hint" style={{ marginTop: 0 }}>
            {totp.data?.enabled ? `Enabled · ${totp.data.recoveryCodesLeft} recovery codes left.` : 'Not enabled yet.'}
          </p>
          <Button onClick={() => { window.location.hash = '#/settings'; }}>Manage in Settings</Button>
        </Card>
        <Card title="Password policy">
          <ul className="hint" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Minimum 10 characters</li>
            <li>Must contain letters and numbers</li>
            <li>5 failed attempts lock the account for 15 minutes</li>
          </ul>
        </Card>
      </div>

      <Card title="Active sessions" noBody>
        {sessions.isError ? (
          <div style={{ padding: 12 }}><ErrorPanel message={errorMessage(sessions.error)} /></div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>User</th><th>Role</th><th>Signed in</th><th>Last seen</th><th /></tr></thead>
              <tbody>
                {(sessions.data?.sessions ?? []).map((row) => (
                  <tr key={row.id}>
                    <td className="mono">{row.email}</td>
                    <td><Badge tone="info">{row.role}</Badge></td>
                    <td>{fmtDateTime(row.createdAt) || row.createdAt}</td>
                    <td>{row.lastSeenAt ? fmtDateTime(row.lastSeenAt) || row.lastSeenAt : '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Button size="sm" variant="ghost" disabled={!canAdmin} onClick={() => setRevoke(row.id)}>Sign out</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={revoke !== null}
        title="Sign out session"
        confirmLabel="Sign out"
        tone="danger"
        loading={revokeMutation.isPending}
        message="Revoke this session? The user will have to sign in again."
        onCancel={() => setRevoke(null)}
        onConfirm={() => { if (revoke) revokeMutation.mutate(revoke); }}
      />
    </div>
  );
}

/* ---------------- System health ---------------- */

export function SystemHealthPage() {
  const health = useQuery({ queryKey: ['health'], queryFn: () => api.health() });
  const selftest = useQuery({ queryKey: ['selftest'], queryFn: () => api.selftest() });

  return (
    <div className="stack">
      <PageHeader title="System Health" subtitle="Backend status and self-test results." />
      <Card title="Health">
        {health.isLoading ? <Skeleton h={60} /> : (
          <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(health.data, null, 2)}</pre>
        )}
      </Card>
      <Card title="Self test" noBody>
        {selftest.isLoading ? <Skeleton h={180} /> : selftest.isError ? (
          <div style={{ padding: 12 }}><ErrorPanel message={errorMessage(selftest.error)} /></div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Check</th><th>Status</th><th>Detail</th></tr></thead>
              <tbody>
                {(selftest.data?.checks ?? []).map((check) => (
                  <tr key={check.name}>
                    <td>{check.name}</td>
                    <td><Badge tone={check.ok ? 'ok' : 'danger'}>{check.ok ? 'OK' : 'FAIL'}</Badge></td>
                    <td className="muted">{check.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------------- Help ---------------- */

export function HelpPage() {
  return (
    <div className="stack">
      <PageHeader title="Help" subtitle="Quick answers for day-to-day operations." />
      <div className="grid-2">
        <Card title="Getting started">
          <ul className="hint" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Setup wizard me backend, Sheet (optional) aur owner account.</li>
            <li>Sources → Field Mapping → Rules configure karo.</li>
            <li>Imports se pehla CSV daalo.</li>
            <li>Dashboard pe counts aur errors check karo.</li>
          </ul>
        </Card>
        <Card title="Barcode scanners">
          <ul className="hint" style={{ margin: 0, paddingLeft: 18 }}>
            <li>USB scanners keyboard ki tarah chalte hain — driver nahi chahiye.</li>
            <li>Inventory page pe kahin bhi scan karo.</li>
            <li>Settings → Barcode scanner se test aur serial connect.</li>
          </ul>
        </Card>
        <Card title="Backups">
          <ul className="hint" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Automatic: boot pe + har 6 ghante.</li>
            <li>Desktop data: app data folder ke <code>data/backups</code>.</li>
            <li>Restore: server band karke DB file replace karo.</li>
          </ul>
        </Card>
        <Card title="Troubleshooting">
          <ul className="hint" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Data load nahi hua → Refresh / backend health check.</li>
            <li>Email nahi gaya → Email Settings me test bhejo.</li>
            <li>Import fail → barcode column aur errors preview dekho.</li>
            <li>Rollback sirf committed import ka hota hai.</li>
          </ul>
        </Card>
      </div>
      <Card title="Documentation">
        <p className="hint" style={{ marginTop: 0 }}>
          Repository me complete Hinglish guide hai: <code>docs/USER-GUIDE-HINGLISH.md</code> aur PDF.
        </p>
        <a className="btn btn-secondary btn-sm" href="https://github.com/nisharaaj800nr-byte/warehouse-bulk-inventory" target="_blank" rel="noreferrer">
          <ArrowUpRight size={13} /> Open repository
        </a>
      </Card>
    </div>
  );
}
