/* Stock alerts: threshold rules with email / Telegram notifications. */
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Pencil, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/query';
import { hasRole } from '../lib/utils';
import { Badge, Button, Card, EmptyState, ErrorPanel, Field, Input, PageHeader, Select, Switch } from '../ui/base';
import { DataTable, type Column } from '../ui/table';
import { ConfirmDialog, Modal, useToast } from '../ui/overlay';
import { useAuth } from './auth';

interface AlertForm {
  name: string;
  filterField: string;
  filterValue: string;
  operator: string;
  threshold: string;
  emailTo: string;
  telegram: boolean;
  active: boolean;
}

const EMPTY: AlertForm = {
  name: '',
  filterField: 'BRAND',
  filterValue: '',
  operator: 'LT',
  threshold: '10',
  emailTo: '',
  telegram: false,
  active: true,
};

function rowToForm(r: Record<string, unknown>): AlertForm {
  return {
    name: String(r['Alert Name'] ?? r['Name'] ?? ''),
    filterField: String(r['Filter Field'] ?? 'BRAND'),
    filterValue: String(r['Filter Value'] ?? ''),
    operator: String(r['Operator'] ?? 'LT'),
    threshold: String(r['Threshold'] ?? ''),
    emailTo: String(r['Email To'] ?? ''),
    telegram: String(r['Telegram'] ?? 'OFF') === 'ON',
    active: String(r['Active'] ?? 'ON') === 'ON',
  };
}

