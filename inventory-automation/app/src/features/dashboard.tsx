/* Dashboard: KPIs, ageing trend chart, recent runs/errors, quick actions. */
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Boxes, Database, FileText, Play, RefreshCw } from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../lib/api';
import { errorMessage } from '../lib/query';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorPanel,
  PageHeader,
  Skeleton,
  StatCard,
} from '../ui/base';
import { DataTable, type Column } from '../ui/table';
import { ConfirmDialog, useToast } from '../ui/overlay';
import { fmtDateTime, hasRole } from '../lib/utils';
import { useAuth } from './auth';

const TREND_COLORS = ['#2E75B6', '#1E8E3E', '#E0A63D', '#C5221F'];

function StatusBadge({ value }: { value: string }) {
  const v = value.toUpperCase();
  const tone = v === 'OK' ? 'ok' : v === 'PARTIAL' ? 'warn' : v === 'FAILED' || v === 'ERROR' ? 'danger' : 'neutral';
  return <Badge tone={tone}>{value || '—'}</Badge>;
}

export function DashboardPage() {
  const { session } = useAuth();
  const toast = useToast();
  const [confirmRun, setConfirmRun] = useState(false);

  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => api.dashboard() });
  const trends = useQuery({ queryKey: ['trends'], queryFn: () => api.trends() });

  const runProcess = useMutation({
    mutationFn: () => api.runProcess(),
    onSuccess: (data) => {
      const msg = typeof data?.message === 'string' ? data.message : 'Daily process completed.';
      toast.ok(msg);
      void dash.refetch();
      void trends.refetch();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const canRun = hasRole(session?.role, 'OPERATOR');

  const trendData = (() => {
    const d = trends.data;
    if (!d || d.data.length === 0) return [];
    const h = d.headers.map(String);
    const iDate = h.indexOf('Date');
    const idxs = ['Below 30', '30-60', '60-75', 'Above 75'].map((k) => h.indexOf(k));
    return d.data.map((r) => {
      const row = r as unknown[];
      return {
        date: String(row[iDate >= 0 ? iDate : 1] ?? ''),
        below30: Number(row[idxs[0]] ?? 0) || 0,
        m30: Number(row[idxs[1]] ?? 0) || 0,
        m60: Number(row[idxs[2]] ?? 0) || 0,
        above75: Number(row[idxs[3]] ?? 0) || 0,
      };
    });
  })();

  const runs: string[][] = (dash.data?.recentRuns ?? []).map((r) =>
    (r as unknown[]).map((c) => (c === null || c === undefined ? '' : String(c))),
  );
  const errs: string[][] = (dash.data?.recentErrors ?? []).map((r) =>
    (r as unknown[]).map((c) => (c === null || c === undefined ? '' : String(c))),
  );

  const runCols: Column<string[]>[] = [
    { key: 'id', label: 'Run ID', render: (r) => <span className="mono">{r[0]}</span> },
    { key: 'ts', label: 'When', render: (r) => fmtDateTime(r[1]) || r[1] },
    { key: 'src', label: 'Source', render: (r) => r[2] },
    { key: 'proc', label: 'Processed', align: 'right', render: (r) => r[4] },
    { key: 'err', label: 'Errors', align: 'right', render: (r) => r[6] },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r[8] ?? ''} /> },
  ];
  const errCols: Column<string[]>[] = [
    { key: 'bar', label: 'Barcode', render: (r) => <span className="mono">{r[2]}</span> },
    { key: 'field', label: 'Field', render: (r) => r[4] },
    { key: 'error', label: 'Error', render: (r) => <span className="cell-clip" title={r[5]}>{r[5]}</span> },
    { key: 'ts', label: 'When', render: (r) => fmtDateTime(r[6]) || r[6] },
  ];

  return (
    <div className="stack">
      <PageHeader
        title="Dashboard"
        subtitle="Live overview of your inventory operations."
        actions={
          <>
            <Button
              icon={<RefreshCw size={14} />}
              onClick={() => {
                void dash.refetch();
                void trends.refetch();
              }}
              loading={dash.isFetching || trends.isFetching}
            >
              Refresh
            </Button>
            {canRun && (
              <Button variant="primary" icon={<Play size={14} />} onClick={() => setConfirmRun(true)}>
                Run daily process
              </Button>
            )}
          </>
        }
      />

      {dash.isLoading ? (
        <div className="stat-grid">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} h={94} />
          ))}
        </div>
      ) : dash.isError ? (
        <ErrorPanel message={errorMessage(dash.error)} onRetry={() => void dash.refetch()} />
      ) : dash.data ? (
        <div className="stat-grid">
          <StatCard
            label="Inventory items"
            value={dash.data.inventoryCount.toLocaleString()}
            sub="Rows in the INVENTORY sheet"
            icon={<Boxes size={19} />}
          />
          <StatCard
            label="Active sources"
            value={dash.data.sourcesActive}
            sub="Configured data sources"
            icon={<Database size={19} />}
          />
          <StatCard
            label="Active reports"
            value={dash.data.reportsActive}
            sub="Report definitions enabled"
            icon={<FileText size={19} />}
          />
          <StatCard
            label="Recent errors"
            value={dash.data.recentErrors.length}
            sub="From the latest runs"
            tone={dash.data.recentErrors.length > 0 ? 'danger' : 'brand'}
            icon={<AlertTriangle size={19} />}
          />
        </div>
      ) : null}

      <Card
        title="Ageing trend"
        actions={<span className="hint">Daily snapshots by age bucket</span>}
      >
        {trends.isLoading ? (
          <Skeleton h={260} />
        ) : trends.isError ? (
          <ErrorPanel message={errorMessage(trends.error)} onRetry={() => void trends.refetch()} />
        ) : trendData.length === 0 ? (
          <EmptyState
            title="No trend data yet"
            hint="Trend snapshots are recorded when the daily process runs."
          />
        ) : (
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 6, right: 18, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: 'var(--muted)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--line)' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--muted)' }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={38}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: 8,
                    fontSize: 12.5,
                    color: 'var(--ink)',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="below30" name="Below 30" stroke={TREND_COLORS[0]} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="m30" name="30–60" stroke={TREND_COLORS[1]} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="m60" name="60–75" stroke={TREND_COLORS[2]} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="above75" name="Above 75" stroke={TREND_COLORS[3]} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="grid-2">
        <Card title="Recent runs" noBody>
          <DataTable
            columns={runCols}
            rows={runs}
            rowKey={(_r, i) => 'run-' + i}
            loading={dash.isFetching && runs.length === 0}
            empty={<EmptyState title="No runs yet" hint="Run the daily process to see history here." />}
          />
        </Card>
        <Card title="Recent errors" noBody>
          <DataTable
            columns={errCols}
            rows={errs}
            rowKey={(_r, i) => 'err-' + i}
            loading={dash.isFetching && errs.length === 0}
            empty={<EmptyState title="No recent errors" hint="Nothing to review — good news." />}
          />
        </Card>
      </div>

      <ConfirmDialog
        open={confirmRun}
        title="Run daily process"
        confirmLabel="Run now"
        tone="primary"
        loading={runProcess.isPending}
        message="Run the daily processing pipeline now? This reads the configured sources and rebuilds the inventory."
        onCancel={() => setConfirmRun(false)}
        onConfirm={() =>
          runProcess.mutate(undefined, {
            onSettled: () => setConfirmRun(false),
          })
        }
      />
    </div>
  );
}
