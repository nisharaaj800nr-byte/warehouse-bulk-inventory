/* First-run setup wizard: backend choice, optional Google Sheet link, owner account. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Cloud, HardDrive, Link2, Loader2, XCircle } from 'lucide-react';
import {
  api,
  clearApiUrl,
  getApiUrl,
  getSheetUrl,
  markSetupDone,
  setApiUrl,
  setSheetUrl,
  setToken,
} from '../lib/api';
import { Badge, Button, Card, Field, Input } from '../ui/base';
import { GoogleSignIn } from './google-signin';

type Backend = 'local' | 'gas';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function SetupPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [backend, setBackend] = useState<Backend>('local');
  const [url, setUrl] = useState(() => {
    const current = getApiUrl();
    return current === '/api/gas' ? '' : current;
  });
  const [localUrl, setLocalUrl] = useState(() => {
    const current = getApiUrl();
    return current === '/api/gas' ? '' : current;
  });
  const [sheet, setSheet] = useState(getSheetUrl());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [probe, setProbe] = useState<'idle' | 'ok' | 'fail'>('idle');

  function applyBackend(): void {
    if (backend === 'local') {
      const value = localUrl.trim().replace(/\/+$/, '');
      if (value) setApiUrl(value.endsWith('/api/gas') ? value : `${value}/api/gas`);
      else clearApiUrl();
    } else {
      setApiUrl(url.trim());
    }
  }

  async function testConnection(): Promise<void> {
    setError('');
    setProbe('idle');
    setBusy(true);
    try {
      applyBackend();
      const health = await api.health();
      setProbe(health ? 'ok' : 'fail');
    } catch (err) {
      setProbe('fail');
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setBusy(false);
    }
  }

  function next(): void {
    setError('');
    if (step === 1) {
      if (backend === 'gas' && !url.trim().startsWith('http')) {
        setError('Paste the Apps Script web-app URL ending with /exec');
        return;
      }
      applyBackend();
    }
    if (step === 2) setSheetUrl(sheet);
    setStep((current) => Math.min(3, current + 1));
  }

  async function finish(): Promise<void> {
    setError('');
    if (!EMAIL_RE.test(email.trim())) {
      setError('Enter a valid email address');
      return;
    }
    if (password.length < 10) {
      setError('Password must be at least 10 characters');
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must contain both letters and numbers');
      return;
    }
    if (backend === 'local' && password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setBusy(true);
    try {
      applyBackend();
      setSheetUrl(sheet);

      const result =
      // Fresh install -> create owner. Existing install -> bootstrap is rejected,
      // so the same credentials fall back to a normal sign-in.
        backend === 'local'
          ? await api.bootstrapOwner(email.trim(), password).catch(() => api.login(email.trim(), password, true))
          : await api.login(email.trim(), password, true);

      setToken(result.token);
      markSetupDone(true);
      navigate('/', { replace: true });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setBusy(false);
    }
  }

  const steps = [
    { number: 1, title: 'Backend', detail: 'Where your data lives' },
    { number: 2, title: 'Google Sheet', detail: 'Optional quick link' },
    { number: 3, title: 'Owner account', detail: 'Sign in or create' }
  ];

  return (
    <div className="setup">
      <aside className="setup-brand">
        <div className="splash-logo">BR</div>
        <h2>Bulk Repair</h2>
        <p>Inventory operations for repair teams — imports, ageing rules, reports and audit trails in one place.</p>
        <ol className="setup-steps">
          {steps.map((item) => (
            <li
              key={item.number}
              className={step === item.number ? 'active' : step > item.number ? 'done' : ''}
            >
              <span className="step-dot">{step > item.number ? '✓' : item.number}</span>
              <span>
                <strong>{item.title}</strong>
                {item.detail}
              </span>
            </li>
          ))}
        </ol>
      </aside>

      <main className="setup-panel">
        <div className="setup-inner">
          <div className="setup-head">
            <span className="eyebrow">Setup · step {step} of 3</span>
            <h1>
              {step === 1 && 'Choose your backend'}
              {step === 2 && 'Link a Google Sheet'}
              {step === 3 && (backend === 'local' ? 'Create the owner account' : 'Sign in')}
            </h1>
            <p>
              {step === 1 && 'Pick where inventory data should live. You can change this later in Settings.'}
              {step === 2 && 'Optional: save the sheet used by your Apps Script deployment for quick access.'}
              {step === 3 && 'One-time setup — after this the app opens straight into the dashboard.'}
            </p>
          </div>

          {step === 1 && (
            <Card title="Backend">
              <div className="stack" style={{ gap: 12 }}>
                <button
                  type="button"
                  className={`option-card${backend === 'local' ? ' selected' : ''}`}
                  onClick={() => setBackend('local')}
                  style={{ textAlign: 'left', padding: 16, borderRadius: 12, cursor: 'pointer' }}
                >
                  <div className="spread">
                    <div className="row" style={{ gap: 9 }}>
                      <HardDrive size={18} />
                      <strong>This computer (offline)</strong>
                    </div>
                    {backend === 'local' && <Badge tone="ok">Selected</Badge>}
                  </div>
                  <p className="hint" style={{ margin: '7px 0 0' }}>
                    Local server and database. No internet required. Fastest.
                  </p>
                </button>

                <button
                  type="button"
                  className={`option-card${backend === 'gas' ? ' selected' : ''}`}
                  onClick={() => setBackend('gas')}
                  style={{ textAlign: 'left', padding: 16, borderRadius: 12, cursor: 'pointer' }}
                >
                  <div className="spread">
                    <div className="row" style={{ gap: 9 }}>
                      <Cloud size={18} />
                      <strong>Google Apps Script / Google Sheets</strong>
                    </div>
                    {backend === 'gas' && <Badge tone="ok">Selected</Badge>}
                  </div>
                  <p className="hint" style={{ margin: '7px 0 0' }}>
                    Data stays in Google Sheets. Requires internet. Works from your phone anywhere.
                  </p>
                </button>

                {backend === 'local' && (
                  <Field
                    label="Server URL (optional)"
                    hint="Default: http://localhost:5050. Phone pe LAN IP ya VPS URL daalo, e.g. http://192.168.1.10:5050"
                  >
                    <Input
                      value={localUrl}
                      onChange={(event) => setLocalUrl(event.target.value)}
                      placeholder="http://localhost:5050"
                    />
                  </Field>
                )}

                {backend === 'gas' && (
                  <Field label="Apps Script web-app URL (/exec)">
                    <Input
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                      placeholder="https://script.google.com/macros/s/.../exec"
                    />
                  </Field>
                )}

                <div className="row" style={{ gap: 10 }}>
                  <Button onClick={testConnection} loading={busy} icon={<Link2 size={14} />}>
                    Test connection
                  </Button>
                  {probe === 'ok' && (
                    <span style={{ color: 'var(--ok)' }}>
                      <CheckCircle2 size={16} /> Connected
                    </span>
                  )}
                  {probe === 'fail' && (
                    <span style={{ color: 'var(--danger)' }}>
                      <XCircle size={16} /> Not reachable
                    </span>
                  )}
                </div>
              </div>
            </Card>
          )}

          {step === 2 && (
            <Card title="Google Sheet (optional)">
              <div className="stack" style={{ gap: 12 }}>
                <Field label="Sheet link">
                  <Input
                    value={sheet}
                    onChange={(event) => setSheet(event.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                  />
                </Field>
                <p className="hint" style={{ margin: 0 }}>
                  In Apps Script mode, data lives in that sheet. This link is only saved for quick access
                  (you can change it in Settings).
                </p>
              </div>
            </Card>
          )}

          {step === 3 && (
            <Card title={backend === 'local' ? 'Owner account' : 'Account'}>
              <div className="stack" style={{ gap: 12 }}>
                <Field label="Email">
                  <Input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" />
                </Field>
                <Field label={backend === 'local' ? 'Password (10+ characters, letters and numbers)' : 'Password'}>
                  <Input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={backend === 'local' ? 'new-password' : 'current-password'}
                  />
                </Field>
                {backend === 'local' && (
                  <Field label="Confirm password">
                    <Input
                      type="password"
                      value={confirm}
                      onChange={(event) => setConfirm(event.target.value)}
                      autoComplete="new-password"
                    />
                  </Field>
                )}
                <p className="hint" style={{ margin: 0 }}>
                  {backend === 'local'
                    ? 'This account will be created as OWNER on the local server of this computer.'
                    : 'Use the same email and password as your Apps Script deployment.'}
                </p>
                {backend === 'gas' && <GoogleSignIn onError={setError} />}
              </div>
            </Card>
          )}

          {error && (
            <p style={{ color: 'var(--danger)', marginTop: 12 }}>
              <XCircle size={14} /> {error}
            </p>
          )}

          <div className="setup-foot">
            {step > 1 && (
              <Button onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={busy}>
                Back
              </Button>
            )}
            {step < 3 && (
              <Button variant="primary" onClick={next}>
                Continue
              </Button>
            )}
            {step === 3 && (
              <Button variant="primary" onClick={finish} loading={busy} icon={busy ? <Loader2 size={14} /> : undefined}>
                Finish setup
              </Button>
            )}
          </div>

          <p className="hint setup-note">To change the setup later: Settings → Connection.</p>
        </div>
      </main>
    </div>
  );
}
