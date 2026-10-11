/* ============================================================
   Code-Auth.gs — App-level authentication for the Bulk Repair
   Control Center (API v1.1). ADDITIVE file: add it as a new
   file in the same Apps Script project as Code.js and Code-API.gs.

   Why this exists:
   Google session emails (Session.getActiveUser()) are empty for
   anonymous web-app callers and unreliable for consumer Gmail
   accounts, so the API cannot rely on them alone. The React
   portal (and later the Telegram bot) log in with email +
   password and use a session token, sent as params.token on
   every API call.

   Design:
   - The "Authorized Users" sheet gains these columns (appended,
     created idempotently): Password Hash | Salt |
     Failed Attempts | Locked Until | Last Login
   - "App Sessions" sheet stores ONLY SHA-256 hashes of session
     tokens, with a sliding expiry (12h, or 30d with rememberMe).
   - 5 consecutive failed logins lock an account for 15 minutes.
     All credential errors use one generic message.
   - Logout and password change revoke sessions.
   - seedUserPassword(email, password, role) bootstraps the first
     admin — run it once from the Apps Script editor.
   - revokeAllSessions() revokes every session (emergency use).

   Uses only a narrow Sheets API surface (getSheetByName /
   insertSheet / appendRow / getRange / deleteRow) so the logic
   can be unit-tested under Node with a stubbed runtime
   (see tests/auth.smoke.node.js).
   ============================================================ */

var AUTH_VERSION = '1.1.0';
var AUTH_SESSION_TTL_MS = 12 * 60 * 60 * 1000;               // 12h sliding
var AUTH_SESSION_REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30d sliding
var AUTH_MAX_FAILED_ATTEMPTS = 5;
var AUTH_LOCK_MS = 15 * 60 * 1000;                           // 15 min lock
var AUTH_SLIDE_MIN_INTERVAL_MS = 10 * 60 * 1000;             // write "Last Seen At" at most every 10 min
var AUTH_PURGE_INTERVAL_MS = 60 * 60 * 1000;                 // purge sessions at most once per hour
var AUTH_MIN_PASSWORD_LEN = 6;
var AUTH_MAX_PASSWORD_LEN = 100;
var AUTH_SESSIONS_SHEET = 'App Sessions';
var AUTH_USER_COLUMNS_ = ['Password Hash', 'Salt', 'Failed Attempts', 'Locked Until', 'Last Login'];

/* ── Clock + hashing helpers (kept test-friendly) ─────────── */

function authNow_() {
  return new Date();
}

function authBytesToHex_(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i];
    if (b < 0) b += 256;
    var h = b.toString(16);
    out += (h.length === 1 ? '0' : '') + h;
  }
  return out;
}

function authSha256Hex_(text) {
  return authBytesToHex_(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8));
}

function authConstantTimeEquals_(a, b) {
  a = String(a || '');
  b = String(b || '');
  var len = Math.max(a.length, b.length);
  var diff = a.length === b.length ? 0 : 1;
  for (var i = 0; i < len; i++) {
    var ca = i < a.length ? a.charCodeAt(i) : 0;
    var cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

function authGenerateSalt_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 32);
}

/* Salted SHA-256, iterated AUTH_HASH_ROUNDS times. Apps Script has no
   bcrypt/PBKDF2, so we stretch with repeated digests. */
var AUTH_HASH_ROUNDS = 1000;

function authHashPassword_(password, salt) {
  var hash = authSha256Hex_(salt + ':' + password);
  for (var i = 0; i < AUTH_HASH_ROUNDS; i++) {
    hash = authSha256Hex_(hash + ':' + salt);
  }
  return hash;
}

function authVerifyPassword_(password, salt, expectedHash) {
  if (!salt || !expectedHash) return false;
  return authConstantTimeEquals_(authHashPassword_(String(password), salt), expectedHash);
}

function authGenerateToken_() {
  var seed = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid() + ':' +
    authNow_().getTime() + ':' + Math.random();
  return authSha256Hex_(seed);
}

function authToDateMs_(value) {
  if (!value) return 0;
  if (typeof value.getTime === 'function') {
    var t = value.getTime();
    return isNaN(t) ? 0 : t;
  }
  var p = new Date(value).getTime();
  return isNaN(p) ? 0 : p;
}

/* ── Sheet access ─────────────────────────────────────────── */

function authSheetName_(key, fallback) {
  try {
    if (typeof ORS !== 'undefined' && ORS && ORS.SHEETS && ORS.SHEETS[key]) return ORS.SHEETS[key];
  } catch (e) { /* ignore */ }
  return fallback;
}

