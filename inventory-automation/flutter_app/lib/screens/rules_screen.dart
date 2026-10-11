import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../state.dart';
import '../widgets/common.dart';
import '../widgets/tiles.dart';

class RulesScreen extends StatefulWidget {
  const RulesScreen({super.key});

  @override
  State<RulesScreen> createState() => _RulesScreenState();
}

class _RulesScreenState extends State<RulesScreen> {
  int _tab = 0;
  List<Map<String, String>> _rows = [];
  bool _loading = true;
  String _error = '';

  String get _listAction =>
      ['rules.age.list', 'rules.status.list', 'rules.location.list'][_tab];

  String get _saveAction =>
      ['rules.age.save', 'rules.status.save', 'rules.location.save'][_tab];

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
      final data = await appState.api.call(_listAction);
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

  Future<void> _add() async {
    final appState = context.read<AppState>();
    final fields = _tab == 0
        ? {'Min Age': '', 'Max Age': '', 'Bucket': '', 'Priority': ''}
        : _tab == 1
            ? {'Raw Status': '', 'Bucket': '', 'Marking': ''}
            : {'Pattern': '', 'Bucket': '', 'Condition': ''};
    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (ctx) => _RuleDialog(title: _titles[_tab], fields: fields),
    );
    if (result == null || !mounted) return;
    final payload = <String, dynamic>{'active': 'ON'};
    if (_tab == 0) {
      payload['min'] = int.tryParse(result['Min Age'] ?? '') ?? 0;
      payload['max'] = int.tryParse(result['Max Age'] ?? '') ?? 0;
      payload['bucket'] = result['Bucket'] ?? '';
      payload['priority'] = result['Priority'] ?? '';
    } else if (_tab == 1) {
      payload['raw'] = result['Raw Status'] ?? '';
      payload['bucket'] = result['Bucket'] ?? '';
      payload['marking'] = result['Marking'] ?? '';
    } else {
      payload['pattern'] = result['Pattern'] ?? '';
      payload['bucket'] = result['Bucket'] ?? '';
      payload['condition'] = result['Condition'] ?? '';
    }
    try {
      await appState.api.call(_saveAction, payload);
      if (!mounted) return;
      showAppSnack(context, 'Rule added.', tone: 'ok');
      _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    }
  }

  static const List<String> _titles = ['Age bucket rules', 'Status bucket rules', 'Location rules'];

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final canAdmin = appState.hasRole('ADMIN');

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PageHeader(
            title: 'Rules',
            subtitle: 'Business rules powering buckets, priorities and reports. Changes apply on the next run.',
            actions: [
              OutlinedButton.icon(
                onPressed: _loading ? null : _load,
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text('Refresh'),
              ),
              if (canAdmin)
                FilledButton.icon(
                  onPressed: _add,
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Add rule'),
                ),
            ],
          ),
          SegmentedButton<int>(
            segments: const [
              ButtonSegment(value: 0, label: Text('Age')),
              ButtonSegment(value: 1, label: Text('Status')),
              ButtonSegment(value: 2, label: Text('Location')),
            ],
            selected: {_tab},
            onSelectionChanged: (s) {
              setState(() => _tab = s.first);
              _load();
            },
          ),
          const SizedBox(height: 14),
          if (_loading)
            const LoadingBox(label: 'Loading rules…')
          else if (_error.isNotEmpty)
            ErrorBox(message: _error, onRetry: _load)
          else if (_rows.isEmpty)
            EmptyState(title: 'No ${_titles[_tab].toLowerCase()} yet')
          else
            for (final row in _rows)
              ObjectTile(
                title: [
                  for (final e in row.entries)
                    if (e.key != 'Active' && e.value.isNotEmpty) e.value,
                ].join('   ·   '),
                badges: [
                  ToneBadge(row['Active'] == 'OFF' ? 'OFF' : 'ON',
                      tone: row['Active'] == 'OFF' ? 'neutral' : 'ok'),
                ],
              ),
        ],
      ),
    );
  }
}

class _RuleDialog extends StatefulWidget {
  final String title;
  final Map<String, String> fields;

  const _RuleDialog({required this.title, required this.fields});

  @override
  State<_RuleDialog> createState() => _RuleDialogState();
}

class _RuleDialogState extends State<_RuleDialog> {
  late final Map<String, TextEditingController> _ctls;

  @override
  void initState() {
    super.initState();
    _ctls = {
      for (final e in widget.fields.entries) e.key: TextEditingController(text: e.value),
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
      title: Text('Add rule — ${widget.title}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
      content: SizedBox(
        width: 440,
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
          child: const Text('Add rule'),
        ),
      ],
    );
  }
}
