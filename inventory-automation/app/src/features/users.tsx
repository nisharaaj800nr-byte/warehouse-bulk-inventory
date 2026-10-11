/* Users & Security: app logins (roles, passwords, lockouts) + sheet protections. */
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { KeyRound, Lock, Pencil, Plus, RefreshCw, Unlock } from 'lucide-react';
import { api, type Role } from '../lib/api';
import { errorMessage } from '../lib/query';
import { hasRole } from '../lib/utils';
import { Badge, Button, Card, EmptyState, ErrorPanel, Field, Input, PageHeader, Select, Switch, Tabs } from '../ui/base';
import { DataTable, type Column } from '../ui/table';
import { ConfirmDialog, Modal, useToast } from '../ui/overlay';
import { useAuth } from './auth';

const ROLES: Role[] = ['VIEWER', 'OPERATOR', 'MANAGER', 'ADMIN', 'OWNER'];

interface UserForm {
  email: string;
  role: Role;
  active: boolean;
  password: string;
  isNew: boolean;
}

function UsersTab() {
  const toast = useToast();
  const { session } = useAuth();
  const canAdmin = hasRole(session?.role, 'ADMIN');
  const list = useQuery({ queryKey: ['authUsers'], queryFn: () => api.authUsers() });
  const [edit, setEdit] = useState<UserForm | null>(null);
  const [pwFor, setPwFor] = useState<string | null>(null);
  const [pwValue, setPwValue] = useState('');
  const [pwErr, setPwErr] = useState('');

  const save = useMutation({
    mutationFn: (f: UserForm) =>
      api.userSave({
        email: f.email.trim(),
        role: f.role,
        active: f.active ? 'ON' : 'OFF',
        password: f.password ? f.password : undefined,
      }),
    onSuccess: (res) => {
      toast.ok(`User saved${res.passwordSet ? ' with password' : ''}.`);
      setEdit(null);
      void list.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const reset = useMutation({
    mutationFn: () => api.resetPassword(pwFor ?? '', pwValue),
    onSuccess: () => {
      toast.ok('Password reset. Existing sessions were revoked.');
      setPwFor(null);
      setPwValue('');
      setPwErr('');
      void list.refetch();
    },
    onError: (e) => setPwErr(errorMessage(e)),
  });

  const rows = list.data?.users ?? [];
  const columns: Column<(typeof rows)[number]>[] = [
    { key: 'email', label: 'Email', render: (u) => <strong>{u.email}</strong> },
    { key: 'role', label: 'Role', render: (u) => <Badge tone={u.role === 'OWNER' ? 'brand' : 'info'}>{u.role}</Badge> },
    {
      key: 'active',
      label: 'Active',
      render: (u) => <Badge tone={u.active === 'ON' ? 'ok' : 'neutral'}>{u.active}</Badge>,
    },
    {
      key: 'pw',
      label: 'Password',
      render: (u) => (
        <Badge tone={u.hasPassword ? 'ok' : 'warn'}>{u.hasPassword ? 'set' : 'not set'}</Badge>
      ),
    },
    { key: 'last', label: 'Last login', render: (u) => (u.lastLogin ? new Date(u.lastLogin).toLocaleString() : '—') },
    {
      key: 'locked',
      label: 'Locked until',
      render: (u) => (u.lockedUntil ? <Badge tone="danger">{new Date(u.lockedUntil).toLocaleString()}</Badge> : <span className="muted">—</span>),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (u) => (
        <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Edit user"
            disabled={!canAdmin}
            onClick={() => setEdit({ email: u.email, role: u.role, active: u.active === 'ON', password: '', isNew: false })}
          >
            <Pencil size={15} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Reset password"
            disabled={!canAdmin}
            onClick={() => {
              setPwFor(u.email);
              setPwValue('');
              setPwErr('');
            }}
          >
            <KeyRound size={15} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="stack">
      {list.isError && <ErrorPanel message={errorMessage(list.error)} onRetry={() => void list.refetch()} />}
      <Card
        title="Portal users"
        actions={
          <div className="row" style={{ gap: 9 }}>
            <Button size="sm" icon={<RefreshCw size={14} />} loading={list.isFetching} onClick={() => void list.refetch()}>
              Refresh
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<Plus size={14} />}
              disabled={!canAdmin}
              onClick={() => setEdit({ email: '', role: 'OPERATOR', active: true, password: '', isNew: true })}
            >
              Add user
            </Button>
          </div>
        }
        noBody
      >
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(u) => u.email}
          loading={list.isFetching}
          empty={<EmptyState title="No users" hint="Add your first portal user." />}
        />
      </Card>

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.isNew ? 'Add user' : 'Edit user — ' + (edit?.email ?? '')}
        footer={
          <>
            <Button onClick={() => setEdit(null)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={save.isPending}
              disabled={!canAdmin || !edit?.email.trim()}
              onClick={() => edit && save.mutate(edit)}
            >
              Save user
            </Button>
          </>
        }
      >
        {edit && (
          <>
            <Field label="Email">
              <Input
                type="email"
                value={edit.email}
                disabled={!edit.isNew}
                onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                placeholder="user@example.com"
              />
            </Field>
            <Field label="Role">
              <Select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as Role })}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={edit.isNew ? 'Initial password (optional)' : 'New password (optional)'}
              hint="6–100 characters. Leave blank to keep the current password."
            >
              <Input
                type="password"
                value={edit.password}
                onChange={(e) => setEdit({ ...edit, password: e.target.value })}
                autoComplete="new-password"
              />
            </Field>
            <Switch label="Active" checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} />
          </>
        )}
      </Modal>

      <Modal
        open={!!pwFor}
        onClose={() => setPwFor(null)}
        title={'Reset password — ' + (pwFor ?? '')}
        footer={
          <>
            <Button onClick={() => setPwFor(null)} disabled={reset.isPending}>
              Cancel
            </Button>
            <Button variant="primary" loading={reset.isPending} disabled={!canAdmin} onClick={() => reset.mutate()}>
              Reset password
            </Button>
          </>
        }
      >
        {pwErr && <div className="login-err">{pwErr}</div>}
        <Field label="New password" hint="All of this user's sessions will be signed out.">
          <Input type="password" value={pwValue} onChange={(e) => setPwValue(e.target.value)} autoComplete="new-password" />
        </Field>
      </Modal>
    </div>
  );
}

