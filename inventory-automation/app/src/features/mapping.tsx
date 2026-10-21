/* Field Mapping: map raw source columns to standard target fields (full-table editor). */
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/query';
import { hasRole, TARGET_FIELDS } from '../lib/utils';
import { Button, Card, Input, PageHeader } from '../ui/base';
import { useToast } from '../ui/overlay';
import { useAuth } from './auth';

interface MapRow {
  source: string;
  sourceColumn: string;
  target: string;
  required: boolean;
  active: boolean;
  order: string;
}

function rowToMap(r: Record<string, unknown>): MapRow {
  return {
    source: String(r['Source'] ?? ''),
    sourceColumn: String(r['Source Column'] ?? ''),
    target: String(r['Target Field'] ?? ''),
    required: String(r['Required'] ?? 'NO') === 'YES',
    active: String(r['Active'] ?? 'ON') === 'ON',
    order: String(r['Output Order'] ?? ''),
  };
}

export function MappingPage() {
  const toast = useToast();
  const { session } = useAuth();
  const canAdmin = hasRole(session?.role, 'ADMIN');

  const list = useQuery({ queryKey: ['mapping', 'all'], queryFn: () => api.mappingList(true) });
  const rawHeaders = useQuery({ queryKey: ['rawHeaders'], queryFn: () => api.mappingHeaders() });

  const [local, setLocal] = useState<MapRow[] | null>(null);
  const base = useMemo(() => (list.data ?? []).map(rowToMap), [list.data]);
  const rows = local ?? base;

  const update = (i: number, patch: Partial<MapRow>) =>
    setLocal(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const save = useMutation({
    mutationFn: () =>
      api.mappingSave(
        rows.map((r) => ({
          source: r.source,
          sourceColumn: r.sourceColumn,
          target: r.target,
          required: r.required ? 'YES' : 'NO',
          active: r.active ? 'ON' : 'OFF',
          order: Number(r.order) || 99,
        })),
      ),
    onSuccess: (res) => {
      toast.ok(`Saved ${res.saved} mapping row(s).`);
      setLocal(null);
      void list.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const headers = rawHeaders.data?.headers ?? [];

  return (
    <div className="stack">
      <PageHeader
        title="Field Mapping"
        subtitle="Map raw source columns to the standardized system fields used across the pipeline."
        actions={
          <>
            <Button icon={<RefreshCw size={14} />} loading={list.isFetching} onClick={() => void list.refetch()}>
              Refresh
            </Button>
            <Button
              icon={<Plus size={14} />}
              disabled={!canAdmin}
              onClick={() =>
                setLocal([
                  ...rows,
                  { source: '', sourceColumn: '', target: '', required: false, active: true, order: '99' },
                ])
              }
            >
              Add row
            </Button>
            <Button
              variant="primary"
              icon={<Save size={14} />}
              loading={save.isPending}
              disabled={!canAdmin}
              onClick={() => save.mutate()}
            >
              Save mapping
            </Button>
          </>
        }
      />

      <Card
        title="Mapping table"
        actions={<span className="hint">Saving replaces the entire table · “Source” is the source type (e.g. QC_STOCK)</span>}
        noBody
      >
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 130 }}>Source</th>
                <th>Source column</th>
                <th>Target field</th>
                <th style={{ width: 80 }}>Required</th>
                <th style={{ width: 70 }}>Active</th>
                <th style={{ width: 80 }}>Order</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    <Input value={r.source} placeholder="e.g. QC Stock" disabled={!canAdmin} onChange={(e) => update(i, { source: e.target.value })} />
                  </td>
                  <td>
                    <Input
                      list="rawheaders"
                      placeholder="e.g. Barcode"
                      value={r.sourceColumn}
                      disabled={!canAdmin}
                      onChange={(e) => update(i, { sourceColumn: e.target.value })}
                    />
                  </td>
                  <td>
                    <Input
                      list="targetfields"
                      placeholder="e.g. BARCODE"
                      value={r.target}
                      disabled={!canAdmin}
                      onChange={(e) => update(i, { target: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={r.required}
                      disabled={!canAdmin}
                      onChange={(e) => update(i, { required: e.target.checked })}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={r.active}
                      disabled={!canAdmin}
                      onChange={(e) => update(i, { active: e.target.checked })}
                    />
                  </td>
                  <td>
                    <Input
                      type="number"
                      placeholder="1"
                      value={r.order}
                      disabled={!canAdmin}
                      onChange={(e) => update(i, { order: e.target.value })}
                    />
                  </td>
                  <td>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove row"
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
        <datalist id="rawheaders">
          {headers.map((h) => (
            <option key={h} value={h} />
          ))}
        </datalist>
        <datalist id="targetfields">
          {TARGET_FIELDS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        {headers.length > 0 && (
          <div className="hint" style={{ padding: '8px 12px' }}>
            Raw data headers found: {headers.slice(0, 24).join(', ')}
            {headers.length > 24 ? ` … (+${headers.length - 24} more)` : ''}
          </div>
        )}
      </Card>
    </div>
  );
}
