import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../state.dart';
import '../widgets/common.dart';

class QualityScreen extends StatefulWidget {
  const QualityScreen({super.key});

  @override
  State<QualityScreen> createState() => _QualityScreenState();
}

class _QualityScreenState extends State<QualityScreen> {
  Map<String, dynamic>? _errors;
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
      final data = await appState.api.call('errors.list');
      if (!mounted) return;
      setState(() {
        _errors = Map<String, dynamic>.from(data as Map);
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
    final headers = ((_errors?['headers'] as List?) ?? const []).map((h) => '$h').toList();
    final raw = (_errors?['data'] as List?) ?? const [];
    final rows = <List<String>>[
      for (final r in raw)
        if (r is List) r.map((c) => c == null ? '' : '$c').toList() else ['$r'],
    ];
    final si = headers.indexOf('Source');
    final fi = headers.indexOf('Field');
    String cell(List<String> r, int i) => i >= 0 && i < r.length ? r[i] : '';

    final missingBc = rows.where((r) => cell(r, fi) == 'BARCODE').length;
    final unknownStatus = rows.where((r) => cell(r, si) == 'STATUS_ENGINE').length;
    final unknownLoc = rows.where((r) => cell(r, si) == 'LOCATION_ENGINE').length;
    final invalidAge = rows.where((r) => cell(r, si) == 'AGE_ENGINE').length;
    final dupes = rows.where((r) => cell(r, si) == 'DEDUP').length;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          PageHeader(
            title: 'Data Quality',
            subtitle: 'Row-level issues from recent processing runs.',
            actions: [
              OutlinedButton.icon(
                onPressed: _loading ? null : _load,
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text('Refresh'),
              ),
            ],
          ),
          if (_loading)
            const LoadingBox(label: 'Loading quality data…')
          else if (_error.isNotEmpty)
            ErrorBox(message: _error, onRetry: _load)
          else ...[
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                _kpi('Missing Barcode', missingBc, 'records without primary key'),
                _kpi('Unknown Status', unknownStatus, 'no status rule match'),
                _kpi('Unknown Location', unknownLoc, 'no bin rule match'),
                _kpi('Invalid Age', invalidAge, 'blank or non-numeric'),
                _kpi('Duplicates', dupes, 'duplicate barcodes'),
              ],
            ),
            const SizedBox(height: 16),
            SectionCard(
              title: 'Error log',
              trailing: ToneBadge('${rows.length} total', tone: rows.isEmpty ? 'ok' : 'danger'),
              bodyPadding: EdgeInsets.zero,
              child: SimpleTable(headers: headers, rows: rows.reversed.take(300).toList()),
            ),
          ],
        ],
      ),
    );
  }

  Widget _kpi(String label, int value, String sub) {
    return SizedBox(
      width: 220,
      child: StatCard(
        label: label,
        value: '$value',
        sub: sub,
        tone: value > 0 ? 'warn' : 'ok',
        icon: value > 0 ? Icons.report_problem_outlined : Icons.check_circle_outline,
      ),
    );
  }
}
