import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';

class SessionInfo {
  final String email;
  final String role;
  final String? expiresAt;
  final bool legacy;

  const SessionInfo({
    required this.email,
    required this.role,
    this.expiresAt,
    this.legacy = false,
  });

  factory SessionInfo.fromJson(Map<String, dynamic> json) => SessionInfo(
        email: (json['email'] ?? '').toString(),
        role: (json['role'] ?? 'VIEWER').toString(),
        expiresAt: json['expiresAt']?.toString(),
        legacy: json['legacy'] == true,
      );
}

const Map<String, int> roleLevels = {
  'VIEWER': 0,
  'OPERATOR': 1,
  'MANAGER': 2,
  'ADMIN': 3,
  'OWNER': 4,
};

/// Global app state: session, backend settings, theme.
class AppState extends ChangeNotifier {
  final ApiClient api = ApiClient();

  bool initialized = false;
  SessionInfo? session;
  bool darkMode = false;
  bool demoMode = false;

  bool hasRole(String min) {
    final role = session?.role ?? '';
    return (roleLevels[role] ?? 0) >= (roleLevels[min] ?? 0);
  }

  Future<void> boot() async {
    final prefs = await SharedPreferences.getInstance();
    api.baseUrl = prefs.getString('ors.baseUrl') ?? '';
    api.token = prefs.getString('ors.token') ?? '';
    darkMode = prefs.getBool('ors.dark') ?? false;

    api.onAuthRequired = () {
      session = null;
      notifyListeners();
    };

    if (api.baseUrl.isNotEmpty && api.token.isNotEmpty) {
      try {
        final data = await api.call('auth.whoami');
        session = SessionInfo.fromJson(Map<String, dynamic>.from(data as Map));
      } on ApiException catch (e) {
        if (e.code == 'AUTH_REQUIRED') {
          api.token = '';
          await prefs.remove('ors.token');
        }
      } catch (_) {
        // Network hiccup or unexpected error on boot — stay signed out.
      }
    }
    initialized = true;
    notifyListeners();
  }

  Future<void> login({
    required String baseUrl,
    required String email,
    required String password,
    required bool rememberMe,
  }) async {
    demoMode = false;
    api.demoMode = false;
    final prefs = await SharedPreferences.getInstance();
    api.baseUrl = baseUrl.trim();
    await prefs.setString('ors.baseUrl', api.baseUrl);

    final data = await api.call('auth.login', {
      'email': email,
      'password': password,
      'rememberMe': rememberMe,
    });
    final map = Map<String, dynamic>.from(data as Map);
    api.token = (map['token'] ?? '').toString();
    if (rememberMe) {
      await prefs.setString('ors.token', api.token);
    } else {
      await prefs.remove('ors.token');
    }
    session = SessionInfo(
      email: (map['email'] ?? email).toString(),
      role: (map['role'] ?? 'VIEWER').toString(),
      expiresAt: map['expiresAt']?.toString(),
    );
    notifyListeners();
  }

  Future<void> logout() async {
    try {
      await api.call('auth.logout', {'token': api.token});
    } catch (_) {
      // best effort
    }
    api.token = '';
    session = null;
    demoMode = false;
    api.demoMode = false;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('ors.token');
    notifyListeners();
  }

  void enterDemo() {
    demoMode = true;
    api.demoMode = true;
    session = const SessionInfo(email: 'admin@demo.local', role: 'ADMIN');
    notifyListeners();
  }

  void exitDemo() {
    demoMode = false;
    api.demoMode = false;
    session = null;
    notifyListeners();
  }

  Future<void> setDarkMode(bool value) async {
    darkMode = value;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('ors.dark', value);
  }
}
