/* =============================================================
   CONFIGURABLE INVENTORY AUTOMATION PIPELINE
   Google Apps Script — Code.js
   Version: 1.0.0 | Date: 2026-08-13
   =============================================================
   Architecture:
     SOURCE LAYER → INGESTION → FIELD MAPPING → NORMALIZATION
     → JOIN ENGINE → RULE ENGINE → INVENTORY → SUMMARY
     → REPORT → EMAIL/EXPORT

   Side engines: CONFIGURATION, SECURITY, FORMATTING,
                 AUDIT, AI COMMAND, DROPDOWN
   ============================================================= */

// ─────────────────────────────────────────────────────────────
// SECTION 1: GLOBAL CONFIGURATION
// ─────────────────────────────────────────────────────────────

var ORS = {
  APP_NAME: 'Bulk Repair',
  VERSION: '1.0.0',
  MASTER_SHEET: 'Inventory Master',
  // ── Configuration Sheet Names ──
  SHEETS: {
    COMMAND_CENTER: 'Command Center',
    DATA_SOURCES: 'Data Sources',
    FIELD_MAPPING: 'Field Mapping',
    AGE_BUCKET_RULES: 'Age Bucket Rules',
    STATUS_BUCKET_RULES: 'Status Bucket Rules',
    LOCATION_RULES: 'Location Rules',
    REPORT_CONFIG: 'Report Config',
    SCHEDULE_CONFIG: 'Schedule Config',
    DROPDOWN_VALUES: 'Dropdown Values',
    DROPDOWN_CONFIG: 'Dropdown Config',
    SHEET_SECURITY: 'Sheet Security',
    AUTHORIZED_USERS: 'Authorized Users',
    OUTPUT_CONFIG: 'Output Config',
    EMAIL_CONFIG: 'Email Config',
    // ── Data Sheets ──
    RAW_DATA: 'RAW_DATA',
    PROCESSED_DATA: 'PROCESSED_DATA',
    INVENTORY: 'INVENTORY',
    // ── Import Staging ──
    IMPORT_STAGING: 'IMPORT_STAGING',
    IMPORT_ERRORS: 'Import Errors',
    // ── Audit Sheets ──
    PROCESSING_HISTORY: 'Processing History',
    PROCESSING_ERRORS: 'Processing Errors',
    SECURITY_AUDIT: 'Security Audit',
    DATA_QUALITY: 'Data Quality',
    AI_LOG: 'AI Command Log',
    // ── Advanced Feature Sheets ──
    ALERT_RULES: 'Alert Rules',
    TREND_HISTORY: 'Trend History',
    ACTIVITY_LOG: 'Activity Log',
    SYSTEM_SETTINGS: 'System Settings',
    // ── Report Sheets ──
    PIVOT_SUMMARY: 'Pivot Summary',
    REPORT_TEMPLATES: 'Report Templates',
    // ── Multi-Source Architecture ──
    SOURCE_DATA: 'SOURCE_DATA',
    DATA_CONFLICTS: 'Data Conflicts',
    SOURCE_PRIORITY_RULES: 'Source Priority Rules',
    SOURCE_IMPORT_HISTORY: 'Source Import History',
    IMPORT_JOBS: 'Import Jobs'
  },
  // ── Formatting Defaults ──
  FORMAT: {
    MIN_COL_WIDTH: 90,
    MAX_COL_WIDTH: 600,
    CHAR_WIDTH: 7,
    DEFAULT_ROW_HEIGHT: 30,
    MAX_ROW_HEIGHT: 300,
    HEADER_BG: '#1F4E79',
    HEADER_FG: '#FFFFFF',
    ALT_ROW_BG: '#F2F7FB',
    ERROR_BG: '#FDECEA',
    SUCCESS_BG: '#E6F4EA'
  },
  // ── Processing ──
  PROCESSING: {
    DUPLICATE_STRATEGY: 'ERROR', // ERROR | FIRST_RECORD | LATEST_RECORD | MERGE
    BATCH_SIZE: 500,
    MISSING_AGE_VALUE: 'UNKNOWN_AGE',
    MISSING_STATUS_VALUE: 'UNKNOWN_STATUS',
    MISSING_LOCATION_VALUE: 'UNKNOWN_LOCATION'
  },
  // ── Runtime state ──
  _cache: {}
};

// ─────────────────────────────────────────────────────────────
// SECTION 2: UTILITY HELPERS
// ─────────────────────────────────────────────────────────────

function getOrCreateSheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers && headers.length > 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length)
        .setBackground(ORS.FORMAT.HEADER_BG)
        .setFontColor(ORS.FORMAT.HEADER_FG)
        .setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    Logger.log('Created sheet: ' + name);
  }
  return sheet;
}

function sheetExists_(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name) !== null;
}

function readSheetData_(sheetName) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return { headers: [], data: [] };
  var all = sheet.getDataRange().getValues();
  if (all.length <= 1) return { headers: all[0] || [], data: [] };
  return { headers: all[0], data: all.slice(1) };
}

function readConfigSheet_(sheetName) {
  var result = readSheetData_(sheetName);
  var configs = [];
  for (var i = 0; i < result.data.length; i++) {
    var row = {};
    for (var j = 0; j < result.headers.length; j++) {
      row[result.headers[j]] = result.data[i][j];
    }
    configs.push(row);
  }
  return configs;
}

function buildLookupIndex_(data, headers, keyCol) {
  var index = {};
  var keyIdx = headers.indexOf(keyCol);
  if (keyIdx === -1) {
    Logger.log('WARNING: Key column "' + keyCol + '" not found in headers.');
    return index;
  }
  for (var i = 0; i < data.length; i++) {
    var key = String(data[i][keyIdx]).trim();
    if (!key) continue;
    index[key] = data[i];
  }
  return index;
}

function normalizeBarcode_(val) {
  if (val === null || val === undefined) return '';
  var s = String(val).trim();
  if (/^\d+\.0$/.test(s)) s = s.replace(/\.0$/, '');
  return s;
}

function generateRunId_() {
  var d = new Date();
  return 'RUN' + Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyyMMdd')
    + '_' + ('000' + (d.getHours() * 60 + d.getMinutes())).slice(-4);
}

function isNullOrEmpty_(val) {
  return val === null || val === undefined || String(val).trim() === '';
}

function safeNum_(val) {
  if (isNullOrEmpty_(val)) return null;
  var n = Number(val);
  return isNaN(n) ? null : n;
}

// ─────────────────────────────────────────────────────────────
// SECTION 3: CONFIGURATION ENGINE
// ─────────────────────────────────────────────────────────────

function loadDataSourceConfig_() {
  return readConfigSheet_(ORS.SHEETS.DATA_SOURCES)
    .filter(function(r) { return r['Active'] === 'ON'; });
}

function loadFieldMappingConfig_(sourceName) {
  var all = readConfigSheet_(ORS.SHEETS.FIELD_MAPPING);
  if (sourceName) {
    all = all.filter(function(r) { return r['Source'] === sourceName; });
  }
  return all.filter(function(r) { return r['Active'] === 'ON'; })
    .sort(function(a, b) { return (a['Output Order'] || 99) - (b['Output Order'] || 99); });
}

function loadAgeBucketRules_() {
  return readConfigSheet_(ORS.SHEETS.AGE_BUCKET_RULES)
    .filter(function(r) { return r['Active'] === 'ON'; });
}

function loadStatusBucketRules_() {
  return readConfigSheet_(ORS.SHEETS.STATUS_BUCKET_RULES)
    .filter(function(r) { return r['Active'] === 'ON'; });
}

function loadLocationRules_() {
  return readConfigSheet_(ORS.SHEETS.LOCATION_RULES)
    .filter(function(r) { return r['Active'] === 'ON'; });
}

function loadReportConfig_() {
  return readConfigSheet_(ORS.SHEETS.REPORT_CONFIG);
}

function loadReportTemplates_() {
  return readConfigSheet_(ORS.SHEETS.REPORT_TEMPLATES);
}

function ensureReportColumns_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.REPORT_CONFIG);
  if (!sheet) return;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var extras = ['Report Type', 'Output Format', 'Email To', 'Group By', 'Header Text', 'Footer Text', 'Orientation', 'Summary'];
  var add = [];
  for (var i = 0; i < extras.length; i++) {
    if (headers.indexOf(extras[i]) === -1) add.push(extras[i]);
  }
  if (add.length > 0) {
    sheet.getRange(1, headers.length + 1, 1, add.length).setValues([add]);
    applyHeaderFormatting_(sheet);
  }
}

// ─────────────────────────────────────────────────────────────
// REPORT SHEET AUTO-CREATE
// ─────────────────────────────────────────────────────────────
// Jaise hi koi report save/create hota hai, uske naam se ek blank
// sheet spreadsheet root mein turant bana di jati hai (bina pipeline
// chalaye). Pipeline run par wo sheet filtered data se bhar jati hai.

function protectedSheetNames_() {
  var names = {};
  for (var k in ORS.SHEETS) names[ORS.SHEETS[k]] = true;
  names['Report Output'] = true;
  names['Pivot Summary'] = true;
  return names;
}

function createReportSheetIfMissing_(name, columns) {
  if (!name) return { skipped: true };
  if (protectedSheetNames_()[name]) return { skipped: true };
  var cols = [];
  if (typeof columns === 'string' && columns) cols = columns.split(',');
  else if (Array.isArray(columns)) cols = columns;
  if (!cols.length) cols = ['BARCODE', 'MODEL', 'BRAND', 'STATUS', 'STOCK_AGE',
    'AGE_BUCKET', 'PRIORITY', 'STATUS_BUCKET', 'LOCATION', 'BIN_BUCKET'];
  cols = cols.map(function (x) { return String(x).trim(); }).filter(Boolean);
  var sheet = getOrCreateSheet_(name, cols);
  return { created: true, name: name, columns: cols.length };
}

function deleteReportSheetIfSafe_(name) {
  if (!name) return;
  if (protectedSheetNames_()[name]) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (sh) ss.deleteSheet(sh);
}

function saveReportConfig_(params, email) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.REPORT_CONFIG);
  if (!sheet) throw new Error('Report Config sheet not found. Run setup first.');
  ensureReportColumns_();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var hIdx = function (h) { return headers.indexOf(h); };
  var name = params.name || params.reportName;
  if (!name) throw new Error('Report name required.');
  var row = [];
  row[hIdx('Report Name')] = name;
  if (hIdx('Report Type') >= 0) row[hIdx('Report Type')] = params.type || 'Daily';
  if (hIdx('Filter Field') >= 0) row[hIdx('Filter Field')] = params.filterField || '';
  if (hIdx('Filter Value') >= 0) row[hIdx('Filter Value')] = params.filterValue || '';
  if (hIdx('Report Columns') >= 0) row[hIdx('Report Columns')] = (params.columns || '').join ? params.columns.join(',') : params.columns;
  if (hIdx('Output Format') >= 0) row[hIdx('Output Format')] = params.output || 'PDF';
  if (hIdx('Email To') >= 0) row[hIdx('Email To')] = params.recipients || '';
  if (hIdx('Group By') >= 0) row[hIdx('Group By')] = params.groupBy || '';
  if (hIdx('Header Text') >= 0) row[hIdx('Header Text')] = params.headerText || '';
  if (hIdx('Footer Text') >= 0) row[hIdx('Footer Text')] = params.footerText || '';
  if (hIdx('Orientation') >= 0) row[hIdx('Orientation')] = params.orientation || 'Portrait';
  if (hIdx('Summary') >= 0) row[hIdx('Summary')] = params.summary || 'OFF';
  if (hIdx('Active') >= 0) row[hIdx('Active')] = params.active || 'ON';
  // Fill any gaps
  for (var c = 0; c < headers.length; c++) if (row[c] === undefined) row[c] = '';
  var existing = sheet.getDataRange().getValues().slice(1);
  var found = false;
  for (var i = 0; i < existing.length; i++) {
    if (String(existing[i][hIdx('Report Name')]).trim() === name) {
      sheet.getRange(i + 2, 1, 1, headers.length).setValues([row]);
      found = true;
      break;
    }
  }
  if (!found) sheet.appendRow(row);
  try { createReportSheetIfMissing_(name, params.columns); } catch (e) { Logger.log('Report sheet create: ' + e.message); }
  apiLog_('REPORT_SAVED', name, 'OK', email);
  return { saved: name };
}

function deleteReportConfig_(params, email) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.REPORT_CONFIG);
  if (!sheet) throw new Error('Report Config sheet not found.');
  var name = params.name;
  var values = sheet.getDataRange().getValues();
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][0]).trim() === name) sheet.deleteRow(i + 1);
  }
  apiLog_('REPORT_DELETED', name, 'OK', email);
  try { deleteReportSheetIfSafe_(name); } catch (e) { Logger.log('Report sheet delete: ' + e.message); }
  return { deleted: name };
}

function saveReportTemplate_(params, email) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.REPORT_TEMPLATES);
  if (!sheet) throw new Error('Report Templates sheet not found. Run setup first.');
  var name = params.name;
  if (!name) throw new Error('Template name required.');
  var row = [name, params.configJson || '', params.active || 'ON'];
  var existing = sheet.getDataRange().getValues().slice(1);
  var found = false;
  for (var i = 0; i < existing.length; i++) {
    if (String(existing[i][0]).trim() === name) {
      sheet.getRange(i + 2, 1, 1, 3).setValues([row]);
      found = true;
      break;
    }
  }
  if (!found) sheet.appendRow(row);
  apiLog_('TEMPLATE_SAVED', name, 'OK', email);
  return { saved: name };
}

function deleteReportTemplate_(params, email) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.REPORT_TEMPLATES);
  if (!sheet) throw new Error('Report Templates sheet not found.');
  var name = params.name;
  var values = sheet.getDataRange().getValues();
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][0]).trim() === name) sheet.deleteRow(i + 1);
  }
  apiLog_('TEMPLATE_DELETED', name, 'OK', email);
  return { deleted: name };
}

function bulkCreateReports_(params, email) {
  var list = params.reports || [];
  if (!list.length) throw new Error('No reports provided.');
  var created = [];
  for (var i = 0; i < list.length; i++) {
    saveReportConfig_(list[i], email);
    created.push(list[i].name || list[i].reportName);
  }
  apiLog_('REPORTS_BULK_CREATED', created.join(', '), 'OK', email);
  return { created: created };
}

function loadScheduleConfig_() {
  return readConfigSheet_(ORS.SHEETS.SCHEDULE_CONFIG);
}

function loadEmailConfig_() {
  return readConfigSheet_(ORS.SHEETS.EMAIL_CONFIG)
    .filter(function(r) { return r['Active'] === 'ON'; });
}

function loadOutputConfig_() {
  return readConfigSheet_(ORS.SHEETS.OUTPUT_CONFIG);
}

function loadSecurityConfig_() {
  return readConfigSheet_(ORS.SHEETS.SHEET_SECURITY);
}

function loadAuthorizedUsers_() {
  return readConfigSheet_(ORS.SHEETS.AUTHORIZED_USERS)
    .filter(function(r) { return r['Active'] === 'ON'; });
}

function loadDropdownConfig_() {
  return readConfigSheet_(ORS.SHEETS.DROPDOWN_CONFIG)
    .filter(function(r) { return r['Active'] === 'ON'; });
}

function loadDropdownValues_(key) {
  var all = readConfigSheet_(ORS.SHEETS.DROPDOWN_VALUES);
  if (key) {
    all = all.filter(function(r) { return r['Dropdown Key'] === key; });
  }
  return all.map(function(r) { return r['Value']; });
}

function validateConfiguration_() {
  var errors = [];
  var sources = loadDataSourceConfig_();
  if (sources.length === 0) errors.push('No active data sources configured.');

  var mappings = loadFieldMappingConfig_();
  if (mappings.length === 0) errors.push('No active field mappings configured.');

  var requiredMappings = mappings.filter(function(m) { return m['Required'] === 'YES'; });
  for (var i = 0; i < requiredMappings.length; i++) {
    if (!requiredMappings[i]['Source Column']) {
      errors.push('Required mapping missing source column: ' + requiredMappings[i]['Target Field']);
    }
  }

  var ageRules = loadAgeBucketRules_();
  if (ageRules.length === 0) errors.push('No age bucket rules configured.');

  var statusRules = loadStatusBucketRules_();
  if (statusRules.length === 0) errors.push('No status bucket rules configured.');

  return errors;
}

// ─────────────────────────────────────────────────────────────
// SECTION 4: INGESTION ENGINE
// ─────────────────────────────────────────────────────────────

function readSourceData_(sourceConfig) {
  var sheetName = sourceConfig['Sheet Name'];
  var sourceType = sourceConfig['Source Type'];
  var sheetId = sourceConfig['Sheet ID'];

  var data;
  if (sheetId) {
    try {
      var ss = SpreadsheetApp.openById(sheetId);
      data = ss.getSheetByName(sheetName).getDataRange().getValues();
    } catch (e) {
      Logger.log('ERROR reading source ' + sheetName + ' by ID: ' + e.message);
      var localSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
      if (localSheet) {
        data = localSheet.getDataRange().getValues();
      } else {
        throw new Error('Cannot access source: ' + sheetName);
      }
    }
  } else {
    var localSheet2 = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!localSheet2) throw new Error('Sheet not found: ' + sheetName);
    data = localSheet2.getDataRange().getValues();
  }

  if (!data || data.length === 0) throw new Error('No data in source: ' + sheetName);
  return { headers: data[0], data: data.slice(1) };
}

