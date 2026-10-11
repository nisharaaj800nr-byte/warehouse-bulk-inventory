import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/common.dart';

class InventoryScreen extends StatefulWidget {
  const InventoryScreen({super.key});

  @override
  State<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends State<InventoryScreen> {
  final _searchCtl = TextEditingController();
  Timer? _debounce;

  List<String> _headers = [];
  List<List<String>> _rows = [];
  int _total = 0;
  int _page = 1;
  int _perPage = 50;
  bool _loading = true;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchCtl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final appState = context.read<AppState>();
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final data = await appState.api.call('inventory.list', {
        'q': _searchCtl.text.trim(),
        'page': _page,
        'perPage': _perPage,
      });
      final map = Map<String, dynamic>.from(data as Map);
      if (!mounted) return;
      setState(() {
        _headers = ((map['headers'] as List?) ?? const []).map((h) => '$h').toList();
        _rows = [
          for (final r in (map['rows'] as List? ?? const []))
            if (r is List) r.map((c) => c == null ? '' : '$c').toList() else ['$r'],
        ];
        _total = (map['total'] as num?)?.toInt() ?? 0;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = stripApiCode(e.message);
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '$e';
        _loading = false;
      });
    }
  }

  void _onSearchChanged(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      _page = 1;
      _load();
    });
  }

  int get _pages => _total == 0 ? 1 : (_total + _perPage - 1) ~/ _perPage;

  Map<String, String> _rowToMap(List<String> row) {
    final m = <String, String>{};
    for (var i = 0; i < _headers.length; i++) {
      m[_headers[i]] = i < row.length ? row[i] : '';
    }
    return m;
  }

  Future<void> _openDetail(Map<String, String> item) async {
    final appState = context.read<AppState>();
    final canOperate = appState.hasRole('OPERATOR');
    final barcodeKey = _headers.contains('BARCODE') ? 'BARCODE' : (_headers.isNotEmpty ? _headers[0] : '');
    final action = await showDialog<String>(
      context: context,
      builder: (ctx) {
        final ac = appColors(ctx);
        return AlertDialog(
          title: Text(
            item[barcodeKey]?.isNotEmpty == true ? item[barcodeKey]! : 'Row details',
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
          content: SizedBox(
            width: 520,
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final h in _headers)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 7),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SizedBox(
                            width: 130,
                            child: Text(
                              h,
                              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: ac.muted),
                            ),
                          ),
                          Expanded(
                            child: Text(
                              (item[h] ?? '').isEmpty ? '—' : item[h]!,
                              style: TextStyle(fontSize: 13.5, color: ac.ink),
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
          actions: [
            if (canOperate)
              TextButton(onPressed: () => Navigator.of(ctx).pop('edit'), child: const Text('Edit')),
            if (canOperate)
              TextButton(
                onPressed: () => Navigator.of(ctx).pop('delete'),
                style: TextButton.styleFrom(foregroundColor: ac.danger),
                child: const Text('Delete'),
              ),
            FilledButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Close')),
          ],
        );
      },
    );
    if (!mounted) return;
    if (action == 'edit') {
      await _openEditor(initial: item);
    } else if (action == 'delete') {
      final ok = await confirmDialog(
        context,
        title: 'Delete row',
        message: 'Delete ${item[barcodeKey] ?? ''} from the inventory? This cannot be undone.',
        confirmLabel: 'Delete',
        danger: true,
      );
      if (!ok) return;
      try {
        await appState.api.call('inventory.delete', {'barcode': item[barcodeKey] ?? ''});
        if (!mounted) return;
        showAppSnack(context, 'Deleted ${item[barcodeKey] ?? ''}', tone: 'ok');
        _load();
      } on ApiException catch (e) {
        if (!mounted) return;
        showAppSnack(context, stripApiCode(e.message), tone: 'error');
      }
    }
  }

  Future<void> _openEditor({Map<String, String>? initial}) async {
    final appState = context.read<AppState>();
    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (ctx) => _ItemEditorDialog(headers: _headers, initial: initial),
    );
    if (result == null || !mounted) return;
    try {
      final res = await appState.api.call('inventory.save', {'item': result});
      if (!mounted) return;
      final mode = res is Map ? '${res['mode'] ?? 'saved'}' : 'saved';
      showAppSnack(context, 'Row $mode: ${result['BARCODE'] ?? ''}', tone: 'ok');
      _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    }
  }

  Future<void> _export() async {
    final appState = context.read<AppState>();
    try {
      final res = await appState.api.call('inventory.export', {'columns': _headers.join(',')});
      if (!mounted) return;
      final csv = res is Map ? '${res['csv'] ?? ''}' : '';
      final rows = res is Map ? (res['rows'] ?? 0) : 0;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Export ready'),
          content: Text('$rows rows exported. CSV clipboard me copy kar sakte ho (Excel me paste kar dena).'),
          actions: [
            TextButton(
              onPressed: () {
                Clipboard.setData(ClipboardData(text: csv));
                Navigator.of(ctx).pop();
                showAppSnack(context, 'CSV copied to clipboard.', tone: 'ok');
              },
              child: const Text('Copy CSV'),
            ),
            FilledButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Close')),
          ],
        ),
      );
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

    final start = _total == 0 ? 0 : (_page - 1) * _perPage + 1;
    final end = _total < _page * _perPage ? _total : _page * _perPage;

    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          PageHeader(
            title: 'Inventory',
            subtitle: _total > 0 ? '$_total items' : 'Browse the final inventory dataset.',
            actions: [
              OutlinedButton.icon(
                onPressed: _loading ? null : _load,
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text('Refresh'),
              ),
              if (canManage)
                OutlinedButton.icon(
                  onPressed: _headers.isEmpty ? null : _export,
                  icon: const Icon(Icons.download, size: 16),
                  label: const Text('Export CSV'),
                ),
              if (canOperate)
                FilledButton.icon(
                  onPressed: _headers.isEmpty ? null : () => _openEditor(),
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Add row'),
                ),
            ],
          ),          TextField(
            controller: _searchCtl,
            onChanged: _onSearchChanged,
            decoration: const InputDecoration(
              hintText: 'Search inventory',
              prefixIcon: Icon(Icons.search, size: 18),
            ),
          ),
          const SizedBox(height: 12),
          if (_loading)
            const LoadingBox(label: 'Loading inventory…')
          else if (_error.isNotEmpty)
            ErrorBox(message: _error, onRetry: _load)
          else ...[
            Expanded(
              child: SingleChildScrollView(
                child: SimpleTable(
                  headers: _headers,
                  rows: _rows,
                  onRowTap: (i) => _openDetail(_rowToMap(_rows[i])),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 10,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(
                  '$start–$end of $_total',
                  style: TextStyle(fontSize: 12.5, color: ac.muted),
                ),
                const SizedBox(width: 14),
                Text('Rows:', style: TextStyle(fontSize: 12.5, color: ac.muted)),
                const SizedBox(width: 6),
                DropdownButton<int>(
                  value: _perPage,
                  underline: const SizedBox.shrink(),
                  style: TextStyle(fontSize: 12.5, color: ac.ink),
                  items: const [
                    DropdownMenuItem(value: 25, child: Text('25')),
                    DropdownMenuItem(value: 50, child: Text('50')),
                    DropdownMenuItem(value: 100, child: Text('100')),
                  ],
                  onChanged: (v) {
                    if (v == null) return;
                    setState(() {
                      _perPage = v;
                      _page = 1;
                    });
                    _load();
                  },
                ),
                IconButton(
                  tooltip: 'First',
                  onPressed: _page <= 1 ? null : () { setState(() => _page = 1); _load(); },
                  icon: const Icon(Icons.first_page, size: 20),
                ),
                IconButton(
                  tooltip: 'Previous',
                  onPressed: _page <= 1 ? null : () { setState(() => _page -= 1); _load(); },
                  icon: const Icon(Icons.chevron_left, size: 20),
                ),
                Text('Page $_page / $_pages', style: TextStyle(fontSize: 12.5, color: ac.ink)),
                IconButton(
                  tooltip: 'Next',
                  onPressed: _page >= _pages ? null : () { setState(() => _page += 1); _load(); },
                  icon: const Icon(Icons.chevron_right, size: 20),
                ),
                IconButton(
                  tooltip: 'Last',
                  onPressed: _page >= _pages ? null : () { setState(() => _page = _pages); _load(); },
                  icon: const Icon(Icons.last_page, size: 20),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _ItemEditorDialog extends StatefulWidget {
  final List<String> headers;
  final Map<String, String>? initial;

  const _ItemEditorDialog({required this.headers, this.initial});

  @override
  State<_ItemEditorDialog> createState() => _ItemEditorDialogState();
}

class _ItemEditorDialogState extends State<_ItemEditorDialog> {
  late final Map<String, TextEditingController> _ctls;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _ctls = {
      for (final h in widget.headers)
        h: TextEditingController(text: widget.initial?[h] ?? ''),
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
    final isEdit = widget.initial != null;
    return AlertDialog(
      title: Text(isEdit ? 'Edit row' : 'Add row', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
      content: SizedBox(
        width: 560,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (_error.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Text(_error, style: TextStyle(color: appColors(context).danger, fontSize: 13)),
                ),
              for (final h in widget.headers)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: TextField(
                    controller: _ctls[h],
                    enabled: !(isEdit && h == 'BARCODE'),
                    decoration: InputDecoration(labelText: h),
                  ),
                ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(
          onPressed: () {
            if (widget.headers.contains('BARCODE') && (_ctls['BARCODE']?.text.trim().isEmpty ?? true)) {
              setState(() => _error = 'BARCODE is required.');
              return;
            }
            Navigator.of(context).pop({
              for (final e in _ctls.entries) e.key: e.value.text,
            });
          },
          child: Text(isEdit ? 'Save changes' : 'Add row'),
        ),
      ],
    );
  }
}
