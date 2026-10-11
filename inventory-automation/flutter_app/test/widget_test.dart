import 'package:bulk_repair_app/theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('themes build with correct brightness', () {
    expect(buildTheme(AppColors.light, Brightness.light).brightness, Brightness.light);
    expect(buildTheme(AppColors.dark, Brightness.dark).brightness, Brightness.dark);
  });
}
