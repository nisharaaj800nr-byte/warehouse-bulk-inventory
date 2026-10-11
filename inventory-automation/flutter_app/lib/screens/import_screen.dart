import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/common.dart';

const List<String> _targetFields = [
  'BARCODE', 'MODEL', 'BRAND', 'CATEGORY', 'MOD_AGE', 'STOCK_AGE', 'STATUS',
  'LOCATION', 'BIN_BUCKET', 'PRIORITY', 'SOURCE', 'SERIAL', 'MRP',
];

String _norm(String s) => s.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');

String _autoTarget(String column) {
  final key = _norm(column);
  for (final t in _targetFields) {
    final tk = _norm(t);
    if (key == tk || key.contains(tk) || tk.contains(key)) return t;
  }
  return '';
}

class ImportScreen extends StatefulWidget {
  const ImportScreen({super.key});

  @override
  State<ImportScreen> createState() => _ImportScreenState();
}

class _ImportScreenState extends State<ImportScreen> {
  String? _fileName;
  String _format = '';
  List<String> _headers = [];
  int _totalRows = 0;
  List<String> _warnings = [];
  List<Map<String, dynamic>> _map = [];
  List<List<String>> _previewRows = [];
  int _previewOffset = 0;
  final _sourceType = TextEditingController();
  final _sheetCtl = TextEditingController();
  List<Map<String, dynamic>> _tabs = [];
  String? _tab;
  bool _dedupe = false;
  bool _busy = false;
  Map<String, dynamic>? _commitResult;

  bool get _staged => _fileName != null;

  @override
  void dispose() {
    _sourceType.dispose();
    _sheetCtl.dispose();
    super.dispose();
  }

  void _applyStaged(Map<String, dynamic> res) {
    setState(() {
      _fileName = '${res['fileName'] ?? 'upload'}';
      _format = '${res['format'] ?? ''}';
      _headers = [for (final h in (res['headers'] as List? ?? const [])) '$h'];
      _totalRows = (res['totalRows'] as num?)?.toInt() ?? 0;
      _warnings = [for (final w in (res['warnings'] as List? ?? const [])) '$w'];
      _map = [
        for (final h in _headers) {'source': h, 'target': _autoTarget(h), 'required': false},
      ];
      _commitResult = null;
      _previewRows = [];
      _previewOffset = 0;
    });
    _loadPreview(0, true);
  }

