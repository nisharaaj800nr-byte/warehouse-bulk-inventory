/* Overlay primitives: modal, drawer, confirm dialog, dropdown menu, toasts. */
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cx } from '../lib/utils';
import { Button } from './base';

function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}

function useOverlayBehavior(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

export function Modal({
  open,
  onClose,
  title,
  size = 'md',
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  size?: 'md' | 'lg';
  children: ReactNode;
  footer?: ReactNode;
}) {
  useOverlayBehavior(open, onClose);
  if (!open) return null;
  return (
    <Portal>
      <div
        className="backdrop"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className={cx('dialog', size === 'lg' && 'dialog-lg')} role="dialog" aria-modal="true">
          <div className="dialog-head">
            <div className="dialog-title">{title}</div>
            <button className="dialog-x" onClick={onClose} aria-label="Close">
              <X size={17} />
            </button>
          </div>
          <div className="dialog-body">{children}</div>
          {footer && <div className="dialog-foot">{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  wide,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  wide?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useOverlayBehavior(open, onClose);
  if (!open) return null;
  return (
    <Portal>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className={cx('drawer', wide && 'w-lg')} role="dialog" aria-modal="true">
        <div className="drawer-head">
          <div className="dialog-title">{title}</div>
          <button className="dialog-x" onClick={onClose} aria-label="Close">
            <X size={17} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </div>
    </Portal>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  tone = 'danger',
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
        {tone === 'danger' && (
          <span style={{ color: 'var(--danger)', marginTop: 2 }}>
            <AlertTriangle size={18} />
          </span>
        )}
        <div>{message}</div>
      </div>
    </Modal>
  );
}

export interface MenuItemDef {
  label: ReactNode | null; /* null = separator */
  icon?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  keepOpen?: boolean;
}

export function DropdownMenu({
  content,
  items,
  align = 'right',
  className,
  scroll,
  header,
}: {
  content: ReactNode;
  items: MenuItemDef[];
  align?: 'left' | 'right';
  className?: string;
  scroll?: boolean;
  header?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="menu-anchor" ref={ref}>
      <button type="button" className={className} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        {content}
      </button>
      {open && (
        <div className={cx('menu', align === 'left' && 'left', scroll && 'scroll')} role="menu">
          {header}
          {items.map((it, i) =>
            it.label === null ? (
              <div key={i} className="menu-sep" />
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                className={cx('menu-item', it.danger && 'danger')}
                disabled={it.disabled}
                onClick={() => {
                  if (!it.keepOpen) setOpen(false);
                  it.onClick?.();
                }}
              >
                {it.icon && <span className="mi-icon">{it.icon}</span>}
                <span className="grow">{it.label}</span>
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- toasts ---------------- */

interface ToastItem {
  id: number;
  kind: 'ok' | 'error' | 'warn' | 'info';
  message: string;
}

export interface ToastApi {
  ok: (message: string) => void;
  error: (message: string) => void;
  warn: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const push = useCallback((kind: ToastItem['kind'], message: string) => {
    const id = ++idRef.current;
    setItems((prev) => [...prev.slice(-4), { id, kind, message }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 5200);
  }, []);

  const toastApi = useMemo<ToastApi>(
    () => ({
      ok: (m) => push('ok', m),
      error: (m) => push('error', m),
      warn: (m) => push('warn', m),
      info: (m) => push('info', m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={toastApi}>
      {children}
      <Portal>
        <div className="toasts" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className={cx('toast', `toast-${t.kind}`)} role="status">
              <span className="toast-ic">
                {t.kind === 'ok' ? (
                  <CheckCircle2 size={16} />
                ) : t.kind === 'error' ? (
                  <XCircle size={16} />
                ) : t.kind === 'warn' ? (
                  <AlertTriangle size={16} />
                ) : (
                  <Info size={16} />
                )}
              </span>
              <div className="toast-body">{t.message}</div>
              <button
                className="toast-x"
                onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      </Portal>
    </ToastContext.Provider>
  );
}
