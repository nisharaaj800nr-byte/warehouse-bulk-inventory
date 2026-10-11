import 'api.dart';

/// Demo mode: local sample data so the app can be previewed without a backend.
Future<dynamic> demoCall(String action, Map<String, dynamic> params) async {
  await Future<void>.delayed(const Duration(milliseconds: 180));
  switch (action) {
    case 'health':
      return <String, dynamic>{
        'app': 'Warehouse Bulk Inventory',
        'version': '1.1.1-demo',
        'role': 'ADMIN',
        'mode': 'demo',
      };
    case 'auth.login':
      final password = '${params['password'] ?? ''}';
      if (password.length < 4) {
        throw ApiException('AUTH_FAILED', 'AUTH_FAILED: Invalid email or password. (Demo: 4+ characters daalein.)');
      }
      return <String, dynamic>{
        'token': 'demo-token',
        'email': '${params['email'] ?? 'admin@demo.local'}',
        'role': 'ADMIN',
        'expiresAt': DateTime.now().add(const Duration(hours: 12)).toIso8601String(),
      };
    case 'auth.logout':
      return <String, dynamic>{'revoked': true};
    case 'auth.whoami':
      return <String, dynamic>{
        'email': 'admin@demo.local',
        'role': 'ADMIN',
        'expiresAt': null,
        'legacy': false,
      };
    case 'dashboard':
      return <String, dynamic>{
        'inventoryCount': 137,
        'headers': demoHeaders,
        'recentRuns': demoRuns(),
        'recentErrors': demoErrors(),
        'sourcesActive': 4,
        'reportsActive': 6,
      };
    case 'trends.list':
      return <String, dynamic>{'headers': demoTrendHeaders, 'data': demoTrends()};
    case 'process.run':
      await Future<void>.delayed(const Duration(milliseconds: 500));
      return <String, dynamic>{
        'ok': true,
        'message': 'Daily process completed (demo) — ${_inv.length} items processed.',
      };

    /* ---- stage 2 screens ---- */
    case 'inventory.list': {
      var rows = [for (final r in _inv) List<String>.from(r)];
      final q = '${params['q'] ?? ''}'.toLowerCase();
      if (q.isNotEmpty) {
        rows = rows.where((r) => r.join(' ').toLowerCase().contains(q)).toList();
      }
      final total = rows.length;
      final page = (params['page'] as num?)?.toInt() ?? 1;
      final perPage = (params['perPage'] as num?)?.toInt() ?? 50;
      final start = (page - 1) * perPage;
      final end = (start + perPage) > rows.length ? rows.length : start + perPage;
      return <String, dynamic>{
        'rows': start >= rows.length ? <List<String>>[] : rows.sublist(start, end),
        'total': total,
        'headers': demoHeaders,
        'page': page,
        'perPage': perPage,
      };
    }
    case 'inventory.save': {
      final item = Map<String, dynamic>.from(params['item'] as Map? ?? const {});
      final barcode = '${item['BARCODE'] ?? ''}';
      if (barcode.isEmpty) throw ApiException('BACKEND_ERROR', 'BARCODE is required.');
      final row = [for (final h in demoHeaders) '${item[h] ?? ''}'];
      final idx = _inv.indexWhere((r) => r.isNotEmpty && r[0] == barcode);
      if (idx >= 0) {
        _inv[idx] = row;
        return <String, dynamic>{'ok': true, 'barcode': barcode, 'mode': 'updated'};
      }
      _inv.insert(0, row);
      return <String, dynamic>{'ok': true, 'barcode': barcode, 'mode': 'added'};
    }
    case 'inventory.delete': {
      final barcode = '${params['barcode'] ?? ''}';
      _inv.removeWhere((r) => r.isNotEmpty && r[0] == barcode);
      return <String, dynamic>{'ok': true, 'barcode': barcode};
    }
    case 'inventory.export': {
      final cols = '${params['columns'] ?? ''}'
          .split(',')
          .map((c) => c.trim())
          .where((c) => c.isNotEmpty)
          .toList();
      final headers = cols.isEmpty ? demoHeaders : cols;
      final out = StringBuffer();
      out.writeln(headers.join(','));
      for (final row in _inv) {
        out.writeln(headers.map((h) {
          final i = demoHeaders.indexOf(h);
          final v = i >= 0 && i < row.length ? row[i] : '';
          return '"${v.replaceAll('"', '""')}"';
        }).join(','));
      }
      return <String, dynamic>{'csv': out.toString(), 'rows': _inv.length};
    }
    case 'reports.list':
      return <Map<String, dynamic>>[
        {
          'Report Name': 'Apple L4 Bin Storage',
          'Filter Field': 'BRAND',
          'Filter Value': 'Apple',
          'Report Columns': 'BARCODE,MODEL,STATUS_BUCKET,BIN_BUCKET',
          'Active': 'ON',
        },
        {
          'Report Name': '75+ Days Devices',
          'Filter Field': 'AGE_BUCKET',
          'Filter Value': 'Above 75',
          'Report Columns': 'BARCODE,MODEL,AGE_BUCKET,LOCATION',
          'Active': 'ON',
        },
        {
          'Report Name': 'Daily Summary',
          'Filter Field': '',
          'Filter Value': '',
          'Report Columns': 'STATUS_BUCKET,AGE_BUCKET,PRIORITY',
          'Active': 'ON',
        },
      ];
    case 'reports.save':
      return <String, dynamic>{'saved': '${params['name'] ?? 'report'}'};
    case 'reports.delete':
      return <String, dynamic>{'deleted': '${params['name'] ?? ''}'};
    case 'reports.generate':
      await Future<void>.delayed(const Duration(milliseconds: 400));
      return <String, dynamic>{'report': '${params['name'] ?? 'Demo Report'}', 'rows': 42};
    case 'reports.exportToSheet':
      return <String, dynamic>{'exported': 3};
    case 'sources.list':
      return <Map<String, dynamic>>[
        {
          'Source ID': 'SRC001',
          'Source Name': 'Daily Raw Data',
          'Type': 'Google Sheet',
          'Role': 'PRIMARY',
          'Sheet Name': 'Daily Raw Data',
          'Sheet ID': '',
          'Join Key': 'BARCODE',
          'Join Fields': '',
          'Active': 'ON',
        },
        {
          'Source ID': 'SRC002',
          'Source Name': 'QC Stock',
          'Type': 'QC_STOCK',
          'Role': 'JOIN',
          'Sheet Name': 'QC Stock',
          'Sheet ID': '',
          'Join Key': 'BARCODE',
          'Join Fields': 'STOCK_AGE, LOCATION',
          'Active': 'ON',
        },
        {
          'Source ID': 'SRC003',
          'Source Name': 'TRC',
          'Type': 'TRC',
          'Role': 'JOIN',
          'Sheet Name': 'TRC',
          'Sheet ID': '',
          'Join Key': 'BARCODE',
          'Join Fields': 'STATUS',
          'Active': 'ON',
        },
      ];
    case 'sources.save':
      return <String, dynamic>{'id': '${params['id'] ?? 'SRC-DEMO'}'};
    case 'auth.users':
      return <String, dynamic>{
        'users': <Map<String, dynamic>>[
          {
            'email': 'admin@demo.local',
            'role': 'ADMIN',
            'active': 'ON',
            'hasPassword': true,
            'lockedUntil': '',
            'lastLogin': DateTime.now().subtract(const Duration(hours: 1)).toIso8601String(),
          },
          {'email': 'viewer@demo.local', 'role': 'VIEWER', 'active': 'ON', 'hasPassword': true, 'lockedUntil': '', 'lastLogin': ''},
        ],
      };
    case 'users.save':
      return <String, dynamic>{'saved': true, 'updated': false, 'passwordSet': params['password'] != null};
    case 'auth.resetPassword':
      return <String, dynamic>{'reset': true};
    case 'security.list':
      return <Map<String, dynamic>>[
        {'Sheet': 'INVENTORY', 'Access': 'LOCKED', 'Can Edit': 'NO'},
        {'Sheet': 'PROCESSED_DATA', 'Access': 'LOCKED', 'Can Edit': 'NO'},
        {'Sheet': 'RAW_DATA', 'Access': 'PARTIAL', 'Can Edit': 'YES'},
      ];
    case 'security.unlock':
    case 'security.lock':
      return <String, dynamic>{'ok': true};
    case 'settings.get':
      return <String, dynamic>{
        'TELEGRAM_BOT_TOKEN': '',
        'TELEGRAM_CHAT_ID': '',
        'AUTO_BACKUP': 'OFF',
        'BACKUP_FOLDER_ID': '',
      };
    case 'settings.save':
      return <String, dynamic>{'saved': true};
    case 'telegram.test':
      return <String, dynamic>{'ok': true};
    case 'email.test':
      return <String, dynamic>{'sentTo': 'demo@example.com'};
    case 'backup.run':
      return <String, dynamic>{'backupId': 'DEMO-BACKUP', 'name': 'Backup_demo'};
    case 'selftest.run':
      return <String, dynamic>{
        'ok': true,
        'authVersion': 'demo',
        'checks': <Map<String, dynamic>>[
          {'name': 'Spreadsheet readable', 'ok': true, 'detail': 'Demo spreadsheet'},
          {'name': 'Password hash roundtrip', 'ok': true, 'detail': 'ok'},
          {'name': 'Sessions sheet writable', 'ok': true, 'detail': 'probe ok'},
          {'name': 'Inventory readable', 'ok': true, 'detail': '${_inv.length} rows'},
        ],
      };

    case 'ai.command': {
      await Future<void>.delayed(const Duration(milliseconds: 400));
      final text = '${params['text'] ?? ''}';
      final short = text.length > 60 ? text.substring(0, 60) : text;
      return <String, dynamic>{'success': true, 'message': 'Demo: command parsed — $short'};
    }
    case 'mapping.list':
      return <Map<String, dynamic>>[
        {'Source': 'QC_STOCK', 'Source Column': 'Barcode', 'Target Field': 'BARCODE', 'Required': 'YES', 'Active': 'ON', 'Output Order': 1},
        {'Source': 'QC_STOCK', 'Source Column': 'Model', 'Target Field': 'MODEL', 'Required': 'YES', 'Active': 'ON', 'Output Order': 2},
        {'Source': 'QC_STOCK', 'Source Column': 'Brand', 'Target Field': 'BRAND', 'Required': 'YES', 'Active': 'ON', 'Output Order': 3},
        {'Source': 'TRC', 'Source Column': 'Status', 'Target Field': 'STATUS', 'Required': 'NO', 'Active': 'ON', 'Output Order': 4},
        {'Source': 'LOCATION', 'Source Column': 'Bin', 'Target Field': 'LOCATION', 'Required': 'NO', 'Active': 'ON', 'Output Order': 5},
      ];
    case 'mapping.save':
      return <String, dynamic>{'saved': (params['mappings'] as List?)?.length ?? 0};
    case 'rules.age.list':
      return <Map<String, dynamic>>[
        {'Min Age': 0, 'Max Age': 29, 'Bucket': 'Below 30', 'Priority': 'P2', 'Active': 'ON'},
        {'Min Age': 30, 'Max Age': 59, 'Bucket': '30-60', 'Priority': 'P2', 'Active': 'ON'},
        {'Min Age': 60, 'Max Age': 74, 'Bucket': '60-75', 'Priority': 'P3', 'Active': 'ON'},
        {'Min Age': 75, 'Max Age': 999999, 'Bucket': 'Above 75', 'Priority': 'P4', 'Active': 'ON'},
      ];
    case 'rules.status.list':
      return <Map<String, dynamic>>[
        {'Raw Status': 'L4', 'Bucket': 'L4', 'Marking': 'Marked L4', 'Active': 'ON'},
        {'Raw Status': 'Pending Approval', 'Bucket': 'Approval Pending', 'Marking': 'Pending', 'Active': 'ON'},
      ];
    case 'rules.location.list':
      return <Map<String, dynamic>>[
        {'Pattern': 'SW01-SW10', 'Bucket': 'BIN-01', 'Condition': 'STATUS_BUCKET=Bin Storage', 'Active': 'ON'},
        {'Pattern': 'SW11-SW20', 'Bucket': 'BIN-02', 'Condition': 'STATUS_BUCKET=Bin Storage', 'Active': 'ON'},
      ];
    case 'rules.age.save':
    case 'rules.status.save':
    case 'rules.location.save':
      return <String, dynamic>{'saved': true};
    case 'alerts.list':
      return <Map<String, dynamic>>[
        {'Alert Name': 'Low Stock Alert', 'Filter Field': 'BRAND', 'Filter Value': 'Apple', 'Operator': 'LT', 'Threshold': 10, 'Email To': 'ops@example.com', 'Telegram': 'ON', 'Active': 'ON'},
        {'Alert Name': 'Ageing Check', 'Filter Field': 'AGE_BUCKET', 'Filter Value': 'Above 75', 'Operator': 'GT', 'Threshold': 5, 'Email To': '', 'Telegram': 'OFF', 'Active': 'ON'},
      ];
    case 'alerts.save':
      return <String, dynamic>{'saved': '${params['name'] ?? 'alert'}'};
    case 'alerts.delete':
      return <String, dynamic>{'deleted': '${params['name'] ?? ''}'};
    case 'alerts.check':
      return <String, dynamic>{'triggered': <dynamic>[], 'total': 2};
    case 'activity.list':
      return <String, dynamic>{
        'headers': ['Timestamp', 'User', 'Action', 'Object', 'Result'],
        'data': [
          for (var i = 0; i < 6; i++)
            [
              DateTime.now().subtract(Duration(hours: i * 3)).toIso8601String(),
              'admin@demo.local',
              ['PROCESS_RUN', 'IMPORT_COMMIT', 'REPORT_GENERATED'][i % 3],
              'RUN-${1024 - i}',
              'OK',
            ],
        ],
      };
    case 'history.list':
      return <String, dynamic>{
        'headers': ['Run ID', 'Timestamp', 'Source', 'Input Rows', 'Processed Rows', 'Success Count', 'Error Count', 'Duration (sec)', 'Status'],
        'data': demoRuns(),
      };
    case 'errors.list':
      return <String, dynamic>{
        'headers': ['Run ID', 'Row Number', 'Barcode', 'Source', 'Field', 'Error', 'Timestamp'],
        'data': demoErrors(),
      };
    case 'quality.summary':
      return <String, dynamic>{
        'totalErrors': 9,
        'bySource': {'QC Stock': 4, 'TRC': 3, 'Daily Raw Data': 2},
      };
    case 'reports.templates.list':
      return <Map<String, dynamic>>[
        {
          'Name': 'Standard Report',
          'Config JSON': '{"columns":["BARCODE","MODEL","STATUS_BUCKET"],"orientation":"portrait"}',
          'Active': 'ON',
        },
      ];
    case 'reports.templates.save':
      return <String, dynamic>{'saved': '${params['name'] ?? ''}'};
    case 'reports.templates.delete':
      return <String, dynamic>{'deleted': '${params['name'] ?? ''}'};
    case 'import.fileB64':
    case 'import.sheets': {
      _demoStaged = true;
      return <String, dynamic>{
        'ok': true,
        'fileName': action == 'import.fileB64' ? '${params['fileName'] ?? 'demo-upload.csv'}' : 'Google Sheet',
        'format': action == 'import.fileB64' ? 'CSV/TSV' : 'Google Sheets',
        'headers': demoHeaders,
        'totalRows': 120,
        'warnings': <String>[],
      };
    }
    case 'import.tabs':
      return <Map<String, dynamic>>[
        {'name': 'Sheet1', 'rows': 120, 'cols': demoHeaders.length},
      ];
    case 'import.previewPage': {
      final offset = (params['offset'] as num?)?.toInt() ?? 0;
      final limit = ((params['limit'] as num?)?.toInt() ?? 20).clamp(1, 50).toInt();
      final rows = _demoStaged ? _inv.skip(offset).take(limit).toList() : <List<String>>[];
      return <String, dynamic>{
        'headers': demoHeaders,
        'rows': rows,
        'offset': offset,
        'totalRows': _demoStaged ? _inv.length : 0,
      };
    }
    case 'import.commit': {
      await Future<void>.delayed(const Duration(milliseconds: 500));
      final dry = params['dryRun'] == true;
      return <String, dynamic>{
        'ok': true,
        'dryRun': dry,
        'processed': 120,
        'valid': 118,
        'imported': dry ? 0 : 118,
        'failed': 2,
        'skipped': 0,
        'warnings': ['2 row(s) failed validation (demo).'],
        'errorSample': [
          {'row': 14, 'errors': ['Missing required field: BARCODE']},
        ],
      };
    }
    case 'import.discard':
      _demoStaged = false;
      return <String, dynamic>{'ok': true};
    case 'import.fileToSource':
      return <String, dynamic>{
        'sheetName': '${params['sheetName'] ?? 'demo_source'}',
        'headers': demoHeaders,
        'totalRows': 90,
        'format': 'CSV',
      };
    case 'import.multiSource.validate':
      return (params['sources'] as List?) ?? <dynamic>[];
    case 'import.multiSource.create':
      return <String, dynamic>{
        'jobId': 'JOB-DEMO-1',
        'sourceCount': (params['sources'] as List?)?.length ?? 0,
        'status': 'READY',
        'sources': <dynamic>[],
      };
    case 'import.multiSource.run': {
      await Future<void>.delayed(const Duration(milliseconds: 700));
      return <String, dynamic>{
        'jobId': '${params['jobId'] ?? 'JOB-DEMO-1'}',
        'status': 'COMPLETE',
        'totalRows': 240,
        'devices': 220,
        'conflicts': 4,
      };
    }
    case 'conflicts.list':
      return <String, dynamic>{
        'headers': ['Barcode', 'Field', 'Source A', 'Value A', 'Source B', 'Value B', 'Final', 'Rule'],
        'rows': [
          ['BR10034', 'STATUS', 'QC_STOCK', 'QC_PASS', 'TRC', 'IN_REPAIR', 'QC_PASS', 'QC_STOCK > TRC'],
          ['BR10071', 'LOCATION', 'QC_STOCK', 'SW04', 'LOCATION', 'SW09', 'SW04', 'QC_STOCK > LOCATION'],
        ],
        'total': 2,
      };
    case 'conflicts.clear':
      return <String, dynamic>{'cleared': 2};

    default:
      throw ApiException('BACKEND_ERROR', 'Demo mode: action not implemented — $action');
  }
}

