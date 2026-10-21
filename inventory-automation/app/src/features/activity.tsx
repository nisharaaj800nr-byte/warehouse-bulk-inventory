/* Activity & audit: activity log, processing runs, errors, data-quality summary. */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/query';
import { toRowObjects } from '../lib/utils';
import { Badge, Button, Card, EmptyState, ErrorPanel, PageHeader, StatCard, Tabs } from '../ui/base';
import { DataTable, type Column } from '../ui/table';

function statusTone(v: string): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (v === 'OK') return 'ok';
  if (v === 'PARTIAL') return 'warn';
  if (v === 'FAIL' || v === 'FAILED' || v === 'ERROR') return 'danger';
  return 'neutral';
}

function SheetView({
  data,
  loading,
  emptyTitle,
  cap = 300,
}: {
  data: { headers: string[]; data: unknown[][] } | undefined;
  loading: boolean;
  emptyTitle: string;
  cap?: number;
}) {
  const headers = data?.headers ?? [];
  const objs = toRowObjects(headers, data?.data ?? []);
  const latest = [...objs].reverse().slice(0, cap);
  const columns: Column<Record<string, string>>[] = headers.map((h) => ({
    key: h,
    label: h.replace(/_/g, ' '),
    render: (r) => {
      const v = r[h];
      if (h === 'Result' || h === 'Status') return <Badge tone={statusTone(v)}>{v || '—'}</Badge>;
      return (
        <span className="cell-clip" title={v}>
          {v || '—'}
        </span>
      );
    },
  }));
  return (
    <div>
      <DataTable
        columns={columns}
        rows={latest}
        rowKey={(_r, i) => 'row-' + i}
        loading={loading}
        empty={<EmptyState title={emptyTitle} />}
      />
      {objs.length > latest.length && (
        <div className="hint" style={{ padding: '6px 12px' }}>
          Showing latest {latest.length} of {objs.length} rows.
        </div>
      )}
    </div>
  );
}

export function ActivityPage({
  initialTab = 'activity',
  lockedTab = false,
  heading
}: {
  initialTab?: 'activity' | 'runs' | 'errors' | 'quality';
  lockedTab?: boolean;
  heading?: string;
}) {
  const [tab, setTab] = useState(initialTab);
  const activity = useQuery({ queryKey: ['activity'], queryFn: () => api.activityList() });
  const runs = useQuery({ queryKey: ['history'], queryFn: () => api.historyList() });
  const errors = useQuery({ queryKey: ['procErrors'], queryFn: () => api.errorsList() });
  const quality = useQuery({ queryKey: ['quality'], queryFn: () => api.qualitySummary() });

  const refresh = () => {
    void activity.refetch();
    void runs.refetch();
    void errors.refetch();
    void quality.refetch();
  };

  const bySource = quality.data ? Object.entries(quality.data.bySource) : [];
  const maxCount = bySource.reduce((m, entry) => Math.max(m, entry[1]), 0);

  return (
    <div className="stack">
      <PageHeader
        title={heading ?? 'Activity & Audit'}
        subtitle="Processing history, error log, activity feed and data-quality metrics."
        actions={
          <Button icon={<RefreshCw size={14} />} loading={activity.isFetching || runs.isFetching} onClick={refresh}>
            Refresh
          </Button>
        }
      />
      {!lockedTab && (
        <Tabs
          tabs={[
            { key: 'activity', label: 'Activity log' },
            { key: 'runs', label: 'Processing history' },
            { key: 'errors', label: 'Processing errors' },
            { key: 'quality', label: 'Data quality' },
          ]}
          active={tab}
          onChange={(key) => setTab(key as typeof tab)}
        />
      )}

      {tab === 'activity' && (
        <Card title="Recent activity" actions={<span className="hint">Latest events, newest first</span>} noBody>
          {activity.isError ? (
            <div style={{ padding: 12 }}>
              <ErrorPanel message={errorMessage(activity.error)} onRetry={() => void activity.refetch()} />
            </div>
          ) : (
            <SheetView data={activity.data} loading={activity.isFetching} emptyTitle="No activity recorded yet" />
          )}
        </Card>
      )}

      {tab === 'runs' && (
        <Card
          title="Processing history"
          actions={<span className="hint">Pipeline runs with timing and counts</span>}
          noBody
        >
          {runs.isError ? (
            <div style={{ padding: 12 }}>
              <ErrorPanel message={errorMessage(runs.error)} onRetry={() => void runs.refetch()} />
            </div>
          ) : (
            <SheetView data={runs.data} loading={runs.isFetching} emptyTitle="No runs yet" />
          )}
        </Card>
      )}

      {tab === 'errors' && (
        <Card title="Processing errors" actions={<span className="hint">Per-row issues from recent runs</span>} noBody>
          {errors.isError ? (
            <div style={{ padding: 12 }}>
              <ErrorPanel message={errorMessage(errors.error)} onRetry={() => void errors.refetch()} />
            </div>
          ) : (
            <SheetView data={errors.data} loading={errors.isFetching} emptyTitle="No processing errors" />
          )}
        </Card>
      )}

      {tab === 'quality' && (
        <div className="stack">
          <div className="stat-grid">
            <StatCard
              label="Total processing errors"
              value={quality.data?.totalErrors ?? 0}
              sub="Across all recorded runs"
              tone={quality.data && quality.data.totalErrors > 0 ? 'warn' : 'brand'}
            />
          </div>
          <Card title="Errors by source">
            {quality.isError ? (
              <ErrorPanel message={errorMessage(quality.error)} onRetry={() => void quality.refetch()} />
            ) : bySource.length === 0 ? (
              <EmptyState title="No errors recorded" hint="Data quality looks clean." />
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                {bySource.map((entry) => {
                  const src = entry[0];
                  const count = entry[1];
                  return (
                    <div key={src} className="row" style={{ gap: 12 }}>
                      <span style={{ width: 140 }} className="truncate">
                        {src}
                      </span>
                      <div className="grow" style={{ background: 'var(--chip)', borderRadius: 6, height: 10 }}>
                        <div
                          style={{
                            width: (maxCount ? Math.max(4, Math.round((count / maxCount) * 100)) : 4) + '%',
                            height: 10,
                            borderRadius: 6,
                            background: 'var(--warn)',
                          }}
                        />
                      </div>
                      <span className="tnum" style={{ width: 60, textAlign: 'right' }}>
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
