/* Settings: system settings (Telegram, backup), ops tests, selftest, connection. */
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Archive, CheckCircle2, Mail, RefreshCw, Save, Send, Wrench, XCircle } from 'lucide-react';
import { api, getApiMode, getApiUrl, getSheetUrl, setApiUrl, setDemoMode, setSheetUrl } from '../lib/api';
import { errorMessage } from '../lib/query';
import { hasRole } from '../lib/utils';
import { Badge, Button, Card, Field, Input, PageHeader, Switch } from '../ui/base';
import { useToast } from '../ui/overlay';
import { useAuth } from './auth';

const KNOWN_FIELDS: { key: string; label: string; type: 'text' | 'password' | 'switch'; hint?: string }[] = [
  { key: 'TELEGRAM_BOT_TOKEN', label: 'Telegram bot token', type: 'password', hint: 'From @BotFather' },
  { key: 'TELEGRAM_CHAT_ID', label: 'Telegram chat ID', type: 'text', hint: 'Where alerts are sent' },
  { key: 'AUTO_BACKUP', label: 'Auto backup (with daily process)', type: 'switch' },
  { key: 'BACKUP_FOLDER_ID', label: 'Backup folder ID (Drive)', type: 'text', hint: 'Optional Ã¢â‚¬â€ Drive folder for backups' },
  { key: 'SMTP_HOST', label: 'SMTP host', type: 'text', hint: 'e.g. smtp.gmail.com' },
  { key: 'SMTP_PORT', label: 'SMTP port', type: 'text', hint: '587 for TLS' },
  { key: 'SMTP_USER', label: 'SMTP user', type: 'text' },
  { key: 'SMTP_PASS', label: 'SMTP password', type: 'password' },
  { key: 'SMTP_FROM', label: 'From address', type: 'text' },
  { key: 'ALERT_EMAIL_TO', label: 'Alert email recipients', type: 'text', hint: 'Comma separated' },
  { key: 'WHATSAPP_TOKEN', label: 'WhatsApp Cloud API token', type: 'password' },
  { key: 'WHATSAPP_PHONE_ID', label: 'WhatsApp phone number id', type: 'text' },
  { key: 'ALERT_WHATSAPP_TO', label: 'Alert WhatsApp number', type: 'text', hint: 'With country code, e.g. 9198…' },
  { key: 'GOOGLE_CLIENT_ID', label: 'Google OAuth client ID', type: 'text', hint: 'For Sign in with Google' },
  { key: 'GOOGLE_AUTO_CREATE', label: 'Auto-create Google users (VIEWER)', type: 'switch' }
];

