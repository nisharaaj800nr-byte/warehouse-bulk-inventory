import 'package:flutter/material.dart';

import '../theme.dart';

/// Card row for object-list screens (reports, sources, users, alerts…).
class ObjectTile extends StatelessWidget {
  final String title;
  final String? subtitle;
  final List<Widget> badges;
  final List<PopupMenuEntry<String>> Function(BuildContext context)? menuBuilder;
  final void Function(String action)? onAction;

  const ObjectTile({
    super.key,
    required this.title,
    this.subtitle,
    this.badges = const [],
    this.menuBuilder,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    final ac = appColors(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: appCardDecoration(ac),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 11, 6, 11),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          title,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: ac.ink),
                        ),
                      ),
                      const SizedBox(width: 8),
                      ...badges,
                    ],
                  ),
                  if (subtitle != null && subtitle!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 3),
                      child: Text(subtitle!, style: TextStyle(fontSize: 12.5, color: ac.muted)),
                    ),
                ],
              ),
            ),
            if (menuBuilder != null)
              PopupMenuButton<String>(
                tooltip: 'Actions',
                onSelected: onAction,
                itemBuilder: menuBuilder!,
                icon: Icon(Icons.more_vert, size: 20, color: ac.muted),
              ),
          ],
        ),
      ),
    );
  }
}
