/* Inventory explorer: search, filters, pagination, detail drawer, CRUD, export. */
import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { Boxes, Download, Pencil, Plus, RefreshCw, ScanLine, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { errorMessage, queryClient } from '../lib/query';
import { downloadText, hasRole, useDebounced } from '../lib/utils';
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
  Toolbar,
} from '../ui/base';
import { DataTable, Pagination, type Column } from '../ui/table';
import { ConfirmDialog, Drawer, DropdownMenu, Modal, useToast } from '../ui/overlay';
import { useAuth } from './auth';
import { ScannerModal } from './scanner';

const FILTER_FIELDS = ['STATUS_BUCKET', 'AGE_BUCKET', 'BRAND', 'CATEGORY', 'PRIORITY', 'BIN_BUCKET', 'SOURCE'];
const HIDDEN_KEY = 'ors.inv.hidden';
const RIGHT_ALIGN = /AGE|COUNT|QTY|PRICE/;

function labelOf(h: string): string {
  return h.replace(/_/g, ' ');
}

function BucketBadge({ value }: { value: string }) {
  const v = value.toLowerCase();
  const tone =
    v.includes('fail') || v.includes('above 75')
      ? 'danger'
      : v.includes('pending') || v.includes('60-75') || v.includes('repair')
        ? 'warn'
        : 'ok';
  return <Badge tone={tone}>{value}</Badge>;
}

function renderCell(header: string, value: string) {
  if (!value) return <span className="muted">â€”</span>;
  if (header === 'STATUS_BUCKET' || header === 'STATUS' || header === 'AGE_BUCKET') {
    return <BucketBadge value={value} />;
  }
  if (header === 'PRIORITY') return <Badge tone="info">{value}</Badge>;
  return (
    <span className="cell-clip" title={value}>
      {value}
    </span>
  );
}

function ItemDialog({
  open,
  title,
  headers,
  initial,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  headers: string[];
  initial: Record<string, string> | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (item: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    const base: Record<string, string> = {};
    headers.forEach((h) => {
      base[h] = initial?.[h] ?? '';
    });
    setValues(base);
    setErr('');
  }, [open, initial, headers]);

  const isEdit = !!initial;

  const submit = () => {
    if (headers.includes('BARCODE') && !String(values.BARCODE || '').trim()) {
      setErr('BARCODE is required.');
      return;
    }
    onSubmit(values);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            {isEdit ? 'Save changes' : 'Add row'}
          </Button>
        </>
      }
    >
      {err && <div className="login-err">{err}</div>}
      <div className="form-grid">
        {headers.map((h) => (
          <Field key={h} label={labelOf(h)} hint={isEdit && h === 'BARCODE' ? 'Key column â€” not editable.' : undefined}>
            <Input
              value={values[h] ?? ''}
              disabled={isEdit && h === 'BARCODE'}
              onChange={(e) => setValues((prev) => ({ ...prev, [h]: e.target.value }))}
            />
          </Field>
        ))}
      </div>
    </Modal>
  );
}