function authUsersSheetName_() {
  return authSheetName_('AUTHORIZED_USERS', 'Authorized Users');
}

function authUsersSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss ? ss.getSheetByName(authUsersSheetName_()) : null;
  if (!sheet) {
    throw new Error('Authorized Users sheet not found. Run setupAutomationSystem() first.');
  }
  return sheet;
}

function authSessionsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(AUTH_SESSIONS_SHEET);
  if (sheet) return sheet;
  sheet = ss.insertSheet(AUTH_SESSIONS_SHEET);
  sheet.appendRow(['Token Hash', 'Email', 'Role', 'Created At', 'Expires At', 'Last Seen At', 'Revoked']);
  return sheet;
}

/* Append any missing auth columns to Authorized Users and return a
   header-name -> 1-based column index map. Safe to re-run. */
function authEnsureUserColumns_(sheet) {
  var lastCol = sheet.getLastColumn();
  var index = {};
  if (lastCol < 1) return index;
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    var name = String(headers[i] || '').trim();
    if (name) index[name] = i + 1;
  }
  for (var c = 0; c < AUTH_USER_COLUMNS_.length; c++) {
    var colName = AUTH_USER_COLUMNS_[c];
    if (!index[colName]) {
      lastCol += 1;
      sheet.getRange(1, lastCol).setValue(colName);
      index[colName] = lastCol;
    }
  }
  return index;
}

function authFindUserRow_(sheet, email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return -1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim().toLowerCase() === email) return i + 2;
  }
  return -1;
}

function authReadUserRow_(sheet, row, colIndex) {
  var lastCol = Math.max(sheet.getLastColumn(), 3);
  var vals = sheet.getRange(row, 1, 1, lastCol).getValues()[0];
  function cell(name) {
    var idx = colIndex[name];
    return idx ? vals[idx - 1] : '';
  }
  var activeRaw = vals[2];
  var failed = parseInt(cell('Failed Attempts'), 10);
  return {
    row: row,
    email: String(vals[0] || '').trim(),
    role: String(vals[1] || 'VIEWER').trim() || 'VIEWER',
    active: (activeRaw === undefined || activeRaw === null || String(activeRaw).trim() === '')
      ? 'ON' : String(activeRaw).trim().toUpperCase(),
    passwordHash: String(cell('Password Hash') || ''),
    salt: String(cell('Salt') || ''),
    failedAttempts: isNaN(failed) ? 0 : failed,
    lockedUntilMs: authToDateMs_(cell('Locked Until')),
    lastLoginRaw: cell('Last Login')
  };
}

function authLookupUser_(email) {
  var sheet = authUsersSheet_();
  var colIndex = authEnsureUserColumns_(sheet);
  var row = authFindUserRow_(sheet, email);
  if (row === -1) return null;
  return { sheet: sheet, colIndex: colIndex, user: authReadUserRow_(sheet, row, colIndex) };
}

/* ── Sessions ─────────────────────────────────────────────── */

function authFindSessionRow_(sheet, tokenHash) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(tokenHash)) return i + 2;
  }
  return -1;
}

function authCreateSession_(email, role, ttlMs) {
  var sheet = authSessionsSheet_();
  var token = authGenerateToken_();
  var nowMs = authNow_().getTime();
  sheet.appendRow([
    authSha256Hex_(token), email, role,
    new Date(nowMs), new Date(nowMs + ttlMs), new Date(nowMs), 'NO'
  ]);
  return { token: token, expiresAt: new Date(nowMs + ttlMs) };
}

