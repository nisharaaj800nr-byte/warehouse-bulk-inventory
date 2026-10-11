import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/common.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final Map<String, TextEditingController> _ctls = {};
  Map<String, String> _values = {};
  bool _loading = true;
  String _error = '';
  List<Map<String, dynamic>>? _checks;

  static const List<String> _known = [
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHAT_ID',
    'AUTO_BACKUP',
    'BACKUP_FOLDER_ID',
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in _ctls.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    final appState = context.read<AppState>();
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final data = await appState.api.call('settings.get');
      final map = <String, String>{
        for (final e in (data as Map? ?? {}).entries) '${e.key}': e.value == null ? '' : '${e.value}',
      };
      if (!mounted) return;
      setState(() {
        _values = map;
        for (final c in _ctls.values) {
          c.dispose();
        }
        _ctls.clear();
        for (final e in map.entries) {
          _ctls[e.key] = TextEditingController(text: e.value);
        }
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

  TextEditingController _ctl(String key) =>
      _ctls.putIfAbsent(key, () => TextEditingController(text: _values[key] ?? ''));

  Future<void> _save() async {
    final appState = context.read<AppState>();
    final settings = {for (final e in _ctls.entries) e.key: e.value.text};
    try {
      await appState.api.call('settings.save', {'settings': settings});
      if (!mounted) return;
      showAppSnack(context, 'Settings saved.', tone: 'ok');
      _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    }
  }

  Future<void> _op(String action) async {
    final appState = context.read<AppState>();
    try {
      final res = await appState.api.call(action);
      if (!mounted) return;
      if (action == 'telegram.test') {
        final ok = res is Map && res['ok'] == true;
        showAppSnack(context, ok ? 'Telegram test message sent.' : 'Telegram send failed.', tone: ok ? 'ok' : 'error');
      } else if (action == 'email.test') {
        showAppSnack(context, 'Test email sent to ${res is Map ? res['sentTo'] : ''}', tone: 'ok');
      } else if (action == 'backup.run') {
        if (res is Map && res['skipped'] == true) {
          showAppSnack(context, 'Auto backup is OFF — pehle ON karein.', tone: 'warn');
        } else if (res is Map && res['error'] != null) {
          showAppSnack(context, '${res['error']}', tone: 'error');
        } else {
          showAppSnack(
            context,
            'Backup created: ${res is Map ? (res['name'] ?? res['backupId'] ?? '') : ''}',
            tone: 'ok',
          );
        }
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    }
  }

  Future<void> _selftest() async {
    final appState = context.read<AppState>();
    try {
      final res = await appState.api.call('selftest.run');
      if (!mounted) return;
      final map = res is Map ? Map<String, dynamic>.from(res) : <String, dynamic>{};
      setState(() {
        _checks = [
          for (final c in (map['checks'] as List? ?? const [])) Map<String, dynamic>.from(c as Map),
        ];
      });
      showAppSnack(
        context,
        map['ok'] == true ? 'Self-test passed.' : 'Self-test me issues hain — details dekho.',
        tone: map['ok'] == true ? 'ok' : 'warn',
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
    final canAdmin = appState.hasRole('ADMIN');
    final extraKeys = _values.keys.where((k) => !_known.contains(k)).toList();

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PageHeader(
            title: 'Settings',
            subtitle: 'System configuration, notification tests and deployment health.',
            actions: [
              OutlinedButton.icon(
                onPressed: _loading ? null : _load,
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text('Refresh'),
              ),
              if (canAdmin)
                FilledButton.icon(
                  onPressed: _loading ? null : _save,
                  icon: const Icon(Icons.save_outlined, size: 18),
                  label: const Text('Save settings'),
                ),
            ],
          ),
          if (_loading)
            const LoadingBox(label: 'Loading settings…')
          else if (_error.isNotEmpty)
            ErrorBox(message: _error, onRetry: _load)
          else ...[
            SectionCard(
              title: 'System settings',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TextField(
                    controller: _ctl('TELEGRAM_BOT_TOKEN'),
                    enabled: canAdmin,
                    obscureText: true,
                    decoration: const InputDecoration(
                      labelText: 'Telegram bot token',
                      hintText: 'From @BotFather',
                    ),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _ctl('TELEGRAM_CHAT_ID'),
                    enabled: canAdmin,
                    decoration: const InputDecoration(labelText: 'Telegram chat ID'),
                  ),
                  const SizedBox(height: 4),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Auto backup (with daily process)', style: TextStyle(fontSize: 13.5)),
                    value: _ctl('AUTO_BACKUP').text == 'ON',
                    onChanged: canAdmin
                        ? (v) => setState(() {
                              _ctl('AUTO_BACKUP').text = v ? 'ON' : 'OFF';
                            })
                        : null,
                  ),
                  TextField(
                    controller: _ctl('BACKUP_FOLDER_ID'),
                    enabled: canAdmin,
                    decoration: const InputDecoration(labelText: 'Backup folder ID (Drive, optional)'),
                  ),
                  for (final k in extraKeys) ...[
                    const SizedBox(height: 10),
                    TextField(
                      controller: _ctl(k),
                      enabled: canAdmin,
                      decoration: InputDecoration(labelText: k),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 14),
            SectionCard(
              title: 'Tests & backup',
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  OutlinedButton.icon(
                    onPressed: canAdmin ? () => _op('telegram.test') : null,
                    icon: const Icon(Icons.send_outlined, size: 16),
                    label: const Text('Test Telegram'),
                  ),
                  OutlinedButton.icon(
                    onPressed: canAdmin ? () => _op('email.test') : null,
                    icon: const Icon(Icons.mail_outline, size: 16),
                    label: const Text('Test email'),
                  ),
                  OutlinedButton.icon(
                    onPressed: canAdmin ? () => _op('backup.run') : null,
                    icon: const Icon(Icons.archive_outlined, size: 16),
                    label: const Text('Backup now'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            SectionCard(
              title: 'Deployment self-test',
              trailing: OutlinedButton(
                onPressed: canAdmin ? _selftest : null,
                child: const Text('Run self-test'),
              ),
              child: _checks == null
                  ? Text(
                      'Backend checks chalata hai (sheets, credentials, sessions, inventory).',
                      style: TextStyle(fontSize: 12.5, color: ac.muted),
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        for (final c in _checks!)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Icon(
                                  c['ok'] == true ? Icons.check_circle_outline : Icons.error_outline,
                                  size: 17,
                                  color: c['ok'] == true ? ac.ok : ac.danger,
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: RichText(
                                    text: TextSpan(
                                      style: TextStyle(fontSize: 13, color: ac.ink),
                                      children: [
                                        TextSpan(
                                          text: '${c['name'] ?? ''}',
                                          style: const TextStyle(fontWeight: FontWeight.w600),
                                        ),
                                        TextSpan(
                                          text: '  ${c['detail'] ?? ''}',
                                          style: TextStyle(color: ac.muted, fontSize: 12.5),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
            ),
            const SizedBox(height: 14),
            SectionCard(
              title: 'Connection',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      ToneBadge(
                        appState.demoMode ? 'Demo mode' : 'HTTP backend',
                        tone: appState.demoMode ? 'warn' : 'info',
                      ),
                      const SizedBox(width: 8),
                      if (appState.demoMode)
                        OutlinedButton(
                          onPressed: () => appState.exitDemo(),
                          child: const Text('Exit demo'),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  SelectableText(
                    appState.api.baseUrl.isEmpty ? '(koi backend URL set nahi)' : appState.api.baseUrl,
                    style: TextStyle(fontSize: 12.5, color: ac.muted),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
