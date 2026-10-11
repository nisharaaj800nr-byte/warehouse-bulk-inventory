import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../state.dart';
import '../widgets/common.dart';
import '../widgets/tiles.dart';

class MappingScreen extends StatefulWidget {
  const MappingScreen({super.key});

  @override
  State<MappingScreen> createState() => _MappingScreenState();
}

class _MappingScreenState extends State<MappingScreen> {
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
      final data = await appState.api.call('mapping.list', {'all': true});
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

  Future<void> _edit(int index) async {
    final initial = index >= 0 ? _rows[index] : null;
    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (ctx) => _MappingDialog(initial: initial),
    );
    if (result == null || !mounted) return;
    setState(() {
      if (index >= 0 && index < _rows.length) {
        _rows[index] = result;
      } else {
        _rows.add(result);
      }
    });
  }

  Future<void> _save() async {
    final appState = context.read<AppState>();
    try {
      final res = await appState.api.call('mapping.save', {
        'mappings': [
          for (final r in _rows)
            {
              'source': r['Source'] ?? '',
              'sourceColumn': r['Source Column'] ?? '',
              'target': r['Target Field'] ?? '',
              'required': r['Required'] == 'YES' ? 'YES' : 'NO',
              'active': r['Active'] == 'OFF' ? 'OFF' : 'ON',
              'order': int.tryParse(r['Output Order'] ?? '') ?? 99,
            },
        ],
      });
      if (!mounted) return;
      final saved = res is Map ? (res['saved'] ?? 0) : 0;
      showAppSnack(context, 'Saved $saved mapping row(s).', tone: 'ok');
      _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    }
  }

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
            title: 'Field Mapping',
            subtitle: 'Raw columns → standard fields. Saving replaces the whole table.',
            actions: [
              OutlinedButton.icon(
                onPressed: _loading ? null : _load,
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text('Refresh'),
              ),
              if (canAdmin)
                OutlinedButton.icon(
                  onPressed: () => _edit(-1),
                  icon: const Icon(Icons.add, size: 16),
                  label: const Text('Add row'),
                ),
              if (canAdmin)
                FilledButton.icon(
                  onPressed: _save,
                  icon: const Icon(Icons.save_outlined, size: 18),
                  label: const Text('Save mapping'),
                ),
            ],
          ),
          if (_loading)
            const LoadingBox(label: 'Loading mapping…')
          else if (_error.isNotEmpty)
            ErrorBox(message: _error, onRetry: _load)
          else if (_rows.isEmpty)
            const EmptyState(title: 'No mapping rows', hint: 'Add a row to map raw columns.')
          else
            for (var i = 0; i < _rows.length; i++)
              ObjectTile(
                title: '${_rows[i]['Source Column'] ?? ''}  →  ${_rows[i]['Target Field'] ?? ''}',
                subtitle: [
                  if ((_rows[i]['Source'] ?? '').isNotEmpty) 'Source: ${_rows[i]['Source']}',
                  'Required: ${_rows[i]['Required'] ?? 'NO'}',
                  'Order: ${_rows[i]['Output Order'] ?? ''}',
                ].join('  ·  '),
                badges: [
                  ToneBadge(_rows[i]['Active'] == 'OFF' ? 'OFF' : 'ON',
                      tone: _rows[i]['Active'] == 'OFF' ? 'neutral' : 'ok'),
                ],
                menuBuilder: (ctx) => [
                  if (canAdmin) const PopupMenuItem(value: 'edit', child: Text('Edit')),
                  if (canAdmin) const PopupMenuItem(value: 'remove', child: Text('Remove')),
                ],
                onAction: (a) {
                  if (a == 'edit') _edit(i);
                  if (a == 'remove') setState(() => _rows.removeAt(i));
                },
              ),
        ],
      ),
    );
  }
}

class _MappingDialog extends StatefulWidget {
  final Map<String, String>? initial;

  const _MappingDialog({this.initial});

  @override
  State<_MappingDialog> createState() => _MappingDialogState();
}

class _MappingDialogState extends State<_MappingDialog> {
  late final TextEditingController _source;
  late final TextEditingController _column;
  late final TextEditingController _target;
  late final TextEditingController _order;
  late bool _required;
  late bool _active;

  @override
  void initState() {
    super.initState();
    final i = widget.initial;
    _source = TextEditingController(text: i?['Source'] ?? '');
    _column = TextEditingController(text: i?['Source Column'] ?? '');
    _target = TextEditingController(text: i?['Target Field'] ?? '');
    _order = TextEditingController(text: i?['Output Order'] ?? '99');
    _required = i?['Required'] == 'YES';
    _active = (i?['Active'] ?? 'ON') != 'OFF';
  }

  @override
  void dispose() {
    _source.dispose();
    _column.dispose();
    _target.dispose();
    _order.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.initial == null ? 'Add mapping row' : 'Edit mapping row',
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
      content: SizedBox(
        width: 460,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(controller: _source, decoration: const InputDecoration(labelText: 'Source (source type, e.g. QC_STOCK)')),
              const SizedBox(height: 10),
              TextField(controller: _column, decoration: const InputDecoration(labelText: 'Source column (raw header)')),
              const SizedBox(height: 10),
              TextField(controller: _target, decoration: const InputDecoration(labelText: 'Target field (e.g. BARCODE)')),
              const SizedBox(height: 10),
              TextField(controller: _order, decoration: const InputDecoration(labelText: 'Output order'), keyboardType: TextInputType.number),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Required', style: TextStyle(fontSize: 13.5)),
                value: _required,
                onChanged: (v) => setState(() => _required = v),
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
            'Source': _source.text.trim(),
            'Source Column': _column.text.trim(),
            'Target Field': _target.text.trim(),
            'Required': _required ? 'YES' : 'NO',
            'Active': _active ? 'ON' : 'OFF',
            'Output Order': _order.text.trim(),
          }),
          child: const Text('OK'),
        ),
      ],
    );
  }
}
