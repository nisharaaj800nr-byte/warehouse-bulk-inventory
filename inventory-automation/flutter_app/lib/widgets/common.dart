import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../theme.dart';

/* ---------------- formatting helpers ---------------- */

String fmtDate(dynamic value) {
  if (value == null || '$value'.isEmpty) return '';
  final d = value is DateTime ? value : DateTime.tryParse('$value');
  if (d == null) return '$value';
  return DateFormat('dd MMM yyyy').format(d.toLocal());
}

String fmtDateTime(dynamic value) {
  if (value == null || '$value'.isEmpty) return '';
  final d = value is DateTime ? value : DateTime.tryParse('$value');
  if (d == null) return '$value';
  return DateFormat('dd MMM yyyy HH:mm').format(d.toLocal());
}

void showAppSnack(BuildContext context, String message, {String tone = 'info'}) {
  final ac = appColors(context);
  Color bg = const Color(0xFF1C2733);
  if (tone == 'ok') bg = ac.ok;
  if (tone == 'error') bg = ac.danger;
  if (tone == 'warn') bg = ac.warn;
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message), backgroundColor: bg));
}

Future<bool> confirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  String confirmLabel = 'Confirm',
  bool danger = false,
}) async {
  final ac = appColors(context);
  final result = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
      content: Text(message, style: const TextStyle(fontSize: 13.5)),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
        if (danger)
          OutlinedButton(
            style: OutlinedButton.styleFrom(
              foregroundColor: ac.danger,
              side: BorderSide(color: ac.danger.withValues(alpha: .5)),
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(confirmLabel),
          )
        else
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(confirmLabel),
          ),
      ],
    ),
  );
  return result ?? false;
}

/* ---------------- layout widgets ---------------- */

class SectionCard extends StatelessWidget {
  final String? title;
  final Widget? trailing;
  final Widget child;
  final EdgeInsetsGeometry bodyPadding;

  const SectionCard({
    super.key,
    this.title,
    this.trailing,
    required this.child,
    this.bodyPadding = const EdgeInsets.all(16),
  });

  @override
  Widget build(BuildContext context) {
    final ac = appColors(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: appCardDecoration(ac),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (title != null) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 12, 12, 12),
              child: LayoutBuilder(
                builder: (context, c) {
                  final titleWidget = Text(
                    title!,
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: ac.brand),
                  );
                  if (trailing == null) return titleWidget;
                  if (c.maxWidth >= 480) {
                    return Row(
                      children: [
                        Expanded(child: titleWidget),
                        trailing!,
                      ],
                    );
                  }
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      titleWidget,
                      const SizedBox(height: 8),
                      Wrap(spacing: 8, runSpacing: 8, children: [trailing!]),
                    ],
                  );
                },
              ),
            ),
            Divider(height: 1, color: ac.line),
          ],
          Padding(padding: bodyPadding, child: child),
        ],
      ),
    );
  }
}

class SplitRow extends StatelessWidget {
  final Widget a;
  final Widget b;
  final double spacing;
  final double breakpoint;

  const SplitRow({super.key, required this.a, required this.b, this.spacing = 10, this.breakpoint = 460});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        if (c.maxWidth < breakpoint) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [a, SizedBox(height: spacing), b],
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [Expanded(child: a), SizedBox(width: spacing), Expanded(child: b)],
        );
      },
    );
  }
}

class ResponsiveGrid extends StatelessWidget {
  final List<Widget> children;
  final double minItemWidth;
  final double spacing;

  const ResponsiveGrid({super.key, required this.children, this.minItemWidth = 220, this.spacing = 12});

  @override
  Widget build(BuildContext context) {
    if (children.isEmpty) return const SizedBox.shrink();
    return LayoutBuilder(
      builder: (context, c) {
        final cols = ((c.maxWidth + spacing) / (minItemWidth + spacing)).floor().clamp(1, children.length);
        final w = (c.maxWidth - spacing * (cols - 1)) / cols;
        return Wrap(
          spacing: spacing,
          runSpacing: spacing,
          children: [for (final ch in children) SizedBox(width: w, child: ch)],
        );
      },
    );
  }
}

class StatCard extends StatelessWidget {
  final String label;
  final String value;
  final String? sub;
  final IconData icon;
  final String tone;

  const StatCard({
    super.key,
    required this.label,
    required this.value,
    this.sub,
    this.icon = Icons.insights_outlined,
    this.tone = 'brand',
  });

  @override
  Widget build(BuildContext context) {
    final ac = appColors(context);
    Color ic = ac.brandStrong;
    Color ib = ac.chip;
    Color vc = ac.ink;
    if (tone == 'ok') {
      ic = ac.ok;
      vc = ac.ok;
    }
    if (tone == 'warn') {
      ic = ac.warn;
      ib = ac.warn.withValues(alpha: .14);
    }
    if (tone == 'danger') {
      ic = ac.danger;
      ib = ac.danger.withValues(alpha: .12);
    }
    if (tone == 'warn') vc = ac.warn;
    if (tone == 'danger') vc = ac.danger;

    return Container(
      decoration: appCardDecoration(ac),
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label.toUpperCase(),
                  style: TextStyle(
                    fontSize: 12,
                    letterSpacing: .5,
                    fontWeight: FontWeight.w600,
                    color: ac.muted,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  value,
                  style: TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                    color: vc,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
                if (sub != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(sub!, style: TextStyle(fontSize: 11.5, color: ac.muted)),
                  ),
              ],
            ),
          ),
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(color: ib, borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, color: ic, size: 21),
          ),
        ],
      ),
    );
  }
}