export function InventoryPage() {
  const { session } = useAuth();
  const toast = useToast();
  const canOperate = hasRole(session?.role, 'OPERATOR');
  const canManage = hasRole(session?.role, 'MANAGER');

  const [q, setQ] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const debouncedQ = useDebounced(q, 300);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [hidden, setHidden] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]') as string[];
    } catch {
      return [];
    }
  });
  const [options, setOptions] = useState<Record<string, string[]>>({});
  const [selected, setSelected] = useState<Record<string, string> | null>(null);
  const [editItem, setEditItem] = useState<Record<string, string> | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteFor, setDeleteFor] = useState<Record<string, string> | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportCols, setExportCols] = useState<string[]>([]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, filters]);

  const list = useQuery({
    queryKey: ['inventory', debouncedQ, filters, page, perPage],
    queryFn: () => api.inventoryList({ q: debouncedQ, filters, page, perPage }),
    placeholderData: keepPreviousData,
  });

  const headers = list.data?.headers ?? [];
  const rows = list.data?.rows ?? [];

  const rowObjects: Record<string, string>[] = useMemo(
    () =>
      rows.map((r) => {
        const o: Record<string, string> = {};
        headers.forEach((h, i) => {
          const v = (r as unknown[])[i];
          o[h] = v === null || v === undefined ? '' : String(v);
        });
        return o;
      }),
    [rows, headers],
  );

  useEffect(() => {
    if (!headers.length) return;
    setOptions((prev) => {
      const next: Record<string, string[]> = { ...prev };
      let changed = false;
      for (const f of FILTER_FIELDS) {
        const idx = headers.indexOf(f);
        if (idx < 0) continue;
        const set = new Set(next[f] ?? []);
        rows.forEach((r) => {
          const v = String((r as unknown[])[idx] ?? '');
          if (v) set.add(v);
        });
        const arr = Array.from(set).sort();
        if (!next[f] || arr.length !== next[f].length) {
          next[f] = arr;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [rows, headers]);

  const saveMutation = useMutation({
    mutationFn: (item: Record<string, string>) => api.inventorySave(item),
    onSuccess: (res) => {
      toast.ok(`Row ${res.mode === 'added' ? 'added' : 'saved'}: ${res.barcode}`);
      setAddOpen(false);
      setEditItem(null);
      void list.refetch();
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (barcode: string) => api.inventoryDelete(barcode),
    onSuccess: (_res, barcode) => {
      toast.ok(`Deleted ${barcode}`);
      setDeleteFor(null);
      setSelected(null);
      void list.refetch();
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const exportMutation = useMutation({
    mutationFn: (cols: string[]) => api.inventoryExport(cols),
    onSuccess: (res) => {
      downloadText(`inventory-${new Date().toISOString().slice(0, 10)}.csv`, res.csv, 'text/csv;charset=utf-8');
      toast.ok(`Exported ${res.rows} rows.`);
      setExportOpen(false);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const toggleHidden = (h: string) => {
    setHidden((prev) => {
      const next = prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h];
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
      return next;
    });
  };

  const visibleHeaders = headers.filter((h) => !hidden.includes(h));
  const columns: Column<Record<string, string>>[] = visibleHeaders.map((h) => ({
    key: h,
    label: labelOf(h),
    align: RIGHT_ALIGN.test(h) ? 'right' : undefined,
    render: (row) => renderCell(h, row[h] ?? ''),
  }));

  const activeFilter = !!q || Object.values(filters).some(Boolean);
  const barcodeKey = headers.includes('BARCODE') ? 'BARCODE' : headers[0] ?? '';

  const filterSelects = FILTER_FIELDS.filter((f) => headers.includes(f)).map((f) => (
    <Select
      key={f}
      value={filters[f] ?? ''}
      onChange={(e) => setFilters((prev) => ({ ...prev, [f]: e.target.value }))}
      style={{ width: 'auto', minWidth: 138 }}
      aria-label={labelOf(f)}
    >
      <option value="">{labelOf(f)}: All</option>
      {(options[f] ?? []).map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </Select>
  ));

  return (
    <div className="stack">
      <PageHeader
        title="Inventory"
        subtitle={list.data ? `${list.data.total.toLocaleString()} items` : 'Browse the final inventory dataset.'}
        actions={
          <Button icon={<RefreshCw size={14} />} onClick={() => void list.refetch()} loading={list.isFetching}>
            Refresh
          </Button>
        }
      />

      {list.isError && <ErrorPanel message={errorMessage(list.error)} onRetry={() => void list.refetch()} />}

      <Card noBody>
        <div style={{ padding: '12px 14px 0' }}>
          <Toolbar>
            <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--muted)' }} />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search inventoryâ€¦"
                style={{ paddingLeft: 32 }}
                aria-label="Search inventory"
              />
            </div>
            <Button
              size="sm"
              icon={<ScanLine size={14} />}
              onClick={() => setScanOpen(true)}
              title="Scan barcode with camera"
            >
              Scan
            </Button>
            {filterSelects}
            {activeFilter && (
              <Button
                variant="ghost"
                size="sm"
                icon={<X size={14} />}
                onClick={() => {
                  setQ('');
                  setFilters({});
                }}
              >
                Clear
              </Button>
            )}
            <div className="grow" />
            <DropdownMenu
              className="btn btn-secondary btn-sm"
              content={
                <>
                  <SlidersHorizontal size={14} /> Columns
                </>
              }
              scroll
              header={<div className="menu-label">Visible columns</div>}
              items={[
                ...headers.map((h) => ({
                  label: (
                    <label className="checkbox" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={!hidden.includes(h)} onChange={() => toggleHidden(h)} />
                      {labelOf(h)}
                    </label>
                  ),
                  keepOpen: true,
                })),
                { label: null },
                {
                  label: 'Show all columns',
                  onClick: () => {
                    setHidden([]);
                    localStorage.setItem(HIDDEN_KEY, '[]');
                  },
                },
              ]}
            />
            {canManage && (
              <Button
                size="sm"
                icon={<Download size={14} />}
                disabled={!headers.length}
                onClick={() => {
                  setExportCols(headers);
                  setExportOpen(true);
                }}
              >
                Export
              </Button>
            )}
            {canOperate && (
              <Button
                variant="primary"
                size="sm"
                icon={<Plus size={14} />}
                disabled={!headers.length}
                onClick={() => setAddOpen(true)}
              >
                Add row
              </Button>
            )}
          </Toolbar>
          <ScannerModal open={scanOpen} onClose={() => setScanOpen(false)} onDetect={(code) => setQ(code)} />
        </div>

        <DataTable
          columns={columns}
          rows={rowObjects}
          rowKey={(r, i) => `${i}:${barcodeKey ? r[barcodeKey] : ''}`}
          onRowClick={(r) => setSelected(r)}
          loading={list.isFetching}
          empty={
            <EmptyState
              icon={<Boxes size={20} />}
              title="No inventory rows"
              hint={activeFilter ? 'Try clearing the search or filters.' : 'Import data or add a row to get started.'}
            />
          }
        />

        <div style={{ padding: '0 12px' }}>
          <Pagination
            page={page}
            perPage={perPage}
            total={list.data?.total ?? 0}
            onPage={setPage}
            onPerPage={(n) => {
              setPerPage(n);
              setPage(1);
            }}
          />
        </div>
      </Card>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        wide
        title={selected ? String(selected[barcodeKey] || 'Row details') : 'Row details'}
        footer={
          selected ? (
            <>
              {canOperate && (
                <Button
                  icon={<Pencil size={14} />}
                  onClick={() => {
                    setEditItem(selected);
                    setSelected(null);
                  }}
                >
                  Edit
                </Button>
              )}
              {canOperate && (
                <Button variant="danger" icon={<Trash2 size={14} />} onClick={() => setDeleteFor(selected)}>
                  Delete
                </Button>
              )}
              <Button onClick={() => setSelected(null)}>Close</Button>
            </>
          ) : undefined
        }
      >
        {selected && (
          <div className="detail-grid">
            {headers.map((h) => (
              <div className="detail-item" key={h}>
                <div className="detail-label">{labelOf(h)}</div>
                <div className="detail-value">{selected[h] || <span className="muted">â€”</span>}</div>
              </div>
            ))}
          </div>
        )}
      </Drawer>

      <ItemDialog
        open={addOpen}
        title="Add inventory row"
        headers={headers}
        initial={null}
        busy={saveMutation.isPending}
        onClose={() => setAddOpen(false)}
        onSubmit={(item) => saveMutation.mutate(item)}
      />
      <ItemDialog
        open={!!editItem}
        title={'Edit ' + (editItem?.[barcodeKey] ?? 'row')}
        headers={headers}
        initial={editItem}
        busy={saveMutation.isPending}
        onClose={() => setEditItem(null)}
        onSubmit={(item) => saveMutation.mutate(item)}
      />

      <ConfirmDialog
        open={!!deleteFor}
        title="Delete inventory row"
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
        message={
          <>
            Delete <strong>{deleteFor?.[barcodeKey] ?? ''}</strong> from the inventory? This cannot be undone.
          </>
        }
        onCancel={() => setDeleteFor(null)}
        onConfirm={() => {
          if (deleteFor) deleteMutation.mutate(deleteFor[barcodeKey] ?? '');
        }}
      />

      <Modal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export inventory CSV"
        size="lg"
        footer={
          <>
            <Button onClick={() => setExportOpen(false)} disabled={exportMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={<Download size={14} />}
              loading={exportMutation.isPending}
              disabled={!exportCols.length}
              onClick={() => exportMutation.mutate(exportCols)}
            >
              Export CSV
            </Button>
          </>
        }
      >
        <div className="spread" style={{ marginBottom: 10 }}>
          <span className="hint">Choose the columns to include.</span>
          <div className="row" style={{ gap: 8 }}>
            <Button size="sm" onClick={() => setExportCols(headers)}>
              All
            </Button>
            <Button size="sm" onClick={() => setExportCols([])}>
              None
            </Button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
          {headers.map((h) => (
            <label key={h} className="checkbox">
              <input
                type="checkbox"
                checked={exportCols.includes(h)}
                onChange={() =>
                  setExportCols((prev) => (prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]))
                }
              />
              {labelOf(h)}
            </label>
          ))}
        </div>
      </Modal>
    </div>
  );
}