/* ---- demo inventory data ---- */

List<List<String>> _buildInventory() {
  const brands = ['Apple', 'Samsung', 'Xiaomi', 'OnePlus', 'Realme', 'Vivo'];
  const cats = ['Phone', 'Tablet', 'Watch', 'Accessory'];
  const statuses = ['QC_PASS', 'QC_FAIL', 'PENDING', 'IN_REPAIR'];
  String ageB(int a) => a < 30 ? 'Below 30' : (a < 60 ? '30-60' : (a < 75 ? '60-75' : 'Above 75'));
  String statusB(String s) => s == 'QC_PASS'
      ? 'Ready'
      : (s == 'QC_FAIL' ? 'QC Failed' : (s == 'IN_REPAIR' ? 'In Repair' : 'Approval Pending'));
  final rows = <List<String>>[];
  for (var i = 1; i <= 137; i++) {
    final brand = brands[i % brands.length];
    final cat = cats[i % cats.length];
    final modAge = (i * 37) % 240;
    final stockAge = (i * 13) % 200;
    final status = statuses[i % statuses.length];
    final ab = ageB(modAge);
    final loc = 'SW${((i % 20) + 1).toString().padLeft(2, '0')}';
    rows.add([
      'BR${10000 + i}',
      '$brand $cat ${(i % 9) + 1}',
      brand,
      cat,
      '$modAge',
      '$stockAge',
      status,
      statusB(status),
      ab,
      ab == 'Above 75' ? 'P4' : (ab == '60-75' ? 'P3' : 'P2'),
      loc,
      'BIN-0${(i ~/ 10) % 4 + 1}',
      ['QC_STOCK', 'TRC', 'INVENTORY'][i % 3],
    ]);
  }
  return rows;
}

