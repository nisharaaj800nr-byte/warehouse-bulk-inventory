/* Base design-system components: buttons, fields, cards, stats, misc. */
import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertTriangle } from 'lucide-react';
import { cx } from '../lib/utils';
import { translate } from '../lib/i18n';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  icon,
  children,
  className,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const iconOnly = !children && !!icon;
  return (
    <button
      type={type}
      className={cx('btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, iconOnly && 'btn-icon', className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner size={size === 'sm' ? 12 : 14} /> : icon}
      {typeof children === 'string' ? translate(children) : children}
    </button>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />;
}

export function Field({
  label,
  error,
  hint,
  span2,
  children,
}: {
  label?: string;
  error?: string;
  hint?: string;
  span2?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cx('field', span2 && 'span2')}>
      {label && <label className="label">{translate(label)}</label>}
      {children}
      {error ? <div className="field-error">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

export function Input({
  className,
  invalid,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={cx('input', invalid && 'invalid', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('textarea', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx('select', className)} {...rest}>
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) {
  return (
    <label className="checkbox">
      <input type="checkbox" {...rest} />
      {label}
    </label>
  );
}

export function Switch({
  label,
  checked,
  onChange,
  disabled,
}: {
  label?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch-track" />
      {label && <span>{label}</span>}
    </label>
  );
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'brand';
  children: ReactNode;
}) {
  return <span className={cx('badge', tone !== 'neutral' && `badge-${tone}`)}>{children}</span>;
}

export function Card({
  title,
  actions,
  children,
  foot,
  className,
  bodyClassName,
  noBody,
  paddedHeader,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  foot?: ReactNode;
  className?: string;
  bodyClassName?: string;
  noBody?: boolean;
  paddedHeader?: boolean;
}) {
  const hasHead = title !== undefined || actions !== undefined;
  return (
    <div className={cx('card', className)}>
      {hasHead && (
        <div className="card-head" style={paddedHeader ? undefined : { padding: '11px 14px' }}>
          <div className="card-title">{typeof title === 'string' ? translate(title) : title}</div>
          {actions}
        </div>
      )}
      {noBody ? children : <div className={cx('card-body', bodyClassName)}>{children}</div>}
      {foot && <div className="card-foot">{foot}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  tone = 'brand',
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: 'brand' | 'warn' | 'danger';
  icon?: ReactNode;
}) {
  return (
    <div className={cx('stat', tone === 'warn' && 'warn', tone === 'danger' && 'danger')}>
      <div className="grow">
        <div className="stat-label">{translate(label)}</div>
        <div className="stat-value">{value}</div>
        {sub && <div className="stat-sub">{translate(sub)}</div>}
      </div>
      {icon && <div className="stat-icon">{icon}</div>}
    </div>
  );
}

export function Skeleton({
  w,
  h = 14,
  className,
}: {
  w?: number | string;
  h?: number | string;
  className?: string;
}) {
  return <div className={cx('skeleton', className)} style={{ width: w ?? '100%', height: h }} />;
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <div className="empty-title">{translate(title)}</div>
      {hint && <div>{translate(hint)}</div>}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  );
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-panel" role="alert">
      <span className="row" style={{ gap: 8 }}>
        <AlertTriangle size={16} />
        <span>{message}</span>
      </span>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function PageHeader({
  subtitle,
  actions,
}: {
  /** Kept for call-site compatibility; the shell topbar renders the page title. */
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      {subtitle ? <div className="page-sub">{translate(subtitle)}</div> : <span />}
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>;
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: ReactNode }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          className={cx('tab', active === t.key && 'active')}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
