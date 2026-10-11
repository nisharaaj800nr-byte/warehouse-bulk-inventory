import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../api.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/common.dart';

class LabelsScreen extends StatefulWidget {
  const LabelsScreen({super.key});

  @override
  State<LabelsScreen> createState() => _LabelsScreenState();
}

class _LabelsScreenState extends State<LabelsScreen> {
  Map<String, int> _bins = {};
  final Set<String> _selected = {};
  bool _loading = true;
  String _error = '';
  final _custom = TextEditingController();
  final _title = TextEditingController(text: 'Inventory Bin');
  String _size = 'Medium';
  final List<Map<String, String>> _labels = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _custom.dispose();
    _title.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final appState = context.read<AppState>();
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final data = await appState.api.call('inventory.list', {'page': 1, 'perPage': 500});
      final map = Map<String, dynamic>.from(data as Map);
      final headers = ((map['headers'] as List?) ?? const []).map((h) => '$h').toList();
      final bi = headers.indexOf('BIN_BUCKET');
      final bins = <String, int>{};
      for (final r in (map['rows'] as List? ?? const [])) {
        if (r is List && bi >= 0 && bi < r.length) {
          final b = '${r[bi]}'.trim();
          if (b.isNotEmpty && b != 'null') bins[b] = (bins[b] ?? 0) + 1;
        }
      }
      if (!mounted) return;
      setState(() {
        _bins = Map.fromEntries(bins.entries.toList()..sort((a, b) => a.key.compareTo(b.key)));
        _selected
          ..clear()
          ..addAll(_bins.keys);
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

  int get _labelWidth => _size == 'Small' ? 140 : (_size == 'Large' ? 240 : 180);

  void _genCustom() {
    final content = _custom.text.trim();
    if (content.isEmpty) {
      showAppSnack(context, 'QR content required.', tone: 'warn');
      return;
    }
    setState(() => _labels.insert(0, {
          'title': _title.text.trim().isEmpty ? 'QR Code' : _title.text.trim(),
          'content': content,
          'format': 'qr',
        }));
    showAppSnack(context, 'QR label generated.', tone: 'ok');
  }

  void _genSelected(String format) {
    if (_selected.isEmpty) {
      showAppSnack(context, 'No bins selected.', tone: 'warn');
      return;
    }
    setState(() {
      for (final bin in _selected) {
        _labels.insert(0, {'title': bin, 'content': bin, 'format': format});
      }
    });
    showAppSnack(context, '${_selected.length} bin labels generated ($format).', tone: 'ok');
  }

  @override
  Widget build(BuildContext context) {
    final ac = appColors(context);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const PageHeader(
            title: 'Labels & QR Codes',
            subtitle: 'Bin locations ke QR labels — print karke bins pe chipka do. Scanner se bin turant identify hoga.',
          ),
          if (_loading)
            const LoadingBox(label: 'Loading bins…')
          else if (_error.isNotEmpty)
            ErrorBox(message: _error, onRetry: _load)
          else ...[
            SectionCard(
              title: 'Custom QR',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  LayoutBuilder(
                    builder: (context, c) => c.maxWidth < 640
                        ? Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              TextField(
                                controller: _custom,
                                decoration: const InputDecoration(
                                  labelText: 'QR content',
                                  hintText: 'e.g. INV-LOC-SW93-2026 ya koi bhi text/URL',
                                ),
                              ),
                              const SizedBox(height: 10),
                              TextField(
                                controller: _title,
                                decoration: const InputDecoration(labelText: 'Label title'),
                              ),
                              const SizedBox(height: 10),
                              DropdownButtonFormField<String>(
                                initialValue: _size,
                                decoration: const InputDecoration(labelText: 'Size'),
                                items: const [
                                  DropdownMenuItem(value: 'Small', child: Text('Small')),
                                  DropdownMenuItem(value: 'Medium', child: Text('Medium')),
                                  DropdownMenuItem(value: 'Large', child: Text('Large')),
                                ],
                                onChanged: (v) => setState(() => _size = v ?? 'Medium'),
                              ),
                            ],
                          )
                        : Row(
                            children: [
                              Expanded(
                                flex: 2,
                                child: TextField(
                                  controller: _custom,
                                  decoration: const InputDecoration(
                                    labelText: 'QR content',
                                    hintText: 'e.g. INV-LOC-SW93-2026 ya koi bhi text/URL',
                                  ),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: TextField(
                                  controller: _title,
                                  decoration: const InputDecoration(labelText: 'Label title'),
                                ),
                              ),
                              const SizedBox(width: 10),
                              SizedBox(
                                width: 130,
                                child: DropdownButtonFormField<String>(
                                  initialValue: _size,
                                  decoration: const InputDecoration(labelText: 'Size'),
                                  items: const [
                                    DropdownMenuItem(value: 'Small', child: Text('Small')),
                                    DropdownMenuItem(value: 'Medium', child: Text('Medium')),
                                    DropdownMenuItem(value: 'Large', child: Text('Large')),
                                  ],
                                  onChanged: (v) => setState(() => _size = v ?? 'Medium'),
                                ),
                              ),
                            ],
                          ),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    children: [
                      FilledButton.icon(
                        onPressed: _genCustom,
                        icon: const Icon(Icons.qr_code_2, size: 16),
                        label: const Text('Generate QR'),
                      ),
                      OutlinedButton(
                        onPressed: () => setState(() => _labels.clear()),
                        child: const Text('Clear preview'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            SectionCard(
              title: 'Bin labels (auto)',
              trailing: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  OutlinedButton(
                    onPressed: () => setState(() {
                      if (_selected.length == _bins.length) {
                        _selected.clear();
                      } else {
                        _selected
                          ..clear()
                          ..addAll(_bins.keys);
                      }
                    }),
                    child: Text(_selected.length == _bins.length ? 'Deselect all' : 'Select all'),
                  ),
                  OutlinedButton(
                    onPressed: () => _genSelected('qr'),
                    child: const Text('Generate QR'),
                  ),
                  OutlinedButton(
                    onPressed: () => _genSelected('text'),
                    child: const Text('Generate Text'),
                  ),
                ],
              ),
              child: _bins.isEmpty
                  ? const EmptyState(
                      title: 'No bins yet',
                      hint: 'Run the daily process to generate bin buckets.',
                    )
                  : Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: [
                        for (final e in _bins.entries)
                          InkWell(
                            borderRadius: BorderRadius.circular(8),
                            onTap: () => setState(() {
                              if (!_selected.remove(e.key)) _selected.add(e.key);
                            }),
                            child: Container(
                              width: 150,
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: _selected.contains(e.key)
                                    ? ac.brandStrong.withValues(alpha: .10)
                                    : ac.surface,
                                border: Border.all(
                                  color: _selected.contains(e.key) ? ac.brandStrong : ac.line,
                                ),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Icon(
                                        _selected.contains(e.key)
                                            ? Icons.check_box_outlined
                                            : Icons.check_box_outline_blank,
                                        size: 18,
                                        color: _selected.contains(e.key) ? ac.brandStrong : ac.muted,
                                      ),
                                      const SizedBox(width: 6),
                                      Expanded(
                                        child: Text(
                                          e.key,
                                          style: TextStyle(
                                            fontSize: 14,
                                            fontWeight: FontWeight.w700,
                                            color: ac.ink,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 2),
                                  Text('${e.value} items', style: TextStyle(fontSize: 11.5, color: ac.muted)),
                                ],
                              ),
                            ),
                          ),
                      ],
                    ),
            ),
            if (_labels.isNotEmpty)
              SectionCard(
                title: 'Label preview',
                trailing: Text('${_labels.length} labels', style: TextStyle(fontSize: 12, color: ac.muted)),
                child: Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    for (final l in _labels)
                      Container(
                        width: _labelWidth.toDouble(),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          border: Border.all(color: const Color(0xFFCCCCCC)),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Column(
                          children: [
                            Text(
                              l['title'] ?? '',
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: Colors.black,
                              ),
                            ),
                            const SizedBox(height: 8),
                            if (l['format'] == 'qr')
                              QrImageView(
                                data: l['content'] ?? '',
                                size: (_labelWidth - 44).toDouble(),
                                backgroundColor: Colors.white,
                              )
                            else
                              Padding(
                                padding: const EdgeInsets.symmetric(vertical: 10),
                                child: Text(
                                  l['content'] ?? '',
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    fontSize: 22,
                                    fontWeight: FontWeight.w800,
                                    color: Colors.black,
                                    fontFamily: 'monospace',
                                    letterSpacing: 1,
                                  ),
                                ),
                              ),
                            const SizedBox(height: 4),
                            Text(
                              l['content'] ?? '',
                              textAlign: TextAlign.center,
                              style: const TextStyle(fontSize: 9, color: Color(0xFF667085)),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            const SizedBox(height: 8),
            Text(
              'Tip: label preview se screenshot/print karke bins pe laga sakte ho (direct print next update me).',
              style: TextStyle(fontSize: 12.5, color: ac.muted),
            ),
          ],
        ],
      ),
    );
  }
}
