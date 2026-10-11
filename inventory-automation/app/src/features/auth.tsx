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
import { KeyRound, Lock, Moon, Sparkles, ShieldCheck, Sun } from 'lucide-react';
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

interface SessionState {
  email: string;
  role: Role;
  expiresAt: string | null;
  legacy: boolean;
}

interface AuthContextValue {
  status: 'loading' | 'anon' | 'authed';
  session: SessionState | null;
  login: (email: string, password: string, rememberMe: boolean) => Promise<void>;
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

  const login = useCallback(async (email: string, password: string, rememberMe: boolean) => {
    const res = await api.login(email, password, rememberMe);
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
  const [showConn, setShowConn] = useState(false);
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
      await login(email.trim(), password, remember);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
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
      <div className="login-brand">
        <div className="login-brand-inner">
          <div className="login-logo">BR</div>
          <div className="login-big">Bulk Repair — Inventory Portal</div>
          <p className="login-tagline">
            Run the daily pipeline, browse inventory, and keep every record audit-ready — one place, from anywhere.
          </p>
          <ul className="login-features">
            <li>
              <ShieldCheck size={16} /> Secure sign-in with role-based access
            </li>
            <li>
              <Sparkles size={16} /> Live dashboard, ageing trends and reports
            </li>
            <li>
              <Lock size={16} /> Data stays inside your Google account
            </li>
          </ul>
        </div>
      </div>
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
          <div className="login-title2">Sign in</div>
          <div className="login-sub">Use the email and password set up by your administrator.</div>
          {error && <div className="login-err">{error}</div>}
          <form onSubmit={submit}>
            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="username"
                required
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </Field>
            <div className="spread" style={{ marginBottom: 16 }}>
              <label className="checkbox">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Keep me
                signed in
              </label>
            </div>
            <Button variant="primary" size="lg" type="submit" loading={busy} style={{ width: '100%' }}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <div className="login-alt">
            <button type="button" onClick={startDemo} disabled={demoBusy}>
              {demoBusy ? 'Loading demo…' : 'Explore demo (sample data)'}
            </button>
          </div>
          {getApiMode() === 'http' && (
            <div className="login-alt" style={{ marginTop: 10 }}>
              <button type="button" onClick={() => setShowConn((s) => !s)}>
                Connection settings
              </button>
              {showConn && (
                <div style={{ marginTop: 10, textAlign: 'left' }}>
                  <Field label="Apps Script /exec URL" hint="Deploy → Web app URL (ends with /exec)">
                    <Input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://script.google.com/macros/s/…/exec"
                    />
                  </Field>
                  <Button onClick={saveUrl} disabled={!url.trim().startsWith('http')}>
                    Save URL
                  </Button>
                </div>
              )}
            </div>
          )}
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