function SecurityTab() {
  const toast = useToast();
  const { session } = useAuth();
  const canAdmin = hasRole(session?.role, 'ADMIN');
  const list = useQuery({ queryKey: ['security'], queryFn: () => api.securityList() });
  const [confirm, setConfirm] = useState<{ sheet: string; action: 'lock' | 'unlock' } | null>(null);

  const lock = useMutation({
    mutationFn: (sheet: string) => api.securityLock(sheet),
    onSuccess: () => {
      toast.ok('Sheet relocked.');
      setConfirm(null);
      void list.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const unlock = useMutation({
    mutationFn: (sheet: string) => api.securityUnlock(sheet),
    onSuccess: () => {
      toast.ok('Sheet unlocked (protection removed).');
      setConfirm(null);
      void list.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const rows = list.data ?? [];
  const sheetKey = rows.length
    ? Object.keys(rows[0]).find((k) => /sheet/i.test(k)) ?? Object.keys(rows[0])[0]
    : 'Sheet';

  const columns: Column<Record<string, unknown>>[] = [
    ...(rows.length ? Object.keys(rows[0]) : [sheetKey, 'Access', 'Active']).map((k) => ({
      key: k,
      label: k,
      render: (r: Record<string, unknown>) => {
        const v = String(r[k] ?? '');
        if (/^locked$/i.test(k) || /access/i.test(k)) return <Badge tone={/locked/i.test(v) ? 'ok' : 'warn'}>{v || '—'}</Badge>;
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
      render: (r) => {
        const sheet = String(r[sheetKey] ?? '');
        return (
          <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
            <Button size="sm" icon={<Unlock size={13} />} disabled={!canAdmin} onClick={() => setConfirm({ sheet, action: 'unlock' })}>
              Unlock
            </Button>
            <Button size="sm" icon={<Lock size={13} />} disabled={!canAdmin} onClick={() => setConfirm({ sheet, action: 'lock' })}>
              Lock
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="stack">
      {list.isError && <ErrorPanel message={errorMessage(list.error)} onRetry={() => void list.refetch()} />}
      <Card
        title="Sheet protections"
        actions={<span className="hint">Unlock only for maintenance — relock afterwards</span>}
        noBody
      >
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(_r, i) => 'sec-' + i}
          loading={list.isFetching}
          empty={<EmptyState title="No security configuration" hint="Run setup to create the Sheet Security sheet." />}
        />
      </Card>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.action === 'unlock' ? 'Unlock sheet' : 'Relock sheet'}
        confirmLabel={confirm?.action === 'unlock' ? 'Unlock' : 'Relock'}
        tone={confirm?.action === 'unlock' ? 'danger' : 'primary'}
        loading={lock.isPending || unlock.isPending}
        message={
          confirm?.action === 'unlock' ? (
            <>
              Remove protection from <strong>{confirm?.sheet}</strong>? Anyone with edit access could change its
              contents. Relock when done.
            </>
          ) : (
            <>
              Re-apply the configured protection to <strong>{confirm?.sheet}</strong>?
            </>
          )
        }
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.action === 'unlock') unlock.mutate(confirm.sheet);
          else lock.mutate(confirm.sheet);
        }}
      />
    </div>
  );
}

export function UsersPage() {
  const [tab, setTab] = useState('users');
  return (
    <div className="stack">
      <PageHeader title="Users & Security" subtitle="Portal logins, roles and sheet protections (admin only)." />
      <Tabs
        tabs={[
          { key: 'users', label: 'Users' },
          { key: 'security', label: 'Sheet security' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'users' && <UsersTab />}
      {tab === 'security' && <SecurityTab />}
    </div>
  );
}