export function SettingsPage() {
  const toast = useToast();
  const { session } = useAuth();
  const canAdmin = hasRole(session?.role, 'ADMIN');

  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.settingsGet() });
  const [local, setLocal] = useState<Record<string, string> | null>(null);

  const base = useMemo(() => {
    const o: Record<string, string> = {};
    const d = settings.data ?? {};
    Object.keys(d).forEach((k) => {
      o[k] = String(d[k] ?? '');
    });
    return o;
  }, [settings.data]);

  const values = local ?? base;
  const set = (k: string, v: string) => setLocal({ ...values, [k]: v });
  const extraKeys = Object.keys(base).filter((k) => !KNOWN_FIELDS.some((f) => f.key === k));

  const save = useMutation({
    mutationFn: () => api.settingsSave(values),
    onSuccess: () => {
      toast.ok('Settings saved.');
      setLocal(null);
      void settings.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const tgTest = useMutation({
    mutationFn: () => api.telegramTest(),
    onSuccess: (res) => {
      if (res.ok) toast.ok('Telegram test message sent Ã¢â‚¬â€ check the chat.');
      else toast.error('Telegram send failed Ã¢â‚¬â€ verify bot token and chat ID.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const emailTest = useMutation({
    mutationFn: () => api.emailTest(),
    onSuccess: (res) => toast.ok(`Test email sent to ${res.sentTo}.`),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const backup = useMutation({
    mutationFn: () => api.backupRun(),
    onSuccess: (res) => {
      if (res['skipped']) toast.info('Auto backup is OFF Ã¢â‚¬â€ enable AUTO_BACKUP first.');
      else if (res['error']) toast.error(String(res['error']));
      else toast.ok(`Backup created: ${String(res['name'] ?? res['backupId'] ?? '')}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const selftest = useMutation({
    mutationFn: () => api.selftest(),
    onSuccess: (res) => {
      if (res.ok) toast.ok('Self-test passed.');
      else toast.warn('Self-test finished with failures Ã¢â‚¬â€ see details below.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const mode = getApiMode();
  const [url, setUrl] = useState(getApiUrl());
  const [sheet, setSheet] = useState(getSheetUrl());

  return (
    <div className="stack">
      <PageHeader
        title="Settings"
        subtitle="System configuration, notification tests and deployment health."
        actions={
          <>
            <Button icon={<RefreshCw size={14} />} loading={settings.isFetching} onClick={() => void settings.refetch()}>
              Refresh
            </Button>
            <Button
              variant="primary"
              icon={<Save size={14} />}
              loading={save.isPending}
              disabled={!canAdmin}
              onClick={() => save.mutate()}
            >
              Save settings
            </Button>
          </>
        }
      />

      <Card title="System settings" actions={!canAdmin ? <span className="hint">Admin only Ã¢â‚¬â€ read-only for your role</span> : undefined}>
        <div className="form-grid">
          {KNOWN_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint}>
              {f.type === 'switch' ? (
                <div style={{ paddingTop: 6 }}>
                  <Switch
                    label={values[f.key] === 'ON' ? 'ON' : 'OFF'}
                    checked={values[f.key] === 'ON'}
                    disabled={!canAdmin}
                    onChange={(v) => set(f.key, v ? 'ON' : 'OFF')}
                  />
                </div>
              ) : (
                <Input
                  type={f.type === 'password' ? 'password' : 'text'}
                  value={values[f.key] ?? ''}
                  disabled={!canAdmin}
                  onChange={(e) => set(f.key, e.target.value)}
                  autoComplete="off"
                />
              )}
            </Field>
          ))}
          {extraKeys.map((k) => (
            <Field key={k} label={k}>
              <Input value={values[k] ?? ''} disabled={!canAdmin} onChange={(e) => set(k, e.target.value)} />
            </Field>
          ))}
        </div>
      </Card>

      <div className="grid-2">
        <Card title="Notification tests">
          <div className="row" style={{ gap: 9, flexWrap: 'wrap' }}>
            <Button icon={<Send size={14} />} loading={tgTest.isPending} disabled={!canAdmin} onClick={() => tgTest.mutate()}>
              Test Telegram
            </Button>
            <Button icon={<Mail size={14} />} loading={emailTest.isPending} disabled={!canAdmin} onClick={() => emailTest.mutate()}>
              Test email
            </Button>
            <Button icon={<Archive size={14} />} loading={backup.isPending} disabled={!canAdmin} onClick={() => backup.mutate()}>
              Backup now
            </Button>
          </div>
          <p className="hint" style={{ marginBottom: 0 }}>
            Telegram alerts fire from the daily process and alert checks; email goes to the configured recipients.
          </p>
        </Card>

        <Card title="Connection">
          <div className="stack" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 8 }}>
              <Badge tone={mode === 'gas' ? 'ok' : mode === 'demo' ? 'warn' : 'info'}>
                {mode === 'gas' ? 'Google Apps Script' : mode === 'demo' ? 'Demo mode' : 'HTTP (external URL)'}
              </Badge>
              {mode === 'demo' && (
                <Button
                  size="sm"
                  onClick={() => {
                    setDemoMode(false);
                    window.location.reload();
                  }}
                >
                  Exit demo mode
                </Button>
              )}
            </div>
            <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
              <Field label="Google Sheet link (optional)">
                <Input value={sheet} onChange={(e) => setSheet(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." />
              </Field>
              <Button onClick={() => setSheetUrl(sheet)} disabled={!sheet.trim().startsWith('http')}>
                Save sheet
              </Button>
              {sheet.trim().startsWith('http') && (
                <Button onClick={() => window.open(sheet.trim(), '_blank', 'noopener')}>Open sheet</Button>
              )}
            </div>            {mode === 'http' && (
              <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
                <Field label="Backend /exec URL">
                  <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/Ã¢â‚¬Â¦/exec" />
                </Field>
                <Button onClick={() => setApiUrl(url)} disabled={!url.trim().startsWith('http')}>
                  Save URL
                </Button>
              </div>
            )}
            <span className="hint">
              {mode === 'gas'
                ? 'Served directly by Apps Script Ã¢â‚¬â€ no URL needed.'
                : mode === 'demo'
                  ? 'Sample data only Ã¢â‚¬â€ no backend calls.'
                  : 'Paste the deployed web-app URL ending with /exec.'}
            </span>
          </div>
        </Card>
      </div>

      <Card
        title={
          <span className="row" style={{ gap: 8 }}>
            <Wrench size={16} /> Deployment self-test
          </span>
        }
        actions={
          <Button size="sm" loading={selftest.isPending} disabled={!canAdmin} onClick={() => selftest.mutate()}>
            Run self-test
          </Button>
        }
      >
        {selftest.data ? (
          <div className="stack" style={{ gap: 8 }}>
            {selftest.data.checks.map((c) => (
              <div key={c.name} className="row" style={{ gap: 9 }}>
                {c.ok ? (
                  <span style={{ color: 'var(--ok)' }}>
                    <CheckCircle2 size={16} />
                  </span>
                ) : (
                  <span style={{ color: 'var(--danger)' }}>
                    <XCircle size={16} />
                  </span>
                )}
                <span style={{ minWidth: 220 }}>{c.name}</span>
                <span className="muted grow">{c.detail}</span>
              </div>
            ))}
            {selftest.data.authVersion && <span className="hint">Auth module: {selftest.data.authVersion}</span>}
          </div>
        ) : (
          <p className="hint" style={{ margin: 0 }}>
            Runs a series of backend checks (sheets, credentials, sessions, settings, inventory). ADMIN only.
          </p>
        )}
      </Card>
    </div>
  );
}
