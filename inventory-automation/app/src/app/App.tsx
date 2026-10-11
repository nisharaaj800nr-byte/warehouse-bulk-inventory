/* App root: providers, error boundary, router. */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { queryClient } from '../lib/query';
import { ToastProvider } from '../ui/overlay';
import { AuthProvider } from '../features/auth';
import { AppRoutes } from './routes';
import { Button } from '../ui/base';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Portal crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="center-page" style={{ padding: 24 }}>
          <h2>Something went wrong</h2>
          <p className="muted">An unexpected error occurred while rendering the portal.</p>
          <pre
            className="mono"
            style={{ maxWidth: 640, whiteSpace: 'pre-wrap', color: 'var(--danger)', textAlign: 'left' }}
          >
            {String(this.state.error.message || this.state.error)}
          </pre>
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <HashRouter>
              <AppRoutes />
            </HashRouter>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