class ToneBadge extends StatelessWidget {
  final String text;
  final String tone;

  const ToneBadge(this.text, {super.key, this.tone = 'neutral'});

  @override
  Widget build(BuildContext context) {
    final ac = appColors(context);
    Color fg = ac.isDark ? const Color(0xFFA7B8CA) : const Color(0xFF5F6F80);
    Color bg = ac.isDark ? const Color(0xFF223041) : const Color(0xFFEEF1F4);
    if (tone == 'ok') {
      fg = ac.ok;
      bg = ac.ok.withValues(alpha: ac.isDark ? .16 : .12);
    }
    if (tone == 'warn') {
      fg = ac.warn;
      bg = ac.warn.withValues(alpha: ac.isDark ? .16 : .15);
    }
    if (tone == 'danger') {
      fg = ac.danger;
      bg = ac.danger.withValues(alpha: ac.isDark ? .16 : .12);
    }
    if (tone == 'info') {
      fg = ac.info;
      bg = ac.info.withValues(alpha: ac.isDark ? .16 : .12);
    }
    if (tone == 'brand') {
      fg = ac.isDark ? const Color(0xFF7FB4E8) : ac.brand;
      bg = ac.isDark ? const Color(0xFF1D3550) : const Color(0xFFE3EDF7);
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Text(
        text.isEmpty ? '—' : text,
        style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: fg),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? hint;

  const EmptyState({super.key, this.icon = Icons.inbox_outlined, required this.title, this.hint});

  @override
  Widget build(BuildContext context) {
    final ac = appColors(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 16),
      child: Column(
        children: [
          Icon(icon, size: 38, color: ac.muted),
          const SizedBox(height: 10),
          Text(title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: ac.ink)),
          if (hint != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(hint!, textAlign: TextAlign.center, style: TextStyle(fontSize: 12.5, color: ac.muted)),
            ),
        ],
      ),
    );
  }
}

class ErrorBox extends StatelessWidget {
  final String message;
  final VoidCallback? onRetry;

  const ErrorBox({super.key, required this.message, this.onRetry});

  @override
  Widget build(BuildContext context) {
    final ac = appColors(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: ac.danger.withValues(alpha: .08),
        border: Border.all(color: ac.danger),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline, color: ac.danger, size: 18),
          const SizedBox(width: 10),
          Expanded(child: Text(message, style: TextStyle(fontSize: 13, color: ac.ink))),
          if (onRetry != null)
            TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}

class LoadingBox extends StatelessWidget {
  final String? label;

  const LoadingBox({super.key, this.label});

  @override
  Widget build(BuildContext context) {
    final ac = appColors(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 42),
      child: Column(
        children: [
          const SizedBox(width: 26, height: 26, child: CircularProgressIndicator(strokeWidth: 2.6)),
          if (label != null)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(label!, style: TextStyle(fontSize: 12.5, color: ac.muted)),
            ),
        ],
      ),
    );
  }
}

class PageHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  final List<Widget> actions;

  const PageHeader({super.key, required this.title, this.subtitle, this.actions = const []});

  @override
  Widget build(BuildContext context) {
    final ac = appColors(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: ac.ink, letterSpacing: -0.2),
          ),
          if (subtitle != null)
            Padding(
              padding: const EdgeInsets.only(top: 3),
              child: Text(subtitle!, style: TextStyle(fontSize: 13, color: ac.muted)),
            ),
          if (actions.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Wrap(spacing: 8, runSpacing: 8, children: actions),
            ),
        ],
      ),
    );
  }
}

/// Simple responsive table used across screens (matches the original look).
class SimpleTable extends StatelessWidget {
  final List<String> headers;
  final List<List<String>> rows;
  final void Function(int index)? onRowTap;

  const SimpleTable({super.key, required this.headers, required this.rows, this.onRowTap});

  @override
  Widget build(BuildContext context) {
    final ac = appColors(context);
    if (rows.isEmpty) {
      return const EmptyState(title: 'No data');
    }
    return LayoutBuilder(
      builder: (context, constraints) {
        return SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: ConstrainedBox(
            constraints: BoxConstraints(minWidth: constraints.maxWidth),
            child: Table(
              defaultColumnWidth: const IntrinsicColumnWidth(),
              border: TableBorder(horizontalInside: BorderSide(color: ac.line)),
              children: [
                TableRow(
                  decoration: BoxDecoration(color: ac.thBg),
                  children: headers
                      .map(
                        (h) => Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                          child: Text(
                            h.toUpperCase(),
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: ac.thFg,
                              letterSpacing: .4,
                            ),
                          ),
                        ),
                      )
                      .toList(),
                ),
                ...List.generate(rows.length, (i) {
                  final r = rows[i];
                  return TableRow(
                    decoration: i.isEven ? null : BoxDecoration(color: ac.surface2.withValues(alpha: .6)),
                    children: List.generate(headers.length, (j) {
                      final cell = j < r.length ? r[j] : '';
                      return InkWell(
                        onTap: onRowTap == null ? null : () => onRowTap!(i),
                        hoverColor: ac.isDark ? const Color(0xFF1C2A3A) : const Color(0xFFF4F8FC),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          child: Text(
                            cell.isEmpty ? '—' : cell,
                            style: TextStyle(fontSize: 13, color: ac.ink),
                          ),
                        ),
                      );
                    }),
                  );
                }),
              ],
            ),
          ),
        );
      },
    );
  }
}
