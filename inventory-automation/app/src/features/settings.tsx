import { translate } from '../lib/i18n';
/* Settings: system settings (Telegram, backup), ops tests, selftest, connection. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Archive, CheckCircle2, Mail, RefreshCw, Save, ScanLine, Send, Usb, Wrench, XCircle } from 'lucide-react';
import { api, getApiMode, getApiUrl, getSheetUrl, setApiUrl, setDemoMode, setSheetUrl } from '../lib/api';
import { errorMessage } from '../lib/query';
import { hasRole } from '../lib/utils';
import {
  connectSerialScanner,
  disconnectSerialScanner,
  getScannerSettings,
  hasSerialSupport,
  isDesktopShell,
  saveScannerSettings,
  type ScannerSettings
} from '../lib/scanner';
import { Badge, Button, Card, Field, Input, PageHeader, Switch } from '../ui/base';
import { Modal, useToast } from '../ui/overlay';
import { useAuth } from './auth';

const KNOWN_FIELDS: { key: string; label: string; type: 'text' | 'password' | 'switch'; hint?: string }[] = [
  { key: 'TELEGRAM_BOT_TOKEN', label: 'Telegram bot token', type: 'password', hint: 'From @BotFather' },
  { key: 'TELEGRAM_CHAT_ID', label: 'Telegram chat ID', type: 'text', hint: 'Where alerts are sent' },
  { key: 'AUTO_BACKUP', label: 'Auto backup (with daily process)', type: 'switch' },
  { key: 'BACKUP_FOLDER_ID', label: 'Backup folder ID (Drive)', type: 'text', hint: 'Optional — Drive folder for backups' },
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
  { key: 'GOOGLE_AUTO_CREATE', label: 'Auto-create Google users (VIEWER)', type: 'switch' },
  { key: 'LLM_API_URL', label: 'LLM API URL', type: 'text', hint: 'OpenAI-compatible chat completions endpoint' },
  { key: 'LLM_API_KEY', label: 'LLM API key', type: 'password' },
  { key: 'LLM_MODEL', label: 'LLM model', type: 'text', hint: 'e.g. gpt-4o-mini' }
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
      if (res.ok) toast.ok('Telegram test message sent — check the chat.');
      else toast.error('Telegram send failed — verify bot token and chat ID.');
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
      if (res['skipped']) toast.info('Auto backup is OFF — enable AUTO_BACKUP first.');
      else if (res['error']) toast.error(String(res['error']));
      else toast.ok(`Backup created: ${String(res['name'] ?? res['backupId'] ?? '')}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const selftest = useMutation({
    mutationFn: () => api.selftest(),
    onSuccess: (res) => {
      if (res.ok) toast.ok('Self-test passed.');
      else toast.warn('Self-test finished with failures — see details below.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const mode = getApiMode();
  const [url, setUrl] = useState(getApiUrl());
  const [sheet, setSheet] = useState(getSheetUrl());

  return (
    <div className="stack">
      <PageHeader
        title={translate('Settings')}
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

      <ScannerCard />

      <Card title="System settings" actions={!canAdmin ? <span className="hint">Admin only — read-only for your role</span> : undefined}>
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
                  placeholder={f.type === 'password' ? 'Enter secret' : 'Enter value'}
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
              <Input value={values[k] ?? ''} placeholder="Enter value" disabled={!canAdmin} onChange={(e) => set(k, e.target.value)} />
            </Field>
          ))}
        </div>
      </Card>

      <div className="grid-2">
        <Card title="Notification tests">
          <div className="row" style={{ gap: 9, flexWrap: 'wrap' }}>
            {getApiMode() === 'gas' && (
              <Button icon={<Send size={14} />} loading={tgTest.isPending} disabled={!canAdmin} onClick={() => tgTest.mutate()}>
                Test Telegram
              </Button>
            )}
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
                  <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" />
                </Field>
                <Button onClick={() => setApiUrl(url)} disabled={!url.trim().startsWith('http')}>
                  Save URL
                </Button>
              </div>
            )}
            <span className="hint">
              {mode === 'gas'
                ? 'Served directly by Apps Script — no URL needed.'
                : mode === 'demo'
                  ? 'Sample data only — no backend calls.'
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

      <TwoFactorCard />
    </div>
  );
}

/* ---------------- two-factor authentication ---------------- */

