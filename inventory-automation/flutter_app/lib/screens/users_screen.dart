import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/tiles.dart';

const List<String> _roles = ['VIEWER', 'OPERATOR', 'MANAGER', 'ADMIN', 'OWNER'];

class UsersScreen extends StatefulWidget {
  const UsersScreen({super.key});

  @override
  State<UsersScreen> createState() => _UsersScreenState();
}

class _UsersScreenState extends State<UsersScreen> {
  int _tab = 0;

  List<Map<String, dynamic>> _users = [];
  bool _usersLoading = true;
  String _usersError = '';

  List<Map<String, String>> _sec = [];
  bool _secLoading = true;
  String _secError = '';

  @override
  void initState() {
    super.initState();
    _loadUsers();
    _loadSecurity();
  }

  Future<void> _loadUsers() async {
    final appState = context.read<AppState>();
    setState(() {
      _usersLoading = true;
      _usersError = '';
    });
    try {
      final data = await appState.api.call('auth.users');
      if (!mounted) return;
      final map = Map<String, dynamic>.from(data as Map);
      setState(() {
        _users = [
          for (final u in (map['users'] as List? ?? const []))
            Map<String, dynamic>.from(u as Map),
        ];
        _usersLoading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _usersError = stripApiCode(e.message);
        _usersLoading = false;
      });
    }
  }

  Future<void> _loadSecurity() async {
    final appState = context.read<AppState>();
    setState(() {
      _secLoading = true;
      _secError = '';
    });
    try {
      final data = await appState.api.call('security.list');
      if (!mounted) return;
      setState(() {
        _sec = [
          for (final r in (data as List? ?? const []))
            {
              for (final e in (r as Map).entries) '${e.key}': e.value == null ? '' : '${e.value}',
            },
        ];
        _secLoading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _secError = stripApiCode(e.message);
        _secLoading = false;
      });
    }
  }