function authValidateToken_(token) {
  if (!token) return { ok: false, reason: 'invalid' };
  var sheet = authSessionsSheet_();
  var hash = authSha256Hex_(String(token));
  var row = authFindSessionRow_(sheet, hash);
  if (row === -1) return { ok: false, reason: 'invalid' };
  var lastCol = Math.max(sheet.getLastColumn(), 7);
  var vals = sheet.getRange(row, 1, 1, lastCol).getValues()[0];
  if (String(vals[6] || '').trim().toUpperCase() === 'YES') return { ok: false, reason: 'invalid' };
  var nowMs = authNow_().getTime();
  var expiresMs = authToDateMs_(vals[4]);
  if (!expiresMs || expiresMs <= nowMs) return { ok: false, reason: 'expired' };
  var email = String(vals[1] || '');
  var role = String(vals[2] || 'VIEWER');
  /* Prefer the live role from Authorized Users; a disabled account
     invalidates all of its sessions. */
  try {
    var looked = authLookupUser_(email);
    if (looked) {
      if (looked.user.active !== 'ON') return { ok: false, reason: 'disabled' };
      role = looked.user.role || role;
    }
  } catch (e) { /* sheet unavailable — fall back to the session role */ }
  /* Sliding refresh, at most one write per AUTH_SLIDE_MIN_INTERVAL_MS */
  var lastSeenMs = authToDateMs_(vals[5]);
  if (nowMs - lastSeenMs >= AUTH_SLIDE_MIN_INTERVAL_MS) {
    var span = expiresMs - authToDateMs_(vals[3]);
    if (span <= 0) span = AUTH_SESSION_TTL_MS;
    sheet.getRange(row, 5).setValue(new Date(nowMs + span));
    sheet.getRange(row, 6).setValue(new Date(nowMs));
    expiresMs = nowMs + span;
  }
  return { ok: true, email: email, role: role, expiresAt: new Date(expiresMs) };
}

function authRevokeToken_(token) {
  if (!token) return { revoked: false };
  var sheet = authSessionsSheet_();
  var row = authFindSessionRow_(sheet, authSha256Hex_(String(token)));
  if (row === -1) return { revoked: false };
  sheet.getRange(row, 7).setValue('YES');
  return { revoked: true };
}

function authRevokeAllForUser_(email) {
  var sheet = authSessionsSheet_();
  var lastRow = sheet.getLastRow();
  var count = 0;
  if (lastRow < 2) return count;
  var values = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  var target = String(email || '').trim().toLowerCase();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim().toLowerCase() === target) {
      sheet.getRange(i + 2, 7).setValue('YES');
      count++;
    }
  }
  return count;
}

function authRevokeAllForUserExcept_(email, keepToken) {
  var sheet = authSessionsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var keepHash = keepToken ? authSha256Hex_(String(keepToken)) : '';
  var rows = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  var target = String(email || '').trim().toLowerCase();
  var count = 0;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][1] || '').trim().toLowerCase() !== target) continue;
    if (keepHash && String(rows[i][0]) === keepHash) continue;
    if (String(rows[i][6] || '').trim().toUpperCase() === 'YES') continue;
    sheet.getRange(i + 2, 7).setValue('YES');
    count++;
  }
  return count;
}

function authPurgeExpiredSessions_() {
  var sheet = authSessionsSheet_();
  var lastRow = sheet.getLastRow();
  var removed = 0;
  var nowMs = authNow_().getTime();
  for (var row = lastRow; row >= 2; row--) {
    var vals = sheet.getRange(row, 1, 1, 7).getValues()[0];
    var revoked = String(vals[6] || '').trim().toUpperCase() === 'YES';
    var expiresMs = authToDateMs_(vals[4]);
    if (revoked || !expiresMs || expiresMs <= nowMs) {
      sheet.deleteRow(row);
      removed++;
    }
  }
  return { removed: removed };
}

function authMaybePurgeSessions_() {
  var nowMs = authNow_().getTime();
  var fresh = false;
  try {
    var cache = CacheService.getScriptCache();
    var last = parseInt(cache.get('auth_last_purge') || '0', 10) || 0;
    fresh = (nowMs - last) < AUTH_PURGE_INTERVAL_MS;
    if (!fresh) cache.put('auth_last_purge', String(nowMs), 3900);
  } catch (e) { /* cache unavailable — purge anyway */ }
  if (fresh) return;
  try { authPurgeExpiredSessions_(); } catch (e2) { /* non-fatal */ }
}

/* Emergency: revoke every session (run from the editor if needed). */
function revokeAllSessions() {
  var sheet = authSessionsSheet_();
  var lastRow = sheet.getLastRow();
  var removed = 0;
  for (var row = lastRow; row >= 2; row--) {
    sheet.deleteRow(row);
    removed++;
  }
  return { revoked: true, removed: removed };
}

/* ── Password management ──────────────────────────────────── */

function authValidatePasswordPolicy_(password) {
  var p = String(password || '');
  if (p.length < AUTH_MIN_PASSWORD_LEN) {
    throw new Error('Password must be at least ' + AUTH_MIN_PASSWORD_LEN + ' characters.');
  }
  if (p.length > AUTH_MAX_PASSWORD_LEN) {
    throw new Error('Password must be at most ' + AUTH_MAX_PASSWORD_LEN + ' characters.');
  }
  return p;
}

