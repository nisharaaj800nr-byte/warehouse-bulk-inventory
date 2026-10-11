import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/common.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  late final TextEditingController _url;
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _remember = true;
  bool _busy = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _url = TextEditingController(text: context.read<AppState>().api.baseUrl);
  }

  @override
  void dispose() {
    _url.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final appState = context.read<AppState>();
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await appState.login(
        baseUrl: _url.text,
        email: _email.text.trim(),
        password: _password.text,
        rememberMe: _remember,
      );
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = stripApiCode(e.message));
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _testConnection() async {
    final appState = context.read<AppState>();
    appState.api.baseUrl = _url.text.trim();
    setState(() => _error = '');
    try {
      final data = await appState.api.call('health') as Map;
      if (!mounted) return;
      showAppSnack(context, 'Connected: ${data['app']} v${data['version']}', tone: 'ok');
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnack(context, stripApiCode(e.message), tone: 'error');
    }
  }

  @override
  Widget build(BuildContext context) {
    final ac = appColors(context);
    return Scaffold(
      backgroundColor: ac.bg,
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: Column(
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    gradient: const LinearGradient(colors: [Color(0xFF00CCC9), Color(0xFF00A8A5)]),
                  ),
                  child: const Center(
                    child: Text(
                      'WB',
                      style: TextStyle(color: Color(0xFF07302E), fontWeight: FontWeight.w800, fontSize: 16),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  'Warehouse Bulk Inventory',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: ac.ink),
                ),
                Text('Control Center', style: TextStyle(fontSize: 13.5, color: ac.muted)),
                const SizedBox(height: 22),
                Container(
                  decoration: appCardDecoration(ac),
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Sign in',
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: ac.ink),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Admin se mile email/password se login karein.',
                          style: TextStyle(fontSize: 12.5, color: ac.muted),
                        ),
                        const SizedBox(height: 16),
                        if (_error.isNotEmpty)
                          Container(
                            width: double.infinity,
                            margin: const EdgeInsets.only(bottom: 12),
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: ac.danger.withValues(alpha: .08),
                              border: Border.all(color: ac.danger),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(_error, style: TextStyle(fontSize: 13, color: ac.danger)),
                          ),
                        TextField(
                          controller: _url,
                          keyboardType: TextInputType.url,
                          decoration: const InputDecoration(
                            labelText: 'Backend /exec URL',
                            hintText: 'https://script.google.com/macros/s/…/exec',
                          ),
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          controller: _email,
                          keyboardType: TextInputType.emailAddress,
                          decoration: const InputDecoration(labelText: 'Email'),
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          controller: _password,
                          obscureText: true,
                          onSubmitted: (_) => _busy ? null : _submit(),
                          decoration: const InputDecoration(labelText: 'Password'),
                        ),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            SizedBox(
                              height: 26,
                              width: 26,
                              child: Checkbox(
                                value: _remember,
                                onChanged: (v) => setState(() => _remember = v ?? false),
                              ),
                            ),
                            const SizedBox(width: 4),
                            Text(
                              'Keep me signed in',
                              style: TextStyle(fontSize: 13, color: ac.ink),
                            ),
                          ],
                        ),
                        const SizedBox(height: 14),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton(
                            onPressed: _busy ? null : _submit,
                            child: _busy
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2.2,
                                      color: Colors.white,
                                    ),
                                  )
                                : const Text('Sign in'),
                          ),
                        ),
                        const SizedBox(height: 6),
                        Center(
                          child: TextButton(
                            onPressed: _busy ? null : _testConnection,
                            child: const Text('Test connection'),
                          ),
                        ),
                        Center(
                          child: TextButton(
                            onPressed: _busy ? null : () => context.read<AppState>().enterDemo(),
                            child: const Text('Explore demo (sample data)'),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'URL milega: Apps Script → Deploy → Web app ka /exec link',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12, color: ac.muted),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
