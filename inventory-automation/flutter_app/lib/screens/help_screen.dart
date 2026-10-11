import 'package:flutter/material.dart';

import '../theme.dart';
import '../widgets/common.dart';

class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});

  static const List<(String, List<String>)> _sections = [
    (
      'Daily workflow',
      [
        '1. App kholo → Dashboard check karo.',
        '2. Import Data → raw data validate → preview → Import & Process.',
        '3. Data Quality → unknown status/location dekho aur Rules me map karo.',
        '4. Inventory filters (brand, status, age, location) se devices dekho.',
        '5. Reports → generate, preview, email.',
        '6. Processing History har run dikhata hai; Security sheet protection.',
      ],
    ),
    (
      'AI commands (Hindi / English)',
      [
        '"aaj ka inventory summary banao" → full pipeline chalata hai',
        '"75 days se upar wale devices dikhao" → age-filtered view',
        '"Apple L4 Bin Storage ki report banao" → filtered report',
        'AI kabhi Rules Engine bypass nahi karta — sab kuch configuration se aata hai.',
      ],
    ),
    (
      'Roles',
      [
        'OWNER — full access',
        'ADMIN — configuration + ops',
        'MANAGER — reports + inventory',
        'OPERATOR — import / process',
        'VIEWER — read-only',
      ],
    ),
    (
      'Deployment',
      [
        'Backend: Apps Script project me Code.js, Code-auth.gs, Code-api.gs, Code-ui.gs paste karo + Index/App HTML.',
        'setupAutomationSystem() ek baar run karo, seedMyPassword() se login banao, phir New version deploy.',
        'Is app me Settings → Connection me apna /exec URL daal do (ya demо mode use karo).',
      ],
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final ac = appColors(context);
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const PageHeader(title: 'Help', subtitle: 'Documentation & daily workflow guide.'),
          for (final s in _sections)
            SectionCard(
              title: s.$1,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final line in s.$2)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Text('•  $line', style: TextStyle(fontSize: 13.5, color: ac.ink, height: 1.5)),
                    ),
                ],
              ),
            ),
          SectionCard(
            title: 'Architecture',
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: ac.isDark ? const Color(0xFF0A1119) : const Color(0xFF0F1C2A),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                'USER → APP (this UI) → APPS SCRIPT BACKEND → GOOGLE SHEETS\n\n'
                'FIELD MAPPING → NORMALIZATION → JOIN (QC Stock, Location)\n'
                '→ AGE / STATUS / LOCATION RULES → INVENTORY\n'
                '→ PIVOT / SUMMARY → REPORTS → EXPORTS → EMAIL',
                style: TextStyle(
                  fontSize: 12,
                  height: 1.65,
                  fontFamily: 'monospace',
                  color: ac.isDark ? const Color(0xFFC9D9EA) : const Color(0xFFD7E4F2),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