function TwoFactorCard() {
  const toast = useToast();
  const status = useQuery({ queryKey: ['totpStatus'], queryFn: () => api.totpStatus() });
  const [stage, setStage] = useState<'idle' | 'setup' | 'recovery' | 'disable'>('idle');
  const [secret, setSecret] = useState('');
  const [uri, setUri] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const setup = useMutation({
    mutationFn: () => api.totpSetup(),
    onSuccess: (result) => {
      setSecret(result.secret);
      setUri(result.otpauthUri);
      setCode('');
      setStage('setup');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const enable = useMutation({
    mutationFn: () => api.totpEnable(code.trim()),
    onSuccess: (result) => {
      setRecoveryCodes(result.recoveryCodes);
      setStage('recovery');
      void status.refetch();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const disable = useMutation({
    mutationFn: () => api.totpDisable(password, code.trim()),
    onSuccess: () => {
      toast.ok('Two-factor authentication disabled.');
      setStage('idle');
      setPassword('');
      setCode('');
      void status.refetch();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const enabled = status.data?.enabled ?? false;
  const close = () => {
    setStage('idle');
    setCode('');
    setPassword('');
  };

  return (
    <Card
      title="Two-factor authentication"
      actions={
        status.data ? (
          <Badge tone={enabled ? 'ok' : 'neutral'}>{enabled ? 'Enabled' : 'Off'}</Badge>
        ) : undefined
      }
    >
      <p className="hint" style={{ marginTop: 0 }}>
        {enabled
          ? `Authenticator app is protecting this account. Recovery codes left: ${status.data?.recoveryCodesLeft ?? 0}.`
          : 'Add a 6-digit authenticator code on top of your password.'}
      </p>

      {enabled ? (
        <Button variant="danger" onClick={() => setStage('disable')}>
          Disable 2FA
        </Button>
      ) : (
        <Button variant="primary" loading={setup.isPending} onClick={() => setup.mutate()}>
          Enable 2FA
        </Button>
      )}

      <Modal
        open={stage === 'setup'}
        onClose={close}
        title="Set up two-factor authentication"
        footer={
          <>
            <Button onClick={close}>Cancel</Button>
            <Button
              variant="primary"
              loading={enable.isPending}
              disabled={code.trim().length < 6}
              onClick={() => enable.mutate()}
            >
              Verify and enable
            </Button>
          </>
        }
      >
        <div className="stack" style={{ gap: 12 }}>
          <p className="hint" style={{ margin: 0 }}>
            Add this account to Google Authenticator, 1Password, Authy or any TOTP app. Paste the setup URI manually
            if your app supports it.
          </p>
          <Field label="Secret key">
            <Input value={secret} readOnly className="mono" />
          </Field>
          <Field label="Setup URI">
            <Input value={uri} readOnly className="mono" />
          </Field>
          <Field label="6-digit code" hint="Enter the code shown in your app to confirm.">
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={stage === 'recovery'}
        onClose={close}
        title="Save your recovery codes"
        footer={
          <Button
            variant="primary"
            onClick={() => {
              void navigator.clipboard?.writeText(recoveryCodes.join('\n'));
              toast.ok('Recovery codes copied.');
              close();
            }}
          >
            Copy and close
          </Button>
        }
      >
        <p className="hint" style={{ marginTop: 0 }}>
          Each code works once if you lose your authenticator. Store them somewhere safe — they are shown only now.
        </p>
        <div
          className="mono"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 6,
            padding: 12,
            border: '1px solid var(--line)',
            borderRadius: 8,
          }}
        >
          {recoveryCodes.map((value) => (
            <span key={value}>{value}</span>
          ))}
        </div>
      </Modal>

      <Modal
        open={stage === 'disable'}
        onClose={close}
        title="Disable two-factor authentication"
        footer={
          <>
            <Button onClick={close}>Cancel</Button>
            <Button
              variant="danger"
              loading={disable.isPending}
              disabled={!password || code.trim().length < 6}
              onClick={() => disable.mutate()}
            >
              Disable 2FA
            </Button>
          </>
        }
      >
        <div className="stack" style={{ gap: 10 }}>
          <Field label="Current password">
            <Input
              type="password"
              value={password}
              placeholder="Current password"
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </Field>
          <Field label="Authenticator code" hint="Or one of your recovery codes.">
            <Input
              value={code}
              placeholder="123456"
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}


/* ---------------- barcode scanner ---------------- */

function ScannerCard() {
  const toast = useToast();
  const desktop = isDesktopShell();
  const [settings, setSettings] = useState<ScannerSettings>(() => getScannerSettings());
  const [test, setTest] = useState('');
  const [last, setLast] = useState('');
  const [connected, setConnected] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    saveScannerSettings(settings);
  }, [settings]);

  useEffect(() => () => stopRef.current?.(), []);

  const connect = async () => {
    try {
      const stop = await connectSerialScanner();
      stopRef.current = stop;
      setConnected(true);
      toast.ok('Serial scanner connected. Scan a barcode to test.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const disconnect = () => {
    stopRef.current?.();
    stopRef.current = null;
    disconnectSerialScanner();
    setConnected(false);
  };

  return (
    <Card
      title={
        <span className="row" style={{ gap: 8 }}>
          <ScanLine size={16} /> Barcode scanner
        </span>
      }
      actions={
        <Badge tone={settings.mode === 'hardware' ? 'ok' : 'neutral'}>
          {settings.mode === 'hardware' ? 'Hardware ready' : 'Camera mode'}
        </Badge>
      }
    >
      <p className="hint" style={{ marginTop: 0 }}>
        USB barcode scanners work as keyboards — no driver is required on Windows or macOS. Scan anywhere on the
        Inventory page and the search fills automatically. Serial scanners can be connected below.
      </p>

      <div className="form-grid">
        <Field label="Scanner mode" hint={desktop ? 'Desktop builds use hardware scanners.' : 'Hardware or camera.'}>
          <select
            className="input"
            value={settings.mode}
            onChange={(event) => setSettings((prev) => ({ ...prev, mode: event.target.value as ScannerSettings['mode'] }))}
          >
            <option value="hardware">Hardware scanner (USB / serial)</option>
            {!desktop && <option value="camera">Camera</option>}
          </select>
        </Field>

        <Field label="Minimum code length" hint="Shorter bursts are ignored as normal typing.">
          <Input
            type="number"
            min={3}
            max={64}
            value={settings.minLength}
            onChange={(event) =>
              setSettings((prev) => ({ ...prev, minLength: Math.min(64, Math.max(3, Number(event.target.value) || 6)) }))
            }
          />
        </Field>

        <Field label="Terminator" hint="Most scanners send Enter after the code.">
          <select
            className="input"
            value={settings.terminator}
            onChange={(event) =>
              setSettings((prev) => ({ ...prev, terminator: event.target.value as ScannerSettings['terminator'] }))
            }
          >
            <option value="enter">Enter</option>
            <option value="tab">Tab</option>
            <option value="none">None</option>
          </select>
        </Field>

        <Field label="Test scanner" hint="Click here, then scan a barcode.">
          <Input
            value={test}
            onChange={(event) => setTest(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                const value = test.trim();
                if (value) setLast(value);
                setTest('');
              }
            }}
            placeholder="Scan into this field"
          />
        </Field>
      </div>

      <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        {last && (
          <Badge tone="ok">
            Last scan: <span className="mono">{last}</span>
          </Badge>
        )}
        {hasSerialSupport() ? (
          connected ? (
            <Button variant="secondary" icon={<Usb size={14} />} onClick={disconnect}>
              Disconnect serial scanner
            </Button>
          ) : (
            <Button variant="secondary" icon={<Usb size={14} />} onClick={() => void connect()}>
              Connect serial scanner
            </Button>
          )
        ) : (
          <span className="hint">Serial scanners need the desktop app (Chromium).</span>
        )}
      </div>
    </Card>
  );
}