  Future<void> _loadPreview(int offset, bool replace) async {
    final appState = context.read<AppState>();
    try {
      final page = await appState.api.call('import.previewPage', {'offset': offset, 'limit': 20});
      final map = Map<String, dynamic>.from(page as Map);
      final rows = <List<String>>[
        for (final r in (map['rows'] as List? ?? const []))
          if (r is List) r.map((c) => c == null ? '' : '$c').toList() else ['$r'],
      ];
      if (!mounted) return;
      setState(() {
        _previewOffset = offset + rows.length;
        if (replace) {
          _previewRows = rows;
        } else {
          _previewRows = [..._previewRows, ...rows];
        }
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    }
  }

  Future<void> _pickFile() async {
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
      final r = await appState.api.call('import.fileB64', {
        'b64': base64Encode(bytes),
        'fileName': f.name,
      });
      if (!mounted) return;
      _applyStaged(Map<String, dynamic>.from(r as Map));
      showAppSnack(context, 'Staged $_totalRows rows from ${f.name}.', tone: 'ok');
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _loadTabs() async {
    final appState = context.read<AppState>();
    setState(() => _busy = true);
    try {
      final tabs = await appState.api.call('import.tabs', {'sheetId': _sheetCtl.text.trim()});
      if (!mounted) return;
      setState(() {
        _tabs = [for (final t in (tabs as List? ?? const [])) Map<String, dynamic>.from(t as Map)];
        _tab = _tabs.isNotEmpty ? '${_tabs.first['name']}' : null;
      });
      showAppSnack(context, '${_tabs.length} tab(s) found.', tone: 'ok');
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _stageSheet() async {
    final appState = context.read<AppState>();
    setState(() => _busy = true);
    try {
      final r = await appState.api.call('import.sheets', {
        'sheetId': _sheetCtl.text.trim(),
        'tab': _tab ?? '',
      });
      if (!mounted) return;
      _applyStaged(Map<String, dynamic>.from(r as Map));
      showAppSnack(context, 'Staged $_totalRows rows.', tone: 'ok');
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _commit(bool dryRun) async {
    final appState = context.read<AppState>();
    setState(() => _busy = true);
    try {
      final res = await appState.api.call('import.commit', {
        'mapping': [
          for (final m in _map)
            if ('${m['target']}'.isNotEmpty)
              {'source': m['source'], 'target': m['target'], 'required': m['required']},
        ],
        'sourceType': _sourceType.text.trim(),
        'dedupe': _dedupe,
        'dryRun': dryRun,
      });
      if (!mounted) return;
      setState(() => _commitResult = Map<String, dynamic>.from(res as Map));
      final map = _commitResult!;
      if (dryRun) {
        showAppSnack(context,
            'Validation: ${map['valid']} valid, ${map['failed']} failed, ${map['skipped']} skipped.',
            tone: 'ok');
      } else {
        showAppSnack(context, 'Imported ${map['imported']} rows.', tone: 'ok');
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _discard() async {
    final appState = context.read<AppState>();
    try {
      await appState.api.call('import.discard');
    } catch (_) {
      // ignore
    }
    if (!mounted) return;
    setState(() {
      _fileName = null;
      _headers = [];
      _map = [];
      _previewRows = [];
      _commitResult = null;
    });
    showAppSnack(context, 'Staging cleared.', tone: 'info');
  }

  Future<void> _runProcess() async {
    final appState = context.read<AppState>();
    try {
      final res = await appState.api.call('process.run');
      if (!mounted) return;
      final msg = (res is Map && res['message'] != null) ? '${res['message']}' : 'Daily process completed.';
      showAppSnack(context, msg, tone: 'ok');
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

    if (!_staged) {
      return SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const PageHeader(
              title: 'Import Data',
              subtitle: 'CSV / Excel / PDF upload karo ya Google Sheet se data lao — phir validate karke import karo.',
            ),
            LayoutBuilder(
              builder: (context, box) => box.maxWidth < 820
                  ? Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _uploadCard(ac, canOperate),
                        const SizedBox(height: 16),
                        _sheetCard(),
                      ],
                    )
                  : Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(child: _uploadCard(ac, canOperate)),
                        const SizedBox(width: 16),
                        Expanded(child: _sheetCard()),
                      ],
                    ),
            ),
          ],
        ),
      );
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          PageHeader(
            title: 'Import Data',
            subtitle: 'Staged data — map columns, validate, phir import karo.',
            actions: [
              OutlinedButton.icon(
                onPressed: _discard,
                icon: const Icon(Icons.delete_outline, size: 16),
                label: const Text('Discard staging'),
              ),
            ],
          ),
          SectionCard(
            child: Row(
              children: [
                ToneBadge(_format.isEmpty ? 'Staged' : _format, tone: 'brand'),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    '$_fileName  ·  $_totalRows rows × ${_headers.length} cols',
                    style: TextStyle(fontSize: 13.5, color: ac.ink),
                  ),
                ),
              ],
            ),
          ),
          for (final w in _warnings)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Text('⚠  $w', style: TextStyle(fontSize: 12.5, color: ac.warn)),
            ),
          SectionCard(
            title: 'Preview',
            trailing: _previewRows.length < _totalRows && _totalRows > 0
                ? OutlinedButton(
                    onPressed: () => _loadPreview(_previewOffset, false),
                    child: Text('Load more (${_previewRows.length}/$_totalRows)'),
                  )
                : null,
            bodyPadding: EdgeInsets.zero,
            child: SimpleTable(headers: _headers, rows: _previewRows),
          ),
          SectionCard(
            title: 'Column mapping',
            trailing: Text('Imported column → system field', style: TextStyle(fontSize: 12, color: ac.muted)),
            child: Column(
              children: [
                for (var i = 0; i < _map.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        Expanded(
                          flex: 2,
                          child: Text(
                            '${_map[i]['source']}',
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 12.5, fontFamily: 'monospace'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          flex: 3,
                          child: DropdownButtonFormField<String>(
                            initialValue: '${_map[i]['target']}',
                            decoration: const InputDecoration(labelText: 'Target field'),
                            items: [
                              const DropdownMenuItem(value: '', child: Text('— skip —')),
                              for (final t in _targetFields) DropdownMenuItem(value: t, child: Text(t)),
                            ],
                            onChanged: (v) => setState(() => _map[i]['target'] = v ?? ''),
                          ),
                        ),
                        const SizedBox(width: 10),
                        SizedBox(
                          width: 100,
                          child: CheckboxListTile(
                            contentPadding: EdgeInsets.zero,
                            dense: true,
                            title: const Text('Req.', style: TextStyle(fontSize: 12)),
                            value: _map[i]['required'] == true,
                            onChanged: (v) => setState(() => _map[i]['required'] = v == true),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          SectionCard(
            title: 'Import options',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 14,
                  runSpacing: 10,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    SizedBox(
                      width: 260,
                      child: TextField(
                        controller: _sourceType,
                        enabled: canOperate,
                        decoration: const InputDecoration(
                          labelText: 'Source type',
                          hintText: 'QC_STOCK / TRC / INVENTORY / OTHER',
                        ),
                      ),
                    ),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Switch(value: _dedupe, onChanged: (v) => setState(() => _dedupe = v)),
                        const SizedBox(width: 6),
                        const Text('Skip duplicates', style: TextStyle(fontSize: 13)),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    OutlinedButton(
                      onPressed: (canOperate && !_busy) ? () => _commit(true) : null,
                      child: const Text('Validate (dry run)'),
                    ),
                    FilledButton.icon(
                      onPressed: (canOperate && !_busy) ? () => _commit(false) : null,
                      icon: const Icon(Icons.check_circle_outline, size: 16),
                      label: const Text('Import now'),
                    ),
                  ],
                ),
                if (_commitResult != null) ...[
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      ToneBadge(
                        _commitResult!['dryRun'] == true ? 'Dry run' : 'Committed',
                        tone: _commitResult!['dryRun'] == true ? 'info' : 'ok',
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'processed ${_commitResult!['processed']} · valid ${_commitResult!['valid']} · imported ${_commitResult!['imported']} · failed ${_commitResult!['failed']} · skipped ${_commitResult!['skipped']}',
                          style: TextStyle(fontSize: 12.5, color: ac.ink),
                        ),
                      ),
                    ],
                  ),
                  for (final w in (_commitResult!['warnings'] as List? ?? const []))
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text('⚠  $w', style: TextStyle(fontSize: 12.5, color: ac.warn)),
                    ),
                  if (_commitResult!['dryRun'] != true)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: FilledButton.icon(
                        onPressed: _runProcess,
                        icon: const Icon(Icons.play_arrow, size: 16),
                        label: const Text('Run daily process now'),
                      ),
                    ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }


  Widget _uploadCard(AppColors ac, bool canOperate) {
    return SectionCard(
      title: 'Upload a file',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'CSV, TSV, TXT, XLS, XLSX or PDF - up to 15 MB / 50,000 rows.',
            style: TextStyle(fontSize: 12.5, color: ac.muted),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: (canOperate && !_busy) ? _pickFile : null,
            icon: const Icon(Icons.upload_file, size: 16),
            label: _busy ? const Text('Staging...') : const Text('Choose file & stage'),
          ),
        ],
      ),
    );
  }

  Widget _sheetCard() {
    return SectionCard(
      title: 'Connect a Google Sheet',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: _sheetCtl,
            decoration: const InputDecoration(
              labelText: 'Sheet URL or ID',
              hintText: 'https://docs.google.com/spreadsheets/d/...',
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              OutlinedButton(
                onPressed: (_busy || _sheetCtl.text.trim().isEmpty) ? null : _loadTabs,
                child: const Text('Load tabs'),
              ),
              if (_tabs.isNotEmpty)
                SizedBox(
                  width: 260,
                  child: DropdownButtonFormField<String>(
                    initialValue: _tab,
                    decoration: const InputDecoration(labelText: 'Tab'),
                    items: [
                      for (final t in _tabs)
                        DropdownMenuItem(
                          value: '${t['name']}',
                          child: Text('${t['name']} (${t['rows']} rows)'),
                        ),
                    ],
                    onChanged: (v) => setState(() => _tab = v),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          FilledButton(
            onPressed: (true && !_busy && _sheetCtl.text.trim().isNotEmpty)
                ? _stageSheet
                : null,
            child: const Text('Stage this sheet'),
          ),
        ],
      ),
    );
  }
}
