import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/tiles.dart';

Map<String, String> normalizeRow(dynamic r) {
  if (r is! Map) return <String, String>{};
  return {
    for (final e in r.entries) '${e.key}': e.value == null ? '' : '${e.value}',
  };
}

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  List<Map<String, String>> _reports = [];
  bool _loading = true;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final appState = context.read<AppState>();
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final data = await appState.api.call('reports.list');
      if (!mounted) return;
      setState(() {
        _reports = [for (final r in (data as List? ?? const [])) normalizeRow(r)];
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = stripApiCode(e.message);
        _loading = false;
      });
    }
  }

  Future<void> _generate(Map<String, String> row) async {
    final appState = context.read<AppState>();
    final fields = await showDialog<Map<String, String>>(
      context: context,
      builder: (ctx) => _SimpleFormDialog(
        title: 'Generate — ${row['Report Name'] ?? ''}',
        initial: {
          'Filter Field': row['Filter Field'] ?? '',
          'Filter Value': row['Filter Value'] ?? '',
          'Report Columns': row['Report Columns'] ?? '',
        },
        confirmLabel: 'Generate',
      ),
    );
    if (fields == null || !mounted) return;
    try {
      final res = await appState.api.call('reports.generate', {
        'name': row['Report Name'] ?? '',
        'filterField': fields['Filter Field'] ?? '',
        'filterValue': fields['Filter Value'] ?? '',
        'columns': fields['Report Columns'] ?? '',
      });
      if (!mounted) return;
      final map = res is Map ? res : const {};
      showAppSnack(context, 'Report "${map['report'] ?? ''}" generated — ${map['rows'] ?? 0} rows.', tone: 'ok');
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    }
  }

  Future<void> _edit(Map<String, String>? row) async {
    final appState = context.read<AppState>();
    final fields = await showDialog<Map<String, String>>(
      context: context,
      builder: (ctx) => _SimpleFormDialog(
        title: row == null ? 'New report' : 'Edit report',
        initial: {
          'Report Name': row?['Report Name'] ?? '',
          'Filter Field': row?['Filter Field'] ?? '',
          'Filter Value': row?['Filter Value'] ?? '',
          'Report Columns': row?['Report Columns'] ?? '',
        },
        confirmLabel: row == null ? 'Create' : 'Save',
      ),
    );
    if (fields == null || !mounted) return;
    try {
      await appState.api.call('reports.save', {
        'name': fields['Report Name'] ?? '',
        'filterField': fields['Filter Field'] ?? '',
        'filterValue': fields['Filter Value'] ?? '',
        'columns': fields['Report Columns'] ?? '',
      });
      if (!mounted) return;
      showAppSnack(context, 'Report saved.', tone: 'ok');
      _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    }
  }

  Future<void> _delete(Map<String, String> row) async {
    final appState = context.read<AppState>();
    final ok = await confirmDialog(
      context,
      title: 'Delete report',
      message: 'Delete report definition "${row['Report Name'] ?? ''}"?',
      confirmLabel: 'Delete',
      danger: true,
    );
    if (!ok || !mounted) return;
    try {
      await appState.api.call('reports.delete', {'name': row['Report Name'] ?? ''});
      if (!mounted) return;
      showAppSnack(context, 'Report deleted.', tone: 'ok');
      _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    }
  }

  Future<void> _exportAll() async {
    final appState = context.read<AppState>();
    final ok = await confirmDialog(
      context,
      title: 'Export all reports',
      message: 'Rebuild every active report sheet from the current inventory data?',
      confirmLabel: 'Export',
    );
    if (!ok || !mounted) return;
    try {
      await appState.api.call('reports.exportToSheet');
      if (!mounted) return;
      showAppSnack(context, 'All reports exported to sheets.', tone: 'ok');
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    }
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final ac = appColors(context);
    final canAdmin = appState.hasRole('ADMIN');
    final canManage = appState.hasRole('MANAGER');

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PageHeader(
            title: 'Reports',
            subtitle: 'Report definitions and generation.',
            actions: [
              OutlinedButton.icon(
                onPressed: _loading ? null : _load,
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text('Refresh'),
              ),
              if (canManage)
                OutlinedButton.icon(
                  onPressed: _exportAll,
                  icon: const Icon(Icons.grid_on, size: 16),
                  label: const Text('Export all'),
                ),
              if (canAdmin)
                FilledButton.icon(
                  onPressed: () => _edit(null),
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('New report'),
                ),
            ],
          ),
          if (_loading)
            const LoadingBox(label: 'Loading reports…')
          else if (_error.isNotEmpty)
            ErrorBox(message: _error, onRetry: _load)
          else if (_reports.isEmpty)
            const EmptyState(title: 'No reports yet', hint: 'Create your first report definition.')
          else
            for (final row in _reports)
              ObjectTile(
                title: row['Report Name'] ?? '(unnamed)',
                subtitle: [
                  if ((row['Filter Field'] ?? '').isNotEmpty)
                    '${row['Filter Field']}=${row['Filter Value']}',
                  if ((row['Report Columns'] ?? '').isNotEmpty) row['Report Columns'],
                ].join('  ·  '),
                badges: [
                  ToneBadge(row['Active'] ?? '—', tone: row['Active'] == 'ON' ? 'ok' : 'neutral'),
                ],
                menuBuilder: (ctx) => [
                  if (canManage)
                    const PopupMenuItem(value: 'generate', child: Text('Generate now')),
                  if (canAdmin)
                    const PopupMenuItem(value: 'edit', child: Text('Edit')),
                  if (canAdmin)
                    PopupMenuItem(
                      value: 'delete',
                      child: Text('Delete', style: TextStyle(color: ac.danger)),
                    ),
                ],
                onAction: (a) {
                  if (a == 'generate') _generate(row);
                  if (a == 'edit') _edit(row);
                  if (a == 'delete') _delete(row);
                },
              ),
        ],
      ),
    );
  }
}

class _SimpleFormDialog extends StatefulWidget {
  final String title;
  final Map<String, String> initial;
  final String confirmLabel;

  const _SimpleFormDialog({required this.title, required this.initial, required this.confirmLabel});

  @override
  State<_SimpleFormDialog> createState() => _SimpleFormDialogState();
}

class _SimpleFormDialogState extends State<_SimpleFormDialog> {
  late final Map<String, TextEditingController> _ctls;

  @override
  void initState() {
    super.initState();
    _ctls = {
      for (final e in widget.initial.entries) e.key: TextEditingController(text: e.value),
    };
  }

  @override
  void dispose() {
    for (final c in _ctls.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
      content: SizedBox(
        width: 480,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final e in _ctls.entries)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: TextField(controller: e.value, decoration: InputDecoration(labelText: e.key)),
                ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(
          onPressed: () => Navigator.of(context).pop({
            for (final e in _ctls.entries) e.key: e.value.text,
          }),
          child: Text(widget.confirmLabel),
        ),
      ],
    );
  }
}