// ─────────────────────────────────────────────────────────────
// SECTION 5: FIELD MAPPING / EXTRACTION ENGINE
// ─────────────────────────────────────────────────────────────

function extractConfiguredFields_(rawData, mappingConfig, runId) {
  var rawHeaders = rawData.headers;
  var errors = [];

  for (var i = 0; i < mappingConfig.length; i++) {
    var mc = mappingConfig[i];
    if (mc['Required'] === 'YES') {
      var srcCol = mc['Source Column'];
      var found = false;
      for (var h = 0; h < rawHeaders.length; h++) {
        if (rawHeaders[h].toString().trim() === srcCol.trim()) {
          found = true;
          break;
        }
      }
      if (!found) {
        var errMsg = 'Required source field "' + srcCol + '" not found in source.';
        errors.push({ runId: runId, row: 0, barcode: '', field: srcCol,
          error: errMsg, source: 'FIELD_MAPPING', timestamp: new Date() });
      }
    }
  }

  if (errors.length > 0) {
    logProcessingErrors_(errors);
    throw new Error('Required fields missing. Check Processing Errors sheet.');
  }

  var headerIndex = {};
  for (var h2 = 0; h2 < rawHeaders.length; h2++) {
    headerIndex[rawHeaders[h2].toString().trim().toLowerCase()] = h2;
  }

  var outHeaders = [];
  var colMapping = [];
  for (var m = 0; m < mappingConfig.length; m++) {
    var mc2 = mappingConfig[m];
    outHeaders.push(mc2['Target Field']);
    var srcColName = mc2['Source Column'].trim().toLowerCase();
    colMapping.push({
      targetIdx: m,
      srcColIdx: headerIndex[srcColName] !== undefined ? headerIndex[srcColName] : -1
    });
  }

  var extractedData = [];
  for (var r = 0; r < rawData.data.length; r++) {
    var row = rawData.data[r];
    var outRow = [];
    for (var c = 0; c < colMapping.length; c++) {
      if (colMapping[c].srcColIdx === -1) {
        outRow.push('');
      } else {
        outRow.push(row[colMapping[c].srcColIdx]);
      }
    }
    extractedData.push(outRow);
  }

  return { headers: outHeaders, data: extractedData, errors: errors };
}

// ─────────────────────────────────────────────────────────────
// SECTION 6: NORMALIZATION ENGINE
// ─────────────────────────────────────────────────────────────

function normalizeData_(extracted, mappingConfig) {
  var headers = extracted.headers;
  var data = extracted.data;
  var errors = [];

  var barcodeIdx = -1;
  for (var m = 0; m < mappingConfig.length; m++) {
    if (mappingConfig[m]['Target Field'] === 'BARCODE') {
      barcodeIdx = m;
      break;
    }
  }

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (barcodeIdx >= 0) {
      row[barcodeIdx] = normalizeBarcode_(row[barcodeIdx]);
    }
    for (var j = 0; j < row.length; j++) {
      if (typeof row[j] === 'string') {
        row[j] = row[j].trim();
      }
    }
  }

  return { headers: headers, data: data, errors: errors };
}

// ─────────────────────────────────────────────────────────────
// SECTION 7: JOIN / LOOKUP ENGINE
// ─────────────────────────────────────────────────────────────

function buildJoinConfig_() {
  var sources = loadDataSourceConfig_();
  var rawSource = null;
  var joinSources = [];
  for (var i = 0; i < sources.length; i++) {
    if (sources[i]['Source Role'] === 'PRIMARY') {
      rawSource = sources[i];
    } else if (sources[i]['Source Role'] === 'JOIN') {
      joinSources.push(sources[i]);
    }
  }
  return { primary: rawSource, joins: joinSources };
}

function performJoins_(extracted, runId) {
  var headers = extracted.headers;
  var data = extracted.data;
  var errors = [];

  var joinConfig = buildJoinConfig_();
  var joinSources = joinConfig.joins;

  for (var s = 0; s < joinSources.length; s++) {
    var src = joinSources[s];
    var joinKey = src['Join Key'] || 'BARCODE';
    var fieldsToJoin = (src['Join Fields'] || '').split(',').map(function(f) { return f.trim(); });

    if (fieldsToJoin.length === 0 || fieldsToJoin[0] === '') continue;

    try {
      var sourceData = readSourceData_(src);
      var joinFieldMappings = loadFieldMappingConfig_(src['Source Name']);

      var joinHeaderIndex = {};
      for (var h = 0; h < sourceData.headers.length; h++) {
        joinHeaderIndex[sourceData.headers[h].toString().trim().toLowerCase()] = h;
      }

      var joinKeyIdx = joinHeaderIndex[joinKey.toLowerCase()];
      if (joinKeyIdx === undefined) {
        errors.push({ runId: runId, row: 0, barcode: '', field: joinKey,
          error: 'Join key "' + joinKey + '" not found in source ' + src['Source Name'],
          source: src['Source Name'], timestamp: new Date() });
        continue;
      }

      var lookup = buildLookupIndex_(sourceData.data, sourceData.headers, sourceData.headers[joinKeyIdx]);

      var mainKeyIdx = headers.indexOf('BARCODE');
      if (mainKeyIdx === -1) {
        errors.push({ runId: runId, row: 0, barcode: '', field: 'BARCODE',
          error: 'BARCODE not found in extracted data for join.',
          source: 'JOIN_ENGINE', timestamp: new Date() });
        continue;
      }

      var newHeaders = headers.slice();
      var newColIndices = {};
      for (var f = 0; f < fieldsToJoin.length; f++) {
        var fieldName = fieldsToJoin[f];
        var existingIdx = newHeaders.indexOf(fieldName);
        if (existingIdx === -1) {
          newHeaders.push(fieldName);
          existingIdx = newHeaders.length - 1;
        }
        newColIndices[fieldName] = existingIdx;
      }

      for (var r = 0; r < data.length; r++) {
        while (data[r].length < newHeaders.length) data[r].push('');
      }

      for (var r2 = 0; r2 < data.length; r2++) {
        var barcode = normalizeBarcode_(data[r2][mainKeyIdx]);
        var matched = lookup[barcode];
        if (matched) {
          for (var f2 = 0; f2 < fieldsToJoin.length; f2++) {
            var fn = fieldsToJoin[f2];
            var srcFieldIdx = -1;
            for (var jm = 0; jm < joinFieldMappings.length; jm++) {
              if (joinFieldMappings[jm]['Target Field'] === fn) {
                var srcCol = joinFieldMappings[jm]['Source Column'].trim().toLowerCase();
                srcFieldIdx = joinHeaderIndex[srcCol];
                break;
              }
            }
            if (srcFieldIdx === -1) {
              srcFieldIdx = joinHeaderIndex[fn.toLowerCase()];
            }
            if (srcFieldIdx !== undefined && srcFieldIdx >= 0 && matched[srcFieldIdx] !== undefined) {
              data[r2][newColIndices[fn]] = matched[srcFieldIdx];
            }
          }
        }
      }

      headers = newHeaders;
    } catch (e) {
      errors.push({ runId: runId, row: 0, barcode: '', field: '',
        error: 'Join failed for ' + src['Source Name'] + ': ' + e.message,
        source: src['Source Name'], timestamp: new Date() });
    }
  }

  return { headers: headers, data: data, errors: errors };
}

// ─────────────────────────────────────────────────────────────
// SECTION 8: AGE BUCKET RULE ENGINE
// ─────────────────────────────────────────────────────────────

function applyAgeBucketRules_(headers, data, runId) {
  var rules = loadAgeBucketRules_();
  if (rules.length === 0) return { headers: headers, data: data, errors: [] };

  var errors = [];
  var ageCol = headers.indexOf('MOD_AGE');
  var stockAgeCol = headers.indexOf('STOCK_AGE');
  if (ageCol === -1 && stockAgeCol !== -1) ageCol = stockAgeCol;
  if (ageCol === -1) return { headers: headers, data: data, errors: [] };

  var ageBucketIdx = headers.indexOf('AGE_BUCKET');
  var priorityIdx = headers.indexOf('PRIORITY');

  if (ageBucketIdx === -1) {
    headers.push('AGE_BUCKET');
    ageBucketIdx = headers.length - 1;
    for (var i = 0; i < data.length; i++) data[i].push('');
  }
  if (priorityIdx === -1) {
    headers.push('PRIORITY');
    priorityIdx = headers.length - 1;
    for (var i2 = 0; i2 < data.length; i2++) data[i2].push('');
  }

  for (var r = 0; r < data.length; r++) {
    var ageVal = safeNum_(data[r][ageCol]);
    if (ageVal === null) {
      data[r][ageBucketIdx] = ORS.PROCESSING.MISSING_AGE_VALUE;
      data[r][priorityIdx] = '';
      errors.push({ runId: runId, row: r + 2, barcode: data[r][headers.indexOf('BARCODE')] || '',
        field: 'Age', error: 'Invalid or missing age value',
        source: 'AGE_ENGINE', timestamp: new Date() });
      continue;
    }

    var matched = false;
    for (var rule = 0; rule < rules.length; rule++) {
      var minAge = safeNum_(rules[rule]['Min Age']);
      var maxAge = safeNum_(rules[rule]['Max Age']);
      if (minAge !== null && maxAge !== null && ageVal >= minAge && ageVal <= maxAge) {
        data[r][ageBucketIdx] = rules[rule]['Bucket'];
        data[r][priorityIdx] = rules[rule]['Priority'] || '';
        matched = true;
        break;
      }
    }
    if (!matched) {
      data[r][ageBucketIdx] = ORS.PROCESSING.MISSING_AGE_VALUE;
    }
  }

  return { headers: headers, data: data, errors: errors };
}

// ─────────────────────────────────────────────────────────────
// SECTION 9: STATUS BUCKET RULE ENGINE
// ─────────────────────────────────────────────────────────────

function applyStatusBucketRules_(headers, data, runId) {
  var rules = loadStatusBucketRules_();
  if (rules.length === 0) return { headers: headers, data: data, errors: [] };

  var errors = [];
  var statusIdx = headers.indexOf('STATUS');
  if (statusIdx === -1) return { headers: headers, data: data, errors: [] };

  var statusBucketIdx = headers.indexOf('STATUS_BUCKET');
  var markingIdx = headers.indexOf('MARKING');

  if (statusBucketIdx === -1) {
    headers.push('STATUS_BUCKET');
    statusBucketIdx = headers.length - 1;
    for (var i = 0; i < data.length; i++) data[i].push('');
  }
  if (markingIdx === -1) {
    headers.push('MARKING');
    markingIdx = headers.length - 1;
    for (var i2 = 0; i2 < data.length; i2++) data[i2].push('');
  }

  var statusLookup = {};
  for (var rule = 0; rule < rules.length; rule++) {
    var rawStatus = (rules[rule]['Raw Status'] || '').toString().trim().toLowerCase();
    statusLookup[rawStatus] = rules[rule];
  }

  for (var r = 0; r < data.length; r++) {
    var rawStatus = (data[r][statusIdx] || '').toString().trim().toLowerCase();
    var ruleMatch = statusLookup[rawStatus];
    if (ruleMatch) {
      data[r][statusBucketIdx] = ruleMatch['Standard Bucket'] || '';
      data[r][markingIdx] = ruleMatch['Marking'] || '';
    } else if (rawStatus !== '') {
      data[r][statusBucketIdx] = ORS.PROCESSING.MISSING_STATUS_VALUE;
      data[r][markingIdx] = '';
      errors.push({ runId: runId, row: r + 2, barcode: data[r][headers.indexOf('BARCODE')] || '',
        field: 'Status', error: 'Unknown status: "' + data[r][statusIdx] + '"',
        source: 'STATUS_ENGINE', timestamp: new Date() });
    }
  }

  return { headers: headers, data: data, errors: errors };
}

// ─────────────────────────────────────────────────────────────
// SECTION 10: LOCATION / BIN BUCKET RULE ENGINE
// ─────────────────────────────────────────────────────────────

function applyLocationRules_(headers, data, runId) {
  var rules = loadLocationRules_();
  if (rules.length === 0) return { headers: headers, data: data, errors: [] };

  var errors = [];
  var locationIdx = headers.indexOf('LOCATION');
  var binBucketIdx = headers.indexOf('BIN_BUCKET');

  if (binBucketIdx === -1) {
    headers.push('BIN_BUCKET');
    binBucketIdx = headers.length - 1;
    for (var i = 0; i < data.length; i++) data[i].push('');
  }

  if (locationIdx === -1) {
    for (var r = 0; r < data.length; r++) {
      data[r][binBucketIdx] = ORS.PROCESSING.MISSING_LOCATION_VALUE;
    }
    return { headers: headers, data: data, errors: [] };
  }

  for (var r2 = 0; r2 < data.length; r2++) {
    var loc = (data[r2][locationIdx] || '').toString().trim();
    var matched = false;

    for (var rule = 0; rule < rules.length; rule++) {
      var pattern = (rules[rule]['Location Pattern'] || '').toString().trim();
      var bucket = rules[rule]['Bucket'] || '';
      var condition = (rules[rule]['Condition'] || '').toString().trim().toUpperCase();

      if (!pattern) continue;

      if (condition) {
        var condParts = condition.split('=');
        if (condParts.length === 2) {
          var condField = condParts[0].trim();
          var condValue = condParts[1].trim();
          var condFieldIdx = headers.indexOf(condField);
          if (condFieldIdx !== -1) {
            var actualVal = (data[r2][condFieldIdx] || '').toString().trim().toLowerCase();
            if (actualVal !== condValue.toLowerCase()) continue;
          }
        }
      }

      if (pattern.indexOf('-') > 0 && /^[A-Za-z]+\d+-[A-Za-z]+\d+$/.test(pattern)) {
        var parts = pattern.split('-');
        var prefix1 = parts[0].replace(/\d+$/, '');
        var num1 = parseInt(parts[0].replace(/^[A-Za-z]+/, ''));
        var prefix2 = parts[1].replace(/\d+$/, '');
        var num2 = parseInt(parts[1].replace(/^[A-Za-z]+/, ''));

        if (prefix1 === prefix2) {
          var locPrefix = loc.replace(/\d+$/, '');
          var locNum = parseInt(loc.replace(/^[A-Za-z]+/, ''));
          if (locPrefix.toLowerCase() === prefix1.toLowerCase() &&
              !isNaN(locNum) && locNum >= num1 && locNum <= num2) {
            data[r2][binBucketIdx] = bucket;
            matched = true;
            break;
          }
        }
      }
      else if (loc.toLowerCase() === pattern.toLowerCase()) {
        data[r2][binBucketIdx] = bucket;
        matched = true;
        break;
      }
      else if (pattern.indexOf('*') > -1) {
        var regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$', 'i');
        if (regex.test(loc)) {
          data[r2][binBucketIdx] = bucket;
          matched = true;
          break;
        }
      }
    }

    if (!matched && loc) {
      data[r2][binBucketIdx] = ORS.PROCESSING.MISSING_LOCATION_VALUE;
      errors.push({ runId: runId, row: r2 + 2, barcode: data[r2][headers.indexOf('BARCODE')] || '',
        field: 'Location', error: 'No matching location rule for: "' + loc + '"',
        source: 'LOCATION_ENGINE', timestamp: new Date() });
    }
  }

  return { headers: headers, data: data, errors: errors };
}

// ─────────────────────────────────────────────────────────────
// SECTION 11: DUPLICATE DETECTION
// ─────────────────────────────────────────────────────────────

function detectDuplicates_(headers, data, runId) {
  var errors = [];
  var barcodeIdx = headers.indexOf('BARCODE');
  if (barcodeIdx === -1) return { data: data, errors: errors };

  var seen = {};
  var strategy = ORS.PROCESSING.DUPLICATE_STRATEGY;
  var deduped = [];

  for (var i = 0; i < data.length; i++) {
    var bc = data[i][barcodeIdx];
    if (!bc || bc.toString().trim() === '') {
      errors.push({ runId: runId, row: i + 2, barcode: '', field: 'BARCODE',
        error: 'Missing barcode at row ' + (i + 2),
        source: 'DEDUP', timestamp: new Date() });
      continue;
    }

    if (seen[bc]) {
      if (strategy === 'ERROR') {
        errors.push({ runId: runId, row: i + 2, barcode: bc, field: 'BARCODE',
          error: 'Duplicate barcode: ' + bc,
          source: 'DEDUP', timestamp: new Date() });
        continue;
      } else if (strategy === 'FIRST_RECORD') {
        continue;
      } else if (strategy === 'LATEST_RECORD') {
        deduped = deduped.filter(function(r) { return r[barcodeIdx] !== bc; });
        deduped.push(data[i]);
      } else {
        continue;
      }
    } else {
      seen[bc] = true;
      deduped.push(data[i]);
    }
  }

  return { data: deduped, errors: errors };
}

// ─────────────────────────────────────────────────────────────
// SECTION 12: PROCESSING HISTORY & ERROR LOGGING
// ─────────────────────────────────────────────────────────────

function logProcessingHistory_(entry) {
  var headers = ['Run ID', 'Timestamp', 'Source', 'Input Rows', 'Processed Rows',
    'Success Count', 'Error Count', 'Duration (sec)', 'Status'];
  var sheet = getOrCreateSheet_(ORS.SHEETS.PROCESSING_HISTORY, headers);
  sheet.appendRow([entry.runId, entry.timestamp, entry.source, entry.inputRows,
    entry.processedRows, entry.successCount, entry.errorCount, entry.duration, entry.status]);
  protectSheetIfNeeded_(ORS.SHEETS.PROCESSING_HISTORY);
}

