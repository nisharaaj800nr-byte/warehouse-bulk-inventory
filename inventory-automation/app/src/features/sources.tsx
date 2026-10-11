/* Data sources: how the daily pipeline reads its raw input. */
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Pencil, Plus, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/query';
import { hasRole } from '../lib/utils';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Switch } from '../ui/base';
import { DataTable, type Column } from '../ui/table';
import { Modal, useToast } from '../ui/overlay';
import { useAuth } from './auth';

interface SourceForm {
  id: string;
  name: string;
  type: string;
  role: string;
  sheet: string;
  sheetId: string;
  joinKey: string;
  joinFields: string;
  active: boolean;
}

const EMPTY: SourceForm = {
  id: '',
  name: '',
  type: 'Google Sheet',
  role: 'JOIN',
  sheet: '',
  sheetId: '',
  joinKey: 'BARCODE',
  joinFields: '',
  active: true,
};

function rowToForm(r: Record<string, unknown>): SourceForm {
  return {
    id: String(r['Source ID'] ?? ''),
    name: String(r['Source Name'] ?? ''),
    type: String(r['Type'] ?? 'Google Sheet'),
    role: String(r['Role'] ?? 'JOIN'),
    sheet: String(r['Sheet Name'] ?? ''),
    sheetId: String(r['Sheet ID'] ?? ''),
    joinKey: String(r['Join Key'] ?? 'BARCODE'),
    joinFields: String(r['Join Fields'] ?? ''),
    active: String(r['Active'] ?? 'ON') === 'ON',
  };
}

export function SourcesPage() {
  const toast = useToast();
  const { session } = useAuth();
  const canManage = hasRole(session?.role, 'MANAGER');

  const list = useQuery({ queryKey: ['sources', 'all'], queryFn: () => api.sourcesList(true) });
  const [form, setForm] = useState<SourceForm | null>(null);

  const save = useMutation({
    mutationFn: (f: SourceForm) =>
      api.sourcesSave({
        id: f.id || undefined,
        name: f.name.trim(),
        type: f.type.trim() || 'Google Sheet',
        role: f.role,
        sheet: f.sheet.trim(),
        sheetId: f.sheetId.trim(),
        joinKey: f.joinKey.trim() || 'BARCODE',
        joinFields: f.joinFields.trim(),
        active: f.active ? 'ON' : 'OFF',
      }),
    onSuccess: (res) => {
      toast.ok(`Source saved: ${res.id}`);
      setForm(null);
      void list.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const rows = list.data ?? [];
  const dynamicKeys = rows.length ? Object.keys(rows[0]) : ['Source ID', 'Source Name', 'Type', 'Role', 'Sheet Name', 'Active'];

  const columns: Column<Record<string, unknown>>[] = [
    ...dynamicKeys.map((k) => ({
      key: k,
      label: k,
      render: (r: Record<string, unknown>) => {
        const v = String(r[k] ?? '');
        if (k === 'Active') return <Badge tone={v === 'ON' ? 'ok' : 'neutral'}>{v || '—'}</Badge>;
        if (k === 'Role') return <Badge tone={v === 'PRIMARY' ? 'brand' : 'info'}>{v || '—'}</Badge>;
        return (
          <span className="cell-clip" title={v}>
            {v || '—'}
          </span>
        );
      },
    })),
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (r) => (
        <Button
          size="icon"
          variant="ghost"
          aria-label="Edit source"
          disabled={!canManage}
          onClick={() => setForm(rowToForm(r))}
        >
          <Pencil size={15} />
        </Button>
      ),
    },
  ];

  return (
    <div className="stack">
      <PageHeader
        title="Sources"
        subtitle="Data sources used by the daily pipeline (Primary raw data + join sources like QC Stock / Location)."
        actions={
          <>
            <Button icon={<RefreshCw size={14} />} loading={list.isFetching} onClick={() => void list.refetch()}>
              Refresh
            </Button>
            <Button variant="primary" icon={<Plus size={14} />} disabled={!canManage} onClick={() => setForm({ ...EMPTY })}>
              Add source
            </Button>
          </>
        }
      />

      <Card
        title="Configured sources"
        actions={<span className="hint">Tip: to retire a source, edit it and switch Active off</span>}
        noBody
      >
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(_r, i) => 'src-' + i}
          loading={list.isFetching}
          empty={<EmptyState title="No sources configured" hint="Add a source to feed the daily pipeline." />}
        />
      </Card>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? 'Edit source — ' + form.id : 'Add source'}
        size="lg"
        footer={
          <>
            <Button onClick={() => setForm(null)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={save.isPending}
              disabled={!canManage || !form?.name.trim()}
              onClick={() => form && save.mutate(form)}
            >
              Save source
            </Button>
          </>
        }
      >
        {form && (
          <div className="form-grid">
            <Field label="Name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Daily Raw Data" />
            </Field>
            <Field label="Role">
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="PRIMARY">PRIMARY</option>
                <option value="JOIN">JOIN</option>
              </Select>
            </Field>
            <Field label="Type">
              <Input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="Google Sheet" />
            </Field>
            <Field label="Sheet name" hint="Tab name in this spreadsheet">
              <Input value={form.sheet} onChange={(e) => setForm({ ...form, sheet: e.target.value })} />
            </Field>
            <Field label="Sheet ID (optional)" hint="For external spreadsheets">
              <Input value={form.sheetId} onChange={(e) => setForm({ ...form, sheetId: e.target.value })} />
            </Field>
            <Field label="Join key (optional)">
              <Input value={form.joinKey} onChange={(e) => setForm({ ...form, joinKey: e.target.value })} placeholder="BARCODE" />
            </Field>
            <Field label="Join fields (optional)" hint="Comma-separated fields pulled from this source" span2>
              <Input value={form.joinFields} onChange={(e) => setForm({ ...form, joinFields: e.target.value })} placeholder="STOCK_AGE, LOCATION" />
            </Field>
            <div style={{ paddingTop: 20 }}>
              <Switch label="Active" checked={form.active} onChange={(v) => setForm({ ...form, active: v })} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
