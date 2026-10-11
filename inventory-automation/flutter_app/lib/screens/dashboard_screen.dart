import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/common.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  Map<String, dynamic>? _dash;
  Map<String, dynamic>? _trends;
  String _error = '';
  bool _loading = true;

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
      final results = await Future.wait([
        appState.api.call('dashboard'),
        appState.api.call('trends.list'),
      ]);
      if (!mounted) return;
      setState(() {
        _dash = Map<String, dynamic>.from(results[0] as Map);
        _trends = Map<String, dynamic>.from(results[1] as Map);
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = stripApiCode(e.message);
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '$e';
        _loading = false;
      });
    }
  }

  Future<void> _runProcess() async {
    final appState = context.read<AppState>();
    final ok = await confirmDialog(
      context,
      title: 'Run daily process',
      message:
          'Run the daily processing pipeline now? This reads the configured sources and rebuilds the inventory.',
      confirmLabel: 'Run now',
    );
    if (!ok || !mounted) return;
    try {
      final res = await appState.api.call('process.run');
      final msg = (res is Map && res['message'] != null) ? '${res['message']}' : 'Daily process completed.';
      if (!mounted) return;
      showAppSnack(context, msg, tone: 'ok');
      _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    }
  }

  static List<String> _rowString(dynamic row) =>
      row is List ? row.map((c) => c == null ? '' : '$c').toList() : <String>[];

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final ac = appColors(context);
    final canRun = appState.hasRole('OPERATOR');

    return RefreshIndicator(
      onRefresh: _load,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PageHeader(
              title: 'Dashboard',
              subtitle: 'Live overview of your inventory operations.',
              actions: [
                OutlinedButton.icon(
                  onPressed: _loading ? null : _load,
                  icon: const Icon(Icons.refresh, size: 16),
                  label: const Text('Refresh'),
                ),
                if (canRun)
                  FilledButton.icon(
                    onPressed: _runProcess,
                    icon: const Icon(Icons.play_arrow, size: 18),
                    label: const Text('Run daily process'),
                  ),
              ],
            ),
            if (_loading)
              const LoadingBox(label: 'Loading dashboard…')
            else if (_error.isNotEmpty)
              ErrorBox(message: _error, onRetry: _load)
            else
              _content(ac),
          ],
        ),
      ),
    );
  }

  Widget _content(AppColors ac) {
    final dash = _dash ?? const <String, dynamic>{};
    final invCount = '${dash['inventoryCount'] ?? 0}';
    final sources = '${dash['sourcesActive'] ?? 0}';
    final reports = '${dash['reportsActive'] ?? 0}';
    final recentRuns = (dash['recentRuns'] as List?) ?? const [];
    final recentErrors = (dash['recentErrors'] as List?) ?? const [];

    final runRows = <List<String>>[];
    for (final r in recentRuns.take(6)) {
      final row = _rowString(r);
      String g(int i) => i < row.length ? row[i] : '';
      runRows.add([g(0), fmtDateTime(g(1)), g(2), g(4), g(6), g(8)]);
    }
    final errRows = <List<String>>[];
    for (final r in recentErrors.take(6)) {
      final row = _rowString(r);
      String g(int i) => i < row.length ? row[i] : '';
      errRows.add([g(2), g(4), g(5), fmtDateTime(g(6))]);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        LayoutBuilder(
          builder: (context, c) {
            final cols = c.maxWidth > 900 ? 4 : (c.maxWidth > 560 ? 2 : 1);
            final cards = [
              StatCard(
                label: 'Inventory items',
                value: invCount,
                sub: 'Rows in INVENTORY',
                icon: Icons.inventory_2_outlined,
              ),
              StatCard(
                label: 'Active sources',
                value: sources,
                sub: 'Configured data sources',
                icon: Icons.storage_outlined,
              ),
              StatCard(
                label: 'Active reports',
                value: reports,
                sub: 'Report definitions enabled',
                icon: Icons.description_outlined,
              ),
              StatCard(
                label: 'Recent errors',
                value: '${recentErrors.length}',
                sub: 'From the latest runs',
                icon: Icons.error_outline,
                tone: recentErrors.isEmpty ? 'brand' : 'danger',
              ),
            ];
            return GridView.count(
              crossAxisCount: cols,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: cols == 1 ? 3.6 : (cols == 2 ? 2.4 : 2.05),
              children: cards,
            );
          },
        ),
        const SizedBox(height: 16),
        SectionCard(
          title: 'Ageing trend',
          trailing: Text('Daily snapshots', style: TextStyle(fontSize: 12, color: ac.muted)),
          child: _trendChart(ac),
        ),
        const SizedBox(height: 16),
        LayoutBuilder(
          builder: (context, c) {
            final runsCard = SectionCard(
              title: 'Recent runs',
              child: SimpleTable(
                headers: const ['Run ID', 'When', 'Source', 'Processed', 'Errors', 'Status'],
                rows: runRows,
              ),
            );
            final errCard = SectionCard(
              title: 'Recent errors',
              child: SimpleTable(
                headers: const ['Barcode', 'Field', 'Error', 'When'],
                rows: errRows,
              ),
            );
            if (c.maxWidth > 950) {
              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: runsCard),
                  const SizedBox(width: 16),
                  Expanded(child: errCard),
                ],
              );
            }
            return Column(children: [runsCard, const SizedBox(height: 16), errCard]);
          },
        ),
      ],
    );
  }

  Widget _trendChart(AppColors ac) {
    final t = _trends ?? const <String, dynamic>{};
    final headers = ((t['headers'] as List?) ?? const []).map((h) => '$h').toList();
    final data = (t['data'] as List?) ?? const [];
    if (data.isEmpty) {
      return const EmptyState(
        title: 'No trend data yet',
        hint: 'Trend snapshots are recorded when the daily process runs.',
      );
    }
    final iDate = headers.indexOf('Date');
    final idx = ['Below 30', '30-60', '60-75', 'Above 75'].map(headers.indexOf).toList();
    final points = <List<FlSpot>>[[], [], [], []];
    final labels = <String>[];
    for (var i = 0; i < data.length; i++) {
      final row = data[i];
      if (row is! List) continue;
      for (var s = 0; s < 4; s++) {
        dynamic v;
        if (idx[s] >= 0 && idx[s] < row.length) v = row[idx[s]];
        points[s].add(FlSpot(i.toDouble(), double.tryParse('$v') ?? 0));
      }
      labels.add(iDate >= 0 && iDate < row.length ? '${row[iDate]}' : '$i');
    }
    final colors = [ac.brandStrong, ac.ok, ac.warn, ac.danger];
    const names = ['Below 30', '30–60', '60–75', 'Above 75'];
    final interval = (labels.length / 6).clamp(1, 100).toDouble();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          height: 250,
          child: LineChart(
            LineChartData(
              gridData: FlGridData(
                show: true,
                drawVerticalLine: false,
                getDrawingHorizontalLine: (v) => FlLine(color: ac.line, strokeWidth: 1),
              ),
              titlesData: FlTitlesData(
                topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                leftTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    reservedSize: 38,
                    getTitlesWidget: (v, meta) => Text(
                      '${v.toInt()}',
                      style: TextStyle(fontSize: 10.5, color: ac.muted),
                    ),
                  ),
                ),
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    reservedSize: 26,
                    interval: interval,
                    getTitlesWidget: (v, meta) {
                      final i = v.toInt();
                      if (i < 0 || i >= labels.length) return const SizedBox.shrink();
                      final label = labels[i];
                      return Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Text(
                          label.length > 5 ? label.substring(5) : label,
                          style: TextStyle(fontSize: 10, color: ac.muted),
                        ),
                      );
                    },
                  ),
                ),
              ),
              borderData: FlBorderData(show: false),
              lineBarsData: [
                for (var s = 0; s < 4; s++)
                  LineChartBarData(
                    spots: points[s],
                    isCurved: true,
                    barWidth: 2,
                    color: colors[s],
                    dotData: const FlDotData(show: false),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 14,
          runSpacing: 6,
          children: [
            for (var s = 0; s < 4; s++)
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                      color: colors[s],
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
                  const SizedBox(width: 5),
                  Text(names[s], style: TextStyle(fontSize: 12, color: ac.muted)),
                ],
              ),
          ],
        ),
      ],
    );
  }
}
