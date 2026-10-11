import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/common.dart';

const List<String> _sourceTypes = ['QC_STOCK', 'TRC', 'INVENTORY', 'LOCATION', 'OTHER'];

class MultiSourceScreen extends StatefulWidget {
  const MultiSourceScreen({super.key});

  @override
  State<MultiSourceScreen> createState() => _MultiSourceScreenState();
}

class _MultiSourceScreenState extends State<MultiSourceScreen> {
  final List<Map<String, String>> _sources = [
    {'type': 'QC_STOCK', 'name': '', 'sheet': '', 'info': ''},
  ];
  Map<String, dynamic>? _job;
  Map<String, dynamic>? _conflicts;
  bool _busy = false;

  final List<Map<String, TextEditingController>> _ctls = [
    {'name': TextEditingController(), 'sheet': TextEditingController()},
  ];

  @override
  void initState() {
    super.initState();
    _loadConflicts();
  }

  @override
  void dispose() {
    for (final c in _ctls) {
      c['name']!.dispose();
      c['sheet']!.dispose();
    }
    super.dispose();
  }

  void _update(int i, String key, String value) {
    setState(() => _sources[i][key] = value);
  }

  Future<void> _upload(int i) async {
    final files = await FilePicker.pickFiles();
    if (files.isEmpty) return;
    final f = files.first;
    final List<int> bytes;
    try {
      bytes = await f.readAsBytes();
    } catch (_) {
      if (!mounted) return;
      showAppSnack(context, 'Could not read the file.', tone: 'error');
      return;
    }
    if (!mounted) return;
    final appState = context.read<AppState>();
    setState(() => _busy = true);
    try {
      final name = _ctls[i]['name']!.text.trim();
      final target = name.isNotEmpty
          ? name
          : f.name.replaceAll(RegExp(r'\.[^.]+$'), '').replaceAll(RegExp(r'[^a-zA-Z0-9_ ]'), '_');
      final r = await appState.api.call('import.fileToSource', {
        'b64': base64Encode(bytes),
        'fileName': f.name,
        'sheetName': target,
      });
      if (!mounted) return;
      setState(() {
        _ctls[i]['sheet']!.text = '${r['sheetName'] ?? target}';
        _sources[i]['info'] = 'Uploaded: ${r['totalRows']} rows (${r['format']})';
      });
      showAppSnack(context, 'Source file staged into sheet "${_ctls[i]['sheet']!.text}".', tone: 'ok');
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  List<Map<String, String>> _clean() => [
        for (var i = 0; i < _sources.length; i++)
          if (_ctls[i]['name']!.text.trim().isNotEmpty)
            {
              'type': _sources[i]['type']!,
              'name': _ctls[i]['name']!.text.trim(),
              'sheetName': _ctls[i]['sheet']!.text.trim(),
              'sheetId': '',
            },
      ];

  Future<void> _validate() async {
    final appState = context.read<AppState>();
    final list = _clean();
    if (list.isEmpty) {
      showAppSnack(context, 'Add at least one source with a name.', tone: 'warn');
      return;
    }
    setState(() => _busy = true);
    try {
      final norm = await appState.api.call('import.multiSource.validate', {'sources': list});
      if (!mounted) return;
      showAppSnack(context, 'Validation passed — ${(norm as List).length} source(s) ready.', tone: 'ok');
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _runAll() async {
    final appState = context.read<AppState>();
    final list = _clean();
    if (list.isEmpty) {
      showAppSnack(context, 'Add at least one source with a name.', tone: 'warn');
      return;
    }
    setState(() => _busy = true);
    try {
      final created = await appState.api.call('import.multiSource.create', {'sources': list});
      if (!mounted) return;
      showAppSnack(context, 'Import job ${created['jobId']} created — running…', tone: 'info');
      final res = await appState.api.call('import.multiSource.run', {'jobId': created['jobId']});
      if (!mounted) return;
      setState(() => _job = res is Map ? Map<String, dynamic>.from(res) : null);
      final status = '${(res is Map ? res['status'] : '')}';
      if (status == 'FAILED') {
        showAppSnack(context, 'Import job failed. Details neeche.', tone: 'error');
      } else {
        showAppSnack(context,
            'Import $status: ${(res is Map ? res['devices'] : 0)} devices, ${(res is Map ? res['conflicts'] : 0)} conflicts.',
            tone: 'ok');
      }
      _loadConflicts();
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _loadConflicts() async {
    final appState = context.read<AppState>();
    try {
      final data = await appState.api.call('conflicts.list', {'limit': 100});
      if (!mounted) return;
      setState(() => _conflicts = Map<String, dynamic>.from(data as Map));
    } catch (_) {
      // non-fatal
    }
  }

  Future<void> _clearConflicts() async {
    final appState = context.read<AppState>();
    final ok = await confirmDialog(
      context,
      title: 'Clear conflict log',
      message: 'Delete all rows from the Data Conflicts audit log?',
      confirmLabel: 'Clear',
      danger: true,
    );
    if (!ok || !mounted) return;
    try {
      final r = await appState.api.call('conflicts.clear');
      if (!mounted) return;
      showAppSnack(context, 'Cleared ${r['cleared'] ?? 0} conflict rows.', tone: 'ok');
      _loadConflicts();
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    }
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final ac = appColors(context);
    final canOperate = appState.hasRole('OPERATOR');
    final canManage = appState.hasRole('MANAGER');

    final ch = ((_conflicts?['headers'] as List?) ?? const []).map((h) => '$h').toList();
    final craw = (_conflicts?['rows'] as List?) ?? const [];
    final crows = <List<String>>[
      for (final r in craw)
        if (r is List) r.map((c) => c == null ? '' : '$c').toList() else ['$r'],
    ];

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const PageHeader(
            title: 'Multi-Source Import',
            subtitle: 'Kai sources ek saath import karo — conflicts priority rules se resolve hote hain.',
          ),
          SectionCard(
            title: 'Sources for this import',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (var i = 0; i < _sources.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: LayoutBuilder(
                      builder: (context, box) => box.maxWidth < 760
                          ? Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                DropdownButtonFormField<String>(
                                  initialValue: _sources[i]['type'],
                                  decoration: const InputDecoration(labelText: 'Type'),
                                  items: [
                                    for (final t in _sourceTypes) DropdownMenuItem(value: t, child: Text(t)),
                                  ],
                                  onChanged: (v) => _update(i, 'type', v ?? 'QC_STOCK'),
                                ),
                                const SizedBox(height: 10),
                                TextField(
                                  controller: _ctls[i]['name'],
                                  decoration: const InputDecoration(labelText: 'Name'),
                                ),
                                if (_sources[i]['info']!.isNotEmpty)
                                  Padding(
                                    padding: const EdgeInsets.only(top: 3),
                                    child: Text(_sources[i]['info']!, style: TextStyle(fontSize: 11.5, color: ac.muted)),
                                  ),
                                const SizedBox(height: 10),
                                TextField(
                                  controller: _ctls[i]['sheet'],
                                  decoration: const InputDecoration(labelText: 'Sheet name'),
                                ),
                                const SizedBox(height: 8),
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  crossAxisAlignment: WrapCrossAlignment.center,
                                  children: [
                                    OutlinedButton.icon(
                                      onPressed: (canOperate && !_busy) ? () => _upload(i) : null,
                                      icon: const Icon(Icons.upload_file, size: 15),
                                      label: const Text('Upload'),
                                    ),
                                    IconButton(
                                      tooltip: 'Remove',
                                      onPressed: _sources.length <= 1
                                          ? null
                                          : () => setState(() {
                                                _sources.removeAt(i);
                                                final ctl = _ctls.removeAt(i);
                                                ctl['name']!.dispose();
                                                ctl['sheet']!.dispose();
                                              }),
                                      icon: const Icon(Icons.delete_outline, size: 18),
                                    ),
                                  ],
                                ),
                              ],
                            )
                          : Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                SizedBox(
                                  width: 140,
                                  child: DropdownButtonFormField<String>(
                                    initialValue: _sources[i]['type'],
                                    decoration: const InputDecoration(labelText: 'Type'),
                                    items: [
                                      for (final t in _sourceTypes) DropdownMenuItem(value: t, child: Text(t)),
                                    ],
                                    onChanged: (v) => _update(i, 'type', v ?? 'QC_STOCK'),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      TextField(
                                        controller: _ctls[i]['name'],
                                        decoration: const InputDecoration(labelText: 'Name'),
                                      ),
                                      if (_sources[i]['info']!.isNotEmpty)
                                        Padding(
                                          padding: const EdgeInsets.only(top: 3),
                                          child: Text(_sources[i]['info']!, style: TextStyle(fontSize: 11.5, color: ac.muted)),
                                        ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: TextField(
                                    controller: _ctls[i]['sheet'],
                                    decoration: const InputDecoration(labelText: 'Sheet name'),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                OutlinedButton.icon(
                                  onPressed: (canOperate && !_busy) ? () => _upload(i) : null,
                                  icon: const Icon(Icons.upload_file, size: 15),
                                  label: const Text('Upload'),
                                ),
                                IconButton(
                                  tooltip: 'Remove',
                                  onPressed: _sources.length <= 1
                                      ? null
                                      : () => setState(() {
                                            _sources.removeAt(i);
                                            final ctl = _ctls.removeAt(i);
                                            ctl['name']!.dispose();
                                            ctl['sheet']!.dispose();
                                          }),
                                  icon: const Icon(Icons.delete_outline, size: 18),
                                ),
                              ],
                            ),
                    ),
                  ),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    OutlinedButton.icon(
                      onPressed: () => setState(() {
                        _sources.add({'type': 'TRC', 'name': '', 'sheet': '', 'info': ''});
                        _ctls.add({'name': TextEditingController(), 'sheet': TextEditingController()});
                      }),
                      icon: const Icon(Icons.add, size: 16),
                      label: const Text('Add source'),
                    ),
                    OutlinedButton(
                      onPressed: _busy ? null : _validate,
                      child: const Text('Validate all'),
                    ),
                    FilledButton(
                      onPressed: (canOperate && !_busy) ? _runAll : null,
                      child: const Text('Import all sources'),
                    ),
                  ],
                ),
              ],
            ),
          ),
          if (_job != null)
            SectionCard(
              title: 'Import result',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      ToneBadge('${_job!['status'] ?? '—'}',
                          tone: '${_job!['status']}' == 'FAILED' ? 'danger' : 'ok'),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'job ${_job!['jobId'] ?? ''} · rows ${_job!['totalRows'] ?? 0} · devices ${_job!['devices'] ?? 0} · conflicts ${_job!['conflicts'] ?? 0}',
                          style: TextStyle(fontSize: 13, color: ac.ink),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          SectionCard(
            title: 'Data conflicts',
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                ToneBadge('${_conflicts?['total'] ?? 0} rows', tone: 'info'),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: canManage ? _clearConflicts : null,
                  child: const Text('Clear log'),
                ),
              ],
            ),
            bodyPadding: EdgeInsets.zero,
            child: SimpleTable(headers: ch, rows: crows),
          ),
        ],
      ),
    );
  }
}
