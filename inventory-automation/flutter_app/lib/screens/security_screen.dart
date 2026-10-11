import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/tiles.dart';

class SecurityScreen extends StatefulWidget {
  const SecurityScreen({super.key});

  @override
  State<SecurityScreen> createState() => _SecurityScreenState();
}

class _SecurityScreenState extends State<SecurityScreen> {
  List<Map<String, String>> _rows = [];
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
      final data = await appState.api.call('security.list');
      if (!mounted) return;
      setState(() {
        _rows = [
          for (final r in (data as List? ?? const []))
            {
              for (final e in (r as Map).entries) '${e.key}': e.value == null ? '' : '${e.value}',
            },
        ];
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

  String _sheetKey(Map<String, String> row) {
    final keys = row.keys.toList();
    for (final k in keys) {
      if (k.toLowerCase().contains('sheet')) return k;
    }
    return keys.isNotEmpty ? keys.first : '';
  }

  Future<void> _act(String sheet, bool unlock) async {
    final appState = context.read<AppState>();
    final ok = await confirmDialog(
      context,
      title: unlock ? 'Unlock sheet' : 'Relock sheet',
      message: unlock
          ? 'Remove protection from "$sheet"? Unlock sirf maintenance ke liye karein.'
          : 'Re-apply protection to "$sheet"?',
      confirmLabel: unlock ? 'Unlock' : 'Relock',
      danger: unlock,
    );
    if (!ok || !mounted) return;
    try {
      await appState.api.call(unlock ? 'security.unlock' : 'security.lock', {'sheet': sheet});
      if (!mounted) return;
      showAppSnack(context, unlock ? 'Sheet unlocked.' : 'Sheet relocked.', tone: 'ok');
      _load();
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

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PageHeader(
            title: 'Security',
            subtitle: 'Sheet protections — unlock only for maintenance, relock after.',
            actions: [
              OutlinedButton.icon(
                onPressed: _loading ? null : _load,
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text('Refresh'),
              ),
            ],
          ),
          if (_loading)
            const LoadingBox(label: 'Loading security config…')
          else if (_error.isNotEmpty)
            ErrorBox(message: _error, onRetry: _load)
          else if (_rows.isEmpty)
            const EmptyState(title: 'No security configuration')
          else
            for (final row in _rows)
              ObjectTile(
                title: row[_sheetKey(row)] ?? '',
                subtitle: [
                  for (final e in row.entries)
                    if (e.key != _sheetKey(row)) '${e.key}: ${e.value}',
                ].join('  ·  '),
                badges: [
                  ToneBadge(
                    (row['Access'] ?? row['Mode'] ?? '').isNotEmpty ? (row['Access'] ?? row['Mode'])! : '—',
                    tone: (row['Access'] ?? row['Mode'] ?? '').toString().toUpperCase().contains('LOCK') ? 'ok' : 'warn',
                  ),
                ],
                menuBuilder: (ctx) => [
                  if (canAdmin) const PopupMenuItem(value: 'unlock', child: Text('Unlock')),
                  if (canAdmin)
                    PopupMenuItem(
                      value: 'lock',
                      child: Text('Relock', style: TextStyle(color: ac.danger)),
                    ),
                ],
                onAction: (a) {
                  final sheet = row[_sheetKey(row)] ?? '';
                  if (a == 'unlock') _act(sheet, true);
                  if (a == 'lock') _act(sheet, false);
                },
              ),
        ],
      ),
    );
  }
}
