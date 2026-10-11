import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/tiles.dart';

const List<String> _operators = ['LT', 'LTE', 'GT', 'GTE', 'EQ'];

class AlertsScreen extends StatefulWidget {
  const AlertsScreen({super.key});

  @override
  State<AlertsScreen> createState() => _AlertsScreenState();
}

class _AlertsScreenState extends State<AlertsScreen> {
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
      final data = await appState.api.call('alerts.list', {'all': true});
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

  Future<void> _edit(Map<String, String>? row) async {
    final appState = context.read<AppState>();
    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (ctx) => _AlertDialog(initial: row),
    );
    if (result == null || !mounted) return;
    try {
      await appState.api.call('alerts.save', {
        'name': result['Alert Name'] ?? '',
        'filterField': result['Filter Field'] ?? 'BRAND',
        'filterValue': result['Filter Value'] ?? '',
        'operator': result['Operator'] ?? 'LT',
        'threshold': int.tryParse(result['Threshold'] ?? '') ?? 0,
        'emailTo': result['Email To'] ?? '',
        'telegram': result['Telegram'] ?? 'OFF',
        'active': result['Active'] ?? 'ON',
      });
      if (!mounted) return;
      showAppSnack(context, 'Alert saved.', tone: 'ok');
      _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    }
  }

  Future<void> _delete(Map<String, String> row) async {
    final appState = context.read<AppState>();
    final ok = await confirmDialog(
      context,
      title: 'Delete alert',
      message: 'Delete alert rule "${row['Alert Name'] ?? ''}"?',
      confirmLabel: 'Delete',
      danger: true,
    );
    if (!ok || !mounted) return;
    try {
      await appState.api.call('alerts.delete', {'name': row['Alert Name'] ?? ''});
      if (!mounted) return;
      showAppSnack(context, 'Alert deleted.', tone: 'ok');
      _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    }
  }

  Future<void> _check() async {
    final appState = context.read<AppState>();
    try {
      final res = await appState.api.call('alerts.check');
      if (!mounted) return;
      final map = res is Map ? res : const {};
      final triggered = (map['triggered'] as List?) ?? const [];
      showAppSnack(
        context,
        '${map['total'] ?? 0} rule(s) checked · ${triggered.length} triggered.',
        tone: triggered.isEmpty ? 'ok' : 'warn',
      );
      if (triggered.isNotEmpty) {
        await showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Triggered alerts', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            content: SizedBox(
              width: 520,
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final t in triggered)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(
                          t is Map
                              ? t.entries.map((e) => '${e.key}: ${e.value}').join('  ·  ')
                              : '$t',
                          style: TextStyle(fontSize: 13, color: appColors(ctx).ink),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            actions: [
              FilledButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Close')),
            ],
          ),
        );
      }
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
    final canOperate = appState.hasRole('OPERATOR');

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PageHeader(
            title: 'Alerts',
            subtitle: 'Threshold-based stock alerts (email / Telegram).',
            actions: [
              OutlinedButton.icon(
                onPressed: _loading ? null : _load,
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text('Refresh'),
              ),
              if (canOperate)
                OutlinedButton.icon(
                  onPressed: _check,
                  icon: const Icon(Icons.play_arrow, size: 16),
                  label: const Text('Check now'),
                ),
              if (canAdmin)
                FilledButton.icon(
                  onPressed: () => _edit(null),
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Add alert'),
                ),
            ],
          ),
          if (_loading)
            const LoadingBox(label: 'Loading alerts…')
          else if (_error.isNotEmpty)
            ErrorBox(message: _error, onRetry: _load)
          else if (_rows.isEmpty)
            const EmptyState(title: 'No alerts yet', hint: 'Add a threshold rule to get notified.')
          else
            for (final row in _rows)
              ObjectTile(
                title: row['Alert Name'] ?? '',
                subtitle: [
                  '${row['Filter Field'] ?? ''} ${row['Operator'] ?? ''} ${row['Threshold'] ?? ''}',
                  if ((row['Filter Value'] ?? '').isNotEmpty) 'value: ${row['Filter Value']}',
                  if ((row['Email To'] ?? '').isNotEmpty) 'email: ${row['Email To']}',
                ].join('  ·  '),
                badges: [
                  ToneBadge('TG ${row['Telegram'] ?? 'OFF'}',
                      tone: row['Telegram'] == 'ON' ? 'ok' : 'neutral'),
                  ToneBadge(row['Active'] ?? '—', tone: row['Active'] == 'ON' ? 'ok' : 'neutral'),
                ],
                menuBuilder: (ctx) => [
                  if (canAdmin) const PopupMenuItem(value: 'edit', child: Text('Edit')),
                  if (canAdmin)
                    PopupMenuItem(
                      value: 'delete',
                      child: Text('Delete', style: TextStyle(color: ac.danger)),
                    ),
                ],
                onAction: (a) {
                  if (a == 'edit') _edit(row);
                  if (a == 'delete') _delete(row);
                },
              ),
        ],
      ),
    );
  }
}

