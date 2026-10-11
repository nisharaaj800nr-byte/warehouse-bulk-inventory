import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../state.dart';
import '../widgets/common.dart';
import '../widgets/tiles.dart';

class SourcesScreen extends StatefulWidget {
  const SourcesScreen({super.key});

  @override
  State<SourcesScreen> createState() => _SourcesScreenState();
}

class _SourcesScreenState extends State<SourcesScreen> {
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
      final data = await appState.api.call('sources.list', {'all': true});
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
      builder: (ctx) => _SourceDialog(initial: row),
    );
    if (result == null || !mounted) return;
    try {
      await appState.api.call('sources.save', result);
      if (!mounted) return;
      showAppSnack(context, 'Source saved.', tone: 'ok');
      _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    }
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final canManage = appState.hasRole('MANAGER');

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PageHeader(
            title: 'Sources',
            subtitle: 'Data sources used by the daily pipeline (PRIMARY + JOIN).',
            actions: [
              OutlinedButton.icon(
                onPressed: _loading ? null : _load,
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text('Refresh'),
              ),
              if (canManage)
                FilledButton.icon(
                  onPressed: () => _edit(null),
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Add source'),
                ),
            ],
          ),
          if (_loading)
            const LoadingBox(label: 'Loading sources…')
          else if (_error.isNotEmpty)
            ErrorBox(message: _error, onRetry: _load)
          else if (_rows.isEmpty)
            const EmptyState(title: 'No sources configured', hint: 'Add a source to feed the daily pipeline.')
          else
            for (final row in _rows)
              ObjectTile(
                title: row['Source Name']?.isNotEmpty == true ? row['Source Name']! : (row['Source ID'] ?? ''),
                subtitle: [
                  if ((row['Type'] ?? '').isNotEmpty) row['Type']!,
                  if ((row['Sheet Name'] ?? '').isNotEmpty) 'Sheet: ${row['Sheet Name']}',
                  if ((row['Join Key'] ?? '').isNotEmpty) 'Key: ${row['Join Key']}',
                  if ((row['Join Fields'] ?? '').isNotEmpty) 'Fields: ${row['Join Fields']}',
                ].join('  ·  '),
                badges: [
                  ToneBadge(row['Role'] ?? '—', tone: row['Role'] == 'PRIMARY' ? 'brand' : 'info'),
                  ToneBadge(row['Active'] ?? '—', tone: row['Active'] == 'ON' ? 'ok' : 'neutral'),
                ],
                menuBuilder: (ctx) => [
                  if (canManage) const PopupMenuItem(value: 'edit', child: Text('Edit')),
                ],
                onAction: (a) {
                  if (a == 'edit') _edit(row);
                },
              ),
        ],
      ),
    );
  }
}

class _SourceDialog extends StatefulWidget {
  final Map<String, String>? initial;

  const _SourceDialog({this.initial});

  @override
  State<_SourceDialog> createState() => _SourceDialogState();
}

class _SourceDialogState extends State<_SourceDialog> {
  late final TextEditingController _name;
  late final TextEditingController _type;
  late final TextEditingController _sheet;
  late final TextEditingController _sheetId;
  late final TextEditingController _joinKey;
  late final TextEditingController _joinFields;
  late String _role;
  late bool _active;

  @override
  void initState() {
    super.initState();
    final i = widget.initial;
    _name = TextEditingController(text: i?['Source Name'] ?? '');
    _type = TextEditingController(text: i?['Type'] ?? 'Google Sheet');
    _sheet = TextEditingController(text: i?['Sheet Name'] ?? '');
    _sheetId = TextEditingController(text: i?['Sheet ID'] ?? '');
    _joinKey = TextEditingController(text: i?['Join Key'] ?? 'BARCODE');
    _joinFields = TextEditingController(text: i?['Join Fields'] ?? '');
    _role = i?['Role'] ?? 'JOIN';
    _active = (i?['Active'] ?? 'ON') == 'ON';
  }

  @override
  void dispose() {
    _name.dispose();
    _type.dispose();
    _sheet.dispose();
    _sheetId.dispose();
    _joinKey.dispose();
    _joinFields.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isEdit = widget.initial != null;
    return AlertDialog(
      title: Text(isEdit ? 'Edit source' : 'Add source', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
      content: SizedBox(
        width: 520,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(controller: _name, decoration: const InputDecoration(labelText: 'Name')),
              const SizedBox(height: 10),
              SplitRow(
                a: DropdownButtonFormField<String>(
                  initialValue: _role,
                  decoration: const InputDecoration(labelText: 'Role'),
                  items: const [
                    DropdownMenuItem(value: 'PRIMARY', child: Text('PRIMARY')),
                    DropdownMenuItem(value: 'JOIN', child: Text('JOIN')),
                  ],
                  onChanged: (v) => setState(() => _role = v ?? 'JOIN'),
                ),
                b: TextField(controller: _type, decoration: const InputDecoration(labelText: 'Type')),
              ),
              const SizedBox(height: 10),
              TextField(controller: _sheet, decoration: const InputDecoration(labelText: 'Sheet name (tab in this spreadsheet)')),
              const SizedBox(height: 10),
              TextField(controller: _sheetId, decoration: const InputDecoration(labelText: 'Sheet ID (optional, external)')),
              const SizedBox(height: 10),
              TextField(controller: _joinKey, decoration: const InputDecoration(labelText: 'Join key')),
              const SizedBox(height: 10),
              TextField(controller: _joinFields, decoration: const InputDecoration(labelText: 'Join fields (comma separated)')),
              const SizedBox(height: 6),
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
            if (widget.initial?['Source ID']?.isNotEmpty == true) 'id': widget.initial!['Source ID']!,
            'name': _name.text.trim(),
            'type': _type.text.trim(),
            'role': _role,
            'sheet': _sheet.text.trim(),
            'sheetId': _sheetId.text.trim(),
            'joinKey': _joinKey.text.trim(),
            'joinFields': _joinFields.text.trim(),
            'active': _active ? 'ON' : 'OFF',
          }),
          child: const Text('Save'),
        ),
      ],
    );
  }
}