  Future<void> _editUser(Map<String, dynamic>? user) async {
    final appState = context.read<AppState>();
    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (ctx) => _UserDialog(initial: user),
    );
    if (result == null || !mounted) return;
    try {
      await appState.api.call('users.save', result);
      if (!mounted) return;
      showAppSnack(context, 'User saved.', tone: 'ok');
      _loadUsers();
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    }
  }

  Future<void> _resetPassword(String email) async {
    final appState = context.read<AppState>();
    final ctl = TextEditingController();
    final pw = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Reset password — $email', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
        content: SizedBox(
          width: 380,
          child: TextField(
            controller: ctl,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'New password (6+ chars)'),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(ctl.text),
            child: const Text('Reset'),
          ),
        ],
      ),
    );
    if (pw == null || pw.isEmpty || !mounted) return;
    try {
      await appState.api.call('auth.resetPassword', {'email': email, 'newPassword': pw});
      if (!mounted) return;
      showAppSnack(context, 'Password reset. Sessions revoked.', tone: 'ok');
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    }
  }

  Future<void> _secAction(String sheet, bool unlock) async {
    final appState = context.read<AppState>();
    final ok = await confirmDialog(
      context,
      title: unlock ? 'Unlock sheet' : 'Relock sheet',
      message: unlock
          ? 'Remove protection from "$sheet"? Unlock sirf maintenance ke liye karein.'
          : 'Re-apply protection to "$sheet"?',
      confirmLabel: unlock ? 'Unlock' : 'Relock',
      danger: unlock,
    );
    if (!ok || !mounted) return;
    try {
      await appState.api.call(unlock ? 'security.unlock' : 'security.lock', {'sheet': sheet});
      if (!mounted) return;
      showAppSnack(context, unlock ? 'Sheet unlocked.' : 'Sheet relocked.', tone: 'ok');
      _loadSecurity();
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    }
  }

  String _sheetKey(Map<String, String> row) {
    final keys = row.keys.toList();
    for (final k in keys) {
      if (k.toLowerCase().contains('sheet')) return k;
    }
    return keys.isNotEmpty ? keys.first : '';
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
            title: 'Users & Security',
            subtitle: 'Portal logins, roles and sheet protections (admin only).',
            actions: [
              if (canAdmin && _tab == 0)
                FilledButton.icon(
                  onPressed: () => _editUser(null),
                  icon: const Icon(Icons.person_add_alt, size: 18),
                  label: const Text('Add user'),
                ),
            ],
          ),
          SegmentedButton<int>(
            segments: const [
              ButtonSegment(value: 0, label: Text('Users'), icon: Icon(Icons.people_outline, size: 16)),
              ButtonSegment(value: 1, label: Text('Sheet security'), icon: Icon(Icons.lock_outline, size: 16)),
            ],
            selected: {_tab},
            onSelectionChanged: (s) => setState(() => _tab = s.first),
          ),
          const SizedBox(height: 14),
          if (_tab == 0) ...[
            if (_usersLoading)
              const LoadingBox(label: 'Loading users…')
            else if (_usersError.isNotEmpty)
              ErrorBox(message: _usersError, onRetry: _loadUsers)
            else if (_users.isEmpty)
              const EmptyState(title: 'No users', hint: 'Add your first portal user.')
            else
              for (final u in _users)
                ObjectTile(
                  title: '${u['email'] ?? ''}',
                  subtitle: [
                    if ('${u['lastLogin'] ?? ''}'.isNotEmpty) 'Last login: ${fmtDateTime(u['lastLogin'])}',
                    if ('${u['lockedUntil'] ?? ''}'.isNotEmpty) 'Locked until: ${fmtDateTime(u['lockedUntil'])}',
                  ].join('  ·  '),
                  badges: [
                    ToneBadge('${u['role'] ?? ''}', tone: '${u['role']}' == 'OWNER' ? 'brand' : 'info'),
                    ToneBadge('${u['active'] ?? ''}', tone: '${u['active']}' == 'ON' ? 'ok' : 'neutral'),
                    ToneBadge(
                      u['hasPassword'] == true ? 'password set' : 'no password',
                      tone: u['hasPassword'] == true ? 'ok' : 'warn',
                    ),
                  ],
                  menuBuilder: (ctx) => [
                    if (canAdmin) const PopupMenuItem(value: 'edit', child: Text('Edit')),
                    if (canAdmin) const PopupMenuItem(value: 'pw', child: Text('Reset password')),
                  ],
                  onAction: (a) {
                    if (a == 'edit') _editUser(u);
                    if (a == 'pw') _resetPassword('${u['email'] ?? ''}');
                  },
                ),
          ] else ...[
            if (_secLoading)
              const LoadingBox(label: 'Loading security config…')
            else if (_secError.isNotEmpty)
              ErrorBox(message: _secError, onRetry: _loadSecurity)
            else if (_sec.isEmpty)
              const EmptyState(title: 'No security configuration')
            else
              for (final row in _sec)
                ObjectTile(
                  title: row[_sheetKey(row)] ?? '',
                  subtitle: [
                    for (final e in row.entries)
                      if (e.key != _sheetKey(row)) '${e.key}: ${e.value}',
                  ].join('  ·  '),
                  menuBuilder: (ctx) => [
                    if (canAdmin) const PopupMenuItem(value: 'unlock', child: Text('Unlock')),
                    if (canAdmin)
                      PopupMenuItem(
                        value: 'lock',
                        child: Text('Relock', style: TextStyle(color: ac.danger)),
                      ),
                  ],
                  onAction: (a) {
                    final sheet = row[_sheetKey(row)] ?? '';
                    if (a == 'unlock') _secAction(sheet, true);
                    if (a == 'lock') _secAction(sheet, false);
                  },
                ),
          ],
        ],
      ),
    );
  }
}

class _UserDialog extends StatefulWidget {
  final Map<String, dynamic>? initial;

  const _UserDialog({this.initial});

  @override
  State<_UserDialog> createState() => _UserDialogState();
}

class _UserDialogState extends State<_UserDialog> {
  late final TextEditingController _email;
  late final TextEditingController _password;
  late String _role;
  late bool _active;

  @override
  void initState() {
    super.initState();
    final i = widget.initial;
    _email = TextEditingController(text: '${i?['email'] ?? ''}');
    _password = TextEditingController();
    _role = '${i?['role'] ?? 'OPERATOR'}';
    _active = '${i?['active'] ?? 'ON'}' == 'ON';
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isEdit = widget.initial != null;
    return AlertDialog(
      title: Text(isEdit ? 'Edit user' : 'Add user', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
      content: SizedBox(
        width: 440,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                controller: _email,
                enabled: !isEdit,
                decoration: const InputDecoration(labelText: 'Email'),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: _role,
                decoration: const InputDecoration(labelText: 'Role'),
                items: [
                  for (final r in _roles) DropdownMenuItem(value: r, child: Text(r)),
                ],
                onChanged: (v) => setState(() => _role = v ?? 'OPERATOR'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _password,
                obscureText: true,
                decoration: InputDecoration(
                  labelText: isEdit ? 'New password (optional)' : 'Initial password (optional)',
                  hintText: '6+ characters',
                ),
              ),
              const SizedBox(height: 6),
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
            'email': _email.text.trim(),
            'role': _role,
            'active': _active ? 'ON' : 'OFF',
            if (_password.text.isNotEmpty) 'password': _password.text,
          }),
          child: const Text('Save'),
        ),
      ],
    );
  }
}
