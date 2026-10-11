import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/common.dart';

class ActivityScreen extends StatefulWidget {
  const ActivityScreen({super.key});

  @override
  State<ActivityScreen> createState() => _ActivityScreenState();
}

class _ActivityScreenState extends State<ActivityScreen> {
  int _tab = 0;
  final Map<int, Map<String, dynamic>> _cache = {};
  bool _loading = true;
  String _error = '';

  static const List<String> _actions = [
    'activity.list',
    'history.list',
    'errors.list',
    'quality.summary',
  ];

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
      final data = await appState.api.call(_actions[_tab]);
      if (!mounted) return;
      setState(() {
        _cache[_tab] = data is Map ? Map<String, dynamic>.from(data) : <String, dynamic>{};
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

  Widget _sheetView(Map<String, dynamic> data, {int cap = 300}) {
    final ac = appColors(context);
    final headers = ((data['headers'] as List?) ?? const []).map((h) => '$h').toList();
    final raw = (data['data'] as List?) ?? const [];
    final rows = <List<String>>[
      for (final r in raw)
        if (r is List) r.map((c) => c == null ? '' : '$c').toList() else ['$r'],
    ];
    final latest = rows.reversed.take(cap).toList();
    if (latest.isEmpty) return const EmptyState(title: 'No data');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SingleChildScrollView(child: SimpleTable(headers: headers, rows: latest)),
        if (rows.length > cap)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              'Showing latest $cap of ${rows.length} rows.',
              style: TextStyle(fontSize: 12, color: ac.muted),
            ),
          ),
      ],
    );
  }

  Widget _quality(Map<String, dynamic> data) {
    final ac = appColors(context);
    final total = (data['totalErrors'] as num?)?.toInt() ?? 0;
    final bySource = <String, int>{
      for (final e in ((data['bySource'] as Map?) ?? const {}).entries)
        '${e.key}': (e.value as num?)?.toInt() ?? 0,
    };
    final maxC = bySource.values.isEmpty ? 0 : bySource.values.reduce((a, b) => a > b ? a : b);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          width: 280,
          child: StatCard(
            label: 'Total processing errors',
            value: '$total',
            sub: 'Across recorded runs',
            tone: total > 0 ? 'warn' : 'brand',
            icon: Icons.error_outline,
          ),
        ),
        const SizedBox(height: 14),
        SectionCard(
          title: 'Errors by source',
          child: bySource.isEmpty
              ? const EmptyState(title: 'No errors recorded', hint: 'Data quality looks clean.')
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (final e in bySource.entries)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Row(
                          children: [
                            SizedBox(
                              width: 130,
                              child: Text(
                                e.key,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontSize: 12.5, color: ac.ink),
                              ),
                            ),
                            Expanded(
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(6),
                                child: LinearProgressIndicator(
                                  value: maxC == 0 ? 0.04 : (e.value / maxC).clamp(0.04, 1.0),
                                  minHeight: 10,
                                  backgroundColor: ac.chip,
                                  color: ac.warn,
                                ),
                              ),
                            ),
                            SizedBox(
                              width: 50,
                              child: Text(
                                '${e.value}',
                                textAlign: TextAlign.right,
                                style: TextStyle(fontSize: 12.5, color: ac.ink),
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final data = _cache[_tab];
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PageHeader(
            title: 'Activity & Audit',
            subtitle: 'Processing history, errors, activity feed and data quality.',
            actions: [
              OutlinedButton.icon(
                onPressed: _loading ? null : _load,
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text('Refresh'),
              ),
            ],
          ),
          SegmentedButton<int>(
            segments: const [
              ButtonSegment(value: 0, label: Text('Activity')),
              ButtonSegment(value: 1, label: Text('Runs')),
              ButtonSegment(value: 2, label: Text('Errors')),
              ButtonSegment(value: 3, label: Text('Quality')),
            ],
            selected: {_tab},
            onSelectionChanged: (s) {
              setState(() => _tab = s.first);
              _load();
            },
          ),
          const SizedBox(height: 14),
          if (_loading)
            const LoadingBox(label: 'Loading…')
          else if (_error.isNotEmpty)
            ErrorBox(message: _error, onRetry: _load)
          else if (data == null)
            const LoadingBox()
          else if (_tab == 3)
            _quality(data)
          else
            SectionCard(bodyPadding: EdgeInsets.zero, child: _sheetView(data)),
        ],
      ),
    );
  }
}
