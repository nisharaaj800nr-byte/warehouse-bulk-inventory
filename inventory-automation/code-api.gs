/* ============================================================
   Code-API.gs — Web App API layer for the Bulk Repair
   Control Center UI. ADDITIVE file: add it as a SECOND file in
   the same Apps Script project that contains Code.js.

   Supports BOTH connection modes from the same router:

   A) NATIVE (google.script.run) — the UI is served by Apps Script
      itself (Code-UI.gs + Index.html). No third party anywhere:
      browser → google.script.run → runApi() → Google Sheets.
   B) STATIC UI + fetch — deploy this project as a Web App and
      paste the /exec URL into the UI settings.

   All actions route through the existing Code.js engines.
   RBAC is enforced here against the Authorized Users sheet.

   v1.1: app-level session auth (see code-auth.gs + docs/API.md).
   Every action except health / auth.login / auth.logout requires a
   valid params.token session OR a resolvable Google session email.
   ============================================================ */

/* v1.1.1 — session auth + editor "all" list params (code-auth.gs); see docs/API.md */
var API_VERSION = '1.1.1';

/* JSON responder for fetch mode */
function apiRespond_(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', data: data, version: API_VERSION }))
    .setMimeType(ContentService.MimeType.JSON);
}

function apiError_(message, code) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'error', message: message, code: code || 'API_ERROR' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* Resolve caller role from the Authorized Users sheet; default VIEWER */
function apiRole_(email) {
  var users = [];
  try {
    users = loadAuthorizedUsers_();
  } catch (e) { users = []; }
  for (var i = 0; i < users.length; i++) {
    if (users[i]['Email'] === email) return users[i]['Role'] || 'VIEWER';
  }
  // First-run bootstrap: if NO authorized users are configured yet, grant OWNER
  // so the spreadsheet owner can set up the system without being locked out.
  if (users.length === 0) return 'OWNER';
  // Owner fallback: the script owner is always at least OWNER.
  try {
    if (email && Session.getEffectiveUser().getEmail() === email) return 'OWNER';
  } catch (e2) { /* non-fatal */ }
  return 'VIEWER';
}

var API_ROLE_LEVEL = { VIEWER: 0, OPERATOR: 1, MANAGER: 2, ADMIN: 3, OWNER: 4 };

function apiRequireRole_(role, minLevel) {
  return (API_ROLE_LEVEL[role] || 0) >= (API_ROLE_LEVEL[minLevel] || 0);
}

function apiLog_(action, object, result, email) {
  try {
    var sheet = getOrCreateSheet_(ORS.SHEETS.SECURITY_AUDIT,
      ['Timestamp', 'User', 'Action', 'Sheet', 'Range', 'Details']);
    sheet.appendRow([new Date(), email || Session.getActiveUser().getEmail(),
      action, object || '', '', result || 'OK']);
  } catch (e) { /* non-fatal */ }
}

/* ────────────────────────── SHARED ROUTER ──────────────────────────
   Single source of truth for every UI action. Throws Error on
   failure; doPost wraps for fetch mode, runApi propagates for
   google.script.run native mode. */