function logProcessingErrors_(errors) {
  if (!errors || errors.length === 0) return;
  var headers = ['Run ID', 'Row Number', 'Barcode', 'Source', 'Field', 'Error', 'Timestamp'];
  var sheet = getOrCreateSheet_(ORS.SHEETS.PROCESSING_ERRORS, headers);
  var rows = errors.map(function(e) {
    return [e.runId, e.row, e.barcode, e.source, e.field, e.error, e.timestamp];
  });
  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
  protectSheetIfNeeded_(ORS.SHEETS.PROCESSING_ERRORS);
}

function logDataQuality_(runId, stats) {
  var headers = ['Run ID', 'Timestamp', 'Input Rows', 'Processed Rows',
    'Successful', 'Missing Barcode', 'Missing Fields', 'Unknown Status',
    'Unknown Location', 'Invalid Age', 'Duplicates', 'Errors'];
  var sheet = getOrCreateSheet_(ORS.SHEETS.DATA_QUALITY, headers);
  sheet.appendRow([runId, new Date(), stats.inputRows, stats.processedRows,
    stats.successful, stats.missingBarcode, stats.missingFields,
    stats.unknownStatus, stats.unknownLocation, stats.invalidAge,
    stats.duplicates, stats.errors]);
  protectSheetIfNeeded_(ORS.SHEETS.DATA_QUALITY);
}

// ─────────────────────────────────────────────────────────────
// SECTION 13: FORMATTING ENGINE
// ─────────────────────────────────────────────────────────────

function applyUniversalFormatting_(sheet) {
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol <= 0) return;

  var dataRange = sheet.getRange(2, 1, lastRow - 1, lastCol);
  dataRange.setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);

  for (var c = 1; c <= lastCol; c++) {
    var colRange = sheet.getRange(1, c, lastRow, 1);
    var values = colRange.getValues();
    var maxLen = 0;
    for (var r = 0; r < values.length; r++) {
      var len = String(values[r][0]).length;
      if (len > maxLen) maxLen = len;
    }
    var width = Math.max(ORS.FORMAT.MIN_COL_WIDTH,
      Math.min(maxLen * ORS.FORMAT.CHAR_WIDTH, ORS.FORMAT.MAX_COL_WIDTH));
    sheet.setColumnWidth(c, width);
  }

  for (var r2 = 2; r2 <= lastRow; r2++) {
    var rowRange = sheet.getRange(r2, 1, 1, lastCol);
    var vals = rowRange.getValues();
    var maxContentLen = 0;
    for (var c2 = 0; c2 < vals[0].length; c2++) {
      var len = String(vals[0][c2]).length;
      if (len > maxContentLen) maxContentLen = len;
    }
    var avgColWidth = lastCol > 0 ? ORS.FORMAT.MIN_COL_WIDTH : 100;
    var estimatedLines = Math.ceil((maxContentLen * ORS.FORMAT.CHAR_WIDTH) / avgColWidth);
    var height = Math.max(ORS.FORMAT.DEFAULT_ROW_HEIGHT,
      Math.min(estimatedLines * 18, ORS.FORMAT.MAX_ROW_HEIGHT));
    sheet.setRowHeight(r2, height);
  }
}

function applyHeaderFormatting_(sheet) {
  if (!sheet) return;
  var headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  headerRange.setBackground(ORS.FORMAT.HEADER_BG)
    .setFontColor(ORS.FORMAT.HEADER_FG)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
}

function applyAltRowShading_(sheet) {
  if (!sheet) return;
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  for (var r = 3; r <= lastRow; r += 2) {
    sheet.getRange(r, 1, 1, lastCol).setBackground(ORS.FORMAT.ALT_ROW_BG);
  }
}

// ─────────────────────────────────────────────────────────────
// SECTION 14: DROPDOWN / DATA VALIDATION ENGINE
// ─────────────────────────────────────────────────────────────

function applyConfiguredDropdowns_(sheet) {
  if (!sheet) return;
  var dropdownConfigs = loadDropdownConfig_();
  var sheetName = sheet.getName();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  for (var dc = 0; dc < dropdownConfigs.length; dc++) {
    var config = dropdownConfigs[dc];
    if (config['Sheet'] !== sheetName) continue;
    var colName = config['Column'];
    var dropdownKey = config['Dropdown Key'];
    var values = loadDropdownValues_(dropdownKey);
    if (values.length === 0) continue;

    var colIdx = headers.indexOf(colName);
    if (colIdx === -1) continue;

    var colRange = sheet.getRange(2, colIdx + 1, lastRow - 1, 1);
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(values, true)
      .setAllowInvalid(false)
      .build();
    colRange.setDataValidation(rule);
  }
}

function applyDropdown_(range, values) {
  if (!range || !values || values.length === 0) return;
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true)
    .setAllowInvalid(false)
    .build();
  range.setDataValidation(rule);
}

// ─────────────────────────────────────────────────────────────
// SECTION 15: SHEET SECURITY ENGINE
// ─────────────────────────────────────────────────────────────

function protectSheetIfNeeded_(sheetName) {
  var config = loadSecurityConfig_();
  var entry = null;
  for (var i = 0; i < config.length; i++) {
    if (config[i]['Sheet'] === sheetName) {
      entry = config[i];
      break;
    }
  }

  if (!entry) {
    // No config entry → treat as LOCKED so dynamically created report sheets
    // (e.g. Above_75_Days, Bucket_SW93, Filtered_*) are also protected.
    var dynMode = 'LOCKED';
    var ssDyn = SpreadsheetApp.getActiveSpreadsheet();
    var sheetDyn = ssDyn.getSheetByName(sheetName);
    if (!sheetDyn) return;
    var dynProtections = sheetDyn.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    for (var dp = 0; dp < dynProtections.length; dp++) dynProtections[dp].remove();
    var dynProtection = sheetDyn.protect();
    dynProtection.setDescription('System protection (dynamic): ' + sheetName);
    var dynMe = Session.getActiveUser().getEmail();
    dynProtection.addEditor(dynMe);
    return;
  }

  var mode = (entry['Mode'] || 'OPEN').toUpperCase();
  if (mode === 'OPEN') return;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  var protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  for (var p = 0; p < protections.length; p++) {
    protections[p].remove();
  }

  var protection = sheet.protect();
  protection.setDescription('System protection: ' + sheetName);

  var authorized = loadAuthorizedUsers_();
  var me = Session.getActiveUser().getEmail();
  protection.addEditor(me);

  if (mode === 'PARTIAL') {
    var editableRanges = (entry['Editable Columns'] || '').split(',');
    for (var er = 0; er < editableRanges.length; er++) {
      var colName = editableRanges[er].trim();
      if (!colName) continue;
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var colIdx = headers.indexOf(colName);
      if (colIdx !== -1) {
        var lastRow = sheet.getLastRow();
        if (lastRow > 1) {
          var range = sheet.getRange(2, colIdx + 1, lastRow - 1, 1);
          protection.setUnprotectedRanges([range]);
        }
      }
    }
  }

  if (mode === 'LOCKED') {
    for (var a = 0; a < authorized.length; a++) {
      if (authorized[a]['Role'] === 'ADMIN' || authorized[a]['Role'] === 'OWNER') {
        var email = authorized[a]['Email'];
        if (email) protection.addEditor(email);
      }
    }
  }
}

function unlockSheet_(sheetName, userEmail) {
  var authorized = loadAuthorizedUsers_();
  var isAuthorized = false;
  for (var i = 0; i < authorized.length; i++) {
    if ((authorized[i]['Email'] === userEmail) &&
        (authorized[i]['Role'] === 'ADMIN' || authorized[i]['Role'] === 'OWNER')) {
      isAuthorized = true;
      break;
    }
  }

  if (!isAuthorized && userEmail !== Session.getActiveUser().getEmail()) {
    logSecurityEvent_('UNLOCK_DENIED', sheetName, '', userEmail, 'Unauthorized unlock attempt');
    throw new Error('Unauthorized: ' + userEmail + ' cannot unlock ' + sheetName);
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return false;

  var protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  for (var p = 0; p < protections.length; p++) {
    protections[p].remove();
  }

  logSecurityEvent_('UNLOCK', sheetName, '', userEmail, 'Sheet unlocked');
  return true;
}

function relockSheet_(sheetName, userEmail) {
  protectSheetIfNeeded_(sheetName);
  logSecurityEvent_('RELOCK', sheetName, '', userEmail, 'Sheet relocked');
  return true;
}

function lockAllSystemSheets_() {
  var config = loadSecurityConfig_();
  for (var i = 0; i < config.length; i++) {
    protectSheetIfNeeded_(config[i]['Sheet']);
  }
}

function logSecurityEvent_(action, sheetName, range, userEmail, details) {
  var headers = ['Timestamp', 'User', 'Action', 'Sheet', 'Range', 'Details'];
  var sheet = getOrCreateSheet_(ORS.SHEETS.SECURITY_AUDIT, headers);
  sheet.appendRow([new Date(), userEmail || Session.getActiveUser().getEmail(),
    action, sheetName, range || '', details || '']);
  protectSheetIfNeeded_(ORS.SHEETS.SECURITY_AUDIT);
}

// ─────────────────────────────────────────────────────────────
// SECTION 16: SUMMARY / PIVOT ENGINE
// ─────────────────────────────────────────────────────────────

function generatePivotSummary_(headers, data) {
  var pivotDimensions = ['CATEGORY', 'BRAND', 'STATUS_BUCKET', 'AGE_BUCKET',
    'PRIORITY', 'BIN_BUCKET', 'SOURCE'];
  var validDims = [];
  for (var d = 0; d < pivotDimensions.length; d++) {
    if (headers.indexOf(pivotDimensions[d]) !== -1) {
      validDims.push(pivotDimensions[d]);
    }
  }

  var summarySheet = getOrCreateSheet_(ORS.SHEETS.PIVOT_SUMMARY,
    ['Dimension', 'Value', 'Count'].concat(validDims));

  var lastRow = summarySheet.getLastRow();
  if (lastRow > 1) {
    summarySheet.getRange(2, 1, lastRow - 1, summarySheet.getLastColumn()).clearContent();
  }

  var rowIdx = 2;
  for (var dim = 0; dim < validDims.length; dim++) {
    var dimName = validDims[dim];
    var colIdx = headers.indexOf(dimName);
    if (colIdx === -1) continue;

    var counts = {};
    for (var r = 0; r < data.length; r++) {
      var val = (data[r][colIdx] || 'EMPTY').toString();
      counts[val] = (counts[val] || 0) + 1;
    }

    var keys = Object.keys(counts).sort();
    for (var k = 0; k < keys.length; k++) {
      summarySheet.getRange(rowIdx, 1).setValue(dimName);
      summarySheet.getRange(rowIdx, 2).setValue(keys[k]);
      summarySheet.getRange(rowIdx, 3).setValue(counts[keys[k]]);
      rowIdx++;
    }
    rowIdx++;
  }

  applyHeaderFormatting_(summarySheet);
  applyUniversalFormatting_(summarySheet);
  protectSheetIfNeeded_(ORS.SHEETS.PIVOT_SUMMARY);
}

// ─────────────────────────────────────────────────────────────
// SECTION 17: REPORT ENGINE
// ─────────────────────────────────────────────────────────────

function generateReports_(headers, data, runId) {
  var reportConfigs = loadReportConfig_();
  var generatedReports = [];

  for (var rc = 0; rc < reportConfigs.length; rc++) {
    var config = reportConfigs[rc];
    if (config['Active'] !== 'ON') continue;

    var reportName = config['Report Name'] || ('Report_' + (rc + 1));
    var filterField = config['Filter Field'];
    var filterValue = config['Filter Value'];
    var reportHeaders = (config['Report Columns'] || '').split(',').map(function(f) { return f.trim(); });
    var groupBy = config['Group By'] || '';
    var headerText = config['Header Text'] || '';
    var footerText = config['Footer Text'] || '';
    var orientation = config['Orientation'] || 'Portrait';
    var summary = config['Summary'] === 'ON';
    var emailTo = config['Email To'] || '';

    var filteredData = data;
    if (filterField && filterValue) {
      var filterIdx = headers.indexOf(filterField);
      if (filterIdx !== -1) {
        filteredData = data.filter(function(row) {
          return (row[filterIdx] || '').toString().trim().toLowerCase() ===
            filterValue.toString().trim().toLowerCase();
        });
      }
    }

    var outHeaders = reportHeaders;
    var headerIndices = [];
    for (var h = 0; h < reportHeaders.length; h++) {
      var idx = headers.indexOf(reportHeaders[h]);
      headerIndices.push(idx !== -1 ? idx : -1);
    }

    var outData = [];
    for (var r = 0; r < filteredData.length; r++) {
      var row = [];
      for (var c = 0; c < headerIndices.length; c++) {
        row.push(headerIndices[c] >= 0 ? filteredData[r][headerIndices[c]] : '');
      }
      outData.push(row);
    }

    // Group-by support: sort by group column, optionally add a summary block
    var groupIdx = groupBy ? outHeaders.indexOf(groupBy) : -1;
    if (groupIdx >= 0) {
      outData.sort(function(a, b) {
        return String(a[groupIdx] || '').localeCompare(String(b[groupIdx] || ''));
      });
    }

    var reportSheet = getOrCreateSheet_(reportName, outHeaders);
    var lr = reportSheet.getLastRow();
    if (lr > 1) {
      reportSheet.getRange(2, 1, lr - 1, reportSheet.getLastColumn()).clearContent();
    }
    if (outData.length > 0) {
      for (var b = 0; b < outData.length; b += ORS.PROCESSING.BATCH_SIZE) {
        var batch = outData.slice(b, b + ORS.PROCESSING.BATCH_SIZE);
        reportSheet.getRange(reportSheet.getLastRow() + 1, 1, batch.length, batch[0].length)
          .setValues(batch);
      }
    }

    // Summary block when enabled
    if (summary && outData.length > 0) {
      var sRow = reportSheet.getLastRow() + 2;
      var dim = groupBy || (outHeaders[0] || 'Item');
      var dimIdx = dim === groupBy ? groupIdx : 0;
      var counts = {};
      for (var sr = 0; sr < outData.length; sr++) {
        var key = String(dimIdx >= 0 ? outData[sr][dimIdx] : 'All') || 'Empty';
        counts[key] = (counts[key] || 0) + 1;
      }
      reportSheet.getRange(sRow, 1).setValue('Summary by ' + dim);
      reportSheet.getRange(sRow, 1).setFontWeight('bold');
      var keys = Object.keys(counts);
      for (var k2 = 0; k2 < keys.length; k2++) {
        reportSheet.getRange(sRow + 1 + k2, 1).setValue(keys[k2]);
        reportSheet.getRange(sRow + 1 + k2, 2).setValue(counts[keys[k2]]);
      }
      reportSheet.getRange(sRow, 1, 1, 2).setBackground('#e8eaed');
    }

    // Header/footer text rows
    if (headerText && outData.length > 0) {
      reportSheet.insertRowsBefore(1, 1);
      reportSheet.getRange(1, 1).setValue(headerText).setFontWeight('bold').setFontSize(12);
      reportSheet.insertRowsBefore(1, 1);
      reportSheet.getRange(1, 1).setValue('Report: ' + reportName + '   |   Generated: ' +
        Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm'));
    }
    if (footerText) {
      reportSheet.appendRow([footerText]);
    }

    applyHeaderFormatting_(reportSheet);
    applyUniversalFormatting_(reportSheet);
    applyAltRowShading_(reportSheet);
    protectSheetIfNeeded_(reportName);

    generatedReports.push({ name: reportName, emailTo: emailTo, orientation: orientation });
  }

  return generatedReports;
}

// ─────────────────────────────────────────────────────────────
// SECTION 17.5: REPORT OUTPUT — consolidated sheet
// ─────────────────────────────────────────────────────────────
// 'Report Output' sheet mein saari active reports ka filtered data
// section-wise likha jata hai (INVENTORY sheet untouched — reports
// apni alag sheets se copy hokar yahan consolidate hote hain).

function exportAllReportsToSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Report Output');
  if (!sheet) sheet = ss.insertSheet('Report Output');
  sheet.clearContents();
  sheet.clearFormats();

  var configs = loadReportConfig_();
  var tz = Session.getScriptTimeZone();
  var ts = Utilities.formatDate(new Date(), tz, 'dd-MM-yyyy HH:mm');
  var out = [];
  var maxCols = 1;
  var reportCount = 0;
  var totalRows = 0;

  for (var rc = 0; rc < configs.length; rc++) {
    var config = configs[rc];
    if (config['Active'] !== 'ON') continue;
    var name = config['Report Name'];
    if (!name) continue;
    var src = ss.getSheetByName(name);
    if (!src) continue;
    var all = src.getDataRange().getValues();
    if (all.length <= 1) continue;

    var filterText = (config['Filter Field'] || '') +
      (config['Filter Value'] ? ' = ' + config['Filter Value'] : '');
    var heading = '===== ' + name + '  |  ' + ts + '  |  Filter: ' +
      (filterText || 'All') + '  |  Rows: ' + (all.length - 1) + ' =====';
    out.push([heading]);
    var headerRow = all[0];
    out.push(headerRow);
    for (var r = 1; r < all.length; r++) out.push(all[r]);
    out.push([]);
    if (headerRow.length > maxCols) maxCols = headerRow.length;
    reportCount++;
    totalRows += all.length - 1;
  }

  if (out.length > 0) {
    for (var i = 0; i < out.length; i++) {
      while (out[i].length < maxCols) out[i].push('');
    }
    sheet.getRange(1, 1, out.length, maxCols).setValues(out);
    // Formatting: report headings (blue), column headers (grey), alt shading
    var alt = false;
    for (var rr = 0; rr < out.length; rr++) {
      var first = String(out[rr][0] || '');
      if (first.indexOf('=====') === 0) {
        sheet.getRange(rr + 1, 1, 1, maxCols).setBackground('#1a73e8')
          .setFontColor('#ffffff').setFontWeight('bold');
        alt = false;
      } else if (rr > 0 && String(out[rr - 1][0] || '').indexOf('=====') === 0) {
        sheet.getRange(rr + 1, 1, 1, maxCols).setBackground('#e8eaed').setFontWeight('bold');
      } else if (out[rr].length > 0 && String(out[rr][0] || '') !== '') {
        if (alt) sheet.getRange(rr + 1, 1, 1, maxCols).setBackground('#f7f9fc');
        alt = !alt;
      }
    }
    sheet.setFrozenRows(0);
  } else {
    sheet.getRange(1, 1).setValue(
      'No active reports with data found. Configure reports in Report Config and run the daily process first.');
    sheet.getRange(1, 1).setFontWeight('bold');
  }

  logActivity_('system', 'REPORT_OUTPUT',
    String(reportCount) + ' report(s), ' + String(totalRows) + ' rows', 'OK');
  return { sheetName: 'Report Output', reportCount: reportCount, totalRows: totalRows };
}

function exportAllReportsToSheet() {
  return exportAllReportsToSheet_();
}

// ─────────────────────────────────────────────────────────────
// SECTION 18: EMAIL ENGINE
// ─────────────────────────────────────────────────────────────

function sendConfiguredEmails_(reportNames) {
  var emailConfigs = loadEmailConfig_();
  var sent = [];

  // Build per-report recipient map when report objects carry emailTo
  var perReport = {};
  for (var pr = 0; pr < reportNames.length; pr++) {
    if (reportNames[pr] && typeof reportNames[pr] === 'object') {
      perReport[reportNames[pr].name] = reportNames[pr].emailTo || '';
    }
  }
  var names = reportNames.map(function (r) { return typeof r === 'object' ? r.name : r; });

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  for (var ec = 0; ec < emailConfigs.length; ec++) {
    var config = emailConfigs[ec];
    if (config['Active'] !== 'ON') continue;

    var to = config['To Email'];
    var cc = config['CC'] || '';
    var bcc = config['BCC'] || '';
    var subject = config['Subject'] || 'Inventory Report - ' +
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var body = config['Body'] || 'Please find attached the latest inventory reports.';

    // Attach all sheets (one PDF per report)
    var blobs = [];
    for (var r = 0; r < names.length; r++) {
      var sheet = ss.getSheetByName(names[r]);
      if (sheet) {
        var pdf = sheet.getAs(MimeType.PDF);
        pdf.setName(names[r] + '.pdf');
        blobs.push(pdf);
      }
    }

    try {
      if (blobs.length > 0) {
        MailApp.sendEmail({
          to: to,
          cc: cc || undefined,
          bcc: bcc || undefined,
          subject: subject,
          body: body,
          attachments: blobs
        });
      } else {
        MailApp.sendEmail({
          to: to,
          cc: cc || undefined,
          bcc: bcc || undefined,
          subject: subject,
          body: body
        });
      }
      sent.push(to);
      logActivity_(Session.getActiveUser().getEmail(), 'EMAIL_SENT', to, 'OK');
    } catch (e) {
      Logger.log('Email failed to ' + to + ': ' + e.message);
      logActivity_(Session.getActiveUser().getEmail(), 'EMAIL_SENT', to, 'FAIL: ' + e.message);
    }
  }

  // Per-report recipients: send each report PDF separately to its Email To
  for (var rp in perReport) {
    if (!perReport[rp]) continue;
    var rSheet = ss.getSheetByName(rp);
    if (!rSheet) continue;
    var rPdf = rSheet.getAs(MimeType.PDF);
    rPdf.setName(rp + '.pdf');
    try {
      MailApp.sendEmail({
        to: perReport[rp],
        subject: 'Report: ' + rp + ' - ' +
          Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy'),
        body: 'Please find attached the report: ' + rp,
        attachments: [rPdf]
      });
      sent.push(perReport[rp]);
      logActivity_(Session.getActiveUser().getEmail(), 'EMAIL_SENT', perReport[rp], 'OK');
    } catch (e) {
      Logger.log('Per-report email failed to ' + perReport[rp] + ': ' + e.message);
      logActivity_(Session.getActiveUser().getEmail(), 'EMAIL_SENT', perReport[rp], 'FAIL: ' + e.message);
    }
  }

  return sent;
}

// ─────────────────────────────────────────────────────────────
// SECTION 19: AI COMMAND ENGINE
// ─────────────────────────────────────────────────────────────

var AI_COMMAND_MAP = {
  'inventory': { action: 'RUN_INVENTORY', desc: 'Generate inventory' },
  'report': { action: 'RUN_REPORT', desc: 'Generate reports' },
  'update': { action: 'RUN_INVENTORY', desc: 'Update inventory' },
  'email': { action: 'RUN_EMAIL', desc: 'Send reports via email' },
  'bin': { action: 'RUN_BIN_REPORT', desc: 'Bin storage report' },
  'days': { action: 'RUN_AGE_FILTER', desc: 'Age-based filter' },
  'bucket': { action: 'RUN_BUCKET_REPORT', desc: 'Bucket report' },
  'pivot': { action: 'RUN_PIVOT', desc: 'Refresh pivot summary' },
  'setup': { action: 'RUN_SETUP', desc: 'Run system setup' },
  'unlock': { action: 'UNLOCK_SHEET', desc: 'Unlock a sheet' },
  'lock': { action: 'LOCK_SHEET', desc: 'Lock a sheet' },
  'status': { action: 'SYSTEM_STATUS', desc: 'System status check' }
};

function parseAICommand_(commandText) {
  if (!commandText) return null;
  var text = commandText.toLowerCase().trim();

  var detected = [];
  var keys = Object.keys(AI_COMMAND_MAP);
  for (var i = 0; i < keys.length; i++) {
    if (text.indexOf(keys[i]) > -1) {
      detected.push(AI_COMMAND_MAP[keys[i]]);
    }
  }

  var filters = {};
  var ageMatch = text.match(/(\d+)\s*(days|din|दिन)/);
  if (ageMatch) filters.minAge = parseInt(ageMatch[1]);

  var brandMatch = text.match(/(apple|android|samsung|oneplus|xiaomi|vivo|oppo|realme)/);
  if (brandMatch) filters.brand = brandMatch[1];

  var statusMatch = text.match(/(l[0-9]|bin\s*storage|pending|marked)/);
  if (statusMatch) filters.status = statusMatch[1];

  var locationMatch = text.match(/(sw\d{2,3})/i);
  if (locationMatch) filters.location = locationMatch[1].toUpperCase();

  return { commands: detected, filters: filters, raw: commandText };
}

function findSheetNameInText_(text) {
  var names = [];
  var keys = Object.keys(ORS.SHEETS);
  for (var i = 0; i < keys.length; i++) names.push(ORS.SHEETS[keys[i]]);
  var t = String(text || '').toLowerCase();
  for (var j = 0; j < names.length; j++) {
    if (names[j] && t.indexOf(String(names[j]).toLowerCase()) > -1) return names[j];
  }
  return null;
}

function getSystemStatus_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var inv = readSheetData_(ORS.SHEETS.INVENTORY);
  var history = readSheetData_(ORS.SHEETS.PROCESSING_HISTORY);
  var triggers = ScriptApp.getProjectTriggers();
  var daily = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runDailyProcess') daily++;
  }
  var lastRun = history.data.length ? String(history.data[history.data.length - 1][1] || '') : 'never';
  return {
    success: true,
    message: 'Sheets: ' + ss.getSheets().length +
      ' | Inventory rows: ' + inv.data.length +
      ' | Daily trigger: ' + (daily ? 'ON' : 'OFF') +
      ' | Last run: ' + lastRun
  };
}

