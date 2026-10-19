import { translate } from '../lib/i18n';
/* Scheduled reports: recurring PDF/XLSX inventory reports delivered by email. */
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Clock, Pencil, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api, type ScheduleFormat, type ScheduleFrequency, type ScheduledReport } from '../lib/api';
import { errorMessage, queryClient } from '../lib/query';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select } from '../ui/base';
import { DataTable, type Column } from '../ui/table';
import { ConfirmDialog, Modal, useToast } from '../ui/overlay';
import { fmtDateTime, hasRole } from '../lib/utils';
import { useAuth } from './auth';

const GROUPS = ['status', 'brand', 'age_bucket', 'status_bucket', 'location', 'bin_bucket', 'model'];

interface FormState {
  id: number | null;
  name: string;
  groupBy: string;
  frequency: ScheduleFrequency;
  format: ScheduleFormat;
  recipients: string;
  statusFilter: string;
  brandFilter: string;
  locationFilter: string;
  active: boolean;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  groupBy: 'status',
  frequency: 'WEEKLY',
  format: 'PDF',
  recipients: '',
  statusFilter: '',
  brandFilter: '',
  locationFilter: '',
  active: true,
};

function groupLabel(value: string): string {
  return value.replace(/_/g, ' ');
}

export function ScheduledPage() {
  const toast = useToast();
  const { session } = useAuth();
  const canAdmin = hasRole(session?.role, 'ADMIN');
  const canManage = hasRole(session?.role, 'MANAGER');

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteFor, setDeleteFor] = useState<ScheduledReport | null>(null);
  const [runFor, setRunFor] = useState<ScheduledReport | null>(null);

  const list = useQuery({ queryKey: ['scheduledReports'], queryFn: () => api.scheduledList() });

  const save = useMutation({
    mutationFn: () =>
      api.scheduledSave({
        ...(form.id ? { id: form.id } : {}),
        name: form.name.trim(),
        groupBy: form.groupBy,
        frequency: form.frequency,
        format: form.format,
        recipients: form.recipients.trim(),
        active: form.active,
        filters: {
          ...(form.statusFilter.trim() ? { status: form.statusFilter.trim() } : {}),
          ...(form.brandFilter.trim() ? { brand: form.brandFilter.trim() } : {}),
          ...(form.locationFilter.trim() ? { location: form.locationFilter.trim() } : {}),
        },
      }),
    onSuccess: () => {
      toast.ok('Schedule saved.');
      setFormOpen(false);
      setForm(EMPTY_FORM);
      void list.refetch();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.scheduledDelete(id),
    onSuccess: () => {
      toast.ok('Schedule deleted.');
      setDeleteFor(null);
      void list.refetch();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const run = useMutation({
    mutationFn: (id: number) => api.scheduledRun(id),
    onSuccess: (result) => {
      toast.ok(`Report sent to ${result.sentTo} (${Math.round(result.bytes / 1024)} KB).`);
      setRunFor(null);
      void list.refetch();
      void queryClient.invalidateQueries({ queryKey: ['scheduledReports'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const openNew = () => {
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (row: ScheduledReport) => {
    setForm({
      id: row.id,
      name: row.name,
      groupBy: row.groupBy,
      frequency: row.frequency,
      format: row.format,
      recipients: row.recipients,
      statusFilter: row.filters.status ?? '',
      brandFilter: row.filters.brand ?? '',
      locationFilter: row.filters.location ?? '',
      active: row.active,
    });
    setFormOpen(true);
  };

  const rows = list.data ?? [];

  const columns: Column<ScheduledReport>[] = [
    { key: 'name', label: 'Name', render: (row) => <strong>{row.name}</strong> },
    { key: 'group', label: 'Group by', render: (row) => groupLabel(row.groupBy) },
    { key: 'freq', label: 'Frequency', render: (row) => <Badge tone="info">{row.frequency}</Badge> },
    { key: 'format', label: 'Format', render: (row) => row.format },
    { key: 'to', label: 'Recipients', render: (row) => <span className="cell-clip">{row.recipients}</span> },
    {
      key: 'last',
      label: 'Last run',
      render: (row) => (row.lastRunAt ? fmtDateTime(row.lastRunAt) || row.lastRunAt : 'Never'),
    },
    {
      key: 'active',
      label: 'Status',
      render: (row) => <Badge tone={row.active ? 'ok' : 'neutral'}>{row.active ? 'Active' : 'Paused'}</Badge>,
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (row) => (
        <span className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
          <Button
            size="sm"
            variant="ghost"
            icon={<Play size={13} />}
            disabled={!canAdmin}
            onClick={() => setRunFor(row)}
          >
            Run
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Edit schedule"
            disabled={!canAdmin}
            onClick={() => openEdit(row)}
          >
            <Pencil size={14} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Delete schedule"
            disabled={!canAdmin}
            onClick={() => setDeleteFor(row)}
          >
            <Trash2 size={14} />
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div className="stack">
      <PageHeader
        title={translate('Scheduled reports')}
        subtitle="Recurring inventory reports emailed as PDF or Excel."
        actions={
          <>
            <Button icon={<RefreshCw size={14} />} loading={list.isFetching} onClick={() => void list.refetch()}>
              Refresh
            </Button>
            <Button variant="primary" icon={<Plus size={14} />} disabled={!canAdmin} onClick={openNew}>
              New schedule
            </Button>
          </>
        }
      />

      {list.isError && (
        <Card>
          <span className="hint">{errorMessage(list.error)}</span>
        </Card>
      )}

      <Card
        title={
          <span className="row" style={{ gap: 8 }}>
            <Clock size={16} /> Schedules
          </span>
        }
        noBody
      >
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => String(row.id)}
          loading={list.isLoading}
          empty={
            <EmptyState
              icon={<Clock size={20} />}
              title="No scheduled reports"
              hint={canAdmin ? 'Create a schedule to email reports automatically.' : 'Ask an admin to create one.'}
            />
          }
        />
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={form.id ? 'Edit schedule' : 'New scheduled report'}
        size="lg"
        footer={
          <>
            <Button onClick={() => setFormOpen(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={save.isPending}
              disabled={!form.name.trim() || !form.recipients.trim()}
              onClick={() => save.mutate()}
            >
              Save schedule
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Name" span2>
            <Input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Weekly status report"
            />
          </Field>
          <Field label="Group by">
            <Select
              value={form.groupBy}
              onChange={(event) => setForm((prev) => ({ ...prev, groupBy: event.target.value }))}
            >
              {GROUPS.map((group) => (
                <option key={group} value={group}>
                  {groupLabel(group)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Frequency">
            <Select
              value={form.frequency}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, frequency: event.target.value as ScheduleFrequency }))
              }
            >
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </Select>
          </Field>
          <Field label="Format">
            <Select
              value={form.format}
              onChange={(event) => setForm((prev) => ({ ...prev, format: event.target.value as ScheduleFormat }))}
            >
              <option value="PDF">PDF</option>
              <option value="XLSX">Excel (XLSX)</option>
            </Select>
          </Field>
          <Field label="Recipients" hint="Comma-separated email addresses.">
            <Input
              value={form.recipients}
              onChange={(event) => setForm((prev) => ({ ...prev, recipients: event.target.value }))}
              placeholder="ops@example.com, manager@example.com"
            />
          </Field>
          <Field label="Status filter" hint="Optional exact match.">
            <Input
              value={form.statusFilter}
              onChange={(event) => setForm((prev) => ({ ...prev, statusFilter: event.target.value }))}
              placeholder="READY"
            />
          </Field>
          <Field label="Brand filter" hint="Optional exact match.">
            <Input
              value={form.brandFilter}
              onChange={(event) => setForm((prev) => ({ ...prev, brandFilter: event.target.value }))}
              placeholder="Apple"
            />
          </Field>
          <Field label="Location filter" hint="Optional exact match.">
            <Input
              value={form.locationFilter}
              onChange={(event) => setForm((prev) => ({ ...prev, locationFilter: event.target.value }))}
              placeholder="A1"
            />
          </Field>
          <label className="checkbox span2">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
            />
            Active (the server sends it automatically when due)
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!runFor}
        title="Send report now"
        confirmLabel="Send"
        tone="primary"
        loading={run.isPending}
        message={
          <>
            Generate <strong>{runFor?.name ?? ''}</strong> and email it to <strong>{runFor?.recipients ?? ''}</strong> now?
          </>
        }
        onCancel={() => setRunFor(null)}
        onConfirm={() => {
          if (runFor) run.mutate(runFor.id);
        }}
      />

      <ConfirmDialog
        open={!!deleteFor}
        title="Delete schedule"
        confirmLabel="Delete"
        tone="danger"
        loading={remove.isPending}
        message={
          <>
            Delete <strong>{deleteFor?.name ?? ''}</strong>? No further reports will be sent.
          </>
        }
        onCancel={() => setDeleteFor(null)}
        onConfirm={() => {
          if (deleteFor) remove.mutate(deleteFor.id);
        }}
      />
      {!canManage && <span className="hint">Manager role required to view schedules.</span>}
    </div>
  );
}
