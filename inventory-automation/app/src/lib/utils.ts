/* Small shared utilities: class names, roles, formatting, downloads, theme. */
import { useCallback, useEffect, useState } from 'react';
import type { Role } from './api';

export type ClassValue = string | false | null | undefined;

export function cx(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(' ');
}

const ROLE_LEVEL: Record<Role, number> = {
  VIEWER: 0,
  OPERATOR: 1,
  MANAGER: 2,
  ADMIN: 3,
  OWNER: 4,
};

export function hasRole(role: Role | '' | null | undefined, min: Role): boolean {
  if (!role) return false;
  return (ROLE_LEVEL[role] ?? 0) >= (ROLE_LEVEL[min] ?? 0);
}

export function initials(email: string): string {
  const name = (email || '').split('@')[0] || '?';
  const parts = name.split(/[._-]+/).filter(Boolean);
  const a = parts[0]?.[0] ?? '?';
  const b = parts.length > 1 ? parts[1][0] : '';
  return (a + b).toUpperCase();
}

export function fmtDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const d = value instanceof Date ? value : new Date(String(value));
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const d = value instanceof Date ? value : new Date(String(value));
  if (isNaN(d.getTime())) return String(value);
  return (
    d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob(['\uFEFF' + text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return v;
}

/* ---------------- theme ---------------- */

export type Theme = 'light' | 'dark';
const THEME_KEY = 'ors.theme';

export function initTheme(): void {
  const stored = localStorage.getItem(THEME_KEY);
  const theme: Theme = stored === 'dark' ? 'dark' : 'light';
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'),
  );
  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, next);
      document.documentElement.classList.toggle('dark', next === 'dark');
      return next;
    });
  }, []);
  return { theme, toggle };
}

/* ---------------- data helpers ---------------- */

export const TARGET_FIELDS = [
  'BARCODE', 'MODEL', 'BRAND', 'CATEGORY', 'MOD_AGE', 'STOCK_AGE', 'STATUS',
  'LOCATION', 'BIN_BUCKET', 'PRIORITY', 'SOURCE', 'SERIAL', 'MRP',
];

export function toRowObjects(headers: string[], data: unknown[][]): Record<string, string>[] {
  return data.map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => {
      const v = r[i];
      o[h] = v === null || v === undefined ? '' : String(v);
    });
    return o;
  });
}
