/* Google Identity Services sign-in button (rendered only when configured). */
import { useEffect, useRef, useState } from 'react';
import { callApi, setToken } from '../lib/api';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google script load failed'));
    document.head.appendChild(script);
  });
}

export function GoogleSignIn({ onError }: { onError: (message: string) => void }) {
  const holder = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'off'>('loading');

  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      try {
        const config = await callApi<{ enabled: boolean; clientId: string }>('auth.googleConfig', {});
        if (cancelled) return;
        if (!config.enabled || !config.clientId) {
          setStatus('off');
          return;
        }

        await loadScript('https://accounts.google.com/gsi/client');
        if (cancelled || !window.google) return;

        window.google.accounts.id.initialize({
          client_id: config.clientId,
          callback: async (response) => {
            try {
              const result = await callApi<{ token: string }>('auth.google', { idToken: response.credential });
              setToken(result.token);
              window.location.reload();
            } catch (error) {
              onError(error instanceof Error ? error.message : 'Google sign-in failed');
            }
          }
        });

        if (holder.current) {
          window.google.accounts.id.renderButton(holder.current, {
            theme: 'outline',
            size: 'large',
            width: 320,
            text: 'signin_with'
          });
          setStatus('ready');
        }
      } catch {
        if (!cancelled) setStatus('off');
        /* Google not reachable or not configured — the password form stays usable. */
      }
    };

    void setup();
    return () => {
      cancelled = true;
    };
  }, [onError]);

  return (
    <div>
      <div ref={holder} style={{ display: status === 'ready' ? 'flex' : 'none', justifyContent: 'center' }} />
      {status === 'off' && (
        <button
          type="button"
          className="google-btn"
          onClick={() => onError('Google sign-in is not configured. Add GOOGLE_CLIENT_ID in Settings.')}
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.3-.1-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.3-.4-3.5z" />
          </svg>
          Continue with Google
        </button>
      )}
    </div>
  );
}