function authSetPassword_(email, newPassword) {
  authValidatePasswordPolicy_(newPassword);
  var looked = authLookupUser_(email);
  if (!looked) throw new Error('User not found: ' + email);
  var salt = authGenerateSalt_();
  var hash = authHashPassword_(String(newPassword), salt);
  looked.sheet.getRange(looked.user.row, looked.colIndex['Salt']).setValue(salt);
  looked.sheet.getRange(looked.user.row, looked.colIndex['Password Hash']).setValue(hash);
  return { ok: true };
}

/* ── Event logging (never log passwords or tokens) ────────── */

function authLogEvent_(action, email, detail) {
  try { if (typeof apiLog_ === 'function') apiLog_(action, email, detail || 'OK', email); } catch (e) { /* non-fatal */ }
  try { if (typeof logActivity_ === 'function') logActivity_('system', action, email || '', detail || 'OK'); } catch (e2) { /* non-fatal */ }
}

/* ── API handlers ─────────────────────────────────────────── */

function authLogin_(params) {
  params = params || {};
  var email = String(params.email || '').trim();
  var password = String(params.password || '');
  var remember = params.rememberMe === true || String(params.rememberMe || '').toUpperCase() === 'ON';
  if (!email || !password) throw new Error('AUTH_FAILED: Invalid email or password.');
  authMaybePurgeSessions_();
  var looked;
  try { looked = authLookupUser_(email); } catch (e) { looked = null; }
  if (!looked) {
    authLogEvent_('LOGIN_FAIL', email, 'unknown user');
    throw new Error('AUTH_FAILED: Invalid email or password.');
  }
  var u = looked.user;
  if (u.active !== 'ON') {
    authLogEvent_('LOGIN_FAIL', email, 'disabled');
    throw new Error('AUTH_FAILED: Invalid email or password.');
  }
  var nowMs = authNow_().getTime();
  if (u.lockedUntilMs && u.lockedUntilMs > nowMs) {
    authLogEvent_('LOGIN_LOCKED', email);
    throw new Error('AUTH_LOCKED: Too many failed attempts. Try again in a few minutes.');
  }
  var verifyOk = !!(u.passwordHash && u.salt && authVerifyPassword_(password, u.salt, u.passwordHash));
  if (!verifyOk) {
    var fails = u.failedAttempts + 1;
    if (fails >= AUTH_MAX_FAILED_ATTEMPTS) {
      looked.sheet.getRange(u.row, looked.colIndex['Failed Attempts']).setValue(0);
      looked.sheet.getRange(u.row, looked.colIndex['Locked Until']).setValue(new Date(nowMs + AUTH_LOCK_MS));
      authLogEvent_('LOGIN_LOCKED', email, 'locked after ' + fails + ' failures');
      throw new Error('AUTH_LOCKED: Too many failed attempts. Try again in a few minutes.');
    }
    looked.sheet.getRange(u.row, looked.colIndex['Failed Attempts']).setValue(fails);
    authLogEvent_('LOGIN_FAIL', email);
    throw new Error('AUTH_FAILED: Invalid email or password.');
  }
  /* Success — reset counters, stamp last login, issue session */
  looked.sheet.getRange(u.row, looked.colIndex['Failed Attempts']).setValue(0);
  looked.sheet.getRange(u.row, looked.colIndex['Locked Until']).setValue('');
  looked.sheet.getRange(u.row, looked.colIndex['Last Login']).setValue(new Date(nowMs));
  var ttl = remember ? AUTH_SESSION_REMEMBER_TTL_MS : AUTH_SESSION_TTL_MS;
  var session = authCreateSession_(u.email || email, u.role || 'VIEWER', ttl);
  authLogEvent_('LOGIN_OK', email);
  return {
    token: session.token,
    email: u.email || email,
    role: u.role || 'VIEWER',
    expiresAt: session.expiresAt.toISOString()
  };
}

function authLogout_(params) {
  params = params || {};
  var token = String(params.token || '');
  var session = token ? authValidateToken_(token) : { ok: false };
  var res = authRevokeToken_(token);
  if (res.revoked) authLogEvent_('LOGOUT', session.ok ? session.email : '');
  return { revoked: res.revoked };
}

