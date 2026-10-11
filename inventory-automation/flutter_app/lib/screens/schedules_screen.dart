import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/tiles.dart';

class SchedulesScreen extends StatefulWidget {
  const SchedulesScreen({super.key});

  @override
  State<SchedulesScreen> createState() => _SchedulesScreenState();
}

class _SchedulesScreenState extends State<SchedulesScreen> {
  List<Map<String, String>> _rows = [];
  bool _loading = true;

  static const List<String> _tasks = ['Daily Process', 'Daily Report', 'Email Report'];
  static const List<String> _freqs = ['Manual', 'Hourly', 'Daily', 'Weekly', 'Monthly'];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('ors.schedules');
    List<Map<String, String>> rows;
    if (raw == null || raw.isEmpty) {
      rows = [
        {'name': 'Daily Process', 'task': 'Daily Process', 'freq': 'Daily', 'time': '19:00', 'active': 'ON'},
        {'name': 'Daily Report', 'task': 'Daily Report', 'freq': 'Daily', 'time': '20:00', 'active': 'ON'},
      ];
      await prefs.setString('ors.schedules', jsonEncode(rows));
    } else {
      rows = [
        for (final r in (jsonDecode(raw) as List)) Map<String, String>.from(r as Map),
      ];
    }
    if (!mounted) return;
    setState(() {
      _rows = rows;
      _loading = false;
    });
  }

  Future<void> _save() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('ors.schedules', jsonEncode(_rows));
  }

  Future<void> _edit(int index) async {
    final initial = index >= 0 && index < _rows.length ? _rows[index] : null;
    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (ctx) => _ScheduleDialog(initial: initial, tasks: _tasks, freqs: _freqs),
    );
    if (result == null || !mounted) return;
    final dup = _rows.asMap().entries.any((e) =>
        e.key != index &&
        e.value['name']!.toLowerCase() == result['name']!.toLowerCase() &&
        e.value['time'] == result['time']);
    if (dup) {
      showAppSnack(context, 'Isi naam + time wala schedule already exists.', tone: 'warn');
      return;
    }
    setState(() {
      if (index >= 0 && index < _rows.length) {
        _rows[index] = result;
      } else {
        _rows.add(result);
      }
    });
    await _save();
    if (!mounted) return;
    showAppSnack(context, 'Schedule saved.', tone: 'ok');
  }

  Future<void> _delete(int index) async {
    final ok = await confirmDialog(
      context,
      title: 'Delete schedule',
      message: 'Delete "${_rows[index]['name']}" schedule?',
      confirmLabel: 'Delete',
      danger: true,
    );
    if (!ok || !mounted) return;
    setState(() => _rows.removeAt(index));
    await _save();
  }

  Future<void> _runNow(Map<String, String> s) async {
    final appState = context.read<AppState>();
    if (s['task'] == 'Daily Process') {
      final ok = await confirmDialog(
        context,
        title: 'Run now — ${s['name']}',
        message: 'Run the daily processing pipeline now?',
        confirmLabel: 'Run now',
      );
      if (!ok || !mounted) return;
      try {
        final res = await appState.api.call('process.run');
        if (!mounted) return;
        final msg = (res is Map && res['message'] != null) ? '${res['message']}' : 'Process completed.';
        showAppSnack(context, msg, tone: 'ok');
      } on ApiException catch (e) {
        if (!mounted) return;
        showAppSnack(context, stripApiCode(e.message), tone: 'error');
      }
    } else {
      showAppSnack(context, '"${s['name']}" triggered (reports backend se bheje jaate hain).', tone: 'ok');
    }
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final ac = appColors(context);
    final canAdmin = appState.hasRole('ADMIN');
    final canRun = appState.hasRole('OPERATOR');

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PageHeader(
            title: 'Schedules',
            subtitle: 'Kaunse task kab chalें — backend triggers Apps Script me set hote hain.',
            actions: [
              if (canAdmin)
                FilledButton.icon(
                  onPressed: () => _edit(-1),
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Add schedule'),
                ),
            ],
          ),
          if (_loading)
            const LoadingBox(label: 'Loading schedules…')
          else if (_rows.isEmpty)
            const EmptyState(title: 'No schedules', hint: 'Add a schedule to plan daily runs.')
          else
            for (var i = 0; i < _rows.length; i++)
              ObjectTile(
                title: _rows[i]['name'] ?? '',
                subtitle: '${_rows[i]['task']}  ·  ${_rows[i]['freq']}  ·  ${_rows[i]['time']}',
                badges: [
                  ToneBadge(_rows[i]['active'] ?? '—',
                      tone: _rows[i]['active'] == 'ON' ? 'ok' : 'neutral'),
                ],
                menuBuilder: (ctx) => [
                  if (canRun) const PopupMenuItem(value: 'run', child: Text('Run Now')),
                  if (canAdmin) const PopupMenuItem(value: 'edit', child: Text('Edit')),
                  if (canAdmin)
                    PopupMenuItem(
                      value: 'del',
                      child: Text('Delete', style: TextStyle(color: ac.danger)),
                    ),
                ],
                onAction: (a) {
                  if (a == 'run') _runNow(_rows[i]);
                  if (a == 'edit') _edit(i);
                  if (a == 'del') _delete(i);
                },
              ),
          const SizedBox(height: 6),
          Text(
            'Tip: Apps Script backend me daily trigger (7 PM) set karne ke liye editor me setupDailyTrigger() run karein.',
            style: TextStyle(fontSize: 12.5, color: ac.muted),
          ),
        ],
      ),
    );
  }
}

class _ScheduleDialog extends StatefulWidget {
  final Map<String, String>? initial;
  final List<String> tasks;
  final List<String> freqs;

  const _ScheduleDialog({this.initial, required this.tasks, required this.freqs});

  @override
  State<_ScheduleDialog> createState() => _ScheduleDialogState();
}

class _ScheduleDialogState extends State<_ScheduleDialog> {
  late final TextEditingController _name;
  late final TextEditingController _time;
  late String _task;
  late String _freq;
  late bool _active;

  @override
  void initState() {
    super.initState();
    final i = widget.initial;
    _name = TextEditingController(text: i?['name'] ?? '');
    _time = TextEditingController(text: i?['time'] ?? '19:00');
    _task = widget.tasks.contains(i?['task']) ? i!['task']! : widget.tasks.first;
    _freq = widget.freqs.contains(i?['freq']) ? i!['freq']! : 'Daily';
    _active = (i?['active'] ?? 'ON') == 'ON';
  }

  @override
  void dispose() {
    _name.dispose();
    _time.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.initial == null ? 'Add schedule' : 'Edit schedule',
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
      content: SizedBox(
        width: 440,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(controller: _name, decoration: const InputDecoration(labelText: 'Schedule name')),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: _task,
                decoration: const InputDecoration(labelText: 'Task'),
                items: [for (final t in widget.tasks) DropdownMenuItem(value: t, child: Text(t))],
                onChanged: (v) => setState(() => _task = v ?? widget.tasks.first),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: _freq,
                decoration: const InputDecoration(labelText: 'Frequency'),
                items: [for (final f in widget.freqs) DropdownMenuItem(value: f, child: Text(f))],
                onChanged: (v) => setState(() => _freq = v ?? 'Daily'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _time,
                decoration: const InputDecoration(labelText: 'Time (HH:MM)', hintText: '19:00'),
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
            'name': _name.text.trim(),
            'task': _task,
            'freq': _freq,
            'time': _time.text.trim(),
            'active': _active ? 'ON' : 'OFF',
          }),
          child: const Text('Save'),
        ),
      ],
    );
  }
}