export function AlertsPage() {
  const toast = useToast();
  const { session } = useAuth();
  const canOperate = hasRole(session?.role, 'OPERATOR');
  const canAdmin = hasRole(session?.role, 'ADMIN');

  const list = useQuery({ queryKey: ['alerts', 'all'], queryFn: () => api.alertsList(true) });
  const [form, setForm] = useState<AlertForm | null>(null);
  const [deleteName, setDeleteName] = useState<string | null>(null);
  const [triggered, setTriggered] = useState<Record<string, unknown>[] | null>(null);

  const save = useMutation({
    mutationFn: (f: AlertForm) =>
      api.alertSave({
        name: f.name.trim(),
        filterField: f.filterField.trim() || 'BRAND',
        filterValue: f.filterValue.trim(),
        operator: f.operator,
        threshold: Number(f.threshold) || 0,
        emailTo: f.emailTo.trim(),
        telegram: f.telegram ? 'ON' : 'OFF',
        active: f.active ? 'ON' : 'OFF',
      }),
    onSuccess: (res) => {
      toast.ok(`Alert saved: ${res.saved}`);
      setForm(null);
      void list.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const del = useMutation({
    mutationFn: (name: string) => api.alertDelete(name),
    onSuccess: (res) => {
      toast.ok(`Alert deleted: ${res.deleted}`);
      setDeleteName(null);
      void list.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const check = useMutation({
    mutationFn: () => api.alertsCheck(),
    onSuccess: (res) => {
      toast.ok(`${res.total} rule(s) checked · ${res.triggered.length} triggered.`);
      if (res.triggered.length > 0) setTriggered(res.triggered);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const rows = list.data ?? [];
  const columns: Column<Record<string, unknown>>[] = [
    { key: 'name', label: 'Alert', render: (r) => <strong>{String(r['Alert Name'] ?? r['Name'] ?? '')}</strong> },
    { key: 'field', label: 'Field', render: (r) => String(r['Filter Field'] ?? '') || '—' },
    { key: 'value', label: 'Value', render: (r) => String(r['Filter Value'] ?? '') || '—' },
    { key: 'op', label: 'Op', render: (r) => String(r['Operator'] ?? '') || '—' },
    { key: 'threshold', label: 'Threshold', align: 'right', render: (r) => String(r['Threshold'] ?? '—') },
    { key: 'email', label: 'Email', render: (r) => <span className="cell-clip">{String(r['Email To'] ?? '') || '—'}</span> },
    {
      key: 'telegram',
      label: 'Telegram',
      render: (r) => (
        <Badge tone={String(r['Telegram'] ?? '') === 'ON' ? 'ok' : 'neutral'}>{String(r['Telegram'] ?? 'OFF')}</Badge>
      ),
    },
    {
      key: 'active',
      label: 'Active',
      render: (r) => <Badge tone={String(r['Active'] ?? '') === 'ON' ? 'ok' : 'neutral'}>{String(r['Active'] ?? 'OFF')}</Badge>,
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (r) => (
        <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
          <Button size="icon" variant="ghost" aria-label="Edit alert" disabled={!canAdmin} onClick={() => setForm(rowToForm(r))}>
            <Pencil size={15} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Delete alert"
            disabled={!canAdmin}
            onClick={() => setDeleteName(rowToForm(r).name)}
          >
            <Trash2 size={15} />
          </Button>
        </div>
      ),
    },
  ];

  const trigRows = triggered ?? [];
  const trigKeys = trigRows.length ? Object.keys(trigRows[0]) : [];

  return (
    <div className="stack">
      <PageHeader
        title="Alerts"
        subtitle="Threshold-based stock alerts. Checks run with the daily process, or on demand below."
        actions={
          <>
            <Button icon={<RefreshCw size={14} />} loading={list.isFetching} onClick={() => void list.refetch()}>
              Refresh
            </Button>
            <Button icon={<Play size={14} />} loading={check.isPending} disabled={!canOperate} onClick={() => check.mutate()}>
              Check now
            </Button>
            <Button variant="primary" icon={<Plus size={14} />} disabled={!canAdmin} onClick={() => setForm({ ...EMPTY })}>
              Add alert
            </Button>
          </>
        }
      />

      {list.isError && <ErrorPanel message={errorMessage(list.error)} onRetry={() => void list.refetch()} />}

      <Card title="Alert rules" noBody>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(_r, i) => 'al-' + i}
          loading={list.isFetching}
          empty={<EmptyState title="No alerts yet" hint="Add a threshold rule to get notified about stock." />}
        />
      </Card>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form && rows.some((r) => String(r['Alert Name'] ?? r['Name'] ?? '') === form.name) ? 'Edit alert — ' + form.name : 'Add alert'}
        size="lg"
        footer={
          <>
            <Button onClick={() => setForm(null)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={save.isPending}
              disabled={!canAdmin || !form?.name.trim()}
              onClick={() => form && save.mutate(form)}
            >
              Save alert
            </Button>
          </>
        }
      >
        {form && (
          <div className="form-grid">
            <Field label="Alert name" span2>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Low Stock Alert" />
            </Field>
            <Field label="Filter field">
              <Input
                list="alertfields"
                value={form.filterField}
                onChange={(e) => setForm({ ...form, filterField: e.target.value })}
                placeholder="BRAND"
              />
              <datalist id="alertfields">
                {['BRAND', 'CATEGORY', 'STATUS_BUCKET', 'AGE_BUCKET', 'BIN_BUCKET', 'STOCK_AGE'].map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </Field>
            <Field label="Filter value">
              <Input value={form.filterValue} onChange={(e) => setForm({ ...form, filterValue: e.target.value })} placeholder="Apple" />
            </Field>
            <Field label="Operator">
              <Select value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })}>
                {['LT', 'LTE', 'GT', 'GTE', 'EQ'].map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Threshold">
              <Input
                type="number"
                placeholder="e.g. 50"
                value={form.threshold}
                onChange={(e) => setForm({ ...form, threshold: e.target.value })}
              />
            </Field>
            <Field label="Email to (optional)">
              <Input value={form.emailTo} onChange={(e) => setForm({ ...form, emailTo: e.target.value })} placeholder="ops@example.com" />
            </Field>
            <div className="row" style={{ gap: 18, paddingTop: 20 }}>
              <Switch label="Telegram" checked={form.telegram} onChange={(v) => setForm({ ...form, telegram: v })} />
              <Switch label="Active" checked={form.active} onChange={(v) => setForm({ ...form, active: v })} />
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!triggered} onClose={() => setTriggered(null)} title="Triggered alerts" size="lg">
        {trigRows.length > 0 && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  {trigKeys.map((k) => (
                    <th key={k}>{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trigRows.map((r, i) => (
                  <tr key={i}>
                    {trigKeys.map((k) => (
                      <td key={k}>
                        <span className="cell-clip" title={String(r[k] ?? '')}>
                          {String(r[k] ?? '') || '—'}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteName}
        title="Delete alert"
        confirmLabel="Delete"
        loading={del.isPending}
        message={
          <>
            Delete alert rule <strong>{deleteName}</strong>?
          </>
        }
        onCancel={() => setDeleteName(null)}
        onConfirm={() => deleteName && del.mutate(deleteName)}
      />
    </div>
  );
}