function executeAICommand_(commandText) {
  var parsed = parseAICommand_(commandText);
  if (!parsed || parsed.commands.length === 0) {
    return { success: false, message: 'Command not recognized: ' + commandText };
  }

  var results = [];
  for (var i = 0; i < parsed.commands.length; i++) {
    var cmd = parsed.commands[i];
    try {
      var result;
      switch (cmd.action) {
        case 'RUN_INVENTORY':
          result = runDailyProcess_();
          break;
        case 'RUN_REPORT':
          result = runReportsOnly_();
          break;
        case 'RUN_EMAIL':
          result = sendReportsByEmail_();
          break;
        case 'RUN_BIN_REPORT':
          result = runFilteredReport_('STATUS_BUCKET', 'Bin Storage');
          break;
        case 'RUN_AGE_FILTER':
          result = runAgeFilterReport_(parsed.filters.minAge);
          break;
        case 'RUN_BUCKET_REPORT':
          result = runBucketReport_(parsed.filters.location);
          break;
        case 'RUN_PIVOT':
          result = refreshPivot_();
          break;
        case 'RUN_SETUP':
          setupAutomationSystem_();
          result = { success: true, message: 'Setup completed.' };
          break;
        case 'UNLOCK_SHEET':
          {
            var sheetToUnlock = findSheetNameInText_(parsed.raw);
            if (!sheetToUnlock) {
              result = { success: false, message: 'Which sheet? e.g. "unlock Inventory".' };
            } else {
              unlockSheet_(sheetToUnlock, Session.getActiveUser().getEmail());
              result = { success: true, message: 'Unlocked: ' + sheetToUnlock };
            }
          }
          break;
        case 'LOCK_SHEET':
          lockAllSystemSheets_();
          result = { success: true, message: 'All system sheets locked.' };
          break;
        case 'SYSTEM_STATUS':
          result = getSystemStatus_();
          break;
        default:
          result = { success: false, message: 'Unknown action: ' + cmd.action };
      }
      results.push(result);
    } catch (e) {
      results.push({ success: false, message: e.message });
    }
  }

  var logSheet = getOrCreateSheet_(ORS.SHEETS.AI_LOG,
    ['Timestamp', 'Command', 'Parsed Actions', 'Filters', 'Result']);
  logSheet.appendRow([new Date(), commandText,
    parsed.commands.map(function(c) { return c.action; }).join(', '),
    JSON.stringify(parsed.filters),
    results.map(function(r) { return r.message || (r.success ? 'OK' : 'FAIL'); }).join('; ')]);
  protectSheetIfNeeded_(ORS.SHEETS.AI_LOG);

  return results;
}

function processAICommand(commandText) {
  return executeAICommand_(commandText);
}

// ─────────────────────────────────────────────────────────────
// SECTION 20: WRITE DATA SHEETS
// ─────────────────────────────────────────────────────────────

function writeDataSheet_(sheetName, headers, data) {
  var sheet = getOrCreateSheet_(sheetName, headers);
  var lr = sheet.getLastRow();
  if (lr > 1) {
    sheet.getRange(2, 1, lr - 1, sheet.getLastColumn()).clearContent();
  }
  if (data.length > 0) {
    for (var b = 0; b < data.length; b += ORS.PROCESSING.BATCH_SIZE) {
      var batch = data.slice(b, b + ORS.PROCESSING.BATCH_SIZE);
      var startRow = sheet.getLastRow() + 1;
      if (startRow < 2) startRow = 2;
      sheet.getRange(startRow, 1, batch.length, batch[0].length).setValues(batch);
    }
  }
  return sheet;
}

// ─────────────────────────────────────────────────────────────
// SECTION 21: MAIN DAILY PROCESS PIPELINE
// ─────────────────────────────────────────────────────────────

function runDailyProcess_() {
  var startTime = new Date();
  var runId = generateRunId_();
  var allErrors = [];

  // Step 1: Validate configuration
  var configErrors = validateConfiguration_();
  if (configErrors.length > 0) {
    logProcessingHistory_({
      runId: runId, timestamp: startTime, source: 'VALIDATION',
      inputRows: 0, processedRows: 0, successCount: 0,
      errorCount: configErrors.length, duration: 0, status: 'FAILED'
    });
    throw new Error('Configuration errors: ' + configErrors.join('; '));
  }

  // Step 2: Load primary source
  var sources = loadDataSourceConfig_();
  var primarySource = null;
  for (var i = 0; i < sources.length; i++) {
    if (sources[i]['Source Role'] === 'PRIMARY') {
      primarySource = sources[i];
      break;
    }
  }
  if (!primarySource) primarySource = sources[0];

  var rawData;
  try {
    rawData = readSourceData_(primarySource);
  } catch (e) {
    logProcessingHistory_({
      runId: runId, timestamp: startTime, source: primarySource['Source Name'],
      inputRows: 0, processedRows: 0, successCount: 0,
      errorCount: 1, duration: 0, status: 'FAILED'
    });
    throw e;
  }

  var inputRows = rawData.data.length;
  Logger.log('[' + runId + '] Read ' + inputRows + ' rows from ' + primarySource['Source Name']);

  // Step 3: Field extraction
  var mappingConfig = loadFieldMappingConfig_(primarySource['Source Name']);
  if (mappingConfig.length === 0) mappingConfig = loadFieldMappingConfig_();

  var extracted;
  try {
    extracted = extractConfiguredFields_(rawData, mappingConfig, runId);
    allErrors = allErrors.concat(extracted.errors || []);
  } catch (e) {
    logProcessingHistory_({
      runId: runId, timestamp: startTime, source: 'FIELD_MAPPING',
      inputRows: inputRows, processedRows: 0, successCount: 0,
      errorCount: 1, duration: (new Date() - startTime) / 1000, status: 'FAILED'
    });
    throw e;
  }

  // Step 4: Normalize
  var normalized = normalizeData_(extracted, mappingConfig);
  allErrors = allErrors.concat(normalized.errors || []);

  writeDataSheet_(ORS.SHEETS.PROCESSED_DATA, normalized.headers, normalized.data);
  applyHeaderFormatting_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.PROCESSED_DATA));
  applyUniversalFormatting_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.PROCESSED_DATA));
  protectSheetIfNeeded_(ORS.SHEETS.PROCESSED_DATA);

  // Step 5: Join sources
  var joined = performJoins_(normalized, runId);
  allErrors = allErrors.concat(joined.errors || []);

  // Step 6: Duplicate detection
  var deduped = detectDuplicates_(joined.headers, joined.data, runId);
  allErrors = allErrors.concat(deduped.errors || []);

  // Step 7: Apply Age Bucket Rules
  var aged = applyAgeBucketRules_(deduped.headers, deduped.data, runId);
  allErrors = allErrors.concat(aged.errors || []);

  // Step 8: Apply Status Bucket Rules
  var statused = applyStatusBucketRules_(aged.headers, aged.data, runId);
  allErrors = allErrors.concat(statused.errors || []);

  // Step 9: Apply Location / Bin Bucket Rules
  var located = applyLocationRules_(statused.headers, statused.data, runId);
  allErrors = allErrors.concat(located.errors || []);

  // Step 10: Write Inventory
  var invSheet = writeDataSheet_(ORS.SHEETS.INVENTORY, located.headers, located.data);
  applyHeaderFormatting_(invSheet);
  applyUniversalFormatting_(invSheet);
  applyAltRowShading_(invSheet);
  applyConfiguredDropdowns_(invSheet);
  protectSheetIfNeeded_(ORS.SHEETS.INVENTORY);

  // Step 11: Pivot / Summary
  generatePivotSummary_(located.headers, located.data);

  // Step 12: Generate Reports
  var reportNames = generateReports_(located.headers, located.data, runId);

  // Step 13: Log errors
  logProcessingErrors_(allErrors);

  // Step 14: Data Quality Report
  var qualityStats = {
    inputRows: inputRows,
    processedRows: located.data.length,
    successful: located.data.length - allErrors.length,
    missingBarcode: allErrors.filter(function(e) { return e.field === 'BARCODE'; }).length,
    missingFields: allErrors.filter(function(e) { return e.field === 'FIELD_MAPPING'; }).length,
    unknownStatus: allErrors.filter(function(e) { return e.source === 'STATUS_ENGINE'; }).length,
    unknownLocation: allErrors.filter(function(e) { return e.source === 'LOCATION_ENGINE'; }).length,
    invalidAge: allErrors.filter(function(e) { return e.source === 'AGE_ENGINE'; }).length,
    duplicates: allErrors.filter(function(e) { return e.source === 'DEDUP'; }).length,
    errors: allErrors.length
  };
  logDataQuality_(runId, qualityStats);

  // Step 15: Processing History
  var endTime = new Date();
  var duration = ((endTime - startTime) / 1000).toFixed(1);
  var finalStatus = allErrors.length === 0 ? 'SUCCESS' :
    (located.data.length > 0 ? 'PARTIAL_SUCCESS' : 'FAILED');

  logProcessingHistory_({
    runId: runId, timestamp: startTime, source: primarySource['Source Name'],
    inputRows: inputRows, processedRows: located.data.length,
    successCount: qualityStats.successful, errorCount: allErrors.length,
    duration: parseFloat(duration), status: finalStatus
  });

  // Step 16: Email if configured
  var emailConfigs = loadEmailConfig_();
  var autoEmail = emailConfigs.some(function(e) { return e['Active'] === 'ON' && e['Auto Send'] === 'ON'; });
  if (autoEmail && reportNames.length > 0) {
    sendConfiguredEmails_(reportNames);
  }

  // Step 17: Advanced features — trend snapshot, alerts, backup, activity
  try { recordTrendSnapshot_(runId); } catch (e) { Logger.log('Trend: ' + e.message); }
  try { exportAllReportsToSheet_(); } catch (e) { Logger.log('Report output: ' + e.message); }
  var triggeredAlerts = [];
  try {
    triggeredAlerts = checkStockAlerts_(located.headers, located.data);
    if (triggeredAlerts.length > 0) sendAlertNotifications_(triggeredAlerts);
  } catch (e) { Logger.log('Alerts: ' + e.message); }
  try { backupToDrive_(); } catch (e) { Logger.log('Backup: ' + e.message); }
  try {
    logActivity_(Session.getActiveUser().getEmail(), 'PROCESS_RUN', runId, finalStatus);
    if (triggeredAlerts.length > 0) logActivity_('system', 'ALERTS_TRIGGERED', String(triggeredAlerts.length) + ' alert(s)', 'OK');
  } catch (e) {}

  // Step 18: Auto-relock any protected sheets an admin may have unlocked during the day
  try {
    lockAllSystemSheets_();
    logActivity_('system', 'AUTO_RELOCK', 'System sheets', 'OK');
  } catch (e) { Logger.log('Auto-relock: ' + e.message); }

  Logger.log('[' + runId + '] Complete: ' + located.data.length + ' rows, ' +
    allErrors.length + ' errors, ' + duration + 's');

  return {
    success: finalStatus !== 'FAILED',
    runId: runId,
    processedRows: located.data.length,
    errors: allErrors.length,
    status: finalStatus,
    duration: duration,
    reports: reportNames
  };
}

