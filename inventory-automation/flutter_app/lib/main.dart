import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'screens/login_screen.dart';
import 'screens/shell.dart';
import 'state.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final appState = AppState();
  await appState.boot();
  runApp(
    ChangeNotifierProvider<AppState>.value(
      value: appState,
      child: const BulkRepairApp(),
    ),
  );
}

class BulkRepairApp extends StatelessWidget {
  const BulkRepairApp({super.key});

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    return MaterialApp(
      title: 'Warehouse Bulk Inventory',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(AppColors.light, Brightness.light),
      darkTheme: buildTheme(AppColors.dark, Brightness.dark),
      themeMode: appState.darkMode ? ThemeMode.dark : ThemeMode.light,
      home: appState.session == null ? const LoginScreen() : const Shell(),
    );
  }
}
