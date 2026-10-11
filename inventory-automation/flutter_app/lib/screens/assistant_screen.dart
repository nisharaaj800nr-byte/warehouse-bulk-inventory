import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/common.dart';

class AssistantScreen extends StatefulWidget {
  const AssistantScreen({super.key});

  @override
  State<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends State<AssistantScreen> {
  final _ctl = TextEditingController();
  Map<String, dynamic>? _result;
  bool _busy = false;

  static const List<String> _examples = [
    'aaj ka inventory summary banao',
    '75 days se upar wale Apple devices dikhao',
    'Bin Storage me kitne devices hain',
  ];

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  Future<void> _run() async {
    final appState = context.read<AppState>();
    final text = _ctl.text.trim();
    if (text.isEmpty) return;
    setState(() => _busy = true);
    try {
      final res = await appState.api.call('ai.command', {'text': text});
      if (!mounted) return;
      setState(() {
        _result = res is Map ? Map<String, dynamic>.from(res) : <String, dynamic>{'result': '$res'};
      });
      final ok = _result?['success'] != false;
      showAppSnack(
        context,
        ok ? 'Command executed.' : '${_result?['message'] ?? 'Command not recognized.'}',
        tone: ok ? 'ok' : 'warn',
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final ac = appColors(context);
    final canRun = appState.hasRole('OPERATOR');

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const PageHeader(
            title: 'AI Assistant',
            subtitle: 'Natural-language commands (Hindi / English) — rules engine ke through chalti hain.',
          ),
          SectionCard(
            title: 'Command',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(
                  controller: _ctl,
                  maxLines: 4,
                  decoration: const InputDecoration(
                    hintText: 'e.g. "75 days se upar wale Apple devices dikhao"',
                  ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final ex in _examples)
                      ActionChip(
                        label: Text(ex, style: const TextStyle(fontSize: 12.5)),
                        onPressed: () => setState(() => _ctl.text = ex),
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                Align(
                  alignment: Alignment.centerRight,
                  child: FilledButton.icon(
                    onPressed: (canRun && !_busy) ? _run : null,
                    icon: const Icon(Icons.auto_awesome, size: 18),
                    label: _busy ? const Text('Running…') : const Text('Run command'),
                  ),
                ),
                if (!canRun)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      'Your role cannot run commands (needs OPERATOR+).',
                      style: TextStyle(fontSize: 12.5, color: ac.muted),
                    ),
                  ),
              ],
            ),
          ),
          if (_result != null) ...[
            const SizedBox(height: 14),
            SectionCard(
              title: 'Result',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      ToneBadge(
                        _result?['success'] == false ? 'Not recognized' : 'Done',
                        tone: _result?['success'] == false ? 'danger' : 'ok',
                      ),
                      const SizedBox(width: 10),
                      Flexible(
                        child: Text(
                          '${_result?['message'] ?? ''}',
                          style: TextStyle(fontSize: 13.5, color: ac.ink),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: ac.chip,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: SelectableText(
                      const JsonEncoder.withIndent('  ').convert(_result),
                      style: TextStyle(fontSize: 12, color: ac.muted, fontFamily: 'monospace'),
                    ),
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
