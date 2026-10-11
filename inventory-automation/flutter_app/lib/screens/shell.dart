import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'activity_screen.dart';
import 'alerts_screen.dart';
import 'assistant_screen.dart';
import 'builder_screen.dart';
import 'dashboard_screen.dart';
import 'email_screen.dart';
import 'exports_screen.dart';
import 'health_screen.dart';
import 'help_screen.dart';
import 'history_screen.dart';
import 'import_screen.dart';
import 'inventory_screen.dart';
import 'labels_screen.dart';
import 'mapping_screen.dart';
import 'multisource_screen.dart';
import 'processing_screen.dart';
import 'quality_screen.dart';
import 'reports_screen.dart';
import 'rules_screen.dart';
import 'schedules_screen.dart';
import 'security_screen.dart';
import 'settings_screen.dart';
import 'sources_screen.dart';
import 'templates_screen.dart';
import 'trends_screen.dart';
import 'users_screen.dart';

class NavItem {
  final String label;
  final IconData icon;
  final String? minRole;
  final Widget Function() build;

  const NavItem({required this.label, required this.icon, this.minRole, required this.build});
}

class NavGroup {
  final String label;
  final List<NavItem> items;

  const NavGroup(this.label, this.items);
}

/// Navigation — purani Control Center UI wali exact 26 screens.
final List<NavGroup> navGroups = [
  NavGroup('Main', [
    NavItem(label: 'Dashboard', icon: Icons.dashboard_outlined, build: () => const DashboardScreen()),
    NavItem(label: 'Data Sources', icon: Icons.storage_outlined, minRole: 'MANAGER', build: () => const SourcesScreen()),
    NavItem(label: 'Import Data', icon: Icons.upload_file_outlined, minRole: 'OPERATOR', build: () => const ImportScreen()),
    NavItem(label: 'Multi-Source Import', icon: Icons.call_merge_outlined, minRole: 'OPERATOR', build: () => const MultiSourceScreen()),
    NavItem(label: 'Field Mapping', icon: Icons.swap_horiz_outlined, minRole: 'ADMIN', build: () => const MappingScreen()),
    NavItem(label: 'Inventory', icon: Icons.inventory_2_outlined, build: () => const InventoryScreen()),
  ]),
  NavGroup('Business', [
    NavItem(label: 'Rules', icon: Icons.tune_outlined, minRole: 'ADMIN', build: () => const RulesScreen()),
    NavItem(label: 'Reports', icon: Icons.description_outlined, minRole: 'MANAGER', build: () => const ReportsScreen()),
    NavItem(label: 'Report Templates', icon: Icons.dashboard_customize_outlined, minRole: 'MANAGER', build: () => const TemplatesScreen()),
    NavItem(label: 'Report Builder', icon: Icons.build_outlined, minRole: 'MANAGER', build: () => const BuilderScreen()),
    NavItem(label: 'Alerts', icon: Icons.notifications_outlined, minRole: 'MANAGER', build: () => const AlertsScreen()),
  ]),
  NavGroup('Operations', [
    NavItem(label: 'Ageing Trends', icon: Icons.trending_up, build: () => const TrendsScreen()),
    NavItem(label: 'Labels & QR', icon: Icons.qr_code_2_outlined, minRole: 'OPERATOR', build: () => const LabelsScreen()),
    NavItem(label: 'Schedules', icon: Icons.schedule_outlined, minRole: 'ADMIN', build: () => const SchedulesScreen()),
    NavItem(label: 'Email Settings', icon: Icons.mail_outline, minRole: 'ADMIN', build: () => const EmailScreen()),
    NavItem(label: 'Exports', icon: Icons.download_outlined, minRole: 'MANAGER', build: () => const ExportsScreen()),
    NavItem(label: 'Processing', icon: Icons.play_circle_outline, minRole: 'OPERATOR', build: () => const ProcessingScreen()),
  ]),
  NavGroup('Monitoring', [
    NavItem(label: 'Processing History', icon: Icons.history_outlined, build: () => const HistoryScreen()),
    NavItem(label: 'Data Quality', icon: Icons.fact_check_outlined, build: () => const QualityScreen()),
    NavItem(label: 'Activity Log', icon: Icons.receipt_long_outlined, minRole: 'MANAGER', build: () => const ActivityScreen()),
    NavItem(label: 'Security', icon: Icons.lock_outline, minRole: 'ADMIN', build: () => const SecurityScreen()),
    NavItem(label: 'Users & Roles', icon: Icons.admin_panel_settings_outlined, minRole: 'ADMIN', build: () => const UsersScreen()),
    NavItem(label: 'AI Command Center', icon: Icons.auto_awesome_outlined, minRole: 'OPERATOR', build: () => const AssistantScreen()),
    NavItem(label: 'System Health', icon: Icons.monitor_heart_outlined, build: () => const HealthScreen()),
  ]),
  NavGroup('System', [
    NavItem(label: 'Settings', icon: Icons.settings_outlined, minRole: 'ADMIN', build: () => const SettingsScreen()),
    NavItem(label: 'Help', icon: Icons.help_outline, build: () => const HelpScreen()),
  ]),
];

