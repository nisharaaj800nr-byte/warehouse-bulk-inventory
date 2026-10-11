import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/common.dart';

class BuilderScreen extends StatefulWidget {
  const BuilderScreen({super.key});

  @override
  State<BuilderScreen> createState() => _BuilderScreenState();
}

class _BuilderScreenState extends State<BuilderScreen> {
  final _name = TextEditingController();
  final _field = TextEditingController();
  final _value = TextEditingController();
  final _columns = TextEditingController();
  bool _active = true;

  @override
  void dispose() {
    _name.dispose();
    _field.dispose();
    _value.dispose();
    _columns.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final appState = context.read<AppState>();
    if (_name.text.trim().isEmpty) {
      showAppSnack(context, 'Report name required.', tone: 'warn');
      return;
    }
    try {
      await appState.api.call('reports.save', {
        'name': _name.text.trim(),
        'filterField': _field.text.trim(),
        'filterValue': _value.text.trim(),
        'columns': _columns.text.trim(),
        'active': _active ? 'ON' : 'OFF',
      });
      if (!mounted) return;
      showAppSnack(context, 'Report saved: ${_name.text.trim()}', tone: 'ok');
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    }
  }

  Future<void> _generate() async {
    final appState = context.read<AppState>();
    if (_name.text.trim().isEmpty) {
      showAppSnack(context, 'Report name required.', tone: 'warn');
      return;
    }
    try {
      final res = await appState.api.call('reports.generate', {
        'name': _name.text.trim(),
        'filterField': _field.text.trim(),
        'filterValue': _value.text.trim(),
        'columns': _columns.text.trim(),
      });
      if (!mounted) return;
      final map = res is Map ? res : const {};
      showAppSnack(context, 'Report "${map['report'] ?? _name.text.trim()}" generated — ${map['rows'] ?? 0} rows.', tone: 'ok');
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    }
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final ac = appColors(context);
    final canBuild = appState.hasRole('MANAGER');

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const PageHeader(
            title: 'Report Builder',
            subtitle: 'Naya report banao — filter + columns choose karke save ya generate karo.',
          ),
          SectionCard(
            title: 'Report definition',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TextField(
                  controller: _name,
                  enabled: canBuild,
                  decoration: const InputDecoration(
                    labelText: 'Report name',
                    hintText: 'e.g. Apple L4 Bin Storage',
                  ),
                ),
                const SizedBox(height: 10),
                SplitRow(
                  a: TextField(
                    controller: _field,
                    enabled: canBuild,
                    decoration: const InputDecoration(
                      labelText: 'Filter field',
                      hintText: 'BRAND / STATUS_BUCKET / AGE_BUCKET',
                    ),
                  ),
                  b: TextField(
                    controller: _value,
                    enabled: canBuild,
                    decoration: const InputDecoration(
                      labelText: 'Filter value',
                      hintText: 'Apple / Above 75',
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _columns,
                  enabled: canBuild,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Columns (comma separated)',
                    hintText: 'BARCODE, MODEL, STATUS_BUCKET, BIN_BUCKET',
                  ),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Active', style: TextStyle(fontSize: 13.5)),
                  value: _active,
                  onChanged: canBuild ? (v) => setState(() => _active = v) : null,
                ),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    FilledButton.icon(
                      onPressed: canBuild ? _save : null,
                      icon: const Icon(Icons.save_outlined, size: 16),
                      label: const Text('Save report'),
                    ),
                    OutlinedButton.icon(
                      onPressed: canBuild ? _generate : null,
                      icon: const Icon(Icons.play_arrow, size: 16),
                      label: const Text('Generate now'),
                    ),
                  ],
                ),
                if (!canBuild)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      'Report building needs MANAGER+ role.',
                      style: TextStyle(fontSize: 12.5, color: ac.muted),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
