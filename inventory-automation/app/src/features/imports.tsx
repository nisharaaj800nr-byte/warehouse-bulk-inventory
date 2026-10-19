import { translate } from '../lib/i18n';
/* Imports: universal file/sheet import, multi-source jobs, conflicts,
   priority rules, and the consolidated source-data browser. */
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Link2, Plus, Trash2, Upload } from 'lucide-react';
import { api, type ImportCommitResult, type ImportStaged } from '../lib/api';
import { errorMessage } from '../lib/query';
import { hasRole, TARGET_FIELDS, toRowObjects, useDebounced } from '../lib/utils';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorPanel,
  Field,
  Input,
  PageHeader,
  Select,
  Switch,
  Tabs,
} from '../ui/base';
import { DataTable, type Column } from '../ui/table';
import { ConfirmDialog, useToast } from '../ui/overlay';
import { useAuth } from './auth';

const SOURCE_TYPES = ['QC_STOCK', 'TRC', 'INVENTORY', 'LOCATION', 'OTHER'];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || '');
      resolve(s.includes(',') ? s.split(',')[1] : s);
    };
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

function normalizeKey(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function autoTarget(column: string): string {
  const key = normalizeKey(column);
  for (const t of TARGET_FIELDS) {
    const tk = normalizeKey(t);
    if (key === tk || key.includes(tk) || tk.includes(key)) return t;
  }
  return '';
}

interface Staged {
  fileName: string;
  format: string;
  headers: string[];
  totalRows: number;
  warnings: string[];
}

/* ================= Universal import ================= */

function UniversalImportTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const { session } = useAuth();
  const canOperate = hasRole(session?.role, 'OPERATOR');

  const [staged, setStaged] = useState<Staged | null>(null);
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][]; offset: number; totalRows: number } | null>(null);
  const [map, setMap] = useState<{ source: string; target: string; required: boolean }[]>([]);
  const [sourceType, setSourceType] = useState('');
  const [dedupe, setDedupe] = useState(false);
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [sheetUrl, setSheetUrl] = useState('');
  const [tabs, setTabs] = useState<{ name: string; rows: number; cols: number }[]>([]);
  const [tab, setTab] = useState('');

  const mapping = useQuery({ queryKey: ['mapping'], queryFn: () => api.mappingList() });
  const targetOptions = useMemo(() => {
    const set = new Set(TARGET_FIELDS);
    (mapping.data ?? []).forEach((r) => {
      const t = String(r['Target Field'] || '').trim();
      if (t) set.add(t);
    });
    return Array.from(set);
  }, [mapping.data]);

  const loadPreview = async (offset: number, replace: boolean) => {
    const page = await api.importPreviewPage(offset, 20);
    const rows = page.rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : String(c))));
    setPreview((prev) =>
      replace || !prev
        ? { headers: page.headers.map(String), rows, offset: page.offset, totalRows: page.totalRows }
        : { headers: prev.headers, rows: [...prev.rows, ...rows], offset: page.offset, totalRows: page.totalRows },
    );
  };

  const applyStaged = async (res: ImportStaged) => {
    const info: Staged = {
      fileName: res.fileName || 'upload',
      format: res.format || '',
      headers: (res.headers || []).map(String),
      totalRows: res.totalRows || 0,
      warnings: res.warnings || [],
    };
    setStaged(info);
    setCommitResult(null);
    setMap(info.headers.map((h) => ({ source: h, target: autoTarget(h), required: false })));
    setPreview(null);
    try {
      await loadPreview(0, true);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const f = fileRef.current?.files?.[0];
      if (!f) throw new Error('Choose a file first.');
      if (f.size > 15 * 1024 * 1024) throw new Error('File is larger than 15 MB.');
      const b64 = await fileToBase64(f);
      return api.importFileB64(b64, f.name);
    },
    onSuccess: (res) => {
      toast.ok(`Staged ${res.totalRows} rows from ${res.fileName}.`);
      void applyStaged(res);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const tabsMutation = useMutation({
    mutationFn: () => api.importTabs(sheetUrl.trim()),
    onSuccess: (res) => {
      setTabs(res);
      setTab(res[0]?.name ?? '');
      toast.ok(`${res.length} tab(s) found.`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const sheetMutation = useMutation({
    mutationFn: () => api.importSheets(sheetUrl.trim(), tab || undefined),
    onSuccess: (res) => {
      toast.ok(`Staged ${res.totalRows} rows.`);
      void applyStaged(res);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const commitMutation = useMutation({
    mutationFn: (runDry: boolean) =>
      api.importCommit({
        mapping: map.filter((m) => m.target).map((m) => ({ source: m.source, target: m.target, required: m.required })),
        sourceType: sourceType.trim(),
        dedupe,
        dryRun: runDry,
      }),
    onSuccess: (res) => {
      setCommitResult(res);
      if (res.dryRun) {
        toast.ok(`Validation: ${res.valid} valid, ${res.failed} failed, ${res.skipped} skipped.`);
      } else {
        toast.ok(`Imported ${res.imported} rows.`);
        void qc.invalidateQueries({ queryKey: ['inventory'] });
        void qc.invalidateQueries({ queryKey: ['dashboard'] });
      }
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const discardMutation = useMutation({
    mutationFn: () => api.importDiscard(),
    onSuccess: () => {
      setStaged(null);
      setPreview(null);
      setCommitResult(null);
      toast.info('Staging cleared.');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const processMutation = useMutation({
    mutationFn: () => api.runProcess(),
    onSuccess: () => {
      toast.ok('Daily process completed.');
      void qc.invalidateQueries();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const errorCols: Column<{ row: number; errors: string[] }>[] = [
    { key: 'row', label: 'Row', align: 'right', render: (r) => r.row },
    { key: 'errors', label: 'Errors', render: (r) => r.errors.join('; ') },
  ];

  if (!staged) {
    return (
      <div className="grid-2">
        <Card
          title={
            <span className="row" style={{ gap: 8 }}>
              <Upload size={16} /> Upload a file
            </span>
          }
        >
          <p className="hint" style={{ marginTop: 0 }}>
            CSV, TSV, TXT, XLS, XLSX or PDF — up to 15&nbsp;MB / 50,000 rows. PDF extraction needs the
            Drive API advanced service enabled in the Apps Script project.
          </p>
          <Field label="File">
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xls,.xlsx,.pdf" className="input" />
          </Field>
          <Button
            variant="primary"
            icon={<Upload size={14} />}
            loading={uploadMutation.isPending}
            disabled={!canOperate}
            onClick={() => uploadMutation.mutate()}
          >
            Stage this file
          </Button>
          {!canOperate && <p className="hint">Your role cannot import (needs OPERATOR+).</p>}
        </Card>

        <Card
          title={
            <span className="row" style={{ gap: 8 }}>
              <Link2 size={16} /> Connect a Google Sheet
            </span>
          }
        >
          <p className="hint" style={{ marginTop: 0 }}>
            Paste the sheet URL or ID. The sheet must be accessible to this Google account.
          </p>
          <Field label="Sheet URL or ID">
            <Input value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" />
          </Field>
          <div className="row" style={{ marginBottom: 12 }}>
            <Button
              loading={tabsMutation.isPending}
              disabled={!sheetUrl.trim()}
              onClick={() => tabsMutation.mutate()}
            >
              Load tabs
            </Button>
            {tabs.length > 0 && (
              <Select value={tab} onChange={(e) => setTab(e.target.value)} style={{ width: 'auto', minWidth: 160 }}>
                {tabs.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name} ({t.rows} rows)
                  </option>
                ))}
              </Select>
            )}
          </div>
          <Button
            variant="primary"
            icon={<Upload size={14} />}
            loading={sheetMutation.isPending}
            disabled={!canOperate || !sheetUrl.trim()}
            onClick={() => sheetMutation.mutate()}
          >
            Stage this sheet
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="stack">
      <Card>
        <div className="spread" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <Badge tone="brand">{staged.format || 'Staged'}</Badge>
            <strong className={''}>{staged.fileName}</strong>
            <span className="muted tnum">
              {staged.totalRows.toLocaleString()} rows × {staged.headers.length} cols
            </span>
          </div>
          <Button
            icon={<Trash2 size={14} />}
            loading={discardMutation.isPending}
            onClick={() => discardMutation.mutate()}
          >
            Discard staging
          </Button>
        </div>
        {staged.warnings.length > 0 && (
          <div className="stack" style={{ gap: 6, marginTop: 12 }}>
            {staged.warnings.map((w, i) => (
              <div key={i} className="row" style={{ gap: 8, color: 'var(--warn)', fontSize: 13 }}>
                <AlertTriangle size={14} /> {w}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Preview"
        actions={
          preview && preview.rows.length < preview.totalRows ? (
            <Button size="sm" onClick={() => void loadPreview(preview.offset + 20, false)}>
              Load more ({preview.rows.length}/{preview.totalRows})
            </Button>
          ) : undefined
        }
        noBody
      >
        {preview ? (
          <DataTable
            columns={preview.headers.map((h) => ({
              key: h,
              label: h,
              render: (r: string[]) => (
                <span className="cell-clip" title={r[preview.headers.indexOf(h)]}>
                  {r[preview.headers.indexOf(h)] || '—'}
                </span>
              ),
            }))}
            rows={preview.rows}
            rowKey={(_r, i) => 'pv-' + i}
            skeletonRows={4}
            empty={<EmptyState title="No preview rows" />}
          />
        ) : (
          <div style={{ padding: 14 }}>
            <EmptyState title="Loading preview…" />
          </div>
        )}
      </Card>

      <Card title="Column mapping" actions={<span className="hint">Map imported columns to system fields</span>}>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Imported column</th>
                <th>Target field</th>
                <th style={{ width: 90 }}>Required</th>
              </tr>
            </thead>
            <tbody>
              {map.map((m, i) => (
                <tr key={m.source}>
                  <td className="mono">{m.source}</td>
                  <td>
                    <Select
                      value={m.target}
                      onChange={(e) =>
                        setMap((prev) => prev.map((x, idx) => (idx === i ? { ...x, target: e.target.value } : x)))
                      }
                    >
                      <option value="">— skip —</option>
                      {targetOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={m.required}
                      onChange={(e) =>
                        setMap((prev) => prev.map((x, idx) => (idx === i ? { ...x, required: e.target.checked } : x)))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Import options">
        <div className="form-grid">
          <Field label="Source type" hint="Used for multi-source classification (e.g. QC_STOCK).">
            <Input list="srctypes" value={sourceType} onChange={(e) => setSourceType(e.target.value)} placeholder="QC_STOCK" />
            <datalist id="srctypes">
              {SOURCE_TYPES.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
          <div className="row" style={{ alignItems: 'flex-end', gap: 18, paddingBottom: 13 }}>
            <Switch label="Skip duplicates" checked={dedupe} onChange={setDedupe} />
          </div>
        </div>
        <div className="row" style={{ gap: 9, flexWrap: 'wrap' }}>
          <Button
            loading={commitMutation.isPending}
            disabled={!canOperate}
            onClick={() => commitMutation.mutate(true)}
          >
            Validate (dry run)
          </Button>
          <Button
            variant="primary"
            icon={<CheckCircle2 size={14} />}
            loading={commitMutation.isPending}
            disabled={!canOperate}
            onClick={() => commitMutation.mutate(false)}
          >
            Import now
          </Button>
        </div>

        {commitResult && (
          <div className="stack" style={{ gap: 10, marginTop: 14 }}>
            <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
              <Badge tone={commitResult.dryRun ? 'info' : 'ok'}>
                {commitResult.dryRun ? 'Dry run' : 'Committed'}
              </Badge>
              <span className="tnum muted">
                processed {commitResult.processed} · valid {commitResult.valid} · imported {commitResult.imported} ·
                failed {commitResult.failed} · skipped {commitResult.skipped}
              </span>
            </div>
            {commitResult.warnings.map((w, i) => (
              <div key={i} className="row" style={{ gap: 8, color: 'var(--warn)', fontSize: 13 }}>
                <AlertTriangle size={14} /> {w}
              </div>
            ))}
            {commitResult.errorSample.length > 0 && (
              <DataTable
                columns={errorCols}
                rows={commitResult.errorSample}
                rowKey={(r) => 'er-' + r.row}
                skeletonRows={2}
                empty={<EmptyState title="No errors" />}
              />
            )}
            {!commitResult.dryRun && (
              <div className="row" style={{ gap: 9 }}>
                <Button
                  variant="primary"
                  loading={processMutation.isPending}
                  disabled={!canOperate}
                  onClick={() => processMutation.mutate()}
                >
                  Run daily process now
                </Button>
                <Button onClick={() => discardMutation.mutate()} loading={discardMutation.isPending}>
                  Discard staging
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ================= Multi-source ================= */

interface MsSource {
  type: string;
  name: string;
  sheetName: string;
  sheetId: string;
  info: string;
}

function MultiSourceTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const { session } = useAuth();
  const canOperate = hasRole(session?.role, 'OPERATOR');

  const [sources, setSources] = useState<MsSource[]>([
    { type: 'QC_STOCK', name: '', sheetName: '', sheetId: '', info: '' },
  ]);
  const [busy, setBusy] = useState(false);
  const [jobResult, setJobResult] = useState<Record<string, unknown> | null>(null);
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});

  const update = (i: number, patch: Partial<MsSource>) =>
    setSources((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const uploadToSource = async (i: number) => {
    const f = fileInputs.current[i]?.files?.[0];
    if (!f) {
      toast.warn('Choose a file first.');
      return;
    }
    try {
      setBusy(true);
      const b64 = await fileToBase64(f);
      const target =
        sources[i].name.trim() ||
        f.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_ ]/g, '_').slice(0, 40);
      const res = await api.importFileToSource(b64, f.name, target);
      update(i, { sheetName: res.sheetName, info: `Uploaded: ${res.totalRows} rows (${res.format})` });
      toast.ok(`Source file staged into sheet "${res.sheetName}".`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const validate = async () => {
    try {
      setBusy(true);
      const list = sources
        .filter((s) => s.name.trim())
        .map((s) => ({ type: s.type, name: s.name.trim(), sheetName: s.sheetName.trim(), sheetId: s.sheetId.trim() }));
      if (!list.length) throw new Error('Add at least one source with a name.');
      const norm = await api.multiValidate(list);
      toast.ok(`Validation passed — ${norm.length} source(s) ready.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    try {
      setBusy(true);
      const list = sources
        .filter((s) => s.name.trim())
        .map((s) => ({ type: s.type, name: s.name.trim(), sheetName: s.sheetName.trim(), sheetId: s.sheetId.trim() }));
      if (!list.length) throw new Error('Add at least one source with a name.');
      const created = await api.multiCreate(list);
      toast.info(`Import job ${created.jobId} created — running…`);
      const res = await api.multiRun(created.jobId);
      setJobResult(res);
      const status = String(res.status || '');
      if (status === 'FAILED') toast.error('Import job failed. See details below.');
      else toast.ok(`Import ${status}: ${String(res.devices ?? 0)} devices, ${String(res.conflicts ?? 0)} conflicts.`);
      void qc.invalidateQueries({ queryKey: ['inventory'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const failed = Array.isArray(jobResult?.['failedSources'])
    ? (jobResult?.['failedSources'] as { source?: unknown; error?: unknown }[])
    : [];

  return (
    <div className="stack">
      <Card
        title="Sources for this import"
        actions={<span className="hint">One logical device per barcode · conflicts resolved by priority rules</span>}
      >
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 150 }}>Type</th>
                <th>Name</th>
                <th>Sheet name (in this spreadsheet)</th>
                <th style={{ width: 210 }}>Or upload a file</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {sources.map((s, i) => (
                <tr key={i}>
                  <td>
                    <Select value={s.type} onChange={(e) => update(i, { type: e.target.value })}>
                      {SOURCE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td>
                    <Input value={s.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="QC Stock" />
                    {s.info && <div className="hint">{s.info}</div>}
                  </td>
                  <td>
                    <Input
                      value={s.sheetName}
                      onChange={(e) => update(i, { sheetName: e.target.value })}
                      placeholder="Sheet tab name"
                    />
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <input
                        ref={(el) => {
                          fileInputs.current[i] = el;
                        }}
                        type="file"
                        accept=".csv,.tsv,.txt,.xls,.xlsx,.pdf"
                        className="input"
                        style={{ padding: '5px 8px' }}
                      />
                      <Button
                        size="sm"
                        disabled={!canOperate || busy}
                        onClick={() => void uploadToSource(i)}
                        title="Upload and stage into a sheet"
                      >
                        Upload
                      </Button>
                    </div>
                  </td>
                  <td>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove source"
                      disabled={sources.length <= 1}
                      onClick={() => setSources((prev) => prev.filter((_x, idx) => idx !== i))}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ gap: 9, marginTop: 12, flexWrap: 'wrap' }}>
          <Button
            icon={<Plus size={14} />}
            onClick={() =>
              setSources((prev) => [...prev, { type: 'TRC', name: '', sheetName: '', sheetId: '', info: '' }])
            }
          >
            Add source
          </Button>
          <Button loading={busy} onClick={() => void validate()}>
            Validate all
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!canOperate}
            onClick={() => void runImport()}
          >
            Import all sources
          </Button>
        </div>
      </Card>

      {jobResult && (
        <Card title="Import result">
          <div className="row" style={{ gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
            <Badge tone={String(jobResult['status']) === 'FAILED' ? 'danger' : 'ok'}>
              {String(jobResult['status'] ?? '—')}
            </Badge>
            <span className="tnum muted">
              job {String(jobResult['jobId'] ?? '')} · rows {String(jobResult['totalRows'] ?? 0)} · devices{' '}
              {String(jobResult['devices'] ?? 0)} · conflicts {String(jobResult['conflicts'] ?? 0)}
            </span>
          </div>
          {failed.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              {failed.map((f, i) => (
                <div key={i} className="row" style={{ gap: 8, color: 'var(--danger)', fontSize: 13 }}>
                  <AlertTriangle size={14} /> {String(f.source ?? 'source')}: {String(f.error ?? 'failed')}
                </div>
              ))}
            </div>
          )}
          <p className="hint" style={{ marginBottom: 0 }}>
            Conflicts are listed in the “Conflicts” tab; field priorities in “Priority rules”.
          </p>
        </Card>
      )}
    </div>
  );
}

/* ================= Conflicts ================= */

function ConflictsTab() {
  const toast = useToast();
  const { session } = useAuth();
  const canManage = hasRole(session?.role, 'MANAGER');
  const [confirmClear, setConfirmClear] = useState(false);

  const list = useQuery({ queryKey: ['conflicts'], queryFn: () => api.conflictsList(500) });
  const clear = useMutation({
    mutationFn: () => api.conflictsClear(),
    onSuccess: (r) => {
      toast.ok(`Cleared ${r.cleared} conflict rows.`);
      setConfirmClear(false);
      void list.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const headers = list.data?.headers ?? [];
  const rows = toRowObjects(headers, list.data?.rows ?? []);
  const columns: Column<Record<string, string>>[] = headers.map((h) => ({
    key: h,
    label: h.replace(/_/g, ' '),
    render: (r) => (
      <span className="cell-clip" title={r[h]}>
        {r[h] || '—'}
      </span>
    ),
  }));

  return (
    <div className="stack">
      {list.isError && <ErrorPanel message={errorMessage(list.error)} onRetry={() => void list.refetch()} />}
      <Card
        title="Data conflicts"
        actions={
          <div className="row" style={{ gap: 9 }}>
            <Badge tone="info">{list.data?.total ?? 0} rows</Badge>
            <Button
              size="sm"
              icon={<Trash2 size={14} />}
              disabled={!canManage}
              onClick={() => setConfirmClear(true)}
            >
              Clear log
            </Button>
          </div>
        }
        noBody
      >
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(_r, i) => 'cf-' + i}
          loading={list.isFetching}
          empty={<EmptyState title="No conflicts" hint="Field conflicts from multi-source imports appear here." />}
        />
      </Card>

      <ConfirmDialog
        open={confirmClear}
        title="Clear conflict log"
        confirmLabel="Clear"
        loading={clear.isPending}
        message="Delete all rows from the Data Conflicts audit log? This cannot be undone."
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => clear.mutate()}
      />
    </div>
  );
}

/* ================= Priority rules ================= */

const RULE_COLS = ['FIELD', 'Priority 1', 'Priority 2', 'Priority 3', 'Priority 4', 'Priority 5'];

function PriorityTab() {
  const toast = useToast();
  const { session } = useAuth();
  const canAdmin = hasRole(session?.role, 'ADMIN');

  const list = useQuery({ queryKey: ['priorityRules'], queryFn: () => api.priorityRulesList() });
  const [local, setLocal] = useState<Record<string, string>[] | null>(null);

  const base = useMemo(
    () =>
      (list.data ?? []).map((r) => {
        const o: Record<string, string> = {};
        RULE_COLS.forEach((c) => {
          o[c] = String(r[c] ?? '');
        });
        return o;
      }),
    [list.data],
  );
  const rows = local ?? base;

  const update = (i: number, col: string, v: string) => {
    setLocal(rows.map((r, idx) => (idx === i ? { ...r, [col]: v } : r)));
  };

  const save = useMutation({
    mutationFn: () =>
      api.priorityRulesSave(
        rows.map((r) => ({ field: r.FIELD, p1: r['Priority 1'], p2: r['Priority 2'], p3: r['Priority 3'], p4: r['Priority 4'], p5: r['Priority 5'] })),
        true,
      ),
    onSuccess: (res) => {
      toast.ok(`Saved ${res.saved} rule(s).`);
      setLocal(null);
      void list.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="stack">
      <Card
        title="Source priority rules"
        actions={<span className="hint">Per field: which source wins, left to right</span>}
      >
        <p className="hint" style={{ marginTop: 0 }}>
          Example: STATUS → QC_STOCK, TRC, INVENTORY, LOCATION, OTHER. Saving replaces the whole table.
        </p>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                {RULE_COLS.map((c) => (
                  <th key={c}>{c}</th>
                ))}
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {RULE_COLS.map((c) => (
                    <td key={c}>
                      <Input value={r[c]} disabled={!canAdmin} onChange={(e) => update(i, c, e.target.value)} />
                    </td>
                  ))}
                  <td>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove rule"
                      disabled={!canAdmin}
                      onClick={() => setLocal(rows.filter((_x, idx) => idx !== i))}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ gap: 9, marginTop: 12 }}>
          <Button
            icon={<Plus size={14} />}
            disabled={!canAdmin}
            onClick={() =>
              setLocal([...rows, { FIELD: '', 'Priority 1': '', 'Priority 2': '', 'Priority 3': '', 'Priority 4': '', 'Priority 5': '' }])
            }
          >
            Add rule
          </Button>
          <Button variant="primary" disabled={!canAdmin} loading={save.isPending} onClick={() => save.mutate()}>
            Save rules
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ================= Source data ================= */

function SourceDataTab() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 300);
  const list = useQuery({ queryKey: ['sourceData', dq], queryFn: () => api.sourceDataList({ q: dq }) });
  const history = useQuery({ queryKey: ['sourceDataHistory'], queryFn: () => api.sourceDataHistory() });

  const headers = list.data?.headers ?? [];
  const allRows = toRowObjects(headers, list.data?.rows ?? []);
  const rows = allRows.slice(0, 500);
  const columns: Column<Record<string, string>>[] = headers.map((h) => ({
    key: h,
    label: h.replace(/_/g, ' '),
    render: (r) => (
      <span className="cell-clip" title={r[h]}>
        {r[h] || '—'}
      </span>
    ),
  }));

  const histHeaders = history.data?.headers ?? [];
  const histRows = toRowObjects(histHeaders, (history.data?.data ?? []).slice(-20).reverse());

  return (
    <div className="stack">
      {list.isError && <ErrorPanel message={errorMessage(list.error)} onRetry={() => void list.refetch()} />}
      <Card
        title="Consolidated source rows"
        actions={
          <div className="row" style={{ gap: 8 }}>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              style={{ width: 220 }}
              aria-label="Search source data"
            />
            <Badge tone="info">{list.data?.total ?? 0} rows</Badge>
          </div>
        }
        noBody
      >
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(_r, i) => 'sd-' + i}
          loading={list.isFetching}
          empty={<EmptyState title="No source rows" hint="Run a multi-source import to populate SOURCE_DATA." />}
        />
        {allRows.length > rows.length && (
          <div className="hint" style={{ padding: '6px 12px' }}>
            Showing first {rows.length} of {allRows.length} matching rows.
          </div>
        )}
      </Card>

      <Card title="Source import history" noBody>
        <DataTable
          columns={histHeaders.map((h) => ({
            key: h,
            label: h.replace(/_/g, ' '),
            render: (r: Record<string, string>) => (
              <span className="cell-clip" title={r[h]}>
                {r[h] || '—'}
              </span>
            ),
          }))}
          rows={histRows}
          rowKey={(_r, i) => 'sh-' + i}
          loading={history.isFetching}
          empty={<EmptyState title="No import history" />}
        />
      </Card>
    </div>
  );
}

/* ================= Page ================= */

export function ImportsPage() {
  const [tab, setTab] = useState('universal');
  return (
    <div className="stack">
      <PageHeader title={translate('Imports')} subtitle="Bring data in: files, Google Sheets, or multiple sources at once." />
      <Tabs
        tabs={[
          { key: 'universal', label: 'Universal import' },
          { key: 'multi', label: 'Multi-source' },
          { key: 'conflicts', label: 'Conflicts' },
          { key: 'priority', label: 'Priority rules' },
          { key: 'sourceData', label: 'Source data' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'universal' && <UniversalImportTab />}
      {tab === 'multi' && <MultiSourceTab />}
      {tab === 'conflicts' && <ConflictsTab />}
      {tab === 'priority' && <PriorityTab />}
      {tab === 'sourceData' && <SourceDataTab />}
    </div>
  );
}
