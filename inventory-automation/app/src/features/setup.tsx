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
  const [sheet, setSheet] = useState(getSheetUrl());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [probe, setProbe] = useState<'idle' | 'ok' | 'fail'>('idle');

  function applyBackend(): void {
    if (backend === 'local') clearApiUrl();
    else setApiUrl(url.trim());
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
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
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
        backend === 'local'
          ? await api.bootstrapOwner(email.trim(), password)
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

  return (
    <div className="center-page" style={{ padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 720 }}>
        <div className="row" style={{ gap: 10, marginBottom: 14 }}>
          <div className="splash-logo">BR</div>
          <div>
            <h2 style={{ margin: 0 }}>Bulk Repair setup</h2>
            <p className="muted" style={{ margin: 0 }}>
              Step {step} of 3 Ã¢â‚¬â€ ek baar setup, phir seedha app khulega.
            </p>
          </div>
        </div>

        {step === 1 && (
          <Card title="1. Backend kahan chalega?">
            <div className="stack" style={{ gap: 12 }}>
              <button
                type="button"
                className={`option-card${backend === 'local' ? ' selected' : ''}`}
                onClick={() => setBackend('local')}
                style={{ textAlign: 'left', padding: 14, borderRadius: 10, cursor: 'pointer' }}
              >
                <div className="row" style={{ gap: 8 }}>
                  <HardDrive size={18} />
                  <strong>This computer (offline)</strong>
                  {backend === 'local' && <Badge tone="ok">selected</Badge>}
                </div>
                <p className="hint" style={{ margin: '6px 0 0' }}>
                  Local server + local database. Internet ki zarurat nahi. Fastest.
                </p>
              </button>

              <button
                type="button"
                className={`option-card${backend === 'gas' ? ' selected' : ''}`}
                onClick={() => setBackend('gas')}
                style={{ textAlign: 'left', padding: 14, borderRadius: 10, cursor: 'pointer' }}
              >
                <div className="row" style={{ gap: 8 }}>
                  <Cloud size={18} />
                  <strong>Google Apps Script / Google Sheets</strong>
                  {backend === 'gas' && <Badge tone="ok">selected</Badge>}
                </div>
                <p className="hint" style={{ margin: '6px 0 0' }}>
                  Data Google Sheets me rahega. Internet chahiye. Phone se kahin se bhi chalega.
                </p>
              </button>

              {backend === 'gas' && (
                <Field label="Apps Script web-app URL (/exec)">
                  <Input
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                  />
                </Field>
              )}

              <div className="row" style={{ gap: 8 }}>
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
          <Card title="2. Google Sheet (optional)">
            <div className="stack" style={{ gap: 12 }}>
              <Field label="Sheet link">
                <Input
                  value={sheet}
                  onChange={(event) => setSheet(event.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                />
              </Field>
              <p className="hint" style={{ margin: 0 }}>
                Apps Script mode me data khud usi sheet me jata hai. Ye link sirf jaldi kholne ke liye
                save hota hai (Settings me bhi badal sakte ho).
              </p>
            </div>
          </Card>
        )}

        {step === 3 && (
          <Card title={backend === 'local' ? '3. Owner account banao' : '3. Sign in'}>
            <div className="stack" style={{ gap: 12 }}>
              <Field label="Email">
                <Input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" />
              </Field>
              <Field label={backend === 'local' ? 'Password (8+ characters)' : 'Password'}>
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
                  ? 'Ye account is computer ke local server pe OWNER ke roop me banega.'
                  : 'Wahi email/password jo aapke Apps Script deployment me hai.'}
              </p>
              {backend === 'gas' && <GoogleSignIn onError={setError} />}
            </div>
          </Card>
        )}

        {error && (
          <p style={{ color: 'var(--danger)', marginTop: 10 }}>
            <XCircle size={14} /> {error}
          </p>
        )}

        <div className="row" style={{ gap: 8, marginTop: 14 }}>
          {step > 1 && (
            <Button onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={busy}>
              Back
            </Button>
          )}
          {step < 3 && (
            <Button variant="primary" onClick={next}>
              Next
            </Button>
          )}
          {step === 3 && (
            <Button variant="primary" onClick={finish} loading={busy} icon={busy ? <Loader2 size={14} /> : undefined}>
              Finish setup
            </Button>
          )}
        </div>

        <p className="hint" style={{ marginTop: 12 }}>
          Setup dobara badalna ho to: Settings Ã¢â€ â€™ Connection.
        </p>
      </div>
    </div>
  );
}