class _AlertDialog extends StatefulWidget {
  final Map<String, String>? initial;

  const _AlertDialog({this.initial});

  @override
  State<_AlertDialog> createState() => _AlertDialogState();
}

class _AlertDialogState extends State<_AlertDialog> {
  late final TextEditingController _name;
  late final TextEditingController _field;
  late final TextEditingController _value;
  late final TextEditingController _threshold;
  late final TextEditingController _email;
  late String _operator;
  late bool _telegram;
  late bool _active;

  @override
  void initState() {
    super.initState();
    final i = widget.initial;
    _name = TextEditingController(text: i?['Alert Name'] ?? '');
    _field = TextEditingController(text: i?['Filter Field'] ?? 'BRAND');
    _value = TextEditingController(text: i?['Filter Value'] ?? '');
    _threshold = TextEditingController(text: i?['Threshold'] ?? '10');
    _email = TextEditingController(text: i?['Email To'] ?? '');
    _operator = _operators.contains(i?['Operator']) ? i!['Operator']! : 'LT';
    _telegram = i?['Telegram'] == 'ON';
    _active = (i?['Active'] ?? 'ON') != 'OFF';
  }

  @override
  void dispose() {
    _name.dispose();
    _field.dispose();
    _value.dispose();
    _threshold.dispose();
    _email.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.initial == null ? 'Add alert' : 'Edit alert',
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
      content: SizedBox(
        width: 480,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(controller: _name, decoration: const InputDecoration(labelText: 'Alert name')),
              const SizedBox(height: 10),
              SplitRow(
                a: TextField(controller: _field, decoration: const InputDecoration(labelText: 'Filter field')),
                b: TextField(controller: _value, decoration: const InputDecoration(labelText: 'Filter value')),
              ),
              const SizedBox(height: 10),
              SplitRow(
                a: DropdownButtonFormField<String>(
                  initialValue: _operator,
                  decoration: const InputDecoration(labelText: 'Operator'),
                  items: [
                    for (final o in _operators) DropdownMenuItem(value: o, child: Text(o)),
                  ],
                  onChanged: (v) => setState(() => _operator = v ?? 'LT'),
                ),
                b: TextField(
                  controller: _threshold,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Threshold'),
                ),
              ),
              const SizedBox(height: 10),
              TextField(controller: _email, decoration: const InputDecoration(labelText: 'Email to (optional)')),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Telegram', style: TextStyle(fontSize: 13.5)),
                value: _telegram,
                onChanged: (v) => setState(() => _telegram = v),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Active', style: TextStyle(fontSize: 13.5)),
                value: _active,
                onChanged: (v) => setState(() => _active = v),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(
          onPressed: () => Navigator.of(context).pop({
            'Alert Name': _name.text.trim(),
            'Filter Field': _field.text.trim(),
            'Filter Value': _value.text.trim(),
            'Operator': _operator,
            'Threshold': _threshold.text.trim(),
            'Email To': _email.text.trim(),
            'Telegram': _telegram ? 'ON' : 'OFF',
            'Active': _active ? 'ON' : 'OFF',
          }),
          child: const Text('Save'),
        ),
      ],
    );
  }
}
