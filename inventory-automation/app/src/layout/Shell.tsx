/* App shell: sidebar navigation, topbar, content area. */
import { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  FlaskConical,
  KeyRound,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
} from 'lucide-react';
import { NAV_GROUPS } from './nav';
import { cx, hasRole, initials, useTheme } from '../lib/utils';
import { ChangePasswordDialog, useAuth } from '../features/auth';
import { Button } from '../ui/base';
import { DropdownMenu } from '../ui/overlay';
import { isDemoMode } from '../lib/api';
import { translate, useLang, type Lang } from '../lib/i18n';

export function Shell() {
  const { session, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('ors.sidebar') === 'collapsed');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const location = useLocation();
  const [lang, changeLang] = useLang();

  const title = useMemo(() => {
    for (const g of NAV_GROUPS) {
      for (const it of g.items) {
        if (it.to === location.pathname) return it.label;
      }
    }
    if (location.pathname.startsWith('/inventory')) return 'Inventory';
    return 'Portal';
  }, [location.pathname]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem('ors.sidebar', next ? 'collapsed' : 'expanded');
      return next;
    });
  };

  const role = session?.role ?? 'VIEWER';

  const groups = useMemo(
    () =>
      NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((it) => !it.min || hasRole(role, it.min)) })).filter(
        (g) => g.items.length > 0,
      ),
    [role],
  );

  return (
    <div className="shell">
      {mobileOpen && (
        <button className="sidebar-backdrop" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
      )}
      <aside className={cx('sidebar', collapsed && 'collapsed', mobileOpen && 'mobile-open')}>
        <div className="side-brand">
          <div className="side-logo">BR</div>
          <div className="side-text">
            <div className="side-name">Bulk Repair</div>
            <div className="side-sub">Inventory Portal</div>
          </div>
        </div>
        <nav className="side-nav">
          {groups.map((g) => (
            <div className="navgroup" key={g.group}>
              <div className="navgroup-title">{translate(g.group, lang)}</div>
              {g.items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={it.end}
                  className={({ isActive }) => cx('navlink', isActive && 'active')}
                  onClick={() => setMobileOpen(false)}
                >
                  <span className="nl-ic">
                    <it.icon size={17} />
                  </span>
                  <span className="nl-label">{translate(it.label, lang)}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <select
            aria-label="Language"
            value={lang}
            onChange={(event) => changeLang(event.target.value as Lang)}
            style={{ width: '100%', marginBottom: 8, padding: '4px 6px', borderRadius: 6 }}
          >
            <option value="en">English</option>
            <option value="hi">हिन्दी</option>
            <option value="gu">ગુજરાતી</option>
          </select>
          <select
            aria-label="Language"
            value={lang}
            onChange={(event) => changeLang(event.target.value as Lang)}
            style={{ width: '100%', marginBottom: 8, padding: '4px 6px', borderRadius: 6 }}
          >
            <option value="en">English</option>
            <option value="hi">à¤¹à¤¿à¤¨à¥à¤¦à¥€</option>
            <option value="gu">àª—à«àªœàª°àª¾àª¤à«€</option>
          </select>
          <Button
            variant="ghost"
            size="sm"
            className="collapse-btn"
            onClick={toggleCollapsed}
            icon={collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          >
            {!collapsed && <span>Collapse</span>}
          </Button>
        </div>
      </aside>

      <div className="main">
        {isDemoMode() && (
          <div className="banner">
            <FlaskConical size={14} /> Demo mode Ã¢â‚¬â€ sample data only. Sign out to exit.
          </div>
        )}
        <header className="topbar">
          <Button
            variant="ghost"
            size="icon"
            className="mobile-only"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </Button>
          <div className="tb-title grow">{title}</div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </Button>
          <DropdownMenu
            className="userchip"
            content={
              <>
                <span className="avatar">{initials(session?.email ?? '')}</span>
                <span className="userchip-text">
                  <div style={{ fontSize: 12.5, fontWeight: 650, lineHeight: 1.2 }}>{session?.email}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{role}</div>
                </span>
              </>
            }
            items={[
              {
                label: 'Change password',
                icon: <KeyRound size={14} />,
                onClick: () => setPwOpen(true),
              },
              { label: null },
              {
                label: 'Sign out',
                icon: <LogOut size={14} />,
                danger: true,
                onClick: () => {
                  void logout();
                },
              },
            ]}
          />
        </header>
        <div className="content">
          <Outlet />
        </div>
      </div>

      <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}
