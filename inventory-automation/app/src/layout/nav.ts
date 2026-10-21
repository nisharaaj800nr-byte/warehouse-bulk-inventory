import type { ComponentType } from 'react';
import {
  ArrowRightLeft,
  Activity,
  Bell,
  Boxes,
  Clock,
  Database,
  Download,
  FileText,
  Files,
  Gauge,
  HelpCircle,
  History,
  KeyRound,
  Layers,
  LayoutDashboard,
  PlayCircle,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tag,
  TrendingUp,
  Truck,
  Upload,
  Users,
  Wrench,
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
      { to: '/sources', label: 'Data Sources', icon: Database },
      { to: '/imports', label: 'Import Data', icon: Upload, end: true },
      { to: '/imports/multi', label: 'Multisource', icon: Layers },
      { to: '/mapping', label: 'Field Mapping', icon: ArrowRightLeft },
      { to: '/inventory', label: 'Inventory', icon: Boxes },
      { to: '/rules', label: 'Rules', icon: SlidersHorizontal },
      { to: '/reports', label: 'Reports', icon: FileText, end: true },
      { to: '/report-templates', label: 'Report Templates', icon: Files },
      { to: '/report-builder', label: 'Report Builder', icon: Wrench },
      { to: '/alerts', label: 'Alerts', icon: Bell },
      { to: '/ageing', label: 'Ageing Trends', icon: TrendingUp },
      { to: '/labels', label: 'Labels', icon: Tag },
      { to: '/scheduled', label: 'Schedules', icon: Clock, min: 'MANAGER' },
      { to: '/exports', label: 'Exports', icon: Download },
      { to: '/purchasing', label: 'Purchasing', icon: Truck, min: 'MANAGER' },
    ],
  },
  {
    group: 'Administration',
    items: [
      { to: '/users', label: 'Users & Roles', icon: Users, min: 'ADMIN' },
      { to: '/security', label: 'Security', icon: ShieldCheck, min: 'ADMIN' },
      { to: '/sessions', label: 'Sessions & Audit', icon: KeyRound, min: 'ADMIN' },
      { to: '/activity-log', label: 'Activity Log', icon: Activity, min: 'MANAGER' },
      { to: '/processing', label: 'Processing', icon: PlayCircle, min: 'OPERATOR', end: true },
      { to: '/processing-history', label: 'Processing History', icon: History, min: 'MANAGER' },
      { to: '/data-quality', label: 'Data Quality', icon: Gauge, min: 'MANAGER' },
      { to: '/system-health', label: 'System Health', icon: ShieldCheck, min: 'ADMIN' },
      { to: '/email-settings', label: 'Email Settings', icon: FileText, min: 'ADMIN' },
      { to: '/settings', label: 'Settings', icon: Settings, min: 'ADMIN' },
    ],
  },
  {
    group: 'Tools',
    items: [
      { to: '/assistant', label: 'AI Command Center', icon: Sparkles, min: 'OPERATOR' },
      { to: '/help', label: 'Help', icon: HelpCircle },
    ],
  },
];
