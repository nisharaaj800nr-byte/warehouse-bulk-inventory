import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/common.dart';

class TrendsScreen extends StatefulWidget {
  const TrendsScreen({super.key});

  @override
  State<TrendsScreen> createState() => _TrendsScreenState();
}

class _TrendsScreenState extends State<TrendsScreen> {
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
      final data = await appState.api.call('trends.list');
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
    final ac = appColors(context);
    final headers = ((_data?['headers'] as List?) ?? const []).map((h) => '$h').toList();
    final raw = (_data?['data'] as List?) ?? const [];
    final rows = <List<String>>[
      for (final r in raw)
        if (r is List) r.map((c) => c == null ? '' : '$c').toList() else ['$r'],
    ];
    final idx = ['Below 30', '30-60', '60-75', 'Above 75'].map(headers.indexOf).toList();
    final iDate = headers.indexOf('Date');
    final latest = rows.isEmpty ? <String>[] : rows.last;

    String val(List<String> row, int i) => i >= 0 && i < row.length ? row[i] : '0';

    final points = <List<FlSpot>>[[], [], [], []];
    final labels = <String>[];
    for (var i = 0; i < rows.length; i++) {
      for (var s = 0; s < 4; s++) {
        points[s].add(FlSpot(i.toDouble(), double.tryParse(val(rows[i], idx[s])) ?? 0));
      }
      labels.add(val(rows[i], iDate));
    }
    final colors = [ac.brandStrong, ac.ok, ac.warn, ac.danger];
    const names = ['Below 30', '30–60', '60–75', 'Above 75'];
    final interval = labels.isEmpty ? 1.0 : (labels.length / 6).clamp(1, 100).toDouble();

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          PageHeader(
            title: 'Ageing Trends',
            subtitle: 'Daily snapshots of stock by age bucket (from Trend History).',
            actions: [
              OutlinedButton.icon(
                onPressed: _loading ? null : _load,
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text('Refresh'),
              ),
            ],
          ),
          if (_loading)
            const LoadingBox(label: 'Loading trends…')
          else if (_error.isNotEmpty)
            ErrorBox(message: _error, onRetry: _load)
          else if (rows.isEmpty)
            const EmptyState(
              title: 'No trend data yet',
              hint: 'Trend snapshots are recorded when the daily process runs.',
            )
          else ...[
            ResponsiveGrid(
              minItemWidth: 210,
              children: [
                for (var s = 0; s < 4; s++)
                  StatCard(
                    label: names[s],
                    value: val(latest, idx[s]),
                    sub: 'latest snapshot',
                    tone: s == 3 ? 'danger' : (s == 2 ? 'warn' : 'brand'),
                    icon: Icons.show_chart,
                  ),
              ],
            ),
            const SizedBox(height: 16),
            SectionCard(
              title: 'Trend chart',
              trailing: Text('${rows.length} snapshots', style: TextStyle(fontSize: 12, color: ac.muted)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    height: 280,
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
                                final l = labels[i];
                                return Padding(
                                  padding: const EdgeInsets.only(top: 6),
                                  child: Text(
                                    l.length > 5 ? l.substring(5) : l,
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
              ),
            ),
          ],
        ],
      ),
    );
  }
}
