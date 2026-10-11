import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/common.dart';

class EmailScreen extends StatefulWidget {
  const EmailScreen({super.key});

  @override
  State<EmailScreen> createState() => _EmailScreenState();
}

class _EmailScreenState extends State<EmailScreen> {
  final _to = TextEditingController();
  final _cc = TextEditingController();
  final _bcc = TextEditingController();
  final _subject = TextEditingController();
  final _body = TextEditingController();
  String _output = 'CSV';
  bool _active = true;
  bool _loading = true;

  static const List<String> _outputs = ['PDF', 'Excel', 'CSV', 'Google Sheet'];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _to.dispose();
    _cc.dispose();
    _bcc.dispose();
    _subject.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('ors.email');
    if (raw != null && raw.isNotEmpty) {
      final m = Map<String, dynamic>.from(jsonDecode(raw) as Map);
      _to.text = '${m['to'] ?? ''}';
      _cc.text = '${m['cc'] ?? ''}';
      _bcc.text = '${m['bcc'] ?? ''}';
      _subject.text = '${m['subject'] ?? ''}';
      _body.text = '${m['body'] ?? ''}';
      _output = _outputs.contains(m['output']) ? '${m['output']}' : 'CSV';
      _active = '${m['active'] ?? 'ON'}' == 'ON';
    } else {
      _subject.text = 'Warehouse Bulk Inventory - Daily Report';
      _body.text = 'Aaj ki inventory report attached hai.\n\n- Warehouse Bulk Inventory';
    }
    if (!mounted) return;
    setState(() => _loading = false);
  }

  Future<void> _save() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      'ors.email',
      jsonEncode({
        'to': _to.text.trim(),
        'cc': _cc.text.trim(),
        'bcc': _bcc.text.trim(),
        'subject': _subject.text.trim(),
        'body': _body.text,
        'output': _output,
        'active': _active ? 'ON' : 'OFF',
      }),
    );
    if (!mounted) return;
    showAppSnack(context, 'Email settings saved.', tone: 'ok');
  }

  Future<void> _test() async {
    final appState = context.read<AppState>();
    try {
      final res = await appState.api.call('email.test');
      if (!mounted) return;
      final to = res is Map ? '${res['sentTo'] ?? ''}' : _to.text;
      showAppSnack(context, 'Test email sent to $to.', tone: 'ok');
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
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          PageHeader(
            title: 'Email Settings',
            subtitle: 'Report emails kis address pe jayein aur kis format me.',
            actions: [
              OutlinedButton.icon(
                onPressed: canAdmin ? _test : null,
                icon: const Icon(Icons.send_outlined, size: 16),
                label: const Text('Send test'),
              ),
              FilledButton.icon(
                onPressed: canAdmin ? _save : null,
                icon: const Icon(Icons.save_outlined, size: 18),
                label: const Text('Save settings'),
              ),
            ],
          ),
          if (_loading)
            const LoadingBox()
          else
            SectionCard(
              title: 'Report email',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SplitRow(
                    a: TextField(
                      controller: _to,
                      enabled: canAdmin,
                      decoration: const InputDecoration(
                        labelText: 'To',
                        hintText: 'ops@example.com, admin@example.com',
                      ),
                    ),
                    b: TextField(
                      controller: _cc,
                      enabled: canAdmin,
                      decoration: const InputDecoration(labelText: 'CC'),
                    ),
                  ),
                  const SizedBox(height: 10),
                  SplitRow(
                    a: TextField(
                      controller: _bcc,
                      enabled: canAdmin,
                      decoration: const InputDecoration(labelText: 'BCC'),
                    ),
                    b: DropdownButtonFormField<String>(
                      initialValue: _output,
                      decoration: const InputDecoration(labelText: 'Output format'),
                      items: [
                        for (final o in _outputs) DropdownMenuItem(value: o, child: Text(o)),
                      ],
                      onChanged: canAdmin ? (v) => setState(() => _output = v ?? 'CSV') : null,
                    ),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _subject,
                    enabled: canAdmin,
                    decoration: const InputDecoration(labelText: 'Subject'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _body,
                    enabled: canAdmin,
                    maxLines: 4,
                    decoration: const InputDecoration(labelText: 'Body'),
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Active', style: TextStyle(fontSize: 13.5)),
                    value: _active,
                    onChanged: canAdmin ? (v) => setState(() => _active = v) : null,
                  ),
                  Text(
                    'Credentials is app me store nahi hote - sending Apps Script backend (Gmail) se hoti hai.',
                    style: TextStyle(fontSize: 12.5, color: ac.muted),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