function runDailyProcess() {
  return runDailyProcess_();
}

// ─────────────────────────────────────────────────────────────
// SECTION 22: ON-DEMAND COMMANDS
// ─────────────────────────────────────────────────────────────

function runReportsOnly_() {
  var inv = readSheetData_(ORS.SHEETS.INVENTORY);
  if (inv.data.length === 0) throw new Error('No inventory data. Run daily process first.');
  var generated = generateReports_(inv.headers, inv.data, generateRunId_());
  try { exportAllReportsToSheet_(); } catch (e) { Logger.log('Report output: ' + e.message); }
  return generated;
}

function runReportsOnly() {
  return runReportsOnly_();
}

function sendReportsByEmail_() {
  var reportConfigs = loadReportConfig_().filter(function(r) { return r['Active'] === 'ON'; });
  var names = reportConfigs.map(function(r) { return r['Report Name']; });
  return sendConfiguredEmails_(names);
}

function sendReportsByEmail() {
  return sendReportsByEmail_();
}

function runFilteredReport_(filterField, filterValue) {
  var inv = readSheetData_(ORS.SHEETS.INVENTORY);
  if (inv.data.length === 0) throw new Error('No inventory data.');

  var reportName = 'Filtered_' + filterField + '_' + filterValue;
  var filterIdx = inv.headers.indexOf(filterField);
  if (filterIdx === -1) throw new Error('Filter field not found: ' + filterField);

  var filtered = inv.data.filter(function(row) {
    return (row[filterIdx] || '').toString().toLowerCase() === filterValue.toLowerCase();
  });

  var sheet = writeDataSheet_(reportName, inv.headers, filtered);
  applyHeaderFormatting_(sheet);
  applyUniversalFormatting_(sheet);
  applyAltRowShading_(sheet);
  protectSheetIfNeeded_(reportName);

  return { success: true, report: reportName, rows: filtered.length };
}

function runAgeFilterReport_(minAge) {
  var inv = readSheetData_(ORS.SHEETS.INVENTORY);
  if (inv.data.length === 0) throw new Error('No inventory data.');

  var ageIdx = inv.headers.indexOf('MOD_AGE');
  if (ageIdx === -1) ageIdx = inv.headers.indexOf('STOCK_AGE');
  if (ageIdx === -1) throw new Error('No age column found.');

  var filtered = inv.data.filter(function(row) {
    var age = safeNum_(row[ageIdx]);
    return age !== null && age > minAge;
  });

  var reportName = 'Above_' + minAge + '_Days';
  var sheet = writeDataSheet_(reportName, inv.headers, filtered);
  applyHeaderFormatting_(sheet);
  applyUniversalFormatting_(sheet);
  applyAltRowShading_(sheet);
  protectSheetIfNeeded_(reportName);

  return { success: true, report: reportName, rows: filtered.length };
}

function runBucketReport_(location) {
  var inv = readSheetData_(ORS.SHEETS.INVENTORY);
  if (inv.data.length === 0) throw new Error('No inventory data.');

  var locIdx = inv.headers.indexOf('LOCATION');
  if (locIdx === -1) throw new Error('No LOCATION column found.');

  var filtered = inv.data.filter(function(row) {
    return (row[locIdx] || '').toString().toUpperCase() === (location || '').toUpperCase();
  });

  var reportName = 'Bucket_' + (location || 'ALL');
  var sheet = writeDataSheet_(reportName, inv.headers, filtered);
  applyHeaderFormatting_(sheet);
  applyUniversalFormatting_(sheet);
  applyAltRowShading_(sheet);
  protectSheetIfNeeded_(reportName);

  return { success: true, report: reportName, rows: filtered.length };
}

function refreshPivot_() {
  var inv = readSheetData_(ORS.SHEETS.INVENTORY);
  if (inv.data.length === 0) throw new Error('No inventory data.');
  generatePivotSummary_(inv.headers, inv.data);
  return { success: true, message: 'Pivot summary refreshed.' };
}

function refreshPivot() {
  return refreshPivot_();
}

// ─────────────────────────────────────────────────────────────
// SECTION 23: onEdit HANDLER
// ─────────────────────────────────────────────────────────────

function onEdit(e) {
  if (!e) return;
  var range = e.range;
  var sheet = range.getSheet();
  var sheetName = sheet.getName();

  var systemSheets = [
    ORS.SHEETS.PROCESSING_HISTORY,
    ORS.SHEETS.PROCESSING_ERRORS,
    ORS.SHEETS.SECURITY_AUDIT,
    ORS.SHEETS.DATA_QUALITY,
    ORS.SHEETS.AI_LOG,
    ORS.SHEETS.PIVOT_SUMMARY
  ];
  if (systemSheets.indexOf(sheetName) > -1) return;

  var row = range.getRow();
  if (row >= 2) {
    var dataRange = sheet.getRange(row, 1, 1, sheet.getLastColumn());
    dataRange.setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setWrap(true);
  }
}

// ─────────────────────────────────────────────────────────────
// SECTION 24: SETUP FUNCTION
// ─────────────────────────────────────────────────────────────

