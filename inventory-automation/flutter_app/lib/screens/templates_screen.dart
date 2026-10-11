import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/tiles.dart';

class TemplatesScreen extends StatefulWidget {
  const TemplatesScreen({super.key});

  @override
  State<TemplatesScreen> createState() => _TemplatesScreenState();
}

class _TemplatesScreenState extends State<TemplatesScreen> {
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
      final data = await appState.api.call('reports.templates.list');
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

  String _name(Map<String, String> r) => r['Name'] ?? r['Template Name'] ?? (r.values.isNotEmpty ? r.values.first : '');

  Future<void> _edit(Map<String, String>? row) async {
    final appState = context.read<AppState>();
    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (ctx) => _TemplateDialog(initial: row),
    );
    if (result == null || !mounted) return;
    try {
      await appState.api.call('reports.templates.save', {
        'name': result['Name'] ?? '',
        'configJson': result['Config JSON'] ?? '',
        'active': result['Active'] ?? 'ON',
      });
      if (!mounted) return;
      showAppSnack(context, 'Template saved.', tone: 'ok');
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
      title: 'Delete template',
      message: 'Delete template "${_name(row)}"?',
      confirmLabel: 'Delete',
      danger: true,
    );
    if (!ok || !mounted) return;
    try {
      await appState.api.call('reports.templates.delete', {'name': _name(row)});
      if (!mounted) return;
      showAppSnack(context, 'Template deleted.', tone: 'ok');
      _load();
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

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PageHeader(
            title: 'Report Templates',
            subtitle: 'Reusable report formats (advanced — config JSON).',
            actions: [
              OutlinedButton.icon(
                onPressed: _loading ? null : _load,
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text('Refresh'),
              ),
              if (canAdmin)
                FilledButton.icon(
                  onPressed: () => _edit(null),
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('New template'),
                ),
            ],
          ),
          if (_loading)
            const LoadingBox(label: 'Loading templates…')
          else if (_error.isNotEmpty)
            ErrorBox(message: _error, onRetry: _load)
          else if (_rows.isEmpty)
            const EmptyState(title: 'No templates', hint: 'Create a reusable template for reports.')
          else
            for (final row in _rows)
              ObjectTile(
                title: _name(row),
                subtitle: () {
                  final cfg = row['Config JSON'] ?? row['ConfigJson'] ?? '';
                  return cfg.length > 120 ? '${cfg.substring(0, 120)}…' : cfg;
                }(),
                badges: [
                  ToneBadge(row['Active'] ?? '—', tone: row['Active'] == 'ON' ? 'ok' : 'neutral'),
                ],
                menuBuilder: (ctx) => [
                  if (canAdmin) const PopupMenuItem(value: 'edit', child: Text('Edit')),
                  if (canAdmin)
                    PopupMenuItem(
                      value: 'del',
                      child: Text('Delete', style: TextStyle(color: ac.danger)),
                    ),
                ],
                onAction: (a) {
                  if (a == 'edit') _edit(row);
                  if (a == 'del') _delete(row);
                },
              ),
        ],
      ),
    );
  }
}

class _TemplateDialog extends StatefulWidget {
  final Map<String, String>? initial;

  const _TemplateDialog({this.initial});

  @override
  State<_TemplateDialog> createState() => _TemplateDialogState();
}

class _TemplateDialogState extends State<_TemplateDialog> {
  late final TextEditingController _name;
  late final TextEditingController _cfg;
  late bool _active;

  @override
  void initState() {
    super.initState();
    final i = widget.initial;
    _name = TextEditingController(text: i?['Name'] ?? i?['Template Name'] ?? '');
    _cfg = TextEditingController(text: i?['Config JSON'] ?? i?['ConfigJson'] ?? '');
    _active = (i?['Active'] ?? 'ON') == 'ON';
  }

  @override
  void dispose() {
    _name.dispose();
    _cfg.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.initial == null ? 'New template' : 'Edit template',
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
      content: SizedBox(
        width: 520,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(controller: _name, decoration: const InputDecoration(labelText: 'Template name')),
              const SizedBox(height: 10),
              TextField(
                controller: _cfg,
                maxLines: 6,
                style: const TextStyle(fontFamily: 'monospace', fontSize: 12.5),
                decoration: const InputDecoration(
                  labelText: 'Config JSON',
                  hintText: '{"columns": ["BARCODE","MODEL"], "title": "..."}',
                ),
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
            'Name': _name.text.trim(),
            'Config JSON': _cfg.text,
            'Active': _active ? 'ON' : 'OFF',
          }),
          child: const Text('Save'),
        ),
      ],
    );
  }
}
