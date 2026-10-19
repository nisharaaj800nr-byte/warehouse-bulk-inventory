import { translate } from '../lib/i18n';
/* Reports: definitions, generation, templates, bulk create, export to sheet. */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/query';
import { hasRole } from '../lib/utils';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorPanel,
  Field,
  Input,
  PageHeader,
  Switch,
  Textarea,
} from '../ui/base';
import { DataTable, type Column } from '../ui/table';
import { ConfirmDialog, Modal, useToast } from '../ui/overlay';
import { useAuth } from './auth';

interface ReportForm {
  name: string;
  filterField: string;
  filterValue: string;
  columns: string;
  active: boolean;
}

const EMPTY_FORM: ReportForm = { name: '', filterField: '', filterValue: '', columns: '', active: true };

function rowToForm(r: Record<string, unknown>): ReportForm {
  return {
    name: String(r['Report Name'] ?? ''),
    filterField: String(r['Filter Field'] ?? ''),
    filterValue: String(r['Filter Value'] ?? ''),
    columns: String(r['Report Columns'] ?? ''),
    active: String(r['Active'] ?? 'ON') === 'ON',
  };
}

export function ReportsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const { session } = useAuth();
  const canManage = hasRole(session?.role, 'MANAGER');
  const canAdmin = hasRole(session?.role, 'ADMIN');

  const reports = useQuery({ queryKey: ['reports'], queryFn: () => api.reportsList() });
  const templates = useQuery({ queryKey: ['templates'], queryFn: () => api.templatesList() });

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<ReportForm>(EMPTY_FORM);
  const [isNew, setIsNew] = useState(true);
  const [deleteName, setDeleteName] = useState<string | null>(null);
  const [genForm, setGenForm] = useState<ReportForm | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [confirmExport, setConfirmExport] = useState(false);

  const [tplOpen, setTplOpen] = useState(false);
  const [tplForm, setTplForm] = useState({ name: '', configJson: '', active: true });
  const [tplDelete, setTplDelete] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api.reportSave({
        name: form.name.trim(),
        filterField: form.filterField.trim(),
        filterValue: form.filterValue.trim(),
        columns: form.columns.trim(),
        active: form.active ? 'ON' : 'OFF',
      }),
    onSuccess: (res) => {
      toast.ok(`Report saved: ${res.saved}`);
      setEditOpen(false);
      void reports.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const del = useMutation({
    mutationFn: (name: string) => api.reportDelete(name),
    onSuccess: (res) => {
      toast.ok(`Report deleted: ${res.deleted}`);
      setDeleteName(null);
      void reports.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const generate = useMutation({
    mutationFn: (f: ReportForm) =>
      api.reportGenerate({
        name: f.name,
        filterField: f.filterField.trim(),
        filterValue: f.filterValue.trim(),
        columns: f.columns.trim(),
      }),
    onSuccess: (res) => {
      toast.ok(`Report "${res.report}" generated with ${res.rows} rows.`);
      setGenForm(null);
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const bulk = useMutation({
    mutationFn: (list: Record<string, unknown>[]) => api.reportsBulkCreate(list),
    onSuccess: (res) => {
      toast.ok(`${res.created.length} report(s) created.`);
      setBulkOpen(false);
      setBulkText('');
      void reports.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const exportAll = useMutation({
    mutationFn: () => api.reportsExportAll(),
    onSuccess: () => {
      toast.ok('All reports exported to sheets.');
      setConfirmExport(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const tplSave = useMutation({
    mutationFn: () => api.templateSave({ name: tplForm.name.trim(), configJson: tplForm.configJson, active: tplForm.active ? 'ON' : 'OFF' }),
    onSuccess: (res) => {
      toast.ok(`Template saved: ${res.saved}`);
      setTplOpen(false);
      void templates.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const tplDel = useMutation({
    mutationFn: (name: string) => api.templateDelete(name),
    onSuccess: (res) => {
      toast.ok(`Template deleted: ${res.deleted}`);
      setTplDelete(null);
      void templates.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const submitBulk = () => {
    try {
      const list = bulkText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
          const parts = line.split('|').map((p) => p.trim());
          if (!parts[0]) throw new Error('Each line needs a report name.');
          return {
            name: parts[0],
            filterField: parts[1] ?? '',
            filterValue: parts[2] ?? '',
            columns: parts[3] ?? '',
          };
        });
      if (!list.length) throw new Error('Add at least one line.');
      bulk.mutate(list);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const rows = reports.data ?? [];
  const columns: Column<Record<string, unknown>>[] = [
    {
      key: 'name',
      label: 'Report name',
      render: (r) => <strong>{String(r['Report Name'] ?? '')}</strong>,
    },
    {
      key: 'filter',
      label: 'Filter',
      render: (r) => {
        const f = String(r['Filter Field'] ?? '');
        const v = String(r['Filter Value'] ?? '');
        return f ? (
          <span className="mono">
            {f}={v}
          </span>
        ) : (
          <span className="muted">—</span>
        );
      },
    },
    {
      key: 'columns',
      label: 'Columns',
      render: (r) => (
        <span className="cell-clip" title={String(r['Report Columns'] ?? '')}>
          {String(r['Report Columns'] ?? '') || '—'}
        </span>
      ),
    },
    {
      key: 'active',
      label: 'Active',
      render: (r) => (
        <Badge tone={String(r['Active'] ?? '') === 'ON' ? 'ok' : 'neutral'}>{String(r['Active'] ?? 'OFF')}</Badge>
      ),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (r) => {
        const f = rowToForm(r);
        return (
          <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Generate"
              title="Generate now"
              disabled={!canManage}
              onClick={() => setGenForm({ ...f })}
            >
              <Play size={15} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Edit"
              disabled={!canAdmin}
              onClick={() => {
                setForm(f);
                setIsNew(false);
                setEditOpen(true);
              }}
            >
              <Pencil size={15} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Delete"
              disabled={!canAdmin}
              onClick={() => setDeleteName(f.name)}
            >
              <Trash2 size={15} />
            </Button>
          </div>
        );
      },
    },
  ];

  const tplRows = templates.data ?? [];
  const tplCols: Column<Record<string, unknown>>[] = [
    { key: 'name', label: 'Template', render: (r) => String(r['Name'] ?? r['Template Name'] ?? Object.values(r)[0] ?? '') },
    {
      key: 'active',
      label: 'Active',
      render: (r) => <Badge tone={String(r['Active'] ?? '') === 'ON' ? 'ok' : 'neutral'}>{String(r['Active'] ?? '') || '—'}</Badge>,
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (r) => (
        <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Edit template"
            disabled={!canAdmin}
            onClick={() => {
              setTplForm({
                name: String(r['Name'] ?? r['Template Name'] ?? Object.values(r)[0] ?? ''),
                configJson: String(r['Config JSON'] ?? r['ConfigJson'] ?? ''),
                active: String(r['Active'] ?? 'ON') === 'ON',
              });
              setTplOpen(true);
            }}
          >
            <Pencil size={15} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Delete template"
            disabled={!canAdmin}
            onClick={() => setTplDelete(String(r['Name'] ?? r['Template Name'] ?? Object.values(r)[0] ?? ''))}
          >
            <Trash2 size={15} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="stack">
      <PageHeader
        title={translate('Reports')}
        subtitle="Report definitions and generation. Generated reports appear as sheets in the spreadsheet."
        actions={
          <>
            <Button icon={<RefreshCw size={14} />} loading={reports.isFetching} onClick={() => void reports.refetch()}>
              Refresh
            </Button>
            <Button disabled={!canManage} loading={exportAll.isPending} onClick={() => setConfirmExport(true)}>
              Export all to sheets
            </Button>
            <Button disabled={!canAdmin} onClick={() => setBulkOpen(true)}>
              Bulk create
            </Button>
            <Button
              variant="primary"
              icon={<Plus size={14} />}
              disabled={!canAdmin}
              onClick={() => {
                setForm(EMPTY_FORM);
                setIsNew(true);
                setEditOpen(true);
              }}
            >
              New report
            </Button>
          </>
        }
      />

      {reports.isError && <ErrorPanel message={errorMessage(reports.error)} onRetry={() => void reports.refetch()} />}

      <Card title="Report definitions" noBody>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(_r, i) => 'rp-' + i}
          loading={reports.isFetching}
          empty={<EmptyState title="No reports yet" hint="Create your first report definition." />}
        />
      </Card>

      <Card title="Report templates" actions={<span className="hint">Reusable formats (advanced)</span>} noBody>
        <DataTable
          columns={tplCols}
          rows={tplRows}
          rowKey={(_r, i) => 'tp-' + i}
          loading={templates.isFetching}
          empty={<EmptyState title="No templates" />}
        />
      </Card>

      {/* Add / edit report */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={isNew ? 'New report' : 'Edit report'}
        size="lg"
        footer={
          <>
            <Button onClick={() => setEditOpen(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={save.isPending}
              disabled={!form.name.trim() || !canAdmin}
              onClick={() => save.mutate()}
            >
              Save report
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Report name" span2>
            <Input
              value={form.name}
              disabled={!isNew}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Apple L4 Bin Storage"
            />
          </Field>
          <Field label="Filter field">
            <Input
              value={form.filterField}
              onChange={(e) => setForm((p) => ({ ...p, filterField: e.target.value }))}
              placeholder="e.g. STATUS_BUCKET"
            />
          </Field>
          <Field label="Filter value">
            <Input
              value={form.filterValue}
              onChange={(e) => setForm((p) => ({ ...p, filterValue: e.target.value }))}
              placeholder="e.g. Bin Storage"
            />
          </Field>
          <Field label="Columns" span2 hint="Comma-separated column names, e.g. BARCODE, MODEL, STATUS, AGE_BUCKET">
            <Textarea value={form.columns} onChange={(e) => setForm((p) => ({ ...p, columns: e.target.value }))} />
          </Field>
        </div>
        <Switch label="Active" checked={form.active} onChange={(v) => setForm((p) => ({ ...p, active: v }))} />
      </Modal>

      {/* Generate */}
      <Modal
        open={!!genForm}
        onClose={() => setGenForm(null)}
        title={'Generate — ' + (genForm?.name ?? '')}
        size="lg"
        footer={
          <>
            <Button onClick={() => setGenForm(null)} disabled={generate.isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={<Play size={14} />}
              loading={generate.isPending}
              disabled={!canManage}
              onClick={() => genForm && generate.mutate(genForm)}
            >
              Generate report
            </Button>
          </>
        }
      >
        {genForm && (
          <div className="form-grid">
            <Field label="Filter field">
              <Input value={genForm.filterField} onChange={(e) => setGenForm({ ...genForm, filterField: e.target.value })} />
            </Field>
            <Field label="Filter value">
              <Input value={genForm.filterValue} onChange={(e) => setGenForm({ ...genForm, filterValue: e.target.value })} />
            </Field>
            <Field label="Columns" span2 hint="Comma-separated. Leave as-is to use the saved definition.">
              <Textarea value={genForm.columns} onChange={(e) => setGenForm({ ...genForm, columns: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      {/* Bulk create */}
      <Modal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Bulk create reports"
        size="lg"
        footer={
          <>
            <Button onClick={() => setBulkOpen(false)} disabled={bulk.isPending}>
              Cancel
            </Button>
            <Button variant="primary" loading={bulk.isPending} disabled={!canAdmin} onClick={submitBulk}>
              Create reports
            </Button>
          </>
        }
      >
        <Field label="One report per line" hint="Format: Name | FilterField | FilterValue | Col1,Col2">
          <Textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={'Apple Bin Storage | BRAND | Apple | BARCODE,MODEL,STATUS_BUCKET\n75+ Devices | AGE_BUCKET | Above 75 | BARCODE,MODEL,AGE_BUCKET,LOCATION'}
            style={{ minHeight: 140 }}
          />
        </Field>
      </Modal>

      {/* Template dialog */}
      <Modal
        open={tplOpen}
        onClose={() => setTplOpen(false)}
        title="Report template"
        size="lg"
        footer={
          <>
            <Button onClick={() => setTplOpen(false)} disabled={tplSave.isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={tplSave.isPending}
              disabled={!canAdmin || !tplForm.name.trim()}
              onClick={() => tplSave.mutate()}
            >
              Save template
            </Button>
          </>
        }
      >
        <Field label="Template name">
          <Input value={tplForm.name} onChange={(e) => setTplForm((p) => ({ ...p, name: e.target.value }))} />
        </Field>
        <Field label="Config JSON" hint="Advanced — structure depends on your template engine.">
          <Textarea
            value={tplForm.configJson}
            onChange={(e) => setTplForm((p) => ({ ...p, configJson: e.target.value }))}
            className="mono"
          />
        </Field>
        <Switch label="Active" checked={tplForm.active} onChange={(v) => setTplForm((p) => ({ ...p, active: v }))} />
      </Modal>

      <ConfirmDialog
        open={!!deleteName}
        title="Delete report"
        confirmLabel="Delete"
        loading={del.isPending}
        message={
          <>
            Delete report definition <strong>{deleteName}</strong>? Generated sheet content is not removed.
          </>
        }
        onCancel={() => setDeleteName(null)}
        onConfirm={() => deleteName && del.mutate(deleteName)}
      />

      <ConfirmDialog
        open={!!tplDelete}
        title="Delete template"
        confirmLabel="Delete"
        loading={tplDel.isPending}
        message={
          <>
            Delete template <strong>{tplDelete}</strong>?
          </>
        }
        onCancel={() => setTplDelete(null)}
        onConfirm={() => tplDelete && tplDel.mutate(tplDelete)}
      />

      <ConfirmDialog
        open={confirmExport}
        tone="primary"
        title="Export all reports"
        confirmLabel="Export"
        loading={exportAll.isPending}
        message="Rebuild every active report sheet from the current inventory data?"
        onCancel={() => setConfirmExport(false)}
        onConfirm={() => exportAll.mutate()}
      />
    </div>
  );
}