function setupAutomationSystem_() {
  Logger.log('Starting system setup...');

  // ── Data Sources ──
  var dsSheet = getOrCreateSheet_(ORS.SHEETS.DATA_SOURCES,
    ['Source ID', 'Source Name', 'Source Type', 'Source Role', 'Sheet Name', 'Sheet ID', 'Join Key', 'Join Fields', 'Active']);
  applyHeaderFormatting_(dsSheet);
  applyDropdown_(dsSheet.getRange(2, 3, 100, 1), ['Google Sheet', 'Excel Import', 'CSV']);
  applyDropdown_(dsSheet.getRange(2, 4, 100, 1), ['PRIMARY', 'JOIN']);
  applyDropdown_(dsSheet.getRange(2, 9, 100, 1), ['ON', 'OFF']);

  if (dsSheet.getLastRow() <= 1) {
    dsSheet.appendRow(['SRC001', 'Daily Raw Data', 'Google Sheet', 'PRIMARY', 'Daily Raw Data', '', 'BARCODE', 'Stock Age,Status,Model,Brand,Source', 'ON']);
    dsSheet.appendRow(['SRC002', 'QC Stock', 'Google Sheet', 'JOIN', 'QC Stock', '', 'Barcode', 'Stock Age,Status,Model,Brand,Source', 'ON']);
    dsSheet.appendRow(['SRC003', 'Location', 'Google Sheet', 'JOIN', 'Location', '', 'Barcode', 'Location,Storage Status,Bin', 'ON']);
  }

  // ── Field Mapping ──
  var fmSheet = getOrCreateSheet_(ORS.SHEETS.FIELD_MAPPING,
    ['Source', 'Source Column', 'Target Field', 'Required', 'Active', 'Output Order']);
  applyHeaderFormatting_(fmSheet);
  applyDropdown_(fmSheet.getRange(2, 4, 200, 1), ['YES', 'NO']);
  applyDropdown_(fmSheet.getRange(2, 5, 200, 1), ['ON', 'OFF']);

  // ── Age Bucket Rules ──
  var abSheet = getOrCreateSheet_(ORS.SHEETS.AGE_BUCKET_RULES,
    ['Min Age', 'Max Age', 'Bucket', 'Priority', 'Active']);
  applyHeaderFormatting_(abSheet);
  applyDropdown_(abSheet.getRange(2, 5, 50, 1), ['ON', 'OFF']);

  if (abSheet.getLastRow() <= 1) {
    abSheet.appendRow([0, 29, 'Below 30', 'P2', 'ON']);
    abSheet.appendRow([30, 59, '30-60', 'P2', 'ON']);
    abSheet.appendRow([60, 74, '60-75', 'P3', 'ON']);
    abSheet.appendRow([75, 999999, 'Above 75', 'P4', 'ON']);
  }

  // ── Status Bucket Rules ──
  var sbSheet = getOrCreateSheet_(ORS.SHEETS.STATUS_BUCKET_RULES,
    ['Raw Status', 'Standard Bucket', 'Marking', 'Active']);
  applyHeaderFormatting_(sbSheet);
  applyDropdown_(sbSheet.getRange(2, 4, 200, 1), ['ON', 'OFF']);

  // ── Location Rules ──
  var lrSheet = getOrCreateSheet_(ORS.SHEETS.LOCATION_RULES,
    ['Location Pattern', 'Bucket', 'Condition', 'Active']);
  applyHeaderFormatting_(lrSheet);
  applyDropdown_(lrSheet.getRange(2, 4, 50, 1), ['ON', 'OFF']);

  // ── Report Config ──
  var rcSheet = getOrCreateSheet_(ORS.SHEETS.REPORT_CONFIG,
    ['Report Name', 'Filter Field', 'Filter Value', 'Report Columns', 'Active']);
  ensureReportColumns_();
  applyHeaderFormatting_(rcSheet);
  applyDropdown_(rcSheet.getRange(2, 5, 50, 1), ['ON', 'OFF']);

  // ── Report Output (consolidated reports + filtered data) ──
  getOrCreateSheet_('Report Output', ['Report Output']);

  // ── Report Templates (advanced: reusable report formats) ──
  var rtSheet = getOrCreateSheet_(ORS.SHEETS.REPORT_TEMPLATES,
    ['Template Name', 'Config JSON', 'Active']);
  applyHeaderFormatting_(rtSheet);
  applyDropdown_(rtSheet.getRange(2, 3, 100, 1), ['ON', 'OFF']);

  // ── Alert Rules (stock threshold alerts) ──
  var arSheet = getOrCreateSheet_(ORS.SHEETS.ALERT_RULES,
    ['Alert Name', 'Filter Field', 'Filter Value', 'Operator', 'Threshold', 'Email To', 'Telegram', 'Active']);
  applyHeaderFormatting_(arSheet);
  applyDropdown_(arSheet.getRange(2, 5, 100, 1), ['LT', 'GT']);
  applyDropdown_(arSheet.getRange(2, 7, 100, 1), ['ON', 'OFF']);
  applyDropdown_(arSheet.getRange(2, 8, 100, 1), ['ON', 'OFF']);
  if (arSheet.getLastRow() <= 1) {
    arSheet.appendRow(['Low Stock Alert', 'BRAND', 'Apple', 'LT', 10, 'ops@example.com', 'ON', 'ON']);
  }

  // ── Trend History (ageing snapshots per run) ──
  var thSheet = getOrCreateSheet_(ORS.SHEETS.TREND_HISTORY,
    ['Run ID', 'Date', 'Below 30', '30-60', '60-75', 'Above 75', 'Total']);
  applyHeaderFormatting_(thSheet);

  // ── Activity Log (user/action feed) ──
  var alSheet = getOrCreateSheet_(ORS.SHEETS.ACTIVITY_LOG,
    ['Timestamp', 'User', 'Action', 'Object', 'Result']);
  applyHeaderFormatting_(alSheet);

  // ── System Settings (key-value: telegram token, backup toggle) ──
  var sysSheet = getOrCreateSheet_(ORS.SHEETS.SYSTEM_SETTINGS,
    ['Key', 'Value']);
  applyHeaderFormatting_(sysSheet);
  var sysDefaults = {
    'TELEGRAM_BOT_TOKEN': '',
    'TELEGRAM_CHAT_ID': '',
    'AUTO_BACKUP': 'OFF',
    'BACKUP_FOLDER_ID': ''
  };
  var sysKeys = sysSheet.getDataRange().getValues().slice(1).map(function (r) { return r[0]; });
  for (var sk in sysDefaults) {
    if (sysKeys.indexOf(sk) === -1) sysSheet.appendRow([sk, sysDefaults[sk]]);
  }


  // ── Schedule Config ──
  var scSheet = getOrCreateSheet_(ORS.SHEETS.SCHEDULE_CONFIG,
    ['Task', 'Schedule Type', 'Time', 'Active']);
  applyHeaderFormatting_(scSheet);
  applyDropdown_(scSheet.getRange(2, 2, 20, 1), ['Manual', 'Hourly', 'Daily', 'Weekly', 'Monthly']);
  applyDropdown_(scSheet.getRange(2, 4, 20, 1), ['ON', 'OFF']);

  if (scSheet.getLastRow() <= 1) {
    scSheet.appendRow(['Daily Process', 'Daily', '19:00', 'ON']);
    scSheet.appendRow(['Daily Report', 'Daily', '19:30', 'ON']);
    scSheet.appendRow(['Email Report', 'Daily', '19:45', 'ON']);
  }

  // ── Dropdown Values ──
  var dvSheet = getOrCreateSheet_(ORS.SHEETS.DROPDOWN_VALUES,
    ['Dropdown Key', 'Value', 'Active']);
  applyHeaderFormatting_(dvSheet);
  applyDropdown_(dvSheet.getRange(2, 3, 200, 1), ['ON', 'OFF']);

  if (dvSheet.getLastRow() <= 1) {
    var defaults = [
      ['BOOLEAN', 'ON'], ['BOOLEAN', 'OFF'],
      ['YES_NO', 'YES'], ['YES_NO', 'NO'],
      ['REPORT_TYPE', 'Daily'], ['REPORT_TYPE', 'Weekly'], ['REPORT_TYPE', 'Monthly'], ['REPORT_TYPE', 'Custom'],
      ['OUTPUT_FORMAT', 'Google Sheet'], ['OUTPUT_FORMAT', 'Excel'], ['OUTPUT_FORMAT', 'PDF'],
      ['OUTPUT_FORMAT', 'PPT'], ['OUTPUT_FORMAT', 'CSV'],
      ['PROCESSING_STATUS', 'READY'], ['PROCESSING_STATUS', 'RUNNING'],
      ['PROCESSING_STATUS', 'SUCCESS'], ['PROCESSING_STATUS', 'PARTIAL_SUCCESS'],
      ['PROCESSING_STATUS', 'FAILED'],
      ['DUPLICATE_STRATEGY', 'ERROR'], ['DUPLICATE_STRATEGY', 'FIRST_RECORD'],
      ['DUPLICATE_STRATEGY', 'LATEST_RECORD'], ['DUPLICATE_STRATEGY', 'MERGE'],
      ['SOURCE_ROLE', 'PRIMARY'], ['SOURCE_ROLE', 'JOIN'],
      ['SOURCE_TYPE', 'Google Sheet'], ['SOURCE_TYPE', 'Excel Import'], ['SOURCE_TYPE', 'CSV'],
      ['SOURCE_CATEGORY', 'QC_STOCK'], ['SOURCE_CATEGORY', 'TRC'], ['SOURCE_CATEGORY', 'INVENTORY'],
      ['SOURCE_CATEGORY', 'LOCATION'], ['SOURCE_CATEGORY', 'OTHER']
    ];
    for (var d = 0; d < defaults.length; d++) {
      dvSheet.appendRow([defaults[d][0], defaults[d][1], 'ON']);
    }
  }

  // ── Dropdown Config ──
  var dcSheet = getOrCreateSheet_(ORS.SHEETS.DROPDOWN_CONFIG,
    ['Sheet', 'Column', 'Dropdown Key', 'Active']);
  applyHeaderFormatting_(dcSheet);
  applyDropdown_(dcSheet.getRange(2, 4, 50, 1), ['ON', 'OFF']);

  // ── Sheet Security ──
  var ssSheet = getOrCreateSheet_(ORS.SHEETS.SHEET_SECURITY,
    ['Sheet', 'Mode', 'Editable Columns', 'Admin Unlock', 'Auto Relock']);
  applyHeaderFormatting_(ssSheet);
  applyDropdown_(ssSheet.getRange(2, 2, 50, 1), ['OPEN', 'PARTIAL', 'LOCKED']);
  applyDropdown_(ssSheet.getRange(2, 4, 50, 1), ['YES', 'NO']);
  applyDropdown_(ssSheet.getRange(2, 5, 50, 1), ['YES', 'NO']);

  if (ssSheet.getLastRow() <= 1) {
    var secDefaults = [
      [ORS.SHEETS.DATA_SOURCES, 'OPEN', '', 'NO', 'NO'],
      [ORS.SHEETS.FIELD_MAPPING, 'OPEN', '', 'NO', 'NO'],
      [ORS.SHEETS.AGE_BUCKET_RULES, 'OPEN', '', 'NO', 'NO'],
      [ORS.SHEETS.STATUS_BUCKET_RULES, 'OPEN', '', 'NO', 'NO'],
      [ORS.SHEETS.LOCATION_RULES, 'OPEN', '', 'NO', 'NO'],
      [ORS.SHEETS.REPORT_CONFIG, 'OPEN', '', 'NO', 'NO'],
      [ORS.SHEETS.REPORT_TEMPLATES, 'OPEN', '', 'NO', 'NO'],
      [ORS.SHEETS.ALERT_RULES, 'OPEN', '', 'NO', 'NO'],
      [ORS.SHEETS.TREND_HISTORY, 'LOCKED', '', 'NO', 'YES'],
      [ORS.SHEETS.ACTIVITY_LOG, 'LOCKED', '', 'NO', 'YES'],
      [ORS.SHEETS.SYSTEM_SETTINGS, 'OPEN', '', 'NO', 'NO'],
      [ORS.SHEETS.SCHEDULE_CONFIG, 'OPEN', '', 'NO', 'NO'],
      [ORS.SHEETS.DROPDOWN_VALUES, 'OPEN', '', 'NO', 'NO'],
      [ORS.SHEETS.DROPDOWN_CONFIG, 'OPEN', '', 'NO', 'NO'],
      [ORS.SHEETS.SHEET_SECURITY, 'PARTIAL', 'Mode,Editable Columns,Admin Unlock,Auto Relock', 'YES', 'NO'],
      [ORS.SHEETS.AUTHORIZED_USERS, 'PARTIAL', 'Email,Role,Active', 'YES', 'NO'],
      [ORS.SHEETS.OUTPUT_CONFIG, 'OPEN', '', 'NO', 'NO'],
      [ORS.SHEETS.EMAIL_CONFIG, 'OPEN', '', 'NO', 'NO'],
      [ORS.SHEETS.COMMAND_CENTER, 'OPEN', '', 'NO', 'NO'],
      [ORS.SHEETS.RAW_DATA, 'LOCKED', '', 'YES', 'YES'],
      [ORS.SHEETS.PROCESSED_DATA, 'LOCKED', '', 'YES', 'YES'],
      [ORS.SHEETS.INVENTORY, 'LOCKED', '', 'YES', 'YES'],
      [ORS.SHEETS.PIVOT_SUMMARY, 'LOCKED', '', 'YES', 'YES'],
      [ORS.SHEETS.PROCESSING_HISTORY, 'LOCKED', '', 'NO', 'YES'],
      [ORS.SHEETS.PROCESSING_ERRORS, 'LOCKED', '', 'NO', 'YES'],
      [ORS.SHEETS.SECURITY_AUDIT, 'LOCKED', '', 'NO', 'YES'],
      [ORS.SHEETS.DATA_QUALITY, 'LOCKED', '', 'NO', 'YES'],
      [ORS.SHEETS.AI_LOG, 'LOCKED', '', 'NO', 'YES']
    ];
    for (var s = 0; s < secDefaults.length; s++) {
      ssSheet.appendRow(secDefaults[s]);
    }
  }

  // ── Authorized Users ──
  var auSheet = getOrCreateSheet_(ORS.SHEETS.AUTHORIZED_USERS,
    ['Email', 'Role', 'Active']);
  applyHeaderFormatting_(auSheet);
  applyDropdown_(auSheet.getRange(2, 2, 50, 1), ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER']);
  applyDropdown_(auSheet.getRange(2, 3, 50, 1), ['ON', 'OFF']);
  // Seed the current user (spreadsheet owner) as OWNER so they are never locked out.
  try {
    var ownerEmail = '';
    try { ownerEmail = Session.getActiveUser().getEmail(); } catch (e1) {}
    if (!ownerEmail) { try { ownerEmail = Session.getEffectiveUser().getEmail(); } catch (e2) {} }
    if (ownerEmail) {
      var auData = auSheet.getDataRange().getValues();
      var auFound = false;
      for (var auR = 1; auR < auData.length; auR++) {
        if (String(auData[auR][0]).toLowerCase() === ownerEmail.toLowerCase()) { auFound = true; break; }
      }
      if (!auFound) auSheet.appendRow([ownerEmail, 'OWNER', 'ON']);
    }
  } catch (e) { /* non-fatal */ }

  // ── Output Config ──
  var ocSheet = getOrCreateSheet_(ORS.SHEETS.OUTPUT_CONFIG,
    ['Config Key', 'Config Value', 'Active']);
  applyHeaderFormatting_(ocSheet);
  applyDropdown_(ocSheet.getRange(2, 3, 50, 1), ['ON', 'OFF']);

  // ── Email Config ──
  var ecSheet = getOrCreateSheet_(ORS.SHEETS.EMAIL_CONFIG,
    ['To Email', 'CC', 'BCC', 'Subject', 'Body', 'Auto Send', 'Output Format', 'Active']);
  applyHeaderFormatting_(ecSheet);
  applyDropdown_(ecSheet.getRange(2, 6, 50, 1), ['ON', 'OFF']);
  applyDropdown_(ecSheet.getRange(2, 7, 50, 1), ['PDF', 'Excel', 'CSV', 'Google Sheet']);
  applyDropdown_(ecSheet.getRange(2, 8, 50, 1), ['ON', 'OFF']);

  // ── Command Center ──
  var ccSheet = getOrCreateSheet_(ORS.SHEETS.COMMAND_CENTER,
    ['Command', 'Status', 'Last Run', 'Result', 'Notes']);
  applyHeaderFormatting_(ccSheet);
  applyDropdown_(ccSheet.getRange(2, 2, 50, 1),
    ['READY', 'RUNNING', 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED']);

  if (ccSheet.getLastRow() <= 1) {
    ccSheet.appendRow(['Run Daily Process', 'READY', '', '', 'Runs the full inventory pipeline']);
    ccSheet.appendRow(['Generate Reports', 'READY', '', '', 'Generate configured reports']);
    ccSheet.appendRow(['Send Email', 'READY', '', '', 'Email reports to configured recipients']);
    ccSheet.appendRow(['Refresh Pivot', 'READY', '', '', 'Refresh pivot/summary data']);
    ccSheet.appendRow(['AI Command', 'READY', '', '', 'Process natural language command']);
  }

  // ── Create data layer sheets (empty, with headers) ──
  getOrCreateSheet_(ORS.SHEETS.RAW_DATA, []);
  getOrCreateSheet_(ORS.SHEETS.PROCESSED_DATA, []);
  getOrCreateSheet_(ORS.SHEETS.INVENTORY, []);

  // ── Multi-source architecture sheets (SOURCE_DATA, conflicts, jobs) ──
  ensureMultiSourceSheets_();

  // ── Apply security ──
  lockAllSystemSheets_();

  // ── Create menu (may fail in editor context; onOpen creates it in the browser) ──
  try {
    createSystemMenu_();
  } catch (e) {
    Logger.log('Menu creation skipped (no UI context): ' + e.message);
  }

  // ── Daily auto-run trigger (7 PM) — idempotent: purana trigger replace hota hai ──
  setupDailyTrigger_();

  Logger.log('Setup complete.');
  return { success: true, message: 'Automation system setup complete. Configure your sources and field mappings, then run the daily process.' };
}

function setupAutomationSystem() {
  return setupAutomationSystem_();
}

// ─────────────────────────────────────────────────────────────
// SECTION 25: CUSTOM MENU
// ─────────────────────────────────────────────────────────────

function createSystemMenu_() {
  SpreadsheetApp.getActiveSpreadsheet().addMenu('⚙ Bulk Repair', [
    { name: '▶ Run Daily Process', functionName: 'runDailyProcess' },
    { name: '📊 Generate Reports', functionName: 'runReportsOnly' },
    { name: '📧 Send Reports by Email', functionName: 'sendReportsByEmail' },
    { name: '🔄 Refresh Pivot', functionName: 'refreshPivot' },
    null,
    { name: '🔧 Setup System', functionName: 'setupAutomationSystem' },
    null,
    { name: '🔒 Lock All Sheets', functionName: 'lockAllSystemSheets' },
    null,
    { name: '🤖 AI: Run Inventory', functionName: 'menuAIInventory' },
    { name: '🤖 AI: Generate Report', functionName: 'menuAIReport' }
  ]);
}

function onOpen() {
  createSystemMenu_();
}

function menuAIInventory() {
  var result = runDailyProcess_();
  SpreadsheetApp.getUi().alert(
    'Process ' + (result.success ? 'Complete' : 'Failed'),
    'Run ID: ' + result.runId + '\n' +
    'Rows: ' + result.processedRows + '\n' +
    'Errors: ' + result.errors + '\n' +
    'Status: ' + result.status,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function menuAIReport() {
  var reports = runReportsOnly_();
  var names = reports.map(function (r) { return typeof r === 'object' ? r.name : r; });
  SpreadsheetApp.getUi().alert(
    'Reports Generated',
    names.join('\n') || 'No reports configured.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ─────────────────────────────────────────────────────────────
// SECTION 26: TRIGGER MANAGEMENT
// ─────────────────────────────────────────────────────────────

function setupDailyTrigger_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runDailyProcess') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Config-driven: read the "Daily Process" time from Schedule Config (default 19:00).
  var hour = 19;
  var sc = readConfigSheet_(ORS.SHEETS.SCHEDULE_CONFIG);
  for (var j = 0; j < sc.length; j++) {
    if (String(sc[j]['Task']).toLowerCase().indexOf('daily process') === 0 && sc[j]['Active'] === 'ON') {
      var t = String(sc[j]['Time'] || '19:00');
      var hh = parseInt(t.split(':')[0], 10);
      if (!isNaN(hh) && hh >= 0 && hh <= 23) hour = hh;
      break;
    }
  }

  ScriptApp.newTrigger('runDailyProcess')
    .timeBased()
    .atHour(hour)
    .everyDays(1)
    .create();

  Logger.log('Daily trigger set for ' + hour + ':00 (from Schedule Config).');
}

function setupDailyTrigger() {
  setupDailyTrigger_();
}

function removeDailyTrigger_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runDailyProcess') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  Logger.log('Daily trigger removed.');
}

// ─────────────────────────────────────────────────────────────
// SECTION 27: TEST FUNCTIONS
// ─────────────────────────────────────────────────────────────

function runAllTests_() {
  Logger.log('=== RUNNING TESTS ===');
  var passed = 0;
  var failed = 0;

  // TEST 1: normalizeBarcode_
  var t1a = normalizeBarcode_('12345.0') === '12345';
  var t1b = normalizeBarcode_('  ABC123  ') === 'ABC123';
  var t1c = normalizeBarcode_('') === '';
  if (t1a && t1b && t1c) { passed++; } else { failed++; Logger.log('FAIL: Test 1'); }

  // TEST 2: buildLookupIndex_
  var idx = buildLookupIndex_([['A', 'x'], ['B', 'y']], ['key', 'val'], 'key');
  var t2 = idx['A'] !== undefined && idx['B'] !== undefined;
  if (t2) { passed++; } else { failed++; Logger.log('FAIL: Test 2'); }

  // TEST 3: validateConfiguration_
  var t3 = Array.isArray(validateConfiguration_());
  if (t3) { passed++; } else { failed++; Logger.log('FAIL: Test 3'); }

  // TEST 4: extractConfiguredFields_
  var rawData4 = {
    headers: ['Barcode', 'Model', 'Brand', 'Extra Col'],
    data: [['BC1', 'iPhone', 'Apple', 'junk'], ['BC2', 'Galaxy', 'Samsung', 'junk2']]
  };
  var mapping4 = [
    { 'Source Column': 'Barcode', 'Target Field': 'BARCODE', 'Required': 'YES', 'Active': 'ON', 'Output Order': 1 },
    { 'Source Column': 'Model', 'Target Field': 'MODEL', 'Required': 'YES', 'Active': 'ON', 'Output Order': 2 },
    { 'Source Column': 'Brand', 'Target Field': 'BRAND', 'Required': 'YES', 'Active': 'ON', 'Output Order': 3 }
  ];
  var ext4 = extractConfiguredFields_(rawData4, mapping4, 'TEST');
  var t4 = ext4.headers.length === 3 && ext4.data[0].length === 3 && ext4.data[0][0] === 'BC1';
  if (t4) { passed++; } else { failed++; Logger.log('FAIL: Test 4'); }

  // TEST 5: Missing required field
  var mapping5 = [
    { 'Source Column': 'NonExistent', 'Target Field': 'X', 'Required': 'YES', 'Active': 'ON', 'Output Order': 1 }
  ];
  var t5 = false;
  try { extractConfiguredFields_(rawData4, mapping5, 'TEST'); } catch (e) { t5 = e.message.indexOf('Required fields missing') > -1; }
  if (t5) { passed++; } else { failed++; Logger.log('FAIL: Test 5'); }

  // TEST 6: Age bucket rules
  var headers6 = ['BARCODE', 'MOD_AGE'];
  var data6 = [['BC1', 25], ['BC2', 45], ['BC3', 70], ['BC4', 80], ['BC5', 'bad']];
  var aged6 = applyAgeBucketRules_(headers6, data6, 'TEST6');
  var t6a = aged6.data[0][aged6.headers.indexOf('AGE_BUCKET')] === 'Below 30';
  var t6b = aged6.data[3][aged6.headers.indexOf('AGE_BUCKET')] === 'Above 75';
  var t6c = aged6.data[4][aged6.headers.indexOf('AGE_BUCKET')] === 'UNKNOWN_AGE';
  if (t6a && t6b && t6c) { passed++; } else { failed++; Logger.log('FAIL: Test 6'); }

  // TEST 7: Status bucket rules
  var headers7 = ['BARCODE', 'STATUS'];
  var data7 = [['BC1', 'L4'], ['BC2', 'Marked L4'], ['BC3', 'SomethingNew']];
  var statused7 = applyStatusBucketRules_(headers7, data7, 'TEST7');
  var t7a = statused7.data[0][statused7.headers.indexOf('STATUS_BUCKET')] === 'L4';
  var t7c = statused7.data[2][statused7.headers.indexOf('STATUS_BUCKET')] === 'UNKNOWN_STATUS';
  if (t7a && t7c) { passed++; } else { failed++; Logger.log('FAIL: Test 7'); }

  // TEST 8: Duplicate detection
  var headers8 = ['BARCODE', 'VAL'];
  var data8 = [['BC1', 'A'], ['BC1', 'B'], ['BC2', 'C']];
  var dedup8 = detectDuplicates_(headers8, data8, 'TEST8');
  var t8 = dedup8.data.length === 1 && dedup8.errors.length === 1;
  if (t8) { passed++; } else { failed++; Logger.log('FAIL: Test 8'); }

  // TEST 9: Location rules
  var headers9 = ['BARCODE', 'LOCATION', 'STATUS_BUCKET'];
  var data9 = [['BC1', 'SW05', 'Bin Storage'], ['BC2', 'SW15', 'Bin Storage']];
  var loc9 = applyLocationRules_(headers9, data9, 'TEST9');
  var t9 = typeof loc9.data[0][loc9.headers.indexOf('BIN_BUCKET')] === 'string';
  if (t9) { passed++; } else { failed++; Logger.log('FAIL: Test 9'); }

  // TEST 10: generateRunId_
  var rid = generateRunId_();
  var t10 = rid.indexOf('RUN') === 0;
  if (t10) { passed++; } else { failed++; Logger.log('FAIL: Test 10'); }

  Logger.log('=== TESTS COMPLETE: ' + passed + ' passed, ' + failed + ' failed ===');
  return { passed: passed, failed: failed, total: passed + failed };
}

function runAllTests() {
  return runAllTests_();
}

// ─────────────────────────────────────────────────────────────
// SECTION 27: ADVANCED FEATURES (alerts, trends, activity, telegram, backup)
// ─────────────────────────────────────────────────────────────

/* ── System Settings (key-value) ── */
function getSystemSetting_(key) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.SYSTEM_SETTINGS);
  if (!sheet) return '';
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === key) return String(values[i][1] || '');
  }
  return '';
}

function setSystemSetting_(key, value) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.SYSTEM_SETTINGS);
  if (!sheet) return;
  var values = sheet.getDataRange().getValues();
  var found = false;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      found = true;
      break;
    }
  }
  if (!found) sheet.appendRow([key, value]);
}

function saveSystemSettings_(params, email) {
  var map = params.settings || {};
  for (var k in map) {
    if (map.hasOwnProperty(k)) setSystemSetting_(k, String(map[k]));
  }
  apiLog_('SETTINGS_SAVED', Object.keys(map).join(','), 'OK', email);
  return { saved: true };
}