String _initials(String email) {
  final name = email.split('@').first;
  final parts = name.split(RegExp(r'[._-]+')).where((p) => p.isNotEmpty).toList();
  final a = parts.isNotEmpty ? parts[0][0] : '?';
  final b = parts.length > 1 ? parts[1][0] : '';
  return (a + b).toUpperCase();
}

const Color _sideBg = Color(0xFFFFFFFF);
const Color _sideText = Color(0xFF3B4A5C);
const Color _sideMuted = Color(0xFF7C8DA0);
const Color _sideActive = Color(0xFF00CCC9);
const Color _sideLine = Color(0xFFE6ECF2);
const Color _sideGroup = Color(0xFF8CA0B3);
const Color _onAccent = Color(0xFF07302E);

class Shell extends StatefulWidget {
  const Shell({super.key});

  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int _index = 0;
  bool _collapsed = false;

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final wide = MediaQuery.sizeOf(context).width >= 1000;

    final groups = <NavGroup>[];
    final flat = <NavItem>[];
    for (final g in navGroups) {
      final vis = g.items.where((it) => it.minRole == null || appState.hasRole(it.minRole!)).toList();
      if (vis.isEmpty) continue;
      groups.add(NavGroup(g.label, vis));
      flat.addAll(vis);
    }
    if (_index >= flat.length) _index = 0;
    final current = flat.isEmpty ? null : flat[_index];

    final content = current == null
        ? const EmptyState(title: 'No screens available')
        : KeyedSubtree(key: ValueKey(current.label), child: current.build());

    if (wide) {
      return Scaffold(
        body: Row(
          children: [
            _SidebarNav(
              groups: groups,
              selectedIndex: _index,
              collapsed: _collapsed,
              showToggle: true,
              appState: appState,
              onToggle: () => setState(() => _collapsed = !_collapsed),
              onSelect: (i) => setState(() => _index = i),
            ),
            Expanded(
              child: Column(
                children: [
                  _TopBar(title: current?.label ?? 'Warehouse Bulk Inventory', appState: appState, wide: true),
                  Expanded(child: content),
                ],
              ),
            ),
          ],
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(current?.label ?? 'Warehouse Bulk Inventory'),
        actions: [
          IconButton.outlined(
            tooltip: appState.darkMode ? 'Light theme' : 'Dark theme',
            icon: Icon(appState.darkMode ? Icons.light_mode_outlined : Icons.dark_mode_outlined, size: 18),
            onPressed: () => appState.setDarkMode(!appState.darkMode),
          ),
          const SizedBox(width: 10),
          _UserMenu(appState: appState, wide: false),
          const SizedBox(width: 8),
        ],
      ),
      drawer: Drawer(
        backgroundColor: _sideBg,
        width: 276,
        child: _SidebarNav(
          groups: groups,
          selectedIndex: _index,
          collapsed: false,
          showToggle: false,
          appState: appState,
          onToggle: null,
          onSelect: (i) {
            setState(() => _index = i);
            Navigator.of(context).pop();
          },
        ),
      ),
      body: content,
    );
  }
}