final List<List<String>> _inv = _buildInventory();

bool _demoStaged = false;

const List<String> demoHeaders = [
  'BARCODE', 'MODEL', 'BRAND', 'CATEGORY', 'MOD_AGE', 'STOCK_AGE', 'STATUS',
  'STATUS_BUCKET', 'AGE_BUCKET', 'PRIORITY', 'LOCATION', 'BIN_BUCKET', 'SOURCE',
];

const List<String> demoTrendHeaders = ['Run ID', 'Date', 'Below 30', '30-60', '60-75', 'Above 75', 'Total'];

List<List<dynamic>> demoTrends() {
  final rows = <List<dynamic>>[];
  final now = DateTime.now();
  for (var d = 20; d >= 0; d--) {
    final date = now.subtract(Duration(days: d));
    final below = 96 + ((20 - d) * 3) % 18;
    final m30 = 42 + ((20 - d) * 2) % 9;
    final m60 = 18 + (20 - d) % 6;
    final above = 7 + (20 - d) % 4;
    final ds = '${date.year.toString().padLeft(4, '0')}-'
        '${date.month.toString().padLeft(2, '0')}-'
        '${date.day.toString().padLeft(2, '0')}';
    rows.add(['RUN-${1000 + (20 - d)}', ds, below, m30, m60, above, below + m30 + m60 + above]);
  }
  return rows;
}