function authWhoamiApi_(params, email, role) {
  params = params || {};
  var s = authValidateToken_(params.token);
  if (s.ok) {
    return { email: s.email, role: s.role, expiresAt: s.expiresAt.toISOString(), legacy: false };
  }
  if (email) return { email: email, role: role || 'VIEWER', expiresAt: null, legacy: true };
  throw new Error('AUTH_REQUIRED: Invalid or expired session.');
}

function authChangePassword_(params, email) {
  params = params || {};
  var token = String(params.token || '');
  var oldPass = String(params.oldPassword || '');
  var newPass = String(params.newPassword || '');
  var session = token ? authValidateToken_(token) : { ok: false };
  var target = session.ok ? session.email : String(email || '');
  if (!target) throw new Error('AUTH_REQUIRED: Invalid or expired session.');
  var looked = authLookupUser_(target);
  if (!looked) throw new Error('AUTH_REQUIRED: Account not found.');
  if (!authVerifyPassword_(oldPass, looked.user.salt, looked.user.passwordHash)) {
    throw new Error('AUTH_FAILED: Current password is incorrect.');
  }
  authSetPassword_(target, newPass);
  if (session.ok) authRevokeAllForUserExcept_(target, token);
  authLogEvent_('PASSWORD_CHANGED', target);
  return { changed: true };
}

function authResetPassword_(params, adminEmail) {
  params = params || {};
  var target = String(params.email || '').trim();
  var newPass = String(params.newPassword || '');
  if (!target) throw new Error('Email is required.');
  if (!authLookupUser_(target)) throw new Error('User not found: ' + target);
  authSetPassword_(target, newPass);
  authRevokeAllForUser_(target);
  authLogEvent_('PASSWORD_RESET', target, 'by ' + (adminEmail || 'admin'));
  return { reset: true };
}

function authUsersList_() {
  var sheet = authUsersSheet_();
  var colIndex = authEnsureUserColumns_(sheet);
  var lastRow = sheet.getLastRow();
  var users = [];
  if (lastRow >= 2) {
    var vals = sheet.getRange(2, 1, lastRow - 1, Math.max(sheet.getLastColumn(), 3)).getValues();
    for (var i = 0; i < vals.length; i++) {
      var email = String(vals[i][0] || '').trim();
      if (!email) continue;
      var hashIdx = colIndex['Password Hash'];
      var lockIdx = colIndex['Locked Until'];
      var lastIdx = colIndex['Last Login'];
      var activeRaw = vals[i][2];
      var lockedMs = lockIdx ? authToDateMs_(vals[i][lockIdx - 1]) : 0;
      var lastMs = lastIdx ? authToDateMs_(vals[i][lastIdx - 1]) : 0;
      users.push({
        email: email,
        role: String(vals[i][1] || 'VIEWER').trim() || 'VIEWER',
        active: (activeRaw === undefined || activeRaw === null || String(activeRaw).trim() === '')
          ? 'ON' : String(activeRaw).trim().toUpperCase(),
        hasPassword: !!(hashIdx && vals[i][hashIdx - 1]),
        lockedUntil: lockedMs ? new Date(lockedMs).toISOString() : '',
        lastLogin: lastMs ? new Date(lastMs).toISOString() : ''
      });
    }
  }
  return { users: users };
}

/* ── Caller resolution used by the API router ─────────────── */

var AUTH_OPEN_ACTIONS_ = { 'health': true, 'auth.login': true, 'auth.logout': true };

function authResolveCaller_(action, params, legacyEmail) {
  params = params || {};
  legacyEmail = String(legacyEmail || '').trim();
  if (AUTH_OPEN_ACTIONS_[action]) {
    /* Best-effort resolution for open actions (never throws) */
    var soft = { email: '', role: 'VIEWER', legacy: false };
    try {
      if (params.token) {
        var sv = authValidateToken_(String(params.token));
        if (sv.ok) { soft.email = sv.email; soft.role = sv.role; soft.legacy = false; }
      } else if (legacyEmail) {
        soft.email = legacyEmail;
        soft.role = (typeof apiRole_ === 'function') ? apiRole_(legacyEmail) : 'VIEWER';
        soft.legacy = true;
      }
    } catch (e) { /* stay anonymous */ }
    return soft;
  }
  if (params.token) {
    var s = authValidateToken_(String(params.token));
    if (s.ok) return { email: s.email, role: s.role, legacy: false };
    if (s.reason === 'disabled') throw new Error('FORBIDDEN: Account is disabled.');
    throw new Error('AUTH_REQUIRED: Invalid or expired session. Please log in again.');
  }
  if (legacyEmail) {
    return {
      email: legacyEmail,
      role: (typeof apiRole_ === 'function') ? apiRole_(legacyEmail) : 'VIEWER',
      legacy: true
    };
  }
  throw new Error('AUTH_REQUIRED: Login required.');
}