class _SidebarNav extends StatelessWidget {
  final List<NavGroup> groups;
  final int selectedIndex;
  final bool collapsed;
  final bool showToggle;
  final AppState appState;
  final VoidCallback? onToggle;
  final void Function(int index) onSelect;

  const _SidebarNav({
    required this.groups,
    required this.selectedIndex,
    required this.collapsed,
    required this.showToggle,
    required this.appState,
    required this.onToggle,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    var gi = 0;
    final children = <Widget>[];
    for (var g = 0; g < groups.length; g++) {
      final group = groups[g];
      if (g > 0) {
        children.add(
          Container(
            height: 1,
            margin: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            color: _sideLine,
          ),
        );
      }
      children.add(
        Padding(
          padding: EdgeInsets.fromLTRB(collapsed ? 0 : 18, 8, collapsed ? 0 : 18, 4),
          child: Text(
            collapsed ? '•' : group.label.toUpperCase(),
            textAlign: collapsed ? TextAlign.center : TextAlign.start,
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: .6,
              color: _sideGroup,
            ),
          ),
        ),
      );
      for (final it in group.items) {
        final idx = gi++;
        children.add(
          _NavTile(
            item: it,
            selected: idx == selectedIndex,
            collapsed: collapsed,
            onTap: () => onSelect(idx),
          ),
        );
      }
    }

    final email = appState.session?.email ?? '';
    final role = appState.session?.role ?? '';
    final demo = appState.demoMode;

    return Container(
      width: collapsed ? 68 : 248,
      color: _sideBg,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(14, 13, 10, 13),
            decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: _sideLine))),
            child: Column(
              children: [
                Row(
                  children: [
                    Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(9),
                        gradient: const LinearGradient(colors: [Color(0xFF00CCC9), Color(0xFF00A8A5)]),
                      ),
                      child: const Center(
                        child: Text(
                          'WB',
                          style: TextStyle(color: _onAccent, fontWeight: FontWeight.w800, fontSize: 14),
                        ),
                      ),
                    ),
                    if (!collapsed) ...[
                      const SizedBox(width: 10),
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Warehouse Bulk Inventory',
                              maxLines: 2,
                              style: TextStyle(fontSize: 13, height: 1.15, fontWeight: FontWeight.w700, color: Color(0xFF1B2A3A)),
                            ),
                            SizedBox(height: 2),
                            Text('Control Center', style: TextStyle(fontSize: 10.5, color: _sideMuted)),
                          ],
                        ),
                      ),
                      if (showToggle)
                        IconButton(
                          tooltip: 'Collapse',
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(minWidth: 30, minHeight: 30),
                          icon: const Icon(Icons.chevron_left, size: 19, color: _sideMuted),
                          onPressed: onToggle,
                        ),
                    ],
                  ],
                ),
                if (collapsed && showToggle) ...[
                  const SizedBox(height: 6),
                  IconButton(
                    tooltip: 'Expand',
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(minWidth: 30, minHeight: 30),
                    icon: const Icon(Icons.chevron_right, size: 19, color: _sideMuted),
                    onPressed: onToggle,
                  ),
                ],
              ],
            ),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
              children: children,
            ),
          ),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: const BoxDecoration(border: Border(top: BorderSide(color: _sideLine))),
            child: collapsed
                ? Column(
                    children: [
                      Container(
                        width: 9,
                        height: 9,
                        decoration: BoxDecoration(
                          color: demo ? const Color(0xFFFFC107) : const Color(0xFF34C759),
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(height: 10),
                      _avatar(email),
                    ],
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: demo ? const Color(0x26FFC107) : const Color(0x2E1E8E3E),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                color: demo ? const Color(0xFFFFC107) : const Color(0xFF34C759),
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 7),
                            Text(
                              demo ? 'DEMO MODE' : 'LIVE',
                              style: TextStyle(
                                fontSize: 10.5,
                                fontWeight: FontWeight.w700,
                                letterSpacing: .4,
                                color: demo ? const Color(0xFFB26A00) : const Color(0xFF1E8E3E),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          _avatar(email),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  email,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 12.5, color: Color(0xFF1B2A3A)),
                                ),
                                const SizedBox(height: 1),
                                Text(
                                  role,
                                  style: const TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: .5,
                                    color: Color(0xFFB26A00),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget _avatar(String email) => Container(
        width: 34,
        height: 34,
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
          gradient: LinearGradient(colors: [Color(0xFF34C759), Color(0xFF1E8E3E)]),
        ),
        child: Center(
          child: Text(
            _initials(email),
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12),
          ),
        ),
      );
}

