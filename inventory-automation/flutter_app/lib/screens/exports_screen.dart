import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/common.dart';

class ExportsScreen extends StatefulWidget {
  const ExportsScreen({super.key});

  @override
  State<ExportsScreen> createState() => _ExportsScreenState();
}

class _ExportsScreenState extends State<ExportsScreen> {
  int? _invCount;
  List<String> _headers = [];
  bool _loading = true;
  String _error = '';
  final List<Map<String, String>> _log = [];

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
      final data = await appState.api.call('inventory.list', {'page': 1, 'perPage': 25});
      final map = Map<String, dynamic>.from(data as Map);
      if (!mounted) return;
      setState(() {
        _invCount = (map['total'] as num?)?.toInt() ?? 0;
        _headers = ((map['headers'] as List?) ?? const []).map((h) => '$h').toList();
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

  Future<void> _exportCsv() async {
    final appState = context.read<AppState>();
    try {
      final res = await appState.api.call('inventory.export', {'columns': _headers.join(',')});
      if (!mounted) return;
      final csv = res is Map ? '${res['csv'] ?? ''}' : '';
      final rows = res is Map ? (res['rows'] ?? 0) : 0;
      await Clipboard.setData(ClipboardData(text: csv));
      setState(() {
        _log.insert(0, {
          'time': TimeOfDay.now().format(context),
          'format': 'CSV',
          'name': 'inventory.csv',
          'status': 'OK',
        });
      });
      if (!mounted) return;
      showAppSnack(context, 'Exported $rows rows — CSV clipboard me copy ho gaya.', tone: 'ok');
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    }
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final ac = appColors(context);
    final canManage = appState.hasRole('MANAGER');

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const PageHeader(
            title: 'Exports',
            subtitle: 'Export the current Inventory dataset. CSV copies to clipboard (paste into Excel/Sheets).',
          ),
          if (_loading)
            const LoadingBox(label: 'Loading…')
          else if (_error.isNotEmpty)
            ErrorBox(message: _error, onRetry: _load)
          else ...[
            ResponsiveGrid(
              minItemWidth: 240,
              children: [
                StatCard(
                  label: 'Inventory',
                  value: '${_invCount ?? 0}',
                  sub: 'rows ready to export',
                  icon: Icons.inventory_2_outlined,
                ),
                const StatCard(
                  label: 'CSV',
                  value: 'Ready',
                  sub: 'clipboard copy',
                  tone: 'ok',
                  icon: Icons.check_circle_outline,
                ),
                const StatCard(
                  label: 'PDF / Excel',
                  value: 'Backend',
                  sub: 'reports se generate karein',
                  tone: 'warn',
                  icon: Icons.description_outlined,
                ),
              ],
            ),
            const SizedBox(height: 16),
            SectionCard(
              title: 'Export actions',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      FilledButton.icon(
                        onPressed: canManage ? _exportCsv : null,
                        icon: const Icon(Icons.download, size: 16),
                        label: const Text('Export CSV'),
                      ),
                    ],
                  ),
                  if (!canManage)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        'Export needs MANAGER+ role.',
                        style: TextStyle(fontSize: 12.5, color: ac.muted),
                      ),
                    ),
                ],
              ),
            ),
            if (_log.isNotEmpty) ...[
              const SizedBox(height: 16),
              SectionCard(
                title: 'Export log',
                bodyPadding: EdgeInsets.zero,
                child: SimpleTable(
                  headers: const ['Time', 'Format', 'File', 'Status'],
                  rows: [
                    for (final l in _log) [l['time'] ?? '', l['format'] ?? '', l['name'] ?? '', l['status'] ?? ''],
                  ],
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }
}