function loadSystemSettings_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.SYSTEM_SETTINGS);
  if (!sheet) return {};
  var values = sheet.getDataRange().getValues();
  var out = {};
  for (var i = 1; i < values.length; i++) out[values[i][0]] = values[i][1];
  return out;
}

/* ── Activity Log ── */
function logActivity_(user, action, object, result) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.ACTIVITY_LOG);
    if (!sheet) return;
    sheet.appendRow([new Date(), user || 'system', action, object || '', result || 'OK']);
  } catch (e) { Logger.log('Activity log error: ' + e.message); }
}

function loadActivityLog_() {
  return readSheetData_(ORS.SHEETS.ACTIVITY_LOG);
}

/* ── Stock Alerts ── */
function loadAlertRules_() {
  return readConfigSheet_(ORS.SHEETS.ALERT_RULES)
    .filter(function (r) { return r['Active'] === 'ON'; });
}

function saveAlertRule_(params, email) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.ALERT_RULES);
  if (!sheet) throw new Error('Alert Rules sheet not found. Run setup first.');
  var name = params.name;
  if (!name) throw new Error('Alert name required.');
  var row = [name, params.filterField || 'BRAND', params.filterValue || '', params.operator || 'LT',
    params.threshold || 0, params.emailTo || '', params.telegram || 'OFF', params.active || 'ON'];
  var existing = sheet.getDataRange().getValues().slice(1);
  var found = false;
  for (var i = 0; i < existing.length; i++) {
    if (String(existing[i][0]).trim() === name) {
      sheet.getRange(i + 2, 1, 1, 8).setValues([row]);
      found = true;
      break;
    }
  }
  if (!found) sheet.appendRow(row);
  apiLog_('ALERT_SAVED', name, 'OK', email);
  logActivity_(email, 'ALERT_SAVED', name, 'OK');
  return { saved: name };
}

function deleteAlertRule_(params, email) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.ALERT_RULES);
  if (!sheet) throw new Error('Alert Rules sheet not found.');
  var name = params.name;
  var values = sheet.getDataRange().getValues();
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][0]).trim() === name) sheet.deleteRow(i + 1);
  }
  apiLog_('ALERT_DELETED', name, 'OK', email);
  logActivity_(email, 'ALERT_DELETED', name, 'OK');
  return { deleted: name };
}

function checkStockAlerts_(headers, data) {
  var rules = loadAlertRules_();
  var triggered = [];
  if (!rules.length || !data.length) return triggered;
  for (var r = 0; r < rules.length; r++) {
    var rule = rules[r];
    var field = rule['Filter Field'] || 'BRAND';
    var value = rule['Filter Value'];
    var op = rule['Operator'] || 'LT';
    var threshold = parseFloat(rule['Threshold']) || 0;
    var fieldIdx = headers.indexOf(field);
    var count = 0;
    if (fieldIdx >= 0) {
      if (value) {
        count = data.filter(function (row) {
          return String(row[fieldIdx] || '').toLowerCase() === String(value).toLowerCase();
        }).length;
      } else {
        count = data.length;
      }
    }
    var hit = op === 'GT' ? count > threshold : count < threshold;
    if (hit) {
      triggered.push({
        name: rule['Alert Name'], field: field, value: value || '(all)',
        count: count, operator: op, threshold: threshold,
        emailTo: rule['Email To'] || '', telegram: rule['Telegram'] === 'ON'
      });
    }
  }
  return triggered;
}

function runAlertCheck_(email) {
  var inv = readSheetData_(ORS.SHEETS.INVENTORY);
  var triggered = checkStockAlerts_(inv.headers, inv.data);
  var emailAlerts = [];
  for (var i = 0; i < triggered.length; i++) {
    logActivity_(email, 'ALERT_TRIGGERED', triggered[i].name, 'OK');
    if (triggered[i].emailTo) emailAlerts.push(triggered[i]);
  }
  return { triggered: triggered, total: triggered.length };
}

function sendAlertNotifications_(triggered) {
  var sent = { email: 0, telegram: 0 };
  for (var i = 0; i < triggered.length; i++) {
    var t = triggered[i];
    var subject = 'Inventory Alert: ' + t.name;
    var body = t.name + '\nField: ' + t.field + ' = ' + (t.value || '(all)') +
      '\nCurrent count: ' + t.count + ' (' + t.operator + ' ' + t.threshold + ')' +
      '\nGenerated: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm');
    if (t.emailTo) {
      try {
        MailApp.sendEmail({ to: t.emailTo, subject: subject, body: body });
        sent.email++;
        logActivity_('system', 'ALERT_EMAIL', t.emailTo, 'OK');
      } catch (e) { Logger.log('Alert email failed: ' + e.message); logActivity_('system', 'ALERT_EMAIL', t.emailTo, 'FAIL'); }
    }
    if (t.telegram) {
      if (sendTelegram_(subject + '\n' + body)) sent.telegram++;
    }
  }
  return sent;
}

/* ── Telegram (direct bot, no third-party gateway) ── */
function sendTelegram_(text) {
  var token = getSystemSetting_('TELEGRAM_BOT_TOKEN');
  var chatId = getSystemSetting_('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return false;
  try {
    var payload = { chat_id: chatId, text: String(text).slice(0, 3900), parse_mode: 'HTML' };
    var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var json = JSON.parse(res.getContentText());
    var ok = !!(json && json.ok);
    logActivity_('system', 'TELEGRAM_SENT', String(chatId), ok ? 'OK' : 'FAIL');
    return ok;
  } catch (e) {
    Logger.log('Telegram send failed: ' + e.message);
    logActivity_('system', 'TELEGRAM_SENT', String(chatId), 'FAIL: ' + e.message);
    return false;
  }
}

function telegramTest_() {
  var ok = sendTelegram_('✅ Inventory System test message — ' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm'));
  return { ok: ok };
}

/* ── Ageing Trend History (daily snapshot) ── */
function recordTrendSnapshot_(runId) {
  try {
    var inv = readSheetData_(ORS.SHEETS.INVENTORY);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.TREND_HISTORY);
    if (!sheet) return;
    var below30 = 0, m30 = 0, m60 = 0, above75 = 0;
    var ageIdx = inv.headers.indexOf('AGE_BUCKET');
    for (var i = 0; i < inv.data.length; i++) {
      var b = String(inv.data[i][ageIdx] || '');
      if (b.indexOf('Below 30') === 0 || b === '0-29' || b === 'Below 30') below30++;
      else if (b.indexOf('30-60') === 0 || b === '30-59') m30++;
      else if (b.indexOf('60-75') === 0 || b === '60-74') m60++;
      else above75++;
    }
    var dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    sheet.appendRow([runId, dateStr, below30, m30, m60, above75, inv.data.length]);
  } catch (e) { Logger.log('Trend snapshot error: ' + e.message); }
}

function loadTrendHistory_() {
  return readSheetData_(ORS.SHEETS.TREND_HISTORY);
}

/* ── Auto Backup (Drive copy, direct) ── */
function backupToDrive_() {
  var enabled = getSystemSetting_('AUTO_BACKUP');
  if (enabled !== 'ON') return { skipped: true };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmm');
    var copy = ss.copy('Backup_' + stamp);
    var folderId = getSystemSetting_('BACKUP_FOLDER_ID');
    if (folderId) {
      var folder = DriveApp.getFolderById(folderId);
      var f = DriveApp.getFileById(copy.getId());
      folder.addFile(f);
      DriveApp.getRootFolder().removeFile(f);
    }
    logActivity_('system', 'BACKUP_CREATED', copy.getId(), 'OK');
    return { backupId: copy.getId(), name: copy.getName() };
  } catch (e) {
    Logger.log('Backup failed: ' + e.message);
    return { error: e.message };
  }
}

// ─────────────────────────────────────────────────────────────
// SECTION 28: WEB APP ENTRY POINT
// ─────────────────────────────────────────────────────────────
// NOTE: doGet() now lives in Code-UI.gs (serves the Control Center
// UI directly from Apps Script — Google-native mode, no third party).
// Code-API.gs provides doPost (fetch mode) and runApi (native mode).

// ─────────────────────────────────────────────────────────────
// SECTION 28.5: MANUAL INVENTORY EDIT (UI-driven)
// ─────────────────────────────────────────────────────────────
// The Control Center lets authorized users add / edit / delete
// inventory records directly (OPERATOR+). These helpers keep the
// INVENTORY sheet in sync with the UI.

function inventoryHeaders_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.INVENTORY);
  if (!sheet) return [];
  var all = sheet.getDataRange().getValues();
  return all.length ? all[0] : [];
}

function upsertInventoryRow_(item, email) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.INVENTORY);
  if (!sheet) throw new Error('INVENTORY sheet not found — run setupAutomationSystem() first.');
  if (!item || !item.BARCODE) throw new Error('BARCODE is required.');
  var headers = inventoryHeaders_();
  if (!headers.length) throw new Error('INVENTORY sheet is empty — run the pipeline first.');
  var row = headers.map(function (h) { return item[h] !== undefined && item[h] !== null ? String(item[h]) : ''; });
  var all = sheet.getDataRange().getValues();
  var found = -1;
  for (var r = 1; r < all.length; r++) {
    if (String(all[r][0]) === String(item.BARCODE)) { found = r + 1; break; }
  }
  if (found > 0) {
    sheet.getRange(found, 1, 1, headers.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
  logActivity_(email || 'system', 'INVENTORY_' + (found > 0 ? 'UPDATE' : 'ADD'), item.BARCODE, 'OK');
  return { ok: true, barcode: item.BARCODE, mode: found > 0 ? 'updated' : 'added' };
}

function deleteInventoryRow_(barcode, email) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.INVENTORY);
  if (!sheet) throw new Error('INVENTORY sheet not found.');
  var all = sheet.getDataRange().getValues();
  for (var r = 1; r < all.length; r++) {
    if (String(all[r][0]) === String(barcode || '')) {
      sheet.deleteRow(r + 1);
      logActivity_(email || 'system', 'INVENTORY_DELETE', barcode, 'OK');
      return { ok: true, barcode: barcode };
    }
  }
  throw new Error('Barcode not found in INVENTORY: ' + barcode);
}

// ─────────────────────────────────────────────────────────────
// SECTION: MULTI-SOURCE ARCHITECTURE (ADDITIVE)
// Multi-source import → source classification → consolidation
// (SOURCE_DATA with source identity) → conflict resolution →
// inventory. Existing single-source pipeline is untouched.
// ─────────────────────────────────────────────────────────────

var SOURCE_TYPES = ['QC_STOCK', 'TRC', 'INVENTORY', 'LOCATION', 'OTHER'];
var STANDARD_FIELDS = ['BARCODE', 'PRODUCT_NAME', 'MODEL', 'CATEGORY', 'BRAND',
  'MOD_AGE', 'STOCK_AGE', 'STATUS', 'LOCATION', 'BIN_BUCKET', 'PRIORITY'];

/* Idempotent bootstrap of the multi-source sheets. */
function ensureMultiSourceSheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sourceData = getOrCreateSheet_(ORS.SHEETS.SOURCE_DATA,
    ['SOURCE_TYPE', 'SOURCE_NAME', 'SOURCE_ID', 'IMPORT_RUN_ID', 'SOURCE_ROW',
     'IMPORT_DATE'].concat(STANDARD_FIELDS));
  applyHeaderFormatting_(sourceData);

  var dc = getOrCreateSheet_(ORS.SHEETS.DATA_CONFLICTS,
    ['BARCODE', 'FIELD', 'SOURCE_1', 'VALUE_1', 'SOURCE_2', 'VALUE_2',
     'FINAL_VALUE', 'RULE_USED', 'IMPORT_RUN_ID', 'TIMESTAMP']);
  applyHeaderFormatting_(dc);

  var pr = getOrCreateSheet_(ORS.SHEETS.SOURCE_PRIORITY_RULES,
    ['FIELD', 'Priority 1', 'Priority 2', 'Priority 3', 'Priority 4', 'Priority 5']);
  applyHeaderFormatting_(pr);
  if (pr.getLastRow() <= 1) {
    pr.appendRow(['STATUS', 'QC_STOCK', 'TRC', 'INVENTORY', 'LOCATION', 'OTHER']);
    pr.appendRow(['LOCATION', 'LOCATION', 'QC_STOCK', 'TRC', 'INVENTORY', 'OTHER']);
    pr.appendRow(['MODEL', 'QC_STOCK', 'INVENTORY', 'TRC', 'LOCATION', 'OTHER']);
  }

  var sh = getOrCreateSheet_(ORS.SHEETS.SOURCE_IMPORT_HISTORY,
    ['IMPORT_RUN_ID', 'SOURCE_ID', 'SOURCE_TYPE', 'SOURCE_NAME', 'FILE/SHEET',
     'ROWS', 'SUCCESS', 'ERRORS', 'DURATION', 'STATUS']);
  applyHeaderFormatting_(sh);

  var ij = getOrCreateSheet_(ORS.SHEETS.IMPORT_JOBS,
    ['JOB_ID', 'TIMESTAMP', 'USER', 'SOURCE_COUNT', 'STATUS', 'PROGRESS',
     'CURRENT_SOURCE', 'TOTAL_ROWS', 'ERROR', 'DETAILS']);
  applyHeaderFormatting_(ij);
  return true;
}

/* Canonical business source types (configurable via Dropdown Values > SOURCE_CATEGORY).
   Distinct from the existing SOURCE_TYPE dropdown (file format: Google Sheet/Excel/CSV). */
function listSourceTypes_() {
  var configured = [];
  try { configured = loadDropdownValues_('SOURCE_CATEGORY') || []; } catch (e) {}
  if (!configured || !configured.length) configured = SOURCE_TYPES.slice();
  return configured.map(function (v) { return normalizeSourceType_(v); });
}

/* Normalize free-form source type to canonical uppercase token. */
function normalizeSourceType_(val) {
  if (!val) return 'OTHER';
  var v = String(val).toUpperCase().replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (!v) return 'OTHER';
  return v;
}

function loadPriorityRules_() {
  try { return readConfigSheet_(ORS.SHEETS.SOURCE_PRIORITY_RULES); } catch (e) { return []; }
}

function savePriorityRules_(params, email) {
  var sheet = getOrCreateSheet_(ORS.SHEETS.SOURCE_PRIORITY_RULES,
    ['FIELD', 'Priority 1', 'Priority 2', 'Priority 3', 'Priority 4', 'Priority 5']);
  if (params.clear) { sheet.getDataRange().clearContent(); sheet.getRange(1, 1, 1, 6).setValues([['FIELD', 'Priority 1', 'Priority 2', 'Priority 3', 'Priority 4', 'Priority 5']]); }
  (params.rules || []).forEach(function (r) {
    sheet.appendRow([r.field || r['Field'] || '', r.p1 || '', r.p2 || '', r.p3 || '', r.p4 || '', r.p5 || '']);
  });
  applyHeaderFormatting_(sheet);
  apiLog_('PRIORITY_RULES_SAVED', String((params.rules || []).length), 'OK', email);
  return { saved: (params.rules || []).length };
}

function readConflicts_(limit) {
  var d = readSheetData_(ORS.SHEETS.DATA_CONFLICTS);
  var rows = d.data;
  if (limit) rows = rows.slice(0, limit);
  return { headers: d.headers, rows: rows, total: d.data.length };
}

function clearConflicts_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.DATA_CONFLICTS);
  if (!sheet) return { cleared: 0 };
  var n = Math.max(0, sheet.getLastRow() - 1);
  if (n > 0) sheet.getRange(2, 1, n, sheet.getLastColumn()).clearContent();
  return { cleared: n };
}

/* Validate a source array before creating a job. Returns normalized sources. */
function validateSources_(sources) {
  if (!sources || !sources.length) throw new Error('Select at least one source to import.');
  if (sources.length > 20) throw new Error('Too many sources (' + sources.length + '). Max 20 per import.');
  var types = listSourceTypes_();
  var out = [];
  var seenKeys = {};
  for (var i = 0; i < sources.length; i++) {
    var s = sources[i];
    var stype = normalizeSourceType_(s.type || s.sourceType);
    var sname = s.name || s.sourceName || stype;
    var hasData = !!(s.sheetName || s.sheetId || (s.headers && s.rows));
    if (!hasData) throw new Error('Source "' + sname + '" has no data. Provide a sheet name, sheet ID, or inline rows.');
    var key = stype + '|' + sname;
    if (seenKeys[key]) throw new Error('Duplicate source: ' + sname + ' (' + stype + ') appears more than once.');
    seenKeys[key] = true;
    out.push({
      type: stype,
      name: sname,
      id: s.id || ('SRC' + String(out.length + 1).padStart(3, '0')),
      sheetName: s.sheetName || '',
      sheetId: s.sheetId || '',
      joinKey: s.joinKey || 'BARCODE',
      headers: s.headers || null,
      rows: s.rows || null
    });
  }
  return out;
}

/* ── Job lifecycle ── */
function jobRowIndex_(jobId) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.IMPORT_JOBS);
  if (!sheet) return -1;
  var all = sheet.getDataRange().getValues();
  for (var r = 1; r < all.length; r++) {
    if (String(all[r][0]) === String(jobId)) return r + 1;
  }
  return -1;
}

function jobWrite_(jobId, patch) {
  var idx = jobRowIndex_(jobId);
  if (idx < 0) return;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.IMPORT_JOBS);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  for (var k in patch) {
    var ci = headers.indexOf(k);
    if (ci >= 0) sheet.getRange(idx, ci + 1).setValue(patch[k]);
  }
}