class _NavTile extends StatelessWidget {
  final NavItem item;
  final bool selected;
  final bool collapsed;
  final VoidCallback onTap;

  const _NavTile({required this.item, required this.selected, required this.collapsed, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final fg = selected ? _onAccent : _sideText;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        hoverColor: const Color(0xFFEDF3F8),
        child: Container(
          padding: EdgeInsets.symmetric(horizontal: collapsed ? 0 : 12, vertical: 9),
          decoration: BoxDecoration(
            color: selected ? _sideActive : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            mainAxisAlignment: collapsed ? MainAxisAlignment.center : MainAxisAlignment.start,
            children: [
              Icon(item.icon, size: 18, color: fg),
              if (!collapsed) ...[
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    item.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 13.5,
                      fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                      color: fg,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  final String title;
  final AppState appState;
  final bool wide;

  const _TopBar({required this.title, required this.appState, required this.wide});

  @override
  Widget build(BuildContext context) {
    final ac = appColors(context);
    return Container(
      height: 60,
      padding: const EdgeInsets.symmetric(horizontal: 22),
      decoration: BoxDecoration(
        color: ac.surface,
        border: Border(bottom: BorderSide(color: ac.line)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: ac.ink),
            ),
          ),
          IconButton.outlined(
            tooltip: appState.darkMode ? 'Light theme' : 'Dark theme',
            icon: Icon(appState.darkMode ? Icons.light_mode_outlined : Icons.dark_mode_outlined, size: 18),
            onPressed: () => appState.setDarkMode(!appState.darkMode),
          ),
          const SizedBox(width: 10),
          _UserMenu(appState: appState, wide: wide),
        ],
      ),
    );
  }
}

class _UserMenu extends StatelessWidget {
  final AppState appState;
  final bool wide;

  const _UserMenu({required this.appState, required this.wide});

  @override
  Widget build(BuildContext context) {
    final ac = appColors(context);
    final email = appState.session?.email ?? '';
    final role = appState.session?.role ?? '';
    return PopupMenuButton<String>(
      tooltip: 'Account',
      onSelected: (v) {
        if (v == 'logout') appState.logout();
      },
      itemBuilder: (ctx) => [
        PopupMenuItem<String>(
          enabled: false,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(email, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: ac.ink)),
              const SizedBox(height: 2),
              Text(role, style: TextStyle(fontSize: 11, color: ac.muted)),
            ],
          ),
        ),
        const PopupMenuDivider(),
        const PopupMenuItem<String>(
          value: 'logout',
          child: Row(
            children: [
              Icon(Icons.logout, size: 16),
              SizedBox(width: 8),
              Text('Sign out'),
            ],
          ),
        ),
      ],
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
        child: Row(
          children: [
            Container(
              width: 30,
              height: 30,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: ac.brandStrong.withValues(alpha: .13),
              ),
              child: Center(
                child: Text(
                  _initials(email),
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: ac.brandStrong),
                ),
              ),
            ),
            if (wide) ...[
              const SizedBox(width: 8),
              Text(email, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: ac.ink)),
            ],
          ],
        ),
      ),
    );
  }
}
