import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../state.dart';
import '../widgets/common.dart';

class ProcessingScreen extends StatefulWidget {
  const ProcessingScreen({super.key});

  @override
  State<ProcessingScreen> createState() => _ProcessingScreenState();
}

class _ProcessingScreenState extends State<ProcessingScreen> {
  Map<String, dynamic>? _history;
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
        _history = Map<String, dynamic>.from(data as Map);
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

  Future<void> _run() async {
    final appState = context.read<AppState>();
    final ok = await confirmDialog(
      context,
      title: 'Run daily process',
      message:
          'Executes the full pipeline: read raw data → mapped fields → normalize → join QC Stock & Location → rules → inventory → pivot → reports → email.',
      confirmLabel: 'Run now',
    );
    if (!ok || !mounted) return;
    try {
      final res = await appState.api.call('process.run');
      if (!mounted) return;
      final msg = (res is Map && res['message'] != null) ? '${res['message']}' : 'Daily process completed.';
      showAppSnack(context, msg, tone: 'ok');
      _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    }
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final canOperate = appState.hasRole('OPERATOR');
    final headers = ((_history?['headers'] as List?) ?? const []).map((h) => '$h').toList();
    final raw = (_history?['data'] as List?) ?? const [];
    final rows = <List<String>>[
      for (final r in raw)
        if (r is List) r.map((c) => c == null ? '' : '$c').toList() else ['$r'],
    ];
    final last = rows.isEmpty ? null : rows.last;
    final status = last != null && last.length > 8 && last[8].isNotEmpty ? last[8] : 'READY';
    final okStatus = status.toUpperCase() == 'OK' || status.toUpperCase() == 'SUCCESS';

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          PageHeader(
            title: 'Processing',
            subtitle: 'Run the daily pipeline and check the current status.',
            actions: [
              OutlinedButton.icon(
                onPressed: _loading ? null : _load,
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text('Refresh status'),
              ),
            ],
          ),
          if (_loading)
            const LoadingBox(label: 'Loading status…')
          else if (_error.isNotEmpty)
            ErrorBox(message: _error, onRetry: _load)
          else ...[
            ResponsiveGrid(
              minItemWidth: 240,
              children: [
                StatCard(
                  label: 'Current status',
                  value: status,
                  sub: last != null ? 'last run: ${last.isNotEmpty ? last[0] : '-'}' : 'no runs yet',
                  tone: okStatus ? 'ok' : 'warn',
                  icon: okStatus ? Icons.check_circle_outline : Icons.hourglass_empty,
                ),
                const StatCard(
                  label: 'Source',
                  value: 'Daily Raw Data',
                  sub: '+ QC Stock, Location joins',
                  icon: Icons.storage_outlined,
                ),
                const StatCard(
                  label: 'Pipeline',
                  value: '16 stages',
                  sub: 'extract, join, rules, report, email',
                  icon: Icons.account_tree_outlined,
                ),
              ],
            ),
            const SizedBox(height: 16),
            SectionCard(
              title: 'Run processing',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  FilledButton.icon(
                    onPressed: canOperate ? _run : null,
                    icon: const Icon(Icons.play_arrow, size: 18),
                    label: const Text('Run Daily Process'),
                  ),
                  if (!canOperate)
                    const Padding(
                      padding: EdgeInsets.only(top: 8),
                      child: Text('Run needs OPERATOR+ role.', style: TextStyle(fontSize: 12.5)),
                    ),
                ],
              ),
            ),
            if (last != null && headers.isNotEmpty) ...[
              const SizedBox(height: 16),
              SectionCard(
                title: 'Last run details',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (var i = 0; i < headers.length && i < last.length; i++)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SizedBox(
                              width: 140,
                              child: Text(
                                headers[i],
                                style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700),
                              ),
                            ),
                            Expanded(
                              child: Text(last[i].isEmpty ? '—' : last[i], style: const TextStyle(fontSize: 13)),
                            ),
                          ],
                        ),
                      ),
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