function createImportJob_(sources, email) {
  var normalized = validateSources_(sources);
  var jobId = 'JOB-' + new Date().getTime();
  var sheet = getOrCreateSheet_(ORS.SHEETS.IMPORT_JOBS,
    ['JOB_ID', 'TIMESTAMP', 'USER', 'SOURCE_COUNT', 'STATUS', 'PROGRESS',
     'CURRENT_SOURCE', 'TOTAL_ROWS', 'ERROR', 'DETAILS']);
  sheet.appendRow([jobId, new Date(), email || 'system', normalized.length, 'READY', 0,
    '', 0, '', JSON.stringify(normalized.map(function (s) { return { type: s.type, name: s.name, sheetName: s.sheetName, sheetId: s.sheetId }; }))]);
  apiLog_('IMPORT_JOB_CREATED', jobId, 'OK', email);
  return { jobId: jobId, sourceCount: normalized.length, status: 'READY', sources: normalized.map(function (s) { return { id: s.id, type: s.type, name: s.name }; }) };
}

function getImportJobStatus_(jobId) {
  var idx = jobRowIndex_(jobId);
  if (idx < 0) throw new Error('Import job not found: ' + jobId);
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.IMPORT_JOBS);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = sheet.getRange(idx, 1, 1, sheet.getLastColumn()).getValues()[0];
  var out = {};
  for (var i = 0; i < headers.length; i++) out[headers[i]] = row[i];
  return out;
}

/* Read a single source's raw data (supports local sheet, external sheet, inline rows). */
function readSourceRaw_(src) {
  if (src.rows && src.headers) {
    return { headers: src.headers.map(function (h) { return String(h); }), data: src.rows };
  }
  if (src.sheetId) {
    var ss = SpreadsheetApp.openById(String(src.sheetId).replace(/.*\/d\/([\w-]+).*/g, '$1'));
    var sh = ss.getSheetByName(src.sheetName) || ss.getSheets()[0];
    if (!sh) throw new Error('Sheet not found in external spreadsheet: ' + src.sheetName);
    var d = sh.getDataRange().getValues();
    return { headers: d[0], data: d.slice(1) };
  }
  if (src.sheetName) {
    var local = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(src.sheetName);
    if (!local) throw new Error('Sheet not found: ' + src.sheetName);
    var d2 = local.getDataRange().getValues();
    if (!d2 || !d2.length) throw new Error('Sheet is empty: ' + src.sheetName);
    return { headers: d2[0], data: d2.slice(1) };
  }
  throw new Error('No data source for "' + src.name + '".');
}

/* Map source columns → standard target fields using Field Mapping (by source type). */
function mapSourceRaw_(src, raw) {
  var mapping = loadFieldMappingConfig_(src.type);
  if (!mapping.length) mapping = loadFieldMappingConfig_(src.name);
  if (!mapping.length) {
    // No mapping configured → treat source headers as target fields directly.
    return { headers: raw.headers.map(function (h) { return String(h); }), data: raw.data };
  }
  var rawHeaders = raw.headers.map(function (h) { return String(h || '').trim(); });
  var headerIndex = {};
  for (var h = 0; h < rawHeaders.length; h++) headerIndex[rawHeaders[h].toLowerCase()] = h;
  var outHeaders = [];
  var colMap = [];
  var missingRequired = [];
  for (var m = 0; m < mapping.length; m++) {
    var mc = mapping[m];
    var target = mc['Target Field'];
    var srcCol = String(mc['Source Column'] || '').trim();
    outHeaders.push(target);
    var idx = srcCol ? (headerIndex[srcCol.toLowerCase()] !== undefined ? headerIndex[srcCol.toLowerCase()] : -1) : -1;
    if (idx === -1 && mc['Required'] === 'YES') missingRequired.push(srcCol);
    colMap.push(idx);
  }
  if (missingRequired.length) {
    throw new Error('Source "' + src.name + '" (' + src.type + ') is missing required column(s): ' + missingRequired.join(', '));
  }
  var outData = [];
  for (var r = 0; r < raw.data.length; r++) {
    var row = raw.data[r];
    var outRow = [];
    for (var c = 0; c < colMap.length; c++) outRow.push(colMap[c] === -1 ? '' : row[colMap[c]]);
    outData.push(outRow);
  }
  return { headers: outHeaders, data: outData };
}

/* Write consolidated rows to SOURCE_DATA (batch) and return record objects. */
function consolidateSources_(jobId, sources, mode) {
  var SOURCE_COLUMNS = ['SOURCE_TYPE', 'SOURCE_NAME', 'SOURCE_ID', 'IMPORT_RUN_ID', 'SOURCE_ROW',
    'IMPORT_DATE'].concat(STANDARD_FIELDS);
  var sheet = getOrCreateSheet_(ORS.SHEETS.SOURCE_DATA, SOURCE_COLUMNS);
  // If the sheet already existed but is empty (no header row), write the header now
  // so getRange(1, 1, 1, 0) never throws "number of columns must be at least 1".
  if (sheet.getLastColumn() === 0 || sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, SOURCE_COLUMNS.length).setValues([SOURCE_COLUMNS]);
    applyHeaderFormatting_(sheet);
  }
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var hIdx = {};
  for (var i = 0; i < headers.length; i++) hIdx[headers[i]] = i;
  var modeUp = String(mode || 'APPEND').toUpperCase();

  if (modeUp === 'REPLACE' || modeUp === 'SNAPSHOT') {
    if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }

  var allRecords = [];
  var now = new Date();
  var totalRows = 0;
  var failed = [];

  for (var s = 0; s < sources.length; s++) {
    var src = sources[s];
    var t0 = new Date().getTime();
    jobWrite_(jobId, { STATUS: 'RUNNING', CURRENT_SOURCE: src.name, PROGRESS: Math.round((s / Math.max(1, sources.length)) * 70) });
    try {
      var raw = readSourceRaw_(src);
      var mapped = mapSourceRaw_(src, raw);
      var batch = [];
      for (var r = 0; r < mapped.data.length; r++) {
        var rec = { SOURCE_TYPE: src.type, SOURCE_NAME: src.name, SOURCE_ID: src.id,
          IMPORT_RUN_ID: jobId, SOURCE_ROW: r + 2, IMPORT_DATE: now };
        for (var c = 0; c < mapped.headers.length; c++) {
          var field = String(mapped.headers[c]);
          rec[field] = mapped.data[r][c];
        }
        if (rec['BARCODE'] !== undefined) rec['BARCODE'] = normalizeBarcode_(rec['BARCODE']);
        allRecords.push(rec);
        var rowOut = headers.map(function (h) { return rec[h] !== undefined && rec[h] !== null ? rec[h] : ''; });
        batch.push(rowOut);
      }
      if (batch.length) {
        var startRow = sheet.getLastRow() + 1;
        sheet.getRange(startRow, 1, batch.length, headers.length).setValues(batch);
      }
      totalRows += mapped.data.length;
      logSourceImport_(jobId, src, mapped.data.length, true, '', (new Date().getTime() - t0));
    } catch (e) {
      failed.push({ source: src.name, type: src.type, error: e.message });
      logSourceImport_(jobId, src, 0, false, e.message, (new Date().getTime() - t0));
    }
  }

  jobWrite_(jobId, { TOTAL_ROWS: totalRows, PROGRESS: 85 });
  return { records: allRecords, totalRows: totalRows, failed: failed };
}

function logSourceImport_(jobId, src, rows, success, error, durationMs) {
  try {
    var sheet = getOrCreateSheet_(ORS.SHEETS.SOURCE_IMPORT_HISTORY,
      ['IMPORT_RUN_ID', 'SOURCE_ID', 'SOURCE_TYPE', 'SOURCE_NAME', 'FILE/SHEET',
       'ROWS', 'SUCCESS', 'ERRORS', 'DURATION', 'STATUS']);
    sheet.appendRow([jobId, src.id, src.type, src.name, src.sheetName || src.sheetId || 'inline',
      rows, success ? 'YES' : 'NO', error || '', Math.round(durationMs / 1000) + 's',
      success ? 'SUCCESS' : 'FAILED']);
  } catch (e) { /* non-fatal */ }
}

/* Resolve conflicts by BARCODE using SOURCE_PRIORITY_RULES; log to DATA_CONFLICTS. */
function resolveConflicts_(records, jobId) {
  var rules = loadPriorityRules_();
  var byBarcode = {};
  var order = [];
  for (var i = 0; i < records.length; i++) {
    var bc = String(records[i]['BARCODE'] || '');
    if (!bc) continue;
    if (!byBarcode[bc]) { byBarcode[bc] = []; order.push(bc); }
    byBarcode[bc].push(records[i]);
  }

  var resolved = [];
  var conflicts = [];
  var ruleIndex = {};
  for (var r = 0; r < rules.length; r++) ruleIndex[String(rules[r]['FIELD']).toUpperCase()] = rules[r];

  for (var o = 0; o < order.length; o++) {
    var bc = order[o];
    var recs = byBarcode[bc];
    // Start from the first record, then merge (first wins for unruled fields).
    var final = {};
    for (var k in recs[0]) final[k] = recs[0][k];

    for (var field in ruleIndex) {
      var rule = ruleIndex[field];
      var priorities = [rule['Priority 1'], rule['Priority 2'], rule['Priority 3'], rule['Priority 4'], rule['Priority 5']]
        .map(function (p) { return normalizeSourceType_(p); }).filter(Boolean);
      // Collect distinct non-empty values and their sources.
      var byValue = {};
      for (var r2 = 0; r2 < recs.length; r2++) {
        var v = recs[r2][field];
        if (v === undefined || v === null || String(v).trim() === '') continue;
        var vk = String(v).trim();
        if (!byValue[vk]) byValue[vk] = [];
        byValue[vk].push(recs[r2]);
      }
      var distinct = Object.keys(byValue);
      if (distinct.length < 2) continue;
      // Conflict → resolve by priority order.
      var winner = null;
      var winnerValue = null;
      for (var p = 0; p < priorities.length && winner === null; p++) {
        for (var r3 = 0; r3 < recs.length; r3++) {
          if (normalizeSourceType_(recs[r3]['SOURCE_TYPE']) === priorities[p] &&
              recs[r3][field] !== undefined && recs[r3][field] !== null && String(recs[r3][field]).trim() !== '') {
            winner = recs[r3];
            winnerValue = String(recs[r3][field]).trim();
            break;
          }
        }
      }
      if (winner === null) { winner = recs[0]; winnerValue = String(recs[0][field] || '').trim(); }
      // Log conflict (first two differing sources).
      var sourcesSeen = [];
      for (var r4 = 0; r4 < recs.length && sourcesSeen.length < 2; r4++) {
        var v4 = recs[r4][field];
        if (v4 === undefined || v4 === null || String(v4).trim() === '') continue;
        sourcesSeen.push(recs[r4]);
      }
      conflicts.push([bc, field,
        sourcesSeen[0] ? sourcesSeen[0]['SOURCE_TYPE'] : '', sourcesSeen[0] ? String(sourcesSeen[0][field] || '') : '',
        sourcesSeen[1] ? sourcesSeen[1]['SOURCE_TYPE'] : '', sourcesSeen[1] ? String(sourcesSeen[1][field] || '') : '',
        winnerValue, 'SOURCE_PRIORITY', jobId, new Date()]);
      final[field] = winnerValue;
    }
    resolved.push(final);
  }

  // Persist conflicts (batch).
  if (conflicts.length) {
    var cs = getOrCreateSheet_(ORS.SHEETS.DATA_CONFLICTS,
      ['BARCODE', 'FIELD', 'SOURCE_1', 'VALUE_1', 'SOURCE_2', 'VALUE_2',
       'FINAL_VALUE', 'RULE_USED', 'IMPORT_RUN_ID', 'TIMESTAMP']);
    var cStart = cs.getLastRow() + 1;
    cs.getRange(cStart, 1, conflicts.length, 10).setValues(conflicts);
  }

  return { resolved: resolved, conflicts: conflicts.length };
}

/* Build final INVENTORY (one logical device per BARCODE) from resolved records. */
function buildInventoryFromSources_(resolved, email) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.INVENTORY);
  if (!sheet) sheet = getOrCreateSheet_(ORS.SHEETS.INVENTORY, STANDARD_FIELDS);
  var existing = inventoryHeaders_();
  var headers = existing.length ? existing : STANDARD_FIELDS;
  if (!existing.length) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  var hIdx = {};
  for (var i = 0; i < headers.length; i++) hIdx[headers[i]] = i;

  var batch = [];
  var seen = {};
  for (var r = 0; r < resolved.length; r++) {
    var rec = resolved[r];
    var bc = String(rec['BARCODE'] || '');
    if (!bc || seen[bc]) continue;
    seen[bc] = true;
    var row = headers.map(function (h) { return rec[h] !== undefined && rec[h] !== null ? rec[h] : ''; });
    batch.push(row);
  }

  // Upsert: clear existing INVENTORY rows then write fresh (safe, idempotent).
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  if (batch.length) {
    for (var b = 0; b < batch.length; b += ORS.PROCESSING.BATCH_SIZE) {
      var chunk = batch.slice(b, b + ORS.PROCESSING.BATCH_SIZE);
      sheet.getRange(sheet.getLastRow() + 1, 1, chunk.length, headers.length).setValues(chunk);
    }
  }
  applyHeaderFormatting_(sheet);
  applyUniversalFormatting_(sheet);
  protectSheetIfNeeded_(ORS.SHEETS.INVENTORY);
  logActivity_(email || 'system', 'MULTI_SOURCE_BUILD', String(batch.length) + ' devices', 'OK');
  return { devices: batch.length };
}

/* Main job runner: consolidate → resolve → build inventory. */
function runImportJob_(jobId, email) {
  var job = getImportJobStatus_(jobId);
  var sources = [];
  try { sources = JSON.parse(job['DETAILS'] || '[]'); } catch (e) { throw new Error('Job details corrupt: ' + jobId); }
  var normalized = validateSources_(sources.map(function (s) { return { type: s.type, name: s.name, sheetName: s.sheetName, sheetId: s.sheetId }; }));

  jobWrite_(jobId, { STATUS: 'RUNNING', PROGRESS: 5, CURRENT_SOURCE: 'Consolidating' });
  var consolidated = consolidateSources_(jobId, normalized, 'APPEND');

  // SAFETY GUARD: if every source failed (0 rows consolidated), do NOT rebuild
  // INVENTORY — that would wipe existing devices. Abort with a clear FAILED status.
  if (consolidated.totalRows === 0) {
    var errDetail = consolidated.failed.map(function (f) { return f.source + ' (' + f.error + ')'; }).join('; ');
    jobWrite_(jobId, { STATUS: 'FAILED', PROGRESS: 100, CURRENT_SOURCE: '',
      TOTAL_ROWS: 0, ERROR: 'All sources failed: ' + errDetail });
    apiLog_('IMPORT_JOB_RUN', jobId, 'FAILED', email);
    return { jobId: jobId, status: 'FAILED', totalRows: 0, devices: 0, conflicts: 0, failedSources: consolidated.failed };
  }

  jobWrite_(jobId, { PROGRESS: 90, CURRENT_SOURCE: 'Resolving conflicts' });
  var resolution = resolveConflicts_(consolidated.records, jobId);

  jobWrite_(jobId, { PROGRESS: 95, CURRENT_SOURCE: 'Building inventory' });
  var build = buildInventoryFromSources_(resolution.resolved, email);

  var partial = consolidated.failed.length > 0;
  var status = partial ? 'PARTIAL_FAILURE' : 'COMPLETE';
  var result = {
    jobId: jobId,
    status: status,
    totalRows: consolidated.totalRows,
    devices: build.devices,
    conflicts: resolution.conflicts,
    failedSources: consolidated.failed
  };
  jobWrite_(jobId, {
    STATUS: status, PROGRESS: 100, CURRENT_SOURCE: '',
    TOTAL_ROWS: consolidated.totalRows, ERROR: partial ? 'Some sources failed' : ''
  });
  apiLog_('IMPORT_JOB_RUN', jobId, status, email);
  return result;
}

/* Source-level filtering over SOURCE_DATA (engine-side, not just UI). */
function filterSourceData_(filters) {
  filters = filters || {};
  var d = readSheetData_(ORS.SHEETS.SOURCE_DATA);
  var headers = d.headers;
  var rows = d.data;
  var q = String(filters.q || '').toLowerCase();
  if (q) {
    rows = rows.filter(function (r) { return r.join(' ').toLowerCase().indexOf(q) > -1; });
  }
  var exact = ['SOURCE_TYPE', 'SOURCE_NAME', 'SOURCE_ID', 'IMPORT_RUN_ID', 'BARCODE', 'STATUS', 'MODEL', 'CATEGORY', 'LOCATION'];
  exact.forEach(function (key) {
    var val = filters[key];
    if (!val) return;
    var idx = headers.indexOf(key);
    if (idx === -1) return;
    var vals = Array.isArray(val) ? val : [val];
    var norm = vals.map(function (v) { return String(v).toLowerCase(); });
    rows = rows.filter(function (r) { return norm.indexOf(String(r[idx] || '').toLowerCase()) > -1; });
  });
  return { headers: headers, rows: rows, total: rows.length };
}

function readSourceImportHistory_() {
  return readSheetData_(ORS.SHEETS.SOURCE_IMPORT_HISTORY);
}

// ─────────────────────────────────────────────────────────────
// END OF CODE.JS
// ─────────────────────────────────────────────────────────────
