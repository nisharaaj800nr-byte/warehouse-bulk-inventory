import type { ComponentType } from 'react';
import {
  ArrowRightLeft,
  Bell,
  Boxes,
  Database,
  FileText,
  History,
  KeyRound,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Upload,
} from 'lucide-react';
import type { Role } from '../lib/api';

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number | string; className?: string }>;
  min?: Role;
  end?: boolean;
}

export interface NavGroup {
  group: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    group: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    group: 'Operations',
    items: [
      { to: '/inventory', label: 'Inventory', icon: Boxes },
      { to: '/imports', label: 'Imports', icon: Upload },
      { to: '/labels', label: 'Labels', icon: Tag },
      { to: '/reports', label: 'Reports', icon: FileText },
    ],
  },
  {
    group: 'Configuration',
    items: [
      { to: '/sources', label: 'Sources', icon: Database },
      { to: '/mapping', label: 'Field Mapping', icon: ArrowRightLeft },
      { to: '/rules', label: 'Rules', icon: SlidersHorizontal },
      { to: '/alerts', label: 'Alerts', icon: Bell },
    ],
  },
  {
    group: 'Administration',
    items: [
      { to: '/users', label: 'Users & Security', icon: ShieldCheck, min: 'ADMIN' },
      { to: '/sessions', label: 'Sessions & Audit', icon: KeyRound, min: 'ADMIN' },
      { to: '/activity', label: 'Activity & Audit', icon: History },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
  {
    group: 'Tools',
    items: [{ to: '/assistant', label: 'AI Assistant', icon: Sparkles }],
  },
];
