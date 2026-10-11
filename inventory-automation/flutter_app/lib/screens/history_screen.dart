import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../state.dart';
import '../widgets/common.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  Map<String, dynamic>? _data;
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
      final data = await appState.api.call('history.list');
      if (!mounted) return;
      setState(() {
        _data = Map<String, dynamic>.from(data as Map);
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

  @override
  Widget build(BuildContext context) {
    final headers = ((_data?['headers'] as List?) ?? const []).map((h) => '$h').toList();
    final raw = (_data?['data'] as List?) ?? const [];
    final rows = <List<String>>[
      for (final r in raw)
        if (r is List) r.map((c) => c == null ? '' : '$c').toList() else ['$r'],
    ];
    final latest = rows.reversed.take(300).toList();

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          PageHeader(
            title: 'Processing History',
            subtitle: 'Every pipeline run with timing, counts and status.',
            actions: [
              OutlinedButton.icon(
                onPressed: _loading ? null : _load,
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text('Refresh'),
              ),
            ],
          ),
          if (_loading)
            const LoadingBox(label: 'Loading history…')
          else if (_error.isNotEmpty)
            ErrorBox(message: _error, onRetry: _load)
          else
            SectionCard(
              bodyPadding: EdgeInsets.zero,
              child: SimpleTable(headers: headers, rows: latest),
            ),
        ],
      ),
    );
  }
}
