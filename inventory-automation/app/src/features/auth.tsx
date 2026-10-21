/* Authentication: session context, login page, change-password dialog. */
import {
  type FormEvent,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, Cloud, Eye, EyeOff, KeyRound, LockKeyhole, Mail, Moon, ShieldCheck, Sun } from 'lucide-react';
import {
  api,
  ApiError,
  clearToken,
  getApiMode,
  getApiUrl,
  getToken,
  onUnauthorized,
  setApiUrl,
  setDemoMode,
  setToken,
  type Role,
} from '../lib/api';
import { errorMessage, queryClient } from '../lib/query';
import { Button, Field, Input, Spinner } from '../ui/base';
import { Modal, useToast } from '../ui/overlay';
import { useTheme } from '../lib/utils';
import { GoogleSignIn } from './google-signin';

interface SessionState {
  email: string;
  role: Role;
  expiresAt: string | null;
  legacy: boolean;
}

interface AuthContextValue {
  status: 'loading' | 'anon' | 'authed';
  session: SessionState | null;
  login: (email: string, password: string, rememberMe: boolean, code?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'anon' | 'authed'>('loading');
  const [session, setSession] = useState<SessionState | null>(null);
  const toast = useToast();

  /* Boot: validate any stored token; fall back to the Google-session
     legacy mode when served by Apps Script. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mode = getApiMode();
      const hasToken = !!getToken();
      if (!hasToken && mode === 'http' && !getApiUrl()) {
        if (!cancelled) setStatus('anon');
        return;
      }
      try {
        const info = await api.whoami();
        if (!cancelled) {
          setSession({ email: info.email, role: info.role, expiresAt: info.expiresAt, legacy: info.legacy });
          setStatus('authed');
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError && err.code === 'AUTH_REQUIRED') clearToken();
          setStatus('anon');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Session revoked / expired while the portal is open. */
  useEffect(() => {
    return onUnauthorized(() => {
      setSession(null);
      setStatus('anon');
      queryClient.clear();
      toast.warn('Session expired — please sign in again.');
    });
  }, [toast]);

  const login = useCallback(async (email: string, password: string, rememberMe: boolean, code?: string) => {
    const res = await api.login(email, password, rememberMe, code);
    if (res.token) setToken(res.token);
    setSession({ email: res.email, role: res.role, expiresAt: res.expiresAt ?? null, legacy: false });
    setStatus('authed');
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* best effort */
    }
    clearToken();
    setSession(null);
    setStatus('anon');
    queryClient.clear();
  }, []);

