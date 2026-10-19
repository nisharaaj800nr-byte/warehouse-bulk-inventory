import { translate } from '../lib/i18n';
/* Dashboard: KPIs, distributions, ageing trend, recent runs/errors, quick actions. */
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Boxes, Database, FileText, Play, RefreshCw } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
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

const CHART_COLORS = ['#2E75B6', '#1E8E3E', '#E0A63D', '#C5221F', '#7B61FF', '#0F9D9D', '#9C27B0', '#607D8B'];

const TOOLTIP_STYLE = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 8,
  fontSize: 12.5,
  color: 'var(--ink)',
};

interface DistributionPoint {
  key: string;
  count: number;
}

function StatusBadge({ value }: { value: string }) {
  const v = value.toUpperCase();
  const tone = v === 'OK' ? 'ok' : v === 'PARTIAL' ? 'warn' : v === 'FAILED' || v === 'ERROR' ? 'danger' : 'neutral';
  return <Badge tone={tone}>{value || '—'}</Badge>;
}

function DistributionBar({ title, data }: { title: string; data?: DistributionPoint[] }) {
  const rows = (data ?? []).slice(0, 8);

  return (
    <Card title={title} actions={<span className="hint">Top {rows.length}</span>}>
      {rows.length === 0 ? (
        <EmptyState title="No data yet" hint="Import inventory to populate this chart." />
      ) : (
        <div className="chart-box" style={{ height: Math.max(190, rows.length * 34) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 11, fill: 'var(--muted)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--line)' }}
              />
              <YAxis
                type="category"
                dataKey="key"
                width={110}
                tick={{ fontSize: 11.5, fill: 'var(--muted)' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [String(value), 'Items']} />
              <Bar dataKey="count" name="Items" fill="var(--brand)" radius={[0, 4, 4, 0]} barSize={14}>
                <LabelList dataKey="count" position="right" fontSize={11} fill="var(--muted)" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function DistributionDonut({ title, data }: { title: string; data?: DistributionPoint[] }) {
  const rows = (data ?? []).slice(0, 8);
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <Card title={title} actions={<span className="hint">{total.toLocaleString()} items</span>}>
      {rows.length === 0 ? (
        <EmptyState title="No data yet" hint="Import inventory to populate this chart." />
      ) : (
        <div className="chart-box">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={rows}
                dataKey="count"
                nameKey="key"
                innerRadius={70}
                outerRadius={108}
                paddingAngle={2}
                stroke="var(--surface)"
                strokeWidth={2}
              >
                {rows.map((row, index) => (
                  <Cell key={row.key} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [String(value), 'Items']} />
              <Legend wrapperStyle={{ fontSize: 11.5 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

interface RunRow {
  id: string;
  when: string;
  source: string;
  processed: string;
  errors: string;
  status: string;
}

interface ErrorRow {
  row: string;
  field: string;
  message: string;
  when: string;
}

interface TrendSeries {
  key: string;
  name: string;
  color: string;
}

interface TrendPoint {
  date: string;
  [key: string]: string | number;
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

  /* The portal talks to two backends (Apps Script sheet shape and the local
     bridge shape), so rows are normalised before rendering. */
  const trendsModel = (() => {
    const sheet = trends.data;
    const empty: { series: TrendSeries[]; points: TrendPoint[] } = { series: [], points: [] };
    if (!sheet || sheet.data.length === 0) return empty;

    const headers = sheet.headers.map(String);
    const dateIdx = headers.findIndex((header) => /^(date|day)$/i.test(header));
    const bucketKeys = ['Below 30', '30-60', '60-75', 'Above 75'];
    const bucketIdx = bucketKeys.map((key) => headers.indexOf(key));

    if (bucketIdx.every((index) => index >= 0)) {
      const series: TrendSeries[] = [
        { key: 'below30', name: bucketKeys[0], color: CHART_COLORS[0] },
        { key: 'm30', name: bucketKeys[1], color: CHART_COLORS[1] },
        { key: 'm60', name: bucketKeys[2], color: CHART_COLORS[2] },
        { key: 'above75', name: bucketKeys[3], color: CHART_COLORS[3] },
      ];
      const points = sheet.data.map((row) => {
        const cells = row as unknown[];
        return {
          date: String(cells[dateIdx >= 0 ? dateIdx : 0] ?? ''),
          below30: Number(cells[bucketIdx[0]] ?? 0) || 0,
          m30: Number(cells[bucketIdx[1]] ?? 0) || 0,
          m60: Number(cells[bucketIdx[2]] ?? 0) || 0,
          above75: Number(cells[bucketIdx[3]] ?? 0) || 0,
        };
      });
      return { series, points };
    }

    const countIdx = headers.findIndex((header) => /^count$/i.test(header));
    const points = sheet.data.map((row) => {
      const cells = row as unknown[];
      return {
        date: String(cells[dateIdx >= 0 ? dateIdx : 0] ?? ''),
        count: Number(cells[countIdx >= 0 ? countIdx : 1] ?? 0) || 0,
      };
    });
    return { series: [{ key: 'count', name: 'Items added', color: CHART_COLORS[0] }], points };
  })();

  const runs: RunRow[] = (dash.data?.recentRuns ?? []).map((row, index) => {
    const cells = row as unknown[];
    if (cells.length >= 8) {
      return {
        id: String(cells[0] ?? ''),
        when: String(cells[1] ?? ''),
        source: String(cells[2] ?? ''),
        processed: String(cells[4] ?? ''),
        errors: String(cells[6] ?? ''),
        status: String(cells[8] ?? ''),
      };
    }
    /* Local bridge: [kind, status, rows_ok, rows_failed, created_at] */
    return {
      id: `#${index + 1}`,
      when: String(cells[4] ?? ''),
      source: String(cells[0] ?? ''),
      processed: String(cells[2] ?? ''),
      errors: String(cells[3] ?? ''),
      status: String(cells[1] ?? ''),
    };
  });

  const errs: ErrorRow[] = (dash.data?.recentErrors ?? []).map((row) => {
    const cells = row as unknown[];
    if (cells.length >= 7) {
      return {
        row: String(cells[2] ?? ''),
        field: String(cells[4] ?? ''),
        message: String(cells[5] ?? ''),
        when: String(cells[6] ?? ''),
      };
    }
    /* Local bridge: [row_number, field, message] */
    return {
      row: `Row ${String(cells[0] ?? '')}`,
      field: String(cells[1] ?? ''),
      message: String(cells[2] ?? ''),
      when: '',
    };
  });

  const runCols: Column<RunRow>[] = [
    { key: 'id', label: 'Run ID', render: (r) => <span className="mono">{r.id}</span> },
    { key: 'ts', label: 'When', render: (r) => fmtDateTime(r.when) || r.when },
    { key: 'src', label: 'Source', render: (r) => r.source },
    { key: 'proc', label: 'Processed', align: 'right', render: (r) => r.processed },
    { key: 'err', label: 'Errors', align: 'right', render: (r) => r.errors },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
  ];
  const errCols: Column<ErrorRow>[] = [
    { key: 'bar', label: 'Barcode', render: (r) => <span className="mono">{r.row}</span> },
    { key: 'field', label: 'Field', render: (r) => r.field },
    { key: 'error', label: 'Error', render: (r) => <span className="cell-clip" title={r.message}>{r.message}</span> },
    { key: 'ts', label: 'When', render: (r) => fmtDateTime(r.when) || r.when || '—' },
  ];

  return (
    <div className="stack">
      <PageHeader
        title={translate('Dashboard')}
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
            sub="Rows in the inventory table"
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

      <div className="grid-2">
        <DistributionBar title="By status" data={dash.data?.byStatus} />
        <DistributionDonut title="By age bucket" data={dash.data?.byAgeBucket} />
      </div>
      <div className="grid-2">
        <DistributionBar title="By status bucket" data={dash.data?.byStatusBucket} />
        <DistributionBar title="Top brands" data={dash.data?.topBrands} />
      </div>

      <Card title="Ageing trend" actions={<span className="hint">Daily snapshots by age bucket</span>}>
        {trends.isLoading ? (
          <Skeleton h={260} />
        ) : trends.isError ? (
          <ErrorPanel message={errorMessage(trends.error)} onRetry={() => void trends.refetch()} />
        ) : trendsModel.points.length === 0 ? (
          <EmptyState
            title="No trend data yet"
            hint="Trend snapshots are recorded when the daily process runs."
          />
        ) : (
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendsModel.points} margin={{ top: 6, right: 18, bottom: 0, left: 0 }}>
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
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {trendsModel.series.map((series) => (
                  <Line
                    key={series.key}
                    type="monotone"
                    dataKey={series.key}
                    name={series.name}
                    stroke={series.color}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
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