List<List<dynamic>> demoRuns() {
  final rows = <List<dynamic>>[];
  final now = DateTime.now();
  for (var i = 0; i < 6; i++) {
    final t = now.subtract(Duration(hours: i * 26));
    final input = 380 + i * 27;
    rows.add([
      'RUN-${1024 - i}',
      t.toIso8601String(),
      ['Daily Raw Data', 'QC Stock', 'TRC'][i % 3],
      input,
      input - 3,
      input - 8,
      3 + (i % 4),
      '9.4',
      i == 0 ? 'OK' : (i % 4 == 1 ? 'PARTIAL' : 'OK'),
    ]);
  }
  return rows;
}

List<List<dynamic>> demoErrors() {
  const items = [
    ['BR10034', 'QC Stock', 'STOCK_AGE', 'Invalid number: "n/a"'],
    ['BR10071', 'TRC', 'BARCODE', 'Missing required field'],
    ['BR10102', 'Daily Raw Data', 'STATUS', 'Unknown status: "HOLD-2"'],
    ['BR10145', 'QC Stock', 'LOCATION', 'Location not mapped: "ZZ-99"'],
    ['BR10188', 'TRC', 'MOD_AGE', 'Invalid number: "old"'],
  ];
  final now = DateTime.now();
  final rows = <List<dynamic>>[];
  for (var i = 0; i < items.length; i++) {
    final t = now.subtract(Duration(minutes: i * 40));
    rows.add([
      'RUN-${1024 - (i % 2)}',
      12 + i * 7,
      items[i][0],
      items[i][1],
      items[i][2],
      items[i][3],
      t.toIso8601String(),
    ]);
  }
  return rows;
}
