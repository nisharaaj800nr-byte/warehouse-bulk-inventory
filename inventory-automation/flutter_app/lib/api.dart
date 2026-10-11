import 'dart:convert';

import 'package:http/http.dart' as http;

import 'demo.dart';

/// Error carrying the backend's machine-readable code
/// (AUTH_REQUIRED, AUTH_FAILED, AUTH_LOCKED, FORBIDDEN, BACKEND_ERROR, ...).
class ApiException implements Exception {
  final String code;
  final String message;
  ApiException(this.code, this.message);

  @override
  String toString() => '$code: $message';
}

/// HTTP client for the Apps Script backend (code-api.gs, fetch mode).
///
/// The app POSTs `{action, params}` as text/plain JSON to the deployed
/// `/exec` URL and unwraps the `{status, data, version}` envelope.
class ApiClient {
  String baseUrl = '';
  String token = '';
  bool demoMode = false;
  void Function()? onAuthRequired;

  static const Set<String> _publicActions = {'health', 'auth.login', 'auth.logout'};

  Future<dynamic> call(String action, [Map<String, dynamic>? params]) async {
    final args = <String, dynamic>{...?params};
    if (demoMode) {
      return demoCall(action, args);
    }
    if (baseUrl.isEmpty) {
      throw ApiException('NO_URL', 'Backend URL is not configured.');
    }
    if (token.isNotEmpty && !_publicActions.contains(action)) {
      args['token'] = token;
    }
    final body = jsonEncode({'action': action, 'params': args});

    http.Response resp;
    try {
      resp = await http
          .post(
            Uri.parse(baseUrl),
            headers: {'Content-Type': 'text/plain;charset=utf-8'},
            body: body,
          )
          .timeout(const Duration(seconds: 120));
    } catch (e) {
      throw ApiException('NETWORK', 'Connection failed — internet/URL check karein.\n$e');
    }

    dynamic parsed;
    try {
      parsed = jsonDecode(resp.body);
    } catch (_) {
      final snippet = resp.body.length > 220 ? resp.body.substring(0, 220) : resp.body;
      throw ApiException(
        'BAD_RESPONSE',
        'Backend ne JSON nahi bheja. URL/access check karein.\n$snippet',
      );
    }

    if (parsed is! Map<String, dynamic>) {
      throw ApiException('BAD_RESPONSE', 'Unexpected backend response.');
    }
    if (parsed['status'] == 'ok') {
      return parsed['data'];
    }

    final code = (parsed['code'] ?? 'BACKEND_ERROR').toString();
    final message = (parsed['message'] ?? 'Backend error').toString();
    if (code == 'AUTH_REQUIRED' && token.isNotEmpty) {
      token = '';
      onAuthRequired?.call();
    }
    throw ApiException(code, message);
  }
}

/// Removes the leading machine code from a backend message for display.
String stripApiCode(String message) {
  return message.replaceFirst(
    RegExp(r'^(AUTH_REQUIRED|AUTH_FAILED|AUTH_LOCKED|FORBIDDEN|BACKEND_ERROR|BAD_REQUEST|NO_URL|NO_TRANSPORT|BAD_RESPONSE|NETWORK):\s*'),
    '',
  );
}