/* ── Bootstrap + ops helpers (run manually from the editor) ── */

/* Creates the user (if missing) and sets a password.
   Usage (Apps Script editor):  seedUserPassword('you@example.com', 'strong-pass', 'OWNER') */
function seedUserPassword(email, plainPassword, role) {
  email = String(email || '').trim();
  if (!email) throw new Error('Email is required.');
  authValidatePasswordPolicy_(plainPassword);
  var sheet = authUsersSheet_();
  var colIndex = authEnsureUserColumns_(sheet);
  var row = authFindUserRow_(sheet, email);
  if (row === -1) {
    sheet.appendRow([email, role || 'ADMIN', 'ON']);
    row = sheet.getLastRow();
  } else if (role) {
    sheet.getRange(row, 2).setValue(role);
  }
  var salt = authGenerateSalt_();
  var hash = authHashPassword_(String(plainPassword), salt);
  sheet.getRange(row, colIndex['Salt']).setValue(salt);
  sheet.getRange(row, colIndex['Password Hash']).setValue(hash);
  authLogEvent_('PASSWORD_SEEDED', email, 'role ' + (role || 'unchanged'));
  return { seeded: true, email: email };
}

/* Convenience wrapper: edit the two values below and press Run once from the
   Apps Script editor to create (or reset) your first login. */
function seedMyPassword() {
  seedUserPassword('CHANGE_ME@example.com', 'CHANGE_ME_PASSWORD', 'OWNER');
}

/* ── Deployment self-test (selftest.run) ──────────────────── */

function authSelfTest_() {
  var checks = [];
  var add = function (name, fn) {
    try {
      var detail = fn();
      checks.push({ name: name, ok: true, detail: detail === undefined || detail === null ? 'OK' : String(detail) });
    } catch (e) {
      checks.push({ name: name, ok: false, detail: String(e.message || e) });
    }
  };

  add('Spreadsheet readable', function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('No active spreadsheet.');
    return ss.getName();
  });
  add('Authorized Users columns', function () {
    var sheet = authUsersSheet_();
    authEnsureUserColumns_(sheet);
    return 'columns: ' + AUTH_USER_COLUMNS_.join(', ');
  });
  add('Password hash roundtrip', function () {
    var salt = authGenerateSalt_();
    var hash = authHashPassword_('selftest-123', salt);
    if (!authVerifyPassword_('selftest-123', salt, hash)) throw new Error('verify returned false');
    if (authVerifyPassword_('wrong-pass', salt, hash)) throw new Error('wrong password accepted');
    return 'ok (' + hash.slice(0, 8) + '...)';
  });
  add('Sessions sheet writable', function () {
    var sheet = authSessionsSheet_();
    sheet.appendRow(['probe', 'selftest', 'VIEWER', new Date(), new Date(authNow_().getTime() + 60000), new Date(), 'YES']);
    sheet.deleteRow(sheet.getLastRow());
    return 'probe row written + removed';
  });
  add('Session token roundtrip', function () {
    var s = authCreateSession_('selftest@example.com', 'VIEWER', 60000);
    var v1 = authValidateToken_(s.token);
    authRevokeToken_(s.token);
    var v2 = authValidateToken_(s.token);
    authPurgeExpiredSessions_();
    if (!v1.ok) throw new Error('fresh token rejected: ' + v1.reason);
    if (v2.ok) throw new Error('revoked token accepted');
    return 'ok';
  });
  add('Telegram settings', function () {
    var t = (typeof getSystemSetting_ === 'function') ? getSystemSetting_('TELEGRAM_BOT_TOKEN') : '';
    var c = (typeof getSystemSetting_ === 'function') ? getSystemSetting_('TELEGRAM_CHAT_ID') : '';
    return (t && c) ? 'configured' : 'not configured (optional)';
  });
  add('Inventory readable', function () {
    if (typeof readSheetData_ !== 'function' || typeof ORS === 'undefined') throw new Error('engines unavailable');
    var inv = readSheetData_(ORS.SHEETS.INVENTORY);
    return inv.data.length + ' rows';
  });

  var allOk = true;
  for (var i = 0; i < checks.length; i++) if (!checks[i].ok) allOk = false;
  return { ok: allOk, checks: checks, authVersion: AUTH_VERSION };
}
