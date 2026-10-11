import 'package:flutter/material.dart';

/// Palette + geometry matching the original Control Center (Index.html).
class AppColors {
  final bool isDark;
  final Color bg;
  final Color surface;
  final Color surface2;
  final Color ink;
  final Color muted;
  final Color line;
  final Color brand;
  final Color brandStrong;
  final Color accent;
  final Color onAccent;
  final Color ok;
  final Color warn;
  final Color danger;
  final Color info;
  final Color chip;
  final Color inputBorder;
  final Color thBg;
  final Color thFg;
  final Color sideBg;
  final Color sideText;
  final Color sideMuted;
  final Color sideActive;

  const AppColors({
    required this.isDark,
    required this.bg,
    required this.surface,
    required this.surface2,
    required this.ink,
    required this.muted,
    required this.line,
    required this.brand,
    required this.brandStrong,
    required this.accent,
    required this.onAccent,
    required this.ok,
    required this.warn,
    required this.danger,
    required this.info,
    required this.chip,
    required this.inputBorder,
    required this.thBg,
    required this.thFg,
    required this.sideBg,
    required this.sideText,
    required this.sideMuted,
    required this.sideActive,
  });

  static const AppColors light = AppColors(
    isDark: false,
    bg: Color(0xFFFFFFFF),
    surface: Color(0xFFFFFFFF),
    surface2: Color(0xFFF7FAFC),
    ink: Color(0xFF1C2733),
    muted: Color(0xFF6B7A8C),
    line: Color(0xFFE3E9F0),
    brand: Color(0xFF1F4E79),
    brandStrong: Color(0xFF2E75B6),
    accent: Color(0xFF00CCC9),
    onAccent: Color(0xFF07302E),
    ok: Color(0xFF1E8E3E),
    warn: Color(0xFFB26A00),
    danger: Color(0xFFC5221F),
    info: Color(0xFF1A73E8),
    chip: Color(0xFFEEF3F8),
    inputBorder: Color(0xFFCFD9E4),
    thBg: Color(0xFFF7FAFC),
    thFg: Color(0xFF46586B),
    sideBg: Color(0xFF14283C),
    sideText: Color(0xFFB9CBDC),
    sideMuted: Color(0xFF8FA7BD),
    sideActive: Color(0xFF2E75B6),
  );

  static const AppColors dark = AppColors(
    isDark: true,
    bg: Color(0xFF0D1520),
    surface: Color(0xFF16202E),
    surface2: Color(0xFF1B2735),
    ink: Color(0xFFDBE6F2),
    muted: Color(0xFF8BA0B5),
    line: Color(0xFF243446),
    brand: Color(0xFF3D8BD6),
    brandStrong: Color(0xFF5EA2E0),
    accent: Color(0xFF00CCC9),
    onAccent: Color(0xFF07302E),
    ok: Color(0xFF4CAF7D),
    warn: Color(0xFFE0A63D),
    danger: Color(0xFFEF6A67),
    info: Color(0xFF5AA8F5),
    chip: Color(0xFF1D2B3B),
    inputBorder: Color(0xFF2C3D52),
    thBg: Color(0xFF1B2735),
    thFg: Color(0xFF9DB2C7),
    sideBg: Color(0xFF14283C),
    sideText: Color(0xFFB9CBDC),
    sideMuted: Color(0xFF8FA7BD),
    sideActive: Color(0xFF5EA2E0),
  );
}

AppColors appColors(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark ? AppColors.dark : AppColors.light;

/// The exact double-shadow card look from the original UI.
BoxDecoration appCardDecoration(AppColors c) => BoxDecoration(
      color: c.surface,
      border: Border.all(color: c.line),
      borderRadius: BorderRadius.circular(6),
      boxShadow: c.isDark
          ? const [
              BoxShadow(color: Color(0x59000000), blurRadius: 3, offset: Offset(0, 1)),
              BoxShadow(color: Color(0x4D000000), blurRadius: 14, offset: Offset(0, 4)),
            ]
          : const [
              BoxShadow(color: Color(0x14102036), blurRadius: 3, offset: Offset(0, 1)),
              BoxShadow(color: Color(0x0F102036), blurRadius: 14, offset: Offset(0, 4)),
            ],
    );

ThemeData buildTheme(AppColors c, Brightness brightness) {
  final scheme = ColorScheme(
    brightness: brightness,
    primary: c.brand,
    onPrimary: Colors.white,
    secondary: c.brandStrong,
    onSecondary: Colors.white,
    error: c.danger,
    onError: Colors.white,
    surface: c.surface,
    onSurface: c.ink,
    outline: c.line,
    outlineVariant: c.line,
    onSurfaceVariant: c.muted,
    surfaceContainerHighest: c.chip,
    surfaceContainerHigh: c.surface2,
    surfaceContainer: c.surface2,
    surfaceContainerLow: c.surface2,
    surfaceContainerLowest: c.surface,
    tertiary: c.info,
    onTertiary: Colors.white,
  );

  final base = ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    visualDensity: const VisualDensity(horizontal: -1, vertical: -1),
  );

  return base.copyWith(
    scaffoldBackgroundColor: c.bg,
    canvasColor: c.bg,
    dividerColor: c.line,
    splashColor: c.chip,
    highlightColor: c.chip,
    textTheme: base.textTheme.copyWith(
      titleLarge: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: c.ink),
      titleMedium: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.ink),
      titleSmall: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: c.ink),
      bodyMedium: TextStyle(fontSize: 14, color: c.ink),
      bodySmall: TextStyle(fontSize: 12.5, color: c.muted),
      labelLarge: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: c.surface,
      foregroundColor: c.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      centerTitle: false,
      titleTextStyle: TextStyle(color: c.ink, fontSize: 18, fontWeight: FontWeight.w700),
      shape: Border(bottom: BorderSide(color: c.line)),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: c.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      titleTextStyle: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.ink),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.surface,
      isDense: true,
      hintStyle: TextStyle(color: c.muted, fontSize: 13),
      labelStyle: TextStyle(color: c.muted, fontSize: 12.5, fontWeight: FontWeight.w600),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: c.inputBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: c.inputBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: c.brandStrong, width: 1.5),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 11, vertical: 10),
    ),
    dividerTheme: DividerThemeData(color: c.line, thickness: 1, space: 1),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: c.accent,
        foregroundColor: c.onAccent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        minimumSize: const Size(64, 38),
        textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: c.ink,
        backgroundColor: c.surface,
        side: BorderSide(color: c.line),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
        minimumSize: const Size(64, 38),
        textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: c.brandStrong,
        textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: brightness == Brightness.dark ? const Color(0xFF23324A) : const Color(0xFF1C2733),
      contentTextStyle: const TextStyle(color: Colors.white, fontSize: 13),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: c.brandStrong),
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(color: c.ink, borderRadius: BorderRadius.circular(6)),
      textStyle: TextStyle(color: c.surface, fontSize: 12),
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: c.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: BorderSide(color: c.line),
      ),
      textStyle: TextStyle(color: c.ink, fontSize: 13.5),
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? c.brandStrong : null,
      ),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? Colors.white : null,
      ),
      trackColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? c.brandStrong : c.line,
      ),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: ButtonStyle(
        textStyle: WidgetStateProperty.all(const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
        visualDensity: VisualDensity.compact,
      ),
    ),
  );
}
