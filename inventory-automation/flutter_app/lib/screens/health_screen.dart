import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/common.dart';

class _Check {
  final String name;
  final String status; // ok | warn | err
  final String detail;
  const _Check(this.name, this.status, this.detail);
}

class HealthScreen extends StatefulWidget {
  const HealthScreen({super.key});

  @override
  State<HealthScreen> createState() => _HealthScreenState();
}

class _HealthScreenState extends State<HealthScreen> {
  List<_Check> _checks = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _run();
  }

  Future<void> _run() async {
    final appState = context.read<AppState>();
    setState(() {
      _loading = true;
      _checks = [];
    });
    final checks = <_Check>[];

    // Backend connection
    try {
      final h = await appState.api.call('health');
      final mode = (h is Map && h['mode'] != null) ? '${h['mode']}' : 'connected';
      checks.add(_Check('Apps Script Backend', appState.demoMode ? 'warn' : 'ok',
          appState.demoMode ? 'Demo mode — no backend required' : 'Reachable ($mode)'));
    } on ApiException catch (e) {
      checks.add(_Check('Apps Script Backend', 'err', stripApiCode(e.message)));
    }

    // Sources
    try {
      final s = await appState.api.call('sources.list', {'all': true});
      final active = (s as List).where((r) => r is Map && '${r['Active']}' == 'ON').length;
      checks.add(_Check('Data Sources', active > 0 ? 'ok' : 'warn', '$active active sources'));
    } catch (_) {
      checks.add(const _Check('Data Sources', 'warn', 'could not load'));
    }

    // Field mapping
    try {
      final m = await appState.api.call('mapping.list', {'all': true});
      final active = (m as List).where((r) => r is Map && '${r['Active']}' != 'OFF').length;
      checks.add(_Check('Field Mapping', active > 0 ? 'ok' : 'warn', '$active active mappings'));
    } catch (_) {
      checks.add(const _Check('Field Mapping', 'warn', 'could not load'));
    }

    // Rules
    try {
      final age = await appState.api.call('rules.age.list');
      final st = await appState.api.call('rules.status.list');
      final loc = await appState.api.call('rules.location.list');
      checks.add(_Check('Age Rules', (age as List).isNotEmpty ? 'ok' : 'err', '${age.length} rules'));
      checks.add(_Check('Status Rules', (st as List).isNotEmpty ? 'ok' : 'err', '${st.length} mappings'));
      checks.add(_Check('Location Rules', (loc as List).isNotEmpty ? 'ok' : 'err', '${loc.length} rules'));
    } catch (_) {
      checks.add(const _Check('Rules', 'warn', 'could not load'));
    }

    // Last run + failed jobs
    try {
      final h = await appState.api.call('history.list');
      final data = ((h as Map)['data'] as List?) ?? const [];
      if (data.isEmpty) {
        checks.add(const _Check('Last Successful Run', 'warn', 'no runs yet'));
        checks.add(const _Check('Failed Jobs', 'ok', 'none'));
      } else {
        final last = data.last as List;
        final status = last.length > 8 ? '${last[8]}' : '';
        final ok = status.toUpperCase() == 'OK' || status.toUpperCase() == 'SUCCESS';
        checks.add(_Check('Last Successful Run', ok ? 'ok' : 'warn',
            last.isNotEmpty ? '${last[0]} · $status' : status));
        checks.add(_Check('Failed Jobs', status.toUpperCase() == 'FAILED' ? 'err' : 'ok',
            status.toUpperCase() == 'FAILED' ? 'last run failed' : 'none'));
      }
    } catch (_) {
      checks.add(const _Check('Processing History', 'warn', 'could not load'));
    }

    // Security
    try {
      final sec = await appState.api.call('security.list');
      final locked = (sec as List).where((r) => r is Map && '${r['Access'] ?? r['Mode']}'.toUpperCase().contains('LOCK')).length;
      checks.add(_Check('Security', 'ok', '$locked locked sheets'));
    } catch (_) {
      checks.add(const _Check('Security', 'warn', 'could not load'));
    }

    // Telegram
    try {
      final s = await appState.api.call('settings.get');
      final tg = '${(s as Map)['TELEGRAM_BOT_TOKEN'] ?? ''}'.isNotEmpty;
      checks.add(_Check('Telegram', tg ? 'ok' : 'warn', tg ? 'configured' : 'not configured (optional)'));
    } catch (_) {
      checks.add(const _Check('Telegram', 'warn', 'could not load'));
    }

    if (!mounted) return;
    setState(() {
      _checks = checks;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final ac = appColors(context);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          PageHeader(
            title: 'System Health',
            subtitle: 'Quick health check across backend, configuration and data.',
            actions: [
              OutlinedButton.icon(
                onPressed: _loading ? null : _run,
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text('Re-check'),
              ),
            ],
          ),
          if (_loading)
            const LoadingBox(label: 'Checking system health…')
          else
            SectionCard(
              title: 'Checks',
              child: Column(
                children: [
                  for (final c in _checks)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 9),
                      child: Row(
                        children: [
                          Container(
                            width: 10,
                            height: 10,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: c.status == 'ok'
                                  ? ac.ok
                                  : c.status == 'warn'
                                      ? ac.warn
                                      : ac.danger,
                            ),
                          ),
                          const SizedBox(width: 12),
                          ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 200),
                            child: Text(
                              c.name,
                              style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: ac.ink),
                            ),
                          ),
                          Expanded(
                            child: Text(c.detail, style: TextStyle(fontSize: 13, color: ac.muted)),
                          ),
                          ToneBadge(
                            c.status == 'ok' ? 'Healthy' : (c.status == 'warn' ? 'Warning' : 'Error'),
                            tone: c.status == 'ok' ? 'ok' : (c.status == 'warn' ? 'warn' : 'danger'),
                          ),
                        ],
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