  const value = useMemo(() => ({ status, session, login, logout }), [status, session, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function SplashInline() {
  return (
    <div className="splash">
      <div className="splash-logo">BR</div>
      <div className="row" style={{ gap: 8 }}>
        <Spinner size={14} /> Loading…
      </div>
    </div>
  );
}

export function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggle } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [showConn, setShowConn] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [url, setUrl] = useState(getApiUrl());

  if (status === 'loading') return <SplashInline />;
  if (status === 'authed') {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password, remember, needsTotp ? totpCode.trim() : undefined);
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TOTP_REQUIRED') {
        setNeedsTotp(true);
        setError('Enter the 6-digit code from your authenticator app.');
      } else if (err instanceof ApiError && err.code === 'TOTP_INVALID') {
        setNeedsTotp(true);
        setError('That code is not valid. Try the current code or a recovery code.');
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const startDemo = async () => {
    setError('');
    setDemoBusy(true);
    try {
      setDemoMode(true);
      await login('admin@demo.local', 'demo1234', false);
      navigate('/', { replace: true });
    } catch (err) {
      setDemoMode(false);
      setError(errorMessage(err));
    } finally {
      setDemoBusy(false);
    }
  };

  const saveUrl = () => {
    if (!url.trim().startsWith('http')) return;
    setApiUrl(url);
    setShowConn(false);
    setError('');
  };

  return (
    <div className="login">
      <aside className="login-brand">
        <div className="login-brand-inner">
          <div className="login-logo-card">
            <img src="brand-mark.png" alt="Bulk Repair" />
          </div>
          <h1>
            Bulk Repair
            <br />
            <span>Inventory Portal</span>
          </h1>
          <p className="login-tagline">
            Manage your repair inventory, track stock and keep your records organised — all in one place.
          </p>
          <ul className="login-features">
            <li>
              <span className="login-feature-ic">
                <ShieldCheck size={18} />
              </span>
              <div>
                <strong>Secure access</strong>
                <span>Role-based login with advanced security.</span>
              </div>
            </li>
            <li>
              <span className="login-feature-ic">
                <BarChart3 size={18} />
              </span>
              <div>
                <strong>Real-time inventory</strong>
                <span>Track stock, orders and updates instantly.</span>
              </div>
            </li>
            <li>
              <span className="login-feature-ic">
                <Cloud size={18} />
              </span>
              <div>
                <strong>Data always with you</strong>
                <span>Access your data anytime, anywhere.</span>
              </div>
            </li>
          </ul>
          <div className="login-script">
            Smarter Inventory.
            <br />
            Smoother Repairs.
          </div>
        </div>
      </aside>

      <div className="login-panel">
        <div className="login-theme">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </Button>
        </div>

        <div className="login-card">
          <div className="login-eyebrow">Welcome back</div>
          <h1 className="login-title2">Sign in to your account</h1>
          <p className="login-sub">Access your inventory, manage repairs and stay on top of your work.</p>

          {error && <div className="login-err">{error}</div>}

          <form onSubmit={submit}>
            <Field label="Email Address">
              <div className="input-icon">
                <Mail size={16} />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  autoComplete="username"
                  required
                />
              </div>
            </Field>

            <Field label="Password">
              <div className="input-icon">
                <LockKeyhole size={16} />
                <Input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPw((value) => !value)}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>

            {needsTotp && (
              <Field label="Authenticator code" hint="6-digit code, or one of your recovery codes.">
                <Input
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="123456"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  required
                />
              </Field>
            )}

            <div className="login-row">
              <label className="checkbox">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Keep me
                signed in
              </label>
              <button
                type="button"
                className="login-link"
                onClick={() =>
                  setError('To reset your password, ask an administrator to use Users & Security → Reset password.')
                }
              >
                Forgot password?
              </button>
            </div>

            <Button variant="primary" size="lg" type="submit" loading={busy} style={{ width: '100%' }}>
              {busy ? 'Signing in…' : 'Sign in'} {!busy && <ArrowRight size={16} />}
            </Button>
          </form>

          <div className="login-divider">or</div>

          <GoogleSignIn onError={setError} />

          <div className="login-alt">
            <button type="button" onClick={startDemo} disabled={demoBusy}>
              {demoBusy ? 'Loading demo…' : 'Explore demo (sample data)'}
            </button>
            {getApiMode() === 'http' && (
              <button type="button" onClick={() => setShowConn((s) => !s)}>
                Connection settings
              </button>
            )}
            {showConn && (
              <div style={{ marginTop: 4, textAlign: 'left', width: '100%' }}>
                <Field label="Server URL" hint="Local server, LAN or VPS endpoint (ends with /api/gas).">
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="http://localhost:5050/api/gas"
                  />
                </Field>
                <Button onClick={saveUrl} disabled={!url.trim().startsWith('http')}>
                  Save URL
                </Button>
              </div>
            )}
          </div>

          <div className="login-foot">
            <LockKeyhole size={13} /> Your data is secure and encrypted
          </div>
        </div>
      </div>
    </div>
  );
}

export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (newPw.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPw !== confirm) {
      setError('New passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(oldPw, newPw);
      toast.ok('Password changed. Other sessions have been signed out.');
      setOldPw('');
      setNewPw('');
      setConfirm('');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="row" style={{ gap: 8 }}>
          <KeyRound size={16} /> Change password
        </span>
      }
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            Change password
          </Button>
        </>
      }
    >
      {error && <div className="login-err">{error}</div>}
      <Field label="Current password">
        <Input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} autoComplete="current-password" />
      </Field>
      <Field label="New password" hint="At least 6 characters.">
        <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
      </Field>
      <Field label="Confirm new password">
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      </Field>
    </Modal>
  );
}
