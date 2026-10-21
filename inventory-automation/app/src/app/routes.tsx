import { type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { LoginPage, useAuth } from '../features/auth';
import { SetupPage } from '../features/setup';
import { DashboardPage } from '../features/dashboard';
import { InventoryPage } from '../features/inventory';
import { ImportsPage } from '../features/imports';
import { LabelsPage } from '../features/labels';
import { ReportsPage } from '../features/reports';
import { SourcesPage } from '../features/sources';
import { MappingPage } from '../features/mapping';
import { RulesPage } from '../features/rules';
import { AlertsPage } from '../features/alerts';
import { UsersPage } from '../features/users';
import { SessionsPage } from '../features/sessions';
import { ScheduledPage } from '../features/scheduled';
import { PurchasingPage } from '../features/purchasing';
import { ActivityPage } from '../features/activity';
import { SettingsPage } from '../features/settings';
import { AssistantPage } from '../features/assistant';
import {
  AgeingTrendsPage,
  EmailSettingsPage,
  ExportsPage,
  HelpPage,
  ProcessingPage,
  SecurityPage,
  SystemHealthPage
} from '../features/extra';
import { Shell } from '../layout/Shell';
import { Button } from '../ui/base';
import { hasRole } from '../lib/utils';
import { isSetupDone, type Role } from '../lib/api';

export function Splash() {
  return (
    <div className="splash">
      <div className="splash-logo">BR</div>
      <div>Loading portal…</div>
    </div>
  );
}

function RequireSetup({ children }: { children: ReactNode }) {
  if (!isSetupDone()) return <Navigate to="/setup" replace />;
  return <>{children}</>;
}

function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (!isSetupDone()) return <Navigate to="/setup" replace />;
  if (status === 'loading') return <Splash />;
  if (status === 'anon') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Shell />;
}

function RequireRole({ min, children }: { min: Role; children: ReactNode }) {
  const { session } = useAuth();
  if (!hasRole(session?.role, min)) {
    return (
      <div className="center-page">
        <h2>Access denied</h2>
        <p className="muted">
          Your role ({session?.role ?? 'VIEWER'}) cannot open this page. Ask an admin to upgrade your access.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="center-page">
      <div className="splash-logo">BR</div>
      <h2>Page not found</h2>
      <p className="muted">The page you are looking for does not exist.</p>
      <Button
        variant="primary"
        onClick={() => {
          window.location.hash = '#/';
        }}
      >
        Go to dashboard
      </Button>
    </div>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/setup" element={<SetupPage />} />
      <Route
        path="/login"
        element={
          <RequireSetup>
            <LoginPage />
          </RequireSetup>
        }
      />
      <Route path="/" element={<RequireAuth />}>
        <Route index element={<DashboardPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="imports" element={<ImportsPage />} />
        <Route path="imports/multi" element={<ImportsPage initialTab="multi" />} />
        <Route path="labels" element={<LabelsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="report-templates" element={<ReportsPage mode="templates" />} />
        <Route path="report-builder" element={<ReportsPage mode="builder" />} />
        <Route path="ageing" element={<AgeingTrendsPage />} />
        <Route path="exports" element={<ExportsPage />} />
        <Route
          path="scheduled"
          element={
            <RequireRole min="MANAGER">
              <ScheduledPage />
            </RequireRole>
          }
        />
        <Route path="sources" element={<SourcesPage />} />
        <Route path="mapping" element={<MappingPage />} />
        <Route path="rules" element={<RulesPage />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route
          path="users"
          element={
            <RequireRole min="ADMIN">
              <UsersPage />
            </RequireRole>
          }
        />
        <Route
          path="sessions"
          element={
            <RequireRole min="ADMIN">
              <SessionsPage />
            </RequireRole>
          }
        />
        <Route
          path="purchasing"
          element={
            <RequireRole min="MANAGER">
              <PurchasingPage />
            </RequireRole>
          }
        />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="activity-log" element={<ActivityPage initialTab="activity" lockedTab heading="Activity Log" />} />
        <Route
          path="processing-history"
          element={<ActivityPage initialTab="runs" lockedTab heading="Processing History" />}
        />
        <Route path="data-quality" element={<ActivityPage initialTab="quality" lockedTab heading="Data Quality" />} />
        <Route path="processing" element={<ProcessingPage />} />
        <Route
          path="security"
          element={
            <RequireRole min="ADMIN">
              <SecurityPage />
            </RequireRole>
          }
        />
        <Route
          path="system-health"
          element={
            <RequireRole min="ADMIN">
              <SystemHealthPage />
            </RequireRole>
          }
        />
        <Route
          path="email-settings"
          element={
            <RequireRole min="ADMIN">
              <EmailSettingsPage />
            </RequireRole>
          }
        />
        <Route path="help" element={<HelpPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="assistant" element={<AssistantPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