function apiRoute_(action, params, email) {
  params = params || {};
  /* AUTH GATE (v1.1): resolve the caller via app session token or the
     Google session fallback (see code-auth.gs). Throws AUTH_REQUIRED /
     FORBIDDEN errors for unauthenticated or disabled callers. */
  if (typeof authResolveCaller_ !== 'function') {
    throw new Error('AUTH_REQUIRED: Auth module missing — add code-auth.gs to this Apps Script project.');
  }
  var caller = authResolveCaller_(action, params, email || '');
  email = caller.email;
  var role = caller.role;

  switch (action) {

    /* ── Health & meta ── */
    case 'health':
      return { app: ORS.APP_NAME, version: ORS.VERSION, role: role, mode: 'apps-script', time: new Date().toISOString() };

    /* ── Auth (v1.1, code-auth.gs) ── */
    case 'auth.login':
      return authLogin_(params);
    case 'auth.logout':
      return authLogout_(params);
    case 'auth.whoami':
      return authWhoamiApi_(params, email, role);
    case 'auth.changePassword':
      return authChangePassword_(params, email);
    case 'auth.resetPassword':
      if (!apiRequireRole_(role, 'ADMIN')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return authResetPassword_(params, email);
    case 'auth.users':
      if (!apiRequireRole_(role, 'ADMIN')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return authUsersList_();
    case 'selftest.run':
      if (!apiRequireRole_(role, 'ADMIN')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return authSelfTest_();

    /* ── Dashboard ── */
    case 'dashboard':
      return apiDashboard_();

    /* ── Sources ── */
    case 'sources.list':
      /* params.all → include inactive sources (editor) */
      return params.all ? readConfigSheet_(ORS.SHEETS.DATA_SOURCES) : loadDataSourceConfig_();
    case 'sources.save':
      if (!apiRequireRole_(role, 'MANAGER')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return apiSaveSource_(params, email);

    /* ── Field mapping ── */
    case 'mapping.list':
      /* params.all → include inactive rows (mapping editor) */
      return params.all ? readConfigSheet_(ORS.SHEETS.FIELD_MAPPING) : loadFieldMappingConfig_();
    case 'mapping.headers':
      if (!apiRequireRole_(role, 'VIEWER')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return apiRawHeaders_();
    case 'mapping.save':
      if (!apiRequireRole_(role, 'ADMIN')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return apiSaveMapping_(params, email);

    /* ── Rules ── */
    case 'rules.age.list': return loadAgeBucketRules_();
    case 'rules.age.save':
      if (!apiRequireRole_(role, 'ADMIN')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return apiSaveAgeRule_(params, email);
    case 'rules.status.list': return loadStatusBucketRules_();
    case 'rules.status.save':
      if (!apiRequireRole_(role, 'ADMIN')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return apiSaveStatusRule_(params, email);
    case 'rules.location.list': return loadLocationRules_();
    case 'rules.location.save':
      if (!apiRequireRole_(role, 'ADMIN')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return apiSaveLocationRule_(params, email);

    /* ── Inventory ── */
    case 'inventory.list':
      return apiInventoryList_(params);
    case 'inventory.export':
      if (!apiRequireRole_(role, 'MANAGER')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return apiInventoryExport_(params, email);
    case 'inventory.add':
      if (!apiRequireRole_(role, 'OPERATOR')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return upsertInventoryRow_(params.item || params, email);
    case 'inventory.save':
      if (!apiRequireRole_(role, 'OPERATOR')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return upsertInventoryRow_(params.item || params, email);
    case 'inventory.delete':
      if (!apiRequireRole_(role, 'OPERATOR')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return deleteInventoryRow_(params.barcode, email);

    /* ── Processing ── */
    case 'process.run':
      if (!apiRequireRole_(role, 'OPERATOR')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return runDailyProcess_();
    case 'history.list':
      return readSheetData_(ORS.SHEETS.PROCESSING_HISTORY);
    case 'errors.list':
      return readSheetData_(ORS.SHEETS.PROCESSING_ERRORS);
    case 'quality.summary':
      return apiQualitySummary_();

    /* ── Reports & email ── */
    case 'reports.list':
      return loadReportConfig_();
    case 'reports.save':
      if (!apiRequireRole_(role, 'ADMIN')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return saveReportConfig_(params, email);
    case 'reports.delete':
      if (!apiRequireRole_(role, 'ADMIN')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return deleteReportConfig_(params, email);
    case 'reports.bulkCreate':
      if (!apiRequireRole_(role, 'ADMIN')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return bulkCreateReports_(params, email);
    case 'reports.exportToSheet':
      if (!apiRequireRole_(role, 'MANAGER')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return exportAllReportsToSheet_();
    case 'reports.templates.list':
      return loadReportTemplates_();
    case 'reports.templates.save':
      if (!apiRequireRole_(role, 'ADMIN')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return saveReportTemplate_(params, email);
    case 'reports.templates.delete':
      if (!apiRequireRole_(role, 'ADMIN')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return deleteReportTemplate_(params, email);
    case 'reports.generate':
      if (!apiRequireRole_(role, 'MANAGER')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return apiGenerateReport_(params, email);
    case 'email.test':
      if (!apiRequireRole_(role, 'ADMIN')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return apiEmailTest_(email);

    /* ── Advanced features: alerts / trends / activity / settings / import / telegram / backup ── */
    case 'alerts.list':
      /* params.all → include inactive alert rules (editor) */
      return params.all ? readConfigSheet_(ORS.SHEETS.ALERT_RULES) : loadAlertRules_();
    case 'alerts.check':
      if (!apiRequireRole_(role, 'OPERATOR')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return runAlertCheck_(email);
    case 'alerts.save':
      if (!apiRequireRole_(role, 'ADMIN')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return saveAlertRule_(params, email);
    case 'alerts.delete':
      if (!apiRequireRole_(role, 'ADMIN')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return deleteAlertRule_(params, email);
    case 'trends.list':
      return loadTrendHistory_();
    case 'activity.list':
      return loadActivityLog_();
    case 'settings.get':
      return loadSystemSettings_();
    case 'settings.save':
      if (!apiRequireRole_(role, 'ADMIN')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return saveSystemSettings_(params, email);
    case 'telegram.test':
      if (!apiRequireRole_(role, 'ADMIN')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return telegramTest_();
    case 'backup.run':
      if (!apiRequireRole_(role, 'ADMIN')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return backupToDrive_();
    case 'import.upload':
      if (!apiRequireRole_(role, 'OPERATOR')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return apiImportUpload_(params, email);
    case 'import.preview':
      if (!apiRequireRole_(role, 'VIEWER')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return apiImportPreview_(params);

    /* ── Universal Import (v2) ── */
    case 'import.fileB64':
      if (!apiRequireRole_(role, 'OPERATOR')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return apiImportFileB64_(params);
    case 'import.sheets':
      if (!apiRequireRole_(role, 'OPERATOR')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return apiImportSheets_(params);
    case 'import.tabs':
      if (!apiRequireRole_(role, 'OPERATOR')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return apiImportTabs_(params);
    case 'import.previewPage':
      if (!apiRequireRole_(role, 'VIEWER')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return apiImportPreviewPage_(params);
    case 'import.commit':
      if (!apiRequireRole_(role, 'OPERATOR')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return apiImportCommit_(params, email);
    case 'import.discard':
      if (!apiRequireRole_(role, 'OPERATOR')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return apiImportDiscard_();

    /* ── Multi-Source Import (architecture v2) ── */
    case 'sources.types':
      return listSourceTypes_();
    case 'import.multiSource.validate':
      return validateSources_(params.sources);
    case 'import.multiSource.create':
      if (!apiRequireRole_(role, 'OPERATOR')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return createImportJob_(params.sources, email);
    case 'import.multiSource.run':
      if (!apiRequireRole_(role, 'OPERATOR')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return runImportJob_(params.jobId, email);
    case 'import.multiSource.status':
      return getImportJobStatus_(params.jobId);
    case 'import.fileToSource':
      if (!apiRequireRole_(role, 'OPERATOR')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return apiImportFileToSource_(params);
    case 'sourceData.list':
      return filterSourceData_(params);
    case 'sourceData.history':
      return readSourceImportHistory_();
    case 'conflicts.list':
      return readConflicts_(params.limit);
    case 'conflicts.clear':
      if (!apiRequireRole_(role, 'MANAGER')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return clearConflicts_();
    case 'priorityRules.list':
      return loadPriorityRules_();
    case 'priorityRules.save':
      if (!apiRequireRole_(role, 'ADMIN')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return savePriorityRules_(params, email);

    /* ── Security ── */
    case 'security.list':
      return loadSecurityConfig_();
    case 'security.unlock':
      if (!apiRequireRole_(role, 'ADMIN')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return unlockSheet_(params.sheet, email);
    case 'security.lock':
      if (!apiRequireRole_(role, 'ADMIN')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return relockSheet_(params.sheet, email);

    /* ── Users ── */
    case 'users.list':
      return loadAuthorizedUsers_();
    case 'users.save':
      if (!apiRequireRole_(role, 'ADMIN')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return apiSaveUser_(params, email);

    /* ── AI ── */
    case 'ai.command':
      if (!apiRequireRole_(role, 'OPERATOR')) throw new Error('Permission denied: role ' + role + ' is not authorized for action \'' + action + '\'. Check your access level or ask an ADMIN to upgrade your role.');
      return executeAICommand_(params.text || '');

    default:
      throw new Error('Unknown action: ' + action);
  }
}

/* ────────────────────────── FETCH MODE (doPost) ────────────────────────── */
function doPost(e) {
  var payload = {};
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return apiError_('Invalid JSON body.', 'BAD_REQUEST');
  }
  var action = payload.action || '';
  var params = payload.params || {};
  // SECURITY FIX (P0): never trust the request body for identity. Derive the caller
  // exclusively from the authenticated session so an anonymous "Anyone with link"
  // caller cannot claim an ADMIN/OWNER email to bypass RBAC gates.
  var email = Session.getActiveUser().getEmail();
  try {
    var data = apiRoute_(action, params, email);
    return apiRespond_(data);
  } catch (err) {
    var msg = err && err.message ? err.message : String(err);
    var code = 'BACKEND_ERROR';
    if (msg.indexOf('Permission denied') === 0 || msg.indexOf('FORBIDDEN') === 0) code = 'FORBIDDEN';
    else if (msg.indexOf('AUTH_REQUIRED') === 0) code = 'AUTH_REQUIRED';
    else if (msg.indexOf('AUTH_FAILED') === 0) code = 'AUTH_FAILED';
    else if (msg.indexOf('AUTH_LOCKED') === 0) code = 'AUTH_LOCKED';
    return apiError_(msg, code);
  }
}

/* ────────────────────────── NATIVE MODE (google.script.run) ──────────────────────────
   Called by the UI when it is served by Apps Script itself (Code-UI.gs).
   Errors thrown here reach the browser's withFailureHandler. */
function runApi(action, params) {
  var email = Session.getActiveUser().getEmail();
  return apiRoute_(action, params, email);
}

/* NOTE: doGet() is defined in Code-UI.gs only (serves the UI).
   This file intentionally has no doGet to avoid duplicate handlers. */

/* ────────────────────────── IMPLEMENTATIONS ────────────────────────── */

function apiDashboard_() {
  var inv = readSheetData_(ORS.SHEETS.INVENTORY);
  var history = readSheetData_(ORS.SHEETS.PROCESSING_HISTORY);
  var errors = readSheetData_(ORS.SHEETS.PROCESSING_ERRORS);
  return {
    inventoryCount: inv.data.length,
    headers: inv.headers,
    recentRuns: history.data.slice(0, 8),
    recentErrors: errors.data.slice(0, 8),
    sourcesActive: loadDataSourceConfig_().length,
    reportsActive: loadReportConfig_().filter(function (r) { return r['Active'] === 'ON'; }).length
  };
}

function apiInventoryList_(params) {
  var inv = readSheetData_(ORS.SHEETS.INVENTORY);
  if (inv.data.length === 0) return { rows: [], total: 0, headers: inv.headers, page: 1, perPage: params.perPage || 50 };
  var rows = inv.data;
  var q = (params.q || '').toString().toLowerCase();
  var filters = params.filters || {};
  if (q) {
    rows = rows.filter(function (r) {
      return r.join(' ').toLowerCase().indexOf(q) > -1;
    });
  }
  Object.keys(filters).forEach(function (key) {
    var val = String(filters[key] || '').toLowerCase();
    if (!val) return;
    var idx = inv.headers.indexOf(key);
    if (idx === -1) return;
    rows = rows.filter(function (r) { return String(r[idx] || '').toLowerCase() === val; });
  });
  var total = rows.length;
  var page = Math.max(1, parseInt(params.page || '1', 10));
  var perPage = Math.max(1, parseInt(params.perPage || '50', 10));
  rows = rows.slice((page - 1) * perPage, page * perPage);
  return { rows: rows, total: total, headers: inv.headers, page: page, perPage: perPage };
}

function apiSaveSource_(params, email) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.DATA_SOURCES);
  if (!sheet) throw new Error('Data Sources sheet not found. Run setup first.');
  var values = sheet.getDataRange().getValues();
  var existing = values.slice(1);
  var id = params.id || ('SRC' + String(existing.length + 1).padStart(3, '0'));
  var row = [id, params.name, params.type || 'Google Sheet', params.role || 'JOIN',
    params.sheet || '', params.sheetId || '', params.joinKey || 'BARCODE', params.joinFields || '', params.active || 'ON'];
  var found = false;
  for (var i = 0; i < existing.length; i++) {
    if (String(existing[i][0]) === id) {
      sheet.getRange(i + 2, 1, 1, row.length).setValues([row]);
      found = true;
      break;
    }
  }
  if (!found) sheet.appendRow(row);
  apiLog_('SOURCE_SAVED', id, 'OK', email);
  return { id: id };
}

function apiSaveMapping_(params, email) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.FIELD_MAPPING);
  if (!sheet) throw new Error('Field Mapping sheet not found. Run setup first.');
  sheet.getDataRange().clearContent();
  sheet.getRange(1, 1, 1, 6).setValues([['Source', 'Source Column', 'Target Field', 'Required', 'Active', 'Output Order']]);
  (params.mappings || []).forEach(function (m) {
    sheet.appendRow([m.source || '', m.sourceColumn || '', m.target || '', m.required || 'NO', m.active || 'ON', m.order || 99]);
  });
  applyHeaderFormatting_(sheet);
  apiLog_('MAPPING_SAVED', 'Field Mapping', 'OK', email);
  return { saved: (params.mappings || []).length };
}

function apiSaveAgeRule_(params, email) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.AGE_BUCKET_RULES);
  if (!sheet) throw new Error('Age Bucket Rules sheet not found.');
  sheet.appendRow([params.min, params.max, params.bucket, params.priority || '', params.active || 'ON']);
  apiLog_('RULE_CHANGED', 'Age:' + params.bucket, 'OK', email);
  return { saved: true };
}

function apiSaveStatusRule_(params, email) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.STATUS_BUCKET_RULES);
  if (!sheet) throw new Error('Status Bucket Rules sheet not found.');
  sheet.appendRow([params.raw, params.bucket, params.marking || '', params.active || 'ON']);
  apiLog_('RULE_CHANGED', 'Status:' + params.raw, 'OK', email);
  return { saved: true };
}

function apiSaveLocationRule_(params, email) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.LOCATION_RULES);
  if (!sheet) throw new Error('Location Rules sheet not found.');
  sheet.appendRow([params.pattern, params.bucket, params.condition || '', params.active || 'ON']);
  apiLog_('RULE_CHANGED', 'Location:' + params.pattern, 'OK', email);
  return { saved: true };
}

function apiInventoryExport_(params, email) {
  var inv = readSheetData_(ORS.SHEETS.INVENTORY);
  var cols = (params.columns || '').split(',').map(function (c) { return c.trim(); }).filter(Boolean);
  var headers = cols.length ? cols : inv.headers;
  var out = [headers.join(',')];
  inv.data.forEach(function (row) {
    var line = headers.map(function (h) {
      var idx = inv.headers.indexOf(h);
      return '"' + String(idx >= 0 ? row[idx] : '').replace(/"/g, '""') + '"';
    }).join(',');
    out.push(line);
  });
  apiLog_('EXPORT', 'Inventory CSV', 'OK', email);
  return { csv: out.join('\n'), rows: inv.data.length };
}

function apiRawHeaders_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.RAW_DATA);
  if (!sheet) throw new Error('RAW_DATA sheet not found. Run setup first.');
  if (sheet.getLastRow() < 1) return { headers: [] };
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h || '').trim(); })
    .filter(function (h) { return h !== ''; });
  return { headers: headers };
}

function apiImportUpload_(params, email) {
  var headers = params.headers || [];
  var rows = params.rows || [];
  if (!headers.length || !rows.length) throw new Error('No data to import. File empty ya headers missing.');
  if (headers.length > 60) throw new Error('Too many columns (' + headers.length + '). Max 60 columns supported.');
  if (rows.length > 5000) throw new Error('Too many rows (' + rows.length + '). Max 5000 rows per upload.');
  // Validate row width consistency before writing (poor preview / corrupt file ka clear reason)
  for (var i = 0; i < rows.length; i++) {
    if (!rows[i] || rows[i].length !== headers.length) {
      throw new Error('Row ' + (i + 2) + ' has ' + (rows[i] ? rows[i].length : 0) + ' columns but the headers have ' + headers.length + '. Every row in the file must have the same number of columns as the header row.');
    }
  }
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.RAW_DATA);
  if (!sheet) throw new Error('RAW_DATA sheet not found. Run setup first.');
  // If sheet is empty or has only the generic header, write the uploaded header
  if (sheet.getLastRow() <= 1) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    applyHeaderFormatting_(sheet);
  }
  var batchSize = ORS.PROCESSING.BATCH_SIZE || 500;
  for (var b = 0; b < rows.length; b += batchSize) {
    var batch = rows.slice(b, b + batchSize);
    sheet.getRange(sheet.getLastRow() + 1, 1, batch.length, batch[0].length).setValues(batch);
  }
  apiLog_('IMPORT_UPLOAD', rows.length + ' rows', 'OK', email);
  logActivity_(email, 'IMPORT_UPLOAD', rows.length + ' rows', 'OK');
  return { imported: rows.length, sheet: ORS.SHEETS.RAW_DATA };
}

function apiImportPreview_(params) {
  var srcId = params.sourceId || '';
  var sheetId = params.sheetId || '';
  var source = null;
  if (srcId) {
    var sources = loadDataSourceConfig_();
    for (var i = 0; i < sources.length; i++) {
      if (String(sources[i]['Source ID']) === String(srcId)) { source = sources[i]; break; }
    }
    if (!source) throw new Error('Source not found with ID: ' + srcId);
  }
  var ss = null;
  if (source) {
    var name = source['Sheet Name'];
    ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = name ? ss.getSheetByName(name) : null;
    if (!sh && source['Sheet ID']) {
      try { ss = SpreadsheetApp.openById(String(source['Sheet ID']).replace(/.*\/d\/([\w-]+).*/g, '$1')); sh = ss.getSheets()[0]; } catch (e) { throw new Error('External sheet open karte time error: ' + e.message); }
    }
    if (!sh) throw new Error('Configured sheet not found: "' + name + '". Please check the sheet name.');
  } else if (sheetId) {
    var id = String(sheetId).trim().replace(/.*\/d\/([\w-]+).*/g, '$1');
    try { ss = SpreadsheetApp.openById(id); } catch (e) { throw new Error('Error opening the sheet: ' + e.message + '. Check permission/access to this sheet.'); }
    var sh2 = ss.getSheets()[0];
    var lr = Math.min(sh2.getLastRow(), 1001);
    var lc = sh2.getLastColumn();
    if (lr < 1 || lc < 1) throw new Error('The sheet is empty — no data found.');
    var vals = sh2.getRange(1, 1, lr, lc).getValues();
    var headers = vals[0].map(function (h) { return String(h || '').trim(); });
    var sample = vals.slice(1, 11);
    return { headers: headers, sample: sample, rowCount: Math.max(0, lr - 1), source: 'Sheet ID' };
  } else {
    throw new Error('Select something: a configured source or a Sheet ID/URL.');
  }
  var lr2 = Math.min(sh.getLastRow(), 1001);
  var lc2 = sh.getLastColumn();
  if (lr2 < 1 || lc2 < 1) throw new Error('The sheet is empty — no data found.');
  var vals2 = sh.getRange(1, 1, lr2, lc2).getValues();
  var headers2 = vals2[0].map(function (h) { return String(h || '').trim(); });
  var sample2 = vals2.slice(1, 11);
  return { headers: headers2, sample: sample2, rowCount: Math.max(0, lr2 - 1), source: source ? source['Source Name'] : 'Sheet' };
}

function apiGenerateReport_(params, email) {
  var reportName = params.name || ('Report_' + new Date().getTime());
  var cols = (params.columns || '').split(',').map(function (c) { return c.trim(); }).filter(Boolean);
  var sheet = getOrCreateSheet_(reportName, cols);
  var inv = readSheetData_(ORS.SHEETS.INVENTORY);
  var fField = params.filterField, fValue = params.filterValue;
  var rows = inv.data;
  if (fField && fValue) {
    var idx = inv.headers.indexOf(fField);
    if (idx > -1) {
      rows = rows.filter(function (r) { return String(r[idx]).toLowerCase() === String(fValue).toLowerCase(); });
    }
  }
  var out = rows.map(function (r) {
    return cols.map(function (c) {
      var i = inv.headers.indexOf(c);
      return i >= 0 ? r[i] : '';
    });
  });
  var lr = sheet.getLastRow();
  if (lr > 1) sheet.getRange(2, 1, lr - 1, sheet.getLastColumn()).clearContent();
  if (out.length) {
    for (var b = 0; b < out.length; b += ORS.PROCESSING.BATCH_SIZE) {
      var batch = out.slice(b, b + ORS.PROCESSING.BATCH_SIZE);
      sheet.getRange(sheet.getLastRow() + 1, 1, batch.length, batch[0].length).setValues(batch);
    }
  }
  applyHeaderFormatting_(sheet);
  applyUniversalFormatting_(sheet);
  applyAltRowShading_(sheet);
  protectSheetIfNeeded_(reportName);
  apiLog_('REPORT_GENERATED', reportName, 'OK', email);
  return { report: reportName, rows: out.length };
}

function apiQualitySummary_() {
  var errors = readSheetData_(ORS.SHEETS.PROCESSING_ERRORS).data;
  var bySource = {};
  errors.forEach(function (r) {
    var key = r[3] || 'OTHER';
    bySource[key] = (bySource[key] || 0) + 1;
  });
  return { totalErrors: errors.length, bySource: bySource };
}

function apiEmailTest_(email) {
  var configs = loadEmailConfig_();
  if (!configs.length) throw new Error('No active email config found.');
  MailApp.sendEmail({
    to: configs[0]['To Email'],
    subject: 'Inventory System — test email',
    body: 'This is a test email from the Bulk Repair (API v' + API_VERSION + ').'
  });
  apiLog_('EMAIL_TEST', configs[0]['To Email'], 'OK', email);
  return { sentTo: configs[0]['To Email'] };
}

function apiSaveUser_(params, email) {
  params = params || {};
  var target = String(params.email || '').trim();
  if (!target) throw new Error('Email is required.');
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORS.SHEETS.AUTHORIZED_USERS);
  if (!sheet) throw new Error('Authorized Users sheet not found.');
  authEnsureUserColumns_(sheet);
  var row = authFindUserRow_(sheet, target);
  var role = params.role ? String(params.role) : '';
  var active = params.active ? String(params.active).toUpperCase() : '';
  var updated = false;
  if (row === -1) {
    sheet.appendRow([target, role || 'VIEWER', active || 'ON']);
    row = sheet.getLastRow();
  } else {
    updated = true;
    if (role) sheet.getRange(row, 2).setValue(role);
    if (active) sheet.getRange(row, 3).setValue(active);
  }
  var passwordSet = false;
  if (params.password) {
    authSetPassword_(target, String(params.password));
    passwordSet = true;
  }
  apiLog_('USER_SAVED', target, 'OK', email);
  return { saved: true, updated: updated, passwordSet: passwordSet };
}

// ═══════════════════════════════════════════════════════════════════
// SECTION: UNIVERSAL IMPORT ENGINE (v2)
// Direct import: upload file (CSV/TSV/XLS/XLSX/PDF) or connect a
// Google Sheet → stage → preview → map columns → validate → commit.
// Configured sources remain available via Import > Advanced, but are
// never required for a direct import.
// ═══════════════════════════════════════════════════════════════════
var IMPORT_MAX_ROWS = 50000;
var IMPORT_MAX_CELLS = 400000;
var IMPORT_MAX_BYTES = 15 * 1024 * 1024;

/* Fallback sheet names: if code.js is an older version without the new
   constants, use explicit names so the import engine still works. */
function importStageName_() {
  try { if (ORS && ORS.SHEETS && ORS.SHEETS.IMPORT_STAGING) return ORS.SHEETS.IMPORT_STAGING; } catch (e) {}
  return 'IMPORT_STAGING';
}
function importErrorsName_() {
  try { if (ORS && ORS.SHEETS && ORS.SHEETS.IMPORT_ERRORS) return ORS.SHEETS.IMPORT_ERRORS; } catch (e) {}
  return 'Import Errors';
}
function importGetStaging_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(importStageName_());
  if (!sh) {
    var candidates = ss.getSheets();
    for (var i = 0; i < candidates.length; i++) {
      if (String(candidates[i].getName()).toUpperCase() === 'IMPORT_STAGING') { sh = candidates[i]; break; }
    }
  }
  if (!sh) {
    try { sh = ss.insertSheet(importStageName_()); }
    catch (e) { sh = ss.insertSheet('IMPORT_STAGING_' + new Date().getTime()); }
  }
  return sh;
}


/* Public entry for google.script.run with a File/Blob (native mode). */
function importUploadFile(file, fileName) {
  return apiImportFile_(file, fileName);
}

function apiImportFile_(file, fileName) {
  var name = String(fileName || (file && file.getName ? file.getName() : '') || 'upload');
  var bytes = null;
  try { bytes = file.getBytes(); } catch (e) { bytes = null; }
  if (!bytes || !bytes.length) {
    try { bytes = Utilities.newBlob(file).getBytes(); } catch (e2) { bytes = null; }
  }
  return importProcessBlob_(bytes, name);
}

function apiImportFileB64_(params) {
  params = params || {};
  var b64 = String(params.b64 || '');
  if (!b64) throw new Error('No file data received. Please upload the file again.');
  var bytes;
  try { bytes = Utilities.base64Decode(b64); } catch (e) { throw new Error('Could not decode the uploaded file. The file may be corrupted.'); }
  return importProcessBlob_(bytes, String(params.fileName || 'upload'));
}

function importProcessBlob_(bytes, name) {
  var lower = String(name).toLowerCase();
  var ext = lower.indexOf('.') >= 0 ? lower.split('.').pop() : '';
  var supported = ['csv', 'txt', 'tsv', 'xls', 'xlsx', 'pdf'];
  if (supported.indexOf(ext) < 0) {
    throw new Error('Unsupported file format: .' + (ext || '?') + '. Supported formats: CSV, TSV, TXT, XLS, XLSX, PDF and Google Sheets.');
  }
  if (!bytes || !bytes.length) throw new Error('The file is empty or could not be read. Please try again.');
  if (bytes.length > IMPORT_MAX_BYTES) {
    throw new Error('File is too large (' + Math.round(bytes.length / 1048576) + ' MB). Maximum file size is 15 MB.');
  }
  var staging = importStagingSheet_();
  if (ext === 'xls' || ext === 'xlsx') return importExcel_(bytes, name, ext, staging);
  if (ext === 'pdf') return importPdf_(bytes, name, staging);
  return importCsv_(bytes, name, ext, staging);
}

function importStagingSheet_() {
  var sh = importGetStaging_();
  sh.clear();
  return sh;
}

/* ── Multi-source: upload one file → stage into a NAMED sheet (one per source) ──
   Returns { sheetName, headers, totalRows } so the multi-source engine can
   reference it by sheet name and consolidate it with other sources. */
function apiImportFileToSource_(params) {
  params = params || {};
  var b64 = String(params.b64 || '');
  var fileName = String(params.fileName || 'upload');
  var targetName = String(params.sheetName || '').trim();
  if (!b64) throw new Error('No file data received. Please select the file again.');
  var bytes;
  try { bytes = Utilities.base64Decode(b64); } catch (e) { throw new Error('Could not decode the uploaded file.'); }
  var lower = String(fileName).toLowerCase();
  var ext = lower.indexOf('.') >= 0 ? lower.split('.').pop() : '';
  var supported = ['csv', 'txt', 'tsv', 'xls', 'xlsx', 'pdf'];
  if (supported.indexOf(ext) < 0) throw new Error('Unsupported file format: .' + (ext || '?') + '. Supported: CSV, TSV, TXT, XLS, XLSX, PDF.');
  if (bytes.length > IMPORT_MAX_BYTES) throw new Error('File is too large (max 15 MB).');

  if (!targetName) {
    targetName = String(fileName).replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_ ]/g, '_').slice(0, 40);
  }
  if (!targetName) targetName = 'MS_Source_' + new Date().getTime();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(targetName);
  if (sh) sh.clear();
  else sh = ss.insertSheet(targetName);

  var res;
  if (ext === 'xls' || ext === 'xlsx') res = importExcel_(bytes, fileName, ext, sh);
  else if (ext === 'pdf') res = importPdf_(bytes, fileName, sh);
  else res = importCsv_(bytes, fileName, ext, sh);

  return { sheetName: targetName, headers: res.headers, totalRows: res.totalRows, format: res.format, fileName: fileName };
}

/* ── CSV / TSV / TXT ── */
function importCsv_(bytes, name, ext, staging) {
  var text = '';
  try { text = Utilities.newBlob(bytes).getDataAsString('UTF-8'); }
  catch (e) { text = Utilities.newBlob(bytes).getDataAsString(); }
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip BOM
  var delim = (ext === 'tsv' || ext === 'txt') ? '\t' : ',';
  var rows = parseCsvRows_(text, delim);
  if (!rows.length) throw new Error('The file is empty — no data found.');
  if (rows.length < 2) throw new Error('The file has only headers or is empty — no data rows found.');
  return stageRows_(rows, name, 'CSV/TSV', staging);
}

function parseCsvRows_(text, delim) {
  delim = delim || ',';
  var rows = [], row = [], cur = '', inQ = false;
  for (var i = 0; i < text.length; i++) {
    var c = text.charAt(i);
    if (inQ) {
      if (c === '"') {
        if (text.charAt(i + 1) === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else if (c === '"') {
      inQ = true;
    } else if (c === delim) {
      row.push(cur); cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text.charAt(i + 1) === '\n') i++;
      row.push(cur); cur = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      cur += c;
    }
  }
  if (cur !== '' || row.length) {
    row.push(cur);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

/* ── XLS / XLSX — converted server-side via Drive + Sheets ── */
function importExcel_(bytes, name, ext, staging) {
  var mime = ext === 'xls'
    ? 'application/vnd.ms-excel'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  var tmp = DriveApp.createFile(Utilities.newBlob(bytes, mime, name));
  var ss2 = null;
  try {
    ss2 = SpreadsheetApp.openById(tmp.getId());
  } catch (e) {
    try { tmp.setTrashed(true); } catch (e2) {}
    throw new Error('Could not open the Excel file. It may be corrupted or password-protected: ' + e.message);
  }
  var tabs = [];
  var sheets = ss2.getSheets();
  var firstTab = null;
  for (var t = 0; t < sheets.length; t++) {
    var st = sheets[t];
    tabs.push({ name: st.getName(), rows: Math.max(0, st.getLastRow() - 1), cols: st.getLastColumn() });
    if (!firstTab) firstTab = st.getName();
  }
  var activeTab = firstTab;
  var sh2 = ss2.getSheetByName(activeTab) || sheets[0];
  var vals = sh2.getDataRange().getValues();
  var totalCells = vals.length * (vals[0] ? vals[0].length : 0);
  var truncated = false;
  if (totalCells > IMPORT_MAX_CELLS) {
    var maxRows = Math.max(1, Math.floor(IMPORT_MAX_CELLS / (vals[0] ? vals[0].length : 1)));
    vals = vals.slice(0, maxRows);
    truncated = true;
  }
  try { tmp.setTrashed(true); } catch (e3) {}
  var rows = vals.map(function (r) {
    return r.map(function (v) {
      if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      return String(v === null || v === undefined ? '' : v);
    });
  });
  var res = stageRows_(rows, name, 'Excel (.xls/.xlsx)', staging, tabs, activeTab);
  if (truncated) res.warnings.push('File is very large — only the first ' + rows.length + ' rows were loaded.');
  return res;
}

/* ── PDF — text extraction via Drive OCR, then structure heuristics ── */
function importPdf_(bytes, name, staging) {
  if (typeof Drive === 'undefined' || !Drive || !Drive.Files) {
    throw new Error('PDF text extraction needs the Drive API advanced service. Enable it in the Apps Script editor (Services → + → Drive API → Add), then try again.');
  }
  var tmp = DriveApp.createFile(Utilities.newBlob(bytes, 'application/pdf', name));
  var docId = null;
  try {
    var resource = {
      title: String(name).replace(/\.[^.]+$/, '') + ' (imported)',
      mimeType: 'application/vnd.google-apps.document'
    };
    var created = Drive.Files.insert(resource, tmp.getBlob(), { ocr: true, ocrLanguage: 'en' });
    docId = created.id;
  } catch (e) {
    try { tmp.setTrashed(true); } catch (e2) {}
    throw new Error('PDF extraction failed: ' + e.message + '. The PDF may be image-only, scanned or corrupted.');
  }
  try { tmp.setTrashed(true); } catch (e3) {}
  var docText = '';
  try {
    docText = DocumentApp.openById(docId).getBody().getText();
  } catch (e4) {
    throw new Error('Could not read the extracted PDF text: ' + e4.message);
  }
  try { DriveApp.getFileById(docId).setTrashed(true); } catch (e5) {}
  var lines = docText.split('\n').map(function (l) { return l.replace(/\r/g, ''); })
    .filter(function (l) { return l.trim() !== ''; });
  if (!lines.length) throw new Error('No extractable text found in the PDF.');
  var rows = [];
  var colCount = 0;
  for (var i = 0; i < lines.length; i++) {
    var parts = lines[i].split(/\t+/);
    if (parts.length < 2) parts = lines[i].split(/\s{3,}/);
    if (parts.length < 2) parts = [lines[i]];
    rows.push(parts.map(function (p) { return p.trim(); }));
    if (i === 0) colCount = rows[0].length;
  }
  var res = stageRows_(rows, name, 'PDF (extracted)', staging, null, null, true);
  res.warnings.push('PDF text was extracted automatically. Verify the columns below — tables without clear separators may need manual correction.');
  return res;
}

/* ── Shared staging writer ── */
function stageRows_(rows, name, formatLabel, staging, tabs, activeTab, isPdf) {
  var headers = rows[0].map(function (h) { return String(h === null || h === undefined ? '' : h).trim(); });
  var seen = {};
  var warnings = [];
  for (var i = 0; i < headers.length; i++) {
    var k = headers[i] || '(empty)';
    if (seen[k]) {
      var n = 2;
      while (seen[k + '_' + n]) n++;
      headers[i] = k + '_' + n;
      warnings.push('Duplicate header "' + k + '" renamed to "' + headers[i] + '".');
    }
    seen[headers[i]] = 1;
  }
  var dataRows = rows.slice(1);
  if (!dataRows.length) throw new Error('The file has headers but no data rows.');
  // Sanitize every cell to a legal sheet value — undefined/null/object values make
  // setValues throw "Failed due to illegal value in property: 0".
  dataRows = dataRows.map(function (r) {
    return r.map(function (v) {
      if (v === null || v === undefined) return '';
      if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      if (typeof v === 'object') { try { return JSON.stringify(v); } catch (e2) { return String(v); } }
      return v;
    });
  });
  var truncated = false;
  if (dataRows.length > IMPORT_MAX_ROWS) {
    dataRows = dataRows.slice(0, IMPORT_MAX_ROWS);
    truncated = true;
  }
  var maxCols = headers.length;
  for (var d = 0; d < dataRows.length; d++) {
    if (dataRows[d].length > maxCols) maxCols = dataRows[d].length;
  }
  for (var p = 0; p < headers.length; p++) if (!headers[p]) headers[p] = 'Column ' + (p + 1);
  var headerRow = [];
  for (var c = 0; c < maxCols; c++) headerRow.push(headers[c] || ('Column ' + (c + 1)));
  staging.getRange(1, 1, 1, maxCols).setValues([headerRow]);
  applyHeaderFormatting_(staging);
  var batchSize = 500;
  for (var b = 0; b < dataRows.length; b += batchSize) {
    var chunk = dataRows.slice(b, b + batchSize);
    for (var cc = 0; cc < chunk.length; cc++) {
      while (chunk[cc].length < maxCols) chunk[cc].push('');
    }
    staging.getRange(staging.getLastRow() + 1, 1, chunk.length, maxCols).setValues(chunk);
  }
  var out = {
    ok: true,
    fileName: name,
    format: formatLabel,
    staging: importStageName_(),
    headers: headerRow,
    totalRows: dataRows.length,
    totalCols: maxCols,
    preview: dataRows.slice(0, 10),
    tabs: tabs || null,
    activeTab: activeTab || null,
    isPdf: !!isPdf,
    warnings: warnings
  };
  if (truncated) out.warnings.push('Import capped at ' + IMPORT_MAX_ROWS + ' rows. Split the file for more.');
  return out;
}

/* ── Google Sheets direct import ── */
function apiImportSheets_(params) {
  params = params || {};
  var sheetId = String(params.sheetId || '').trim().replace(/.*\/d\/([\w-]+).*/, '$1');
  if (!sheetId) throw new Error('Enter a Google Sheets URL or ID.');
  var ss2;
  try {
    ss2 = SpreadsheetApp.openById(sheetId);
  } catch (e) {
    throw new Error('Could not open the Google Sheet. Check the link and make sure your account has access: ' + e.message);
  }
  var sheets = ss2.getSheets();
  var tabs = sheets.map(function (sh) {
    return { name: sh.getName(), rows: Math.max(0, sh.getLastRow() - 1), cols: sh.getLastColumn() };
  });
  var activeTab = params.tab || tabs[0].name;
  var sh = ss2.getSheetByName(activeTab) || sheets[0];
  var lr = Math.min(sh.getLastRow(), IMPORT_MAX_ROWS + 1);
  var lc = sh.getLastColumn();
  if (lr < 1 || lc < 1) throw new Error('The selected tab is empty — no data found.');
  var vals = sh.getRange(1, 1, lr, lc).getValues();
  var rows = vals.map(function (r) {
    return r.map(function (v) {
      if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      return String(v === null || v === undefined ? '' : v);
    });
  });
  var staging = importStagingSheet_();
  var res = stageRows_(rows, (ss2.getName() || 'Google Sheet') + ' → ' + activeTab, 'Google Sheets', staging, tabs, activeTab);
  res.sourceSheetId = sheetId;
  return res;
}

function apiImportTabs_(params) {
  params = params || {};
  var sheetId = String(params.sheetId || '').trim().replace(/.*\/d\/([\w-]+).*/, '$1');
  if (!sheetId) throw new Error('Enter a Google Sheets URL or ID.');
  var ss2 = SpreadsheetApp.openById(sheetId);
  return ss2.getSheets().map(function (sh) {
    return { name: sh.getName(), rows: Math.max(0, sh.getLastRow() - 1), cols: sh.getLastColumn() };
  });
}

/* ── Paginated preview from staging ── */
function apiImportPreviewPage_(params) {
  params = params || {};
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(importStageName_());
  if (!sh || sh.getLastRow() < 2) throw new Error('No staged data found. Upload a file or connect a sheet first.');
  var lc = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lc).getValues()[0];
  var offset = Math.max(0, parseInt(params.offset, 10) || 0);
  var limit = Math.min(50, Math.max(1, parseInt(params.limit, 10) || 10));
  var total = Math.max(0, sh.getLastRow() - 1);
  var startRow = 2 + offset;
  var count = Math.min(limit, total - offset);
  var rows = count > 0 ? sh.getRange(startRow, 1, count, lc).getValues() : [];
  return { headers: headers, rows: rows, offset: offset, totalRows: total };
}

/* ── Validation + commit ── */
function apiImportCommit_(params, email) {
  params = params || {};
  var mapping = params.mapping || [];
  var sourceType = String(params.sourceType || '').trim();
  var dedupe = !!params.dedupe;
  var dryRun = !!params.dryRun;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(importStageName_());
  if (!sh || sh.getLastRow() < 2) throw new Error('No staged data found. Upload a file or connect a sheet first.');
  var lc = sh.getLastColumn();
  var all = sh.getRange(1, 1, sh.getLastRow(), lc).getValues();
  var headers = all[0].map(String);
  var dataRows = all.slice(1);
  var colIdx = {};
  for (var i = 0; i < headers.length; i++) colIdx[headers[i]] = i;
  var m = [];
  for (var j = 0; j < mapping.length; j++) {
    var mm = mapping[j] || {};
    if (!mm.source || colIdx[mm.source] === undefined) continue;
    var t = String(mm.target || '').trim() || String(mm.source);
    m.push({ idx: colIdx[mm.source], target: t, required: !!mm.required });
  }
  if (!m.length) throw new Error('No valid column mapping. Map at least one imported column to a system field.');

  var valid = 0, failed = 0, skipped = 0;
  var errorRows = [];
  var seen = {};
  var processedRows = [];
  for (var r = 0; r < dataRows.length; r++) {
    var vals = dataRows[r];
    var errs = [];
    var mapped = {};
    for (var p = 0; p < m.length; p++) {
      var v = vals[m[p].idx] === undefined || vals[m[p].idx] === null ? '' : String(vals[m[p].idx]);
      mapped[m[p].target] = v;
      if (m[p].required && !v.trim()) errs.push('Missing required field: ' + m[p].target);
      else if (isDateField_(m[p].target) && v.trim() && isNaN(Date.parse(v))) errs.push('Invalid date in "' + m[p].target + '": "' + v + '"');
      else if (isQtyField_(m[p].target) && v.trim() && isNaN(Number(v.replace(/[^0-9.\-]/g, '')))) errs.push('Invalid number in "' + m[p].target + '": "' + v + '"');
    }
    if (errs.length) {
      failed++;
      if (errorRows.length < 1000) errorRows.push({ row: r + 2, errors: errs });
      continue;
    }
    if (dedupe) {
      var key = m.map(function (x) { return mapped[x.target]; }).join('|');
      if (seen[key]) { skipped++; continue; }
      seen[key] = 1;
    }
    valid++;
    if (!dryRun) processedRows.push(mapped);
  }

  var result = {
    ok: true,
    dryRun: dryRun,
    processed: dataRows.length,
    valid: valid,
    imported: 0,
    failed: failed,
    skipped: skipped,
    warnings: [],
    errorSample: errorRows.slice(0, 100)
  };

  if (dryRun) return result;

  // ── Write valid rows into RAW_DATA (append new target columns) ──
  var rawSheet = ss.getSheetByName(ORS.SHEETS.RAW_DATA);
  if (!rawSheet) throw new Error('RAW_DATA sheet not found. Run setup first.');
  var existing = rawSheet.getLastRow() >= 1 ? rawSheet.getRange(1, 1, 1, rawSheet.getLastColumn()).getValues()[0].map(String) : [];
  var rawCol = {};
  for (var e = 0; e < existing.length; e++) rawCol[existing[e]] = e;
  var newCols = [];
  for (var k = 0; k < m.length; k++) {
    if (rawCol[m[k].target] === undefined && newCols.indexOf(m[k].target) < 0) newCols.push(m[k].target);
  }
  var headerRow = existing.concat(newCols);
  if (!existing.length) {
    rawSheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
    applyHeaderFormatting_(rawSheet);
  } else if (newCols.length) {
    rawSheet.getRange(1, rawSheet.getLastColumn() + 1, 1, newCols.length).setValues([newCols]);
    applyHeaderFormatting_(rawSheet);
  }
  var h2 = rawSheet.getRange(1, 1, 1, rawSheet.getLastColumn()).getValues()[0].map(String);
  var rawCol2 = {};
  for (var e2 = 0; e2 < h2.length; e2++) rawCol2[h2[e2]] = e2;
  var buf = [];
  var flushBuf = function () {
    if (!buf.length) return;
    rawSheet.getRange(rawSheet.getLastRow() + 1, 1, buf.length, h2.length).setValues(buf);
    buf = [];
  };
  for (var w = 0; w < processedRows.length; w++) {
    var rowArr = new Array(h2.length);
    for (var z = 0; z < h2.length; z++) rowArr[z] = '';
    for (var q = 0; q < m.length; q++) {
      var ti = rawCol2[m[q].target];
      if (ti !== undefined) rowArr[ti] = processedRows[w][m[q].target];
    }
    buf.push(rowArr);
    if (buf.length >= 500) flushBuf();
  }
  flushBuf();
  result.imported = valid;

  if (sourceType) {
    var stIdx = rawCol2['SOURCE_TYPE'];
    if (stIdx !== undefined && result.imported > 0) {
      rawSheet.getRange(2, stIdx + 1, Math.min(rawSheet.getLastRow() - 1, 100000), 1).setValue(sourceType);
    }
  }

  if (failed) {
    var errSheet = ss.getSheetByName(importErrorsName_());
    if (!errSheet) {
      errSheet = ss.insertSheet(importErrorsName_());
      errSheet.appendRow(['Timestamp', 'Row', 'Reason']);
      applyHeaderFormatting_(errSheet);
    }
    errSheet.appendRow([new Date(), '--- Import: ' + nameForLog_(params) + ' ---', '']);
    for (var eb = 0; eb < errorRows.length; eb += 500) {
      var chunkE = errorRows.slice(eb, eb + 500).map(function (er) {
        return [new Date(), er.row, er.errors.join('; ')];
      });
      errSheet.getRange(errSheet.getLastRow() + 1, 1, chunkE.length, 3).setValues(chunkE);
    }
    result.warnings.push(failed + ' row(s) failed validation — details written to the "' + importErrorsName_() + '" sheet.');
  }

  apiLog_('IMPORT_COMMIT', result.imported + ' imported / ' + failed + ' failed / ' + skipped + ' skipped', failed ? 'PARTIAL' : 'OK', email);
  logActivity_(email, 'IMPORT_COMMIT', result.imported + ' rows imported' + (sourceType ? ' (' + sourceType + ')' : '') + (failed ? ', ' + failed + ' failed' : ''), failed ? 'PARTIAL' : 'OK');

  return result;
}

function nameForLog_(params) {
  try {
    return String(params.fileName || params.sheetId || 'upload').slice(0, 60);
  } catch (e) { return 'upload'; }
}

function apiImportDiscard_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(importStageName_());
  if (sh) sh.clear();
  return { ok: true };
}

function isDateField_(t) {
  var s = String(t || '').toUpperCase();
  return s.indexOf('DATE') >= 0 || s.indexOf('TIME') >= 0;
}

function isQtyField_(t) {
  var s = String(t || '').toUpperCase();
  return s.indexOf('QTY') >= 0 || s.indexOf('QUANTITY') >= 0 || s.indexOf('STOCK') >= 0 ||
    s.indexOf('COUNT') >= 0 || s.indexOf('PRICE') >= 0 || s.indexOf('AMOUNT') >= 0;
}
