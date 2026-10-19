import { translate } from '../lib/i18n';
/* Sessions & login audit: active sessions, revoke access, recent auth events. */
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { LogIn, RefreshCw, ShieldOff } from 'lucide-react';
import { api, type LoginEvent, type SessionRecord } from '../lib/api';
import { errorMessage, queryClient } from '../lib/query';
import { Badge, Button, Card, EmptyState, PageHeader } from '../ui/base';
import { DataTable, type Column } from '../ui/table';
import { ConfirmDialog, useToast } from '../ui/overlay';
import { fmtDateTime } from '../lib/utils';

type RevokeTarget = { kind: 'session'; session: SessionRecord } | { kind: 'user'; email: string };

function eventTone(event: string): 'ok' | 'danger' | 'warn' | 'neutral' {
  if (event === 'LOGIN_OK') return 'ok';
  if (event === 'LOGIN_FAILED') return 'danger';
  if (event.startsWith('LOGIN_')) return 'warn';
  return 'neutral';
}

function eventLabel(event: string): string {
  return event
    .replace(/^LOGIN_/, 'Login ')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (character) => character.toUpperCase());
}

export function SessionsPage() {
  const toast = useToast();
  const [target, setTarget] = useState<RevokeTarget | null>(null);

  const sessions = useQuery({ queryKey: ['authSessions'], queryFn: () => api.authSessions() });
  const history = useQuery({ queryKey: ['loginHistory'], queryFn: () => api.loginHistory(100) });

  const revoke = useMutation({
    mutationFn: async (next: RevokeTarget) => {
      if (next.kind === 'session') {
        const result = await api.revokeSession(next.session.id);
        return result.revoked ? 1 : 0;
      }
      const result = await api.revokeUserSessions(next.email);
      return result.revoked;
    },
    onSuccess: (_result, next) => {
      toast.ok(next.kind === 'session' ? 'Session signed out.' : `All sessions signed out for ${next.email}.`);
      setTarget(null);
      void sessions.refetch();
      void queryClient.invalidateQueries({ queryKey: ['loginHistory'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const rows = sessions.data?.sessions ?? [];
  const events = history.data?.entries ?? [];

  const sessionCols: Column<SessionRecord>[] = [
    { key: 'email', label: 'User', render: (row) => <span className="mono">{row.email}</span> },
    { key: 'role', label: 'Role', render: (row) => <Badge tone="info">{row.role}</Badge> },
    { key: 'created', label: 'Signed in', render: (row) => fmtDateTime(row.createdAt) || row.createdAt },
    {
      key: 'seen',
      label: 'Last seen',
      render: (row) => (row.lastSeenAt ? fmtDateTime(row.lastSeenAt) || row.lastSeenAt : '—'),
    },
    { key: 'expires', label: 'Expires', render: (row) => fmtDateTime(row.expiresAt) || row.expiresAt },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (row) => (
        <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
          <Button
            size="sm"
            variant="ghost"
            icon={<ShieldOff size={13} />}
            onClick={() => setTarget({ kind: 'session', session: row })}
          >
            Sign out
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setTarget({ kind: 'user', email: row.email })}>
            All
          </Button>
        </span>
      ),
    },
  ];

  const eventCols: Column<LoginEvent>[] = [
    { key: 'at', label: 'When', render: (row) => fmtDateTime(row.at) || row.at },
    { key: 'email', label: 'User', render: (row) => <span className="mono">{row.email || '—'}</span> },
    {
      key: 'event',
      label: 'Event',
      render: (row) => <Badge tone={eventTone(row.event)}>{eventLabel(row.event)}</Badge>,
    },
    { key: 'ip', label: 'IP', render: (row) => <span className="mono">{row.ip || '—'}</span> },
  ];

  return (
    <div className="stack">
      <PageHeader
        title={translate('Sessions & Audit')}
        subtitle={
          sessions.data
            ? `${rows.length} active session${rows.length === 1 ? '' : 's'} · last 100 auth events`
            : 'Active sessions and recent authentication events.'
        }
        actions={
          <Button
            icon={<RefreshCw size={14} />}
            loading={sessions.isFetching || history.isFetching}
            onClick={() => {
              void sessions.refetch();
              void history.refetch();
            }}
          >
            Refresh
          </Button>
        }
      />

      <Card
        title={
          <span className="row" style={{ gap: 8 }}>
            <LogIn size={16} /> Active sessions
          </span>
        }
        noBody
      >
        {sessions.isError ? (
          <div style={{ padding: 14 }}>
            <Button onClick={() => void sessions.refetch()}>Retry</Button>
          </div>
        ) : (
          <DataTable
            columns={sessionCols}
            rows={rows}
            rowKey={(row) => String(row.id)}
            loading={sessions.isLoading}
            empty={<EmptyState title="No active sessions" hint="Sessions appear here when users sign in." />}
          />
        )}
      </Card>

      <Card title="Login history" noBody>
        <DataTable
          columns={eventCols}
          rows={events}
          rowKey={(row, index) => `${row.at}-${index}`}
          loading={history.isLoading}
          empty={<EmptyState title="No auth events yet" hint="Successful and failed sign-ins are recorded here." />}
        />
      </Card>

      <ConfirmDialog
        open={!!target}
        title={target?.kind === 'user' ? 'Sign out all sessions' : 'Sign out session'}
        confirmLabel="Sign out"
        tone="danger"
        loading={revoke.isPending}
        message={
          target?.kind === 'user' ? (
            <>
              Revoke every active session for <strong>{target.email}</strong>? They will have to sign in again.
            </>
          ) : (
            <>
              Revoke this session for <strong>{target?.session.email ?? ''}</strong>? They will have to sign in again.
            </>
          )
        }
        onCancel={() => setTarget(null)}
        onConfirm={() => {
          if (target) revoke.mutate(target);
        }}
      />
    </div>
  );
}
