/* Rules: age / status / location bucket rules (append-only through the API). */
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/query';
import { hasRole } from '../lib/utils';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Switch, Tabs } from '../ui/base';
import { DataTable, type Column } from '../ui/table';
import { Modal, useToast } from '../ui/overlay';
import { useAuth } from './auth';

interface RuleField {
  key: string;
  label: string;
  type?: 'text' | 'number';
  placeholder?: string;
}

function RulesTab({
  title,
  hint,
  queryKey,
  listFn,
  saveFn,
  fields,
}: {
  title: string;
  hint: string;
  queryKey: string[];
  listFn: () => Promise<Record<string, unknown>[]>;
  saveFn: (payload: Record<string, unknown>) => Promise<unknown>;
  fields: RuleField[];
}) {
  const toast = useToast();
  const { session } = useAuth();
  const canAdmin = hasRole(session?.role, 'ADMIN');

  const list = useQuery({ queryKey, queryFn: listFn });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [active, setActive] = useState(true);

  const rows = list.data ?? [];
  const columns: Column<Record<string, unknown>>[] = (() => {
    const keys = rows.length ? Object.keys(rows[0]) : fields.map((f) => f.key);
    return keys.map((k) => ({
      key: k,
      label: k,
      render: (r: Record<string, unknown>) => {
        const v = String(r[k] ?? '');
        if (k === 'Active') return <Badge tone={v === 'ON' ? 'ok' : 'neutral'}>{v || '—'}</Badge>;
        return (
          <span className="cell-clip" title={v}>
            {v || '—'}
          </span>
        );
      },
    }));
  })();

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {};
      fields.forEach((f) => {
        const v = (form[f.key] ?? '').trim();
        if (v !== '') payload[f.key] = f.type === 'number' ? Number(v) : v;
      });
      payload.active = active ? 'ON' : 'OFF';
      return saveFn(payload);
    },
    onSuccess: () => {
      toast.ok('Rule added.');
      setOpen(false);
      setForm({});
      setActive(true);
      void list.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="stack">
      <Card
        title={title}
        actions={
          <div className="row" style={{ gap: 10 }}>
            <span className="hint">{hint}</span>
            <Button size="sm" icon={<Plus size={14} />} disabled={!canAdmin} onClick={() => setOpen(true)}>
              Add rule
            </Button>
          </div>
        }
        noBody
      >
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(_r, i) => 'rl-' + i}
          loading={list.isFetching}
          empty={<EmptyState title="No rules yet" hint={hint} />}
        />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={'Add rule — ' + title}
        footer={
          <>
            <Button onClick={() => setOpen(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button variant="primary" loading={save.isPending} disabled={!canAdmin} onClick={() => save.mutate()}>
              Add rule
            </Button>
          </>
        }
      >
        {fields.map((f) => (
          <Field key={f.key} label={f.label}>
            <Input
              type={f.type === 'number' ? 'number' : 'text'}
              value={form[f.key] ?? ''}
              placeholder={f.placeholder}
              onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
            />
          </Field>
        ))}
        <Switch label="Active" checked={active} onChange={setActive} />
      </Modal>
    </div>
  );
}

export function RulesPage() {
  const [tab, setTab] = useState('age');
  return (
    <div className="stack">
      <PageHeader
        title="Rules"
        subtitle="Business rules powering buckets, priorities and reports. Changes apply on the next process run."
      />
      <Tabs
        tabs={[
          { key: 'age', label: 'Age buckets' },
          { key: 'status', label: 'Status buckets' },
          { key: 'location', label: 'Location rules' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'age' && (
        <RulesTab
          title="Age bucket rules"
          hint="Age (days) → bucket → priority"
          queryKey={['rulesAge']}
          listFn={() => api.ageRules()}
          saveFn={(p) => api.ageRuleSave(p)}
          fields={[
            { key: 'min', label: 'Min age', type: 'number' },
            { key: 'max', label: 'Max age', type: 'number' },
            { key: 'bucket', label: 'Bucket name', placeholder: 'e.g. Below 30' },
            { key: 'priority', label: 'Priority', placeholder: 'P2' },
          ]}
        />
      )}
      {tab === 'status' && (
        <RulesTab
          title="Status bucket rules"
          hint="Raw status → standard bucket + marking"
          queryKey={['rulesStatus']}
          listFn={() => api.statusRules()}
          saveFn={(p) => api.statusRuleSave(p)}
          fields={[
            { key: 'raw', label: 'Raw status', placeholder: 'e.g. L4' },
            { key: 'bucket', label: 'Bucket', placeholder: 'e.g. L4' },
            { key: 'marking', label: 'Marking', placeholder: 'e.g. Marked L4' },
          ]}
        />
      )}
      {tab === 'location' && (
        <RulesTab
          title="Location rules"
          hint="Location pattern → bin bucket (+ optional condition)"
          queryKey={['rulesLocation']}
          listFn={() => api.locationRules()}
          saveFn={(p) => api.locationRuleSave(p)}
          fields={[
            { key: 'pattern', label: 'Location pattern', placeholder: 'e.g. SW01-SW10' },
            { key: 'bucket', label: 'Bin bucket', placeholder: 'e.g. BIN-01' },
            { key: 'condition', label: 'Condition (optional)', placeholder: 'STATUS_BUCKET=Bin Storage' },
          ]}
        />
      )}
    </div>
  );
}
