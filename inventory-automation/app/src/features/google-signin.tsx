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
        /* Google not reachable or not configured â€” the password form stays usable. */
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
      
    </div>
  );
}
