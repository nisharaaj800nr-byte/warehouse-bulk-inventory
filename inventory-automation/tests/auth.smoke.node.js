/* Node smoke test for code-auth.gs — no npm dependencies.
   Run:  node tests/auth.smoke.node.js

   Loads code-auth.gs into a vm sandbox with stubbed Apps Script
   globals (a minimal in-memory spreadsheet, cache, session, digest)
   and exercises the real auth code paths: hashing, login, lockout,
   session lifecycle, purging and caller gating.
   This runs on a dev machine only — Apps Script itself runs the
   same code server-side. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'code-auth.gs'), 'utf8');

/* ---------------- fake Apps Script runtime ---------------- */

function makeSheet(name) {
  return {
    _name: name,
    data: [],
    getName() { return this._name; },
    getLastRow() {
      let n = 0;
      for (let i = 0; i < this.data.length; i++) {
        const row = this.data[i];
        if (row && row.some((c) => c !== '' && c !== null && c !== undefined)) n = i + 1;
      }
      return n;
    },
    getLastColumn() {
      let m = 0;
      for (const row of this.data) if (row) m = Math.max(m, row.length);
      return m;
    },
    appendRow(values) { this.data.push(values.slice()); },
    deleteRow(rowIndex) { this.data.splice(rowIndex - 1, 1); },
    getRange(r, c, nr, nc) {
      nr = nr || 1;
      nc = nc || 1;
      const self = this;
      return {
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const src = self.data[r - 1 + i] || [];
            const row = [];
            for (let j = 0; j < nc; j++) {
              row.push(src[c - 1 + j] !== undefined ? src[c - 1 + j] : '');
            }
            out.push(row);
          }
          return out;
        },
        setValues(values) {
          for (let i = 0; i < values.length; i++) {
            const ri = r - 1 + i;
            if (!self.data[ri]) self.data[ri] = [];
            for (let j = 0; j < values[i].length; j++) {
              self.data[ri][c - 1 + j] = values[i][j];
            }
          }
        },
        setValue(v) {
          const ri = r - 1;
          if (!self.data[ri]) self.data[ri] = [];
          self.data[ri][c - 1] = v;
        },
        getValue() {
          const src = self.data[r - 1] || [];
          return src[c - 1] !== undefined ? src[c - 1] : '';
        }
      };
    }
  };
}

function makeSpreadsheet() {
  const sheets = [];
  return {
    getName() { return 'Fake Spreadsheet'; },
    getSheetByName(name) { return sheets.find((s) => s.getName() === name) || null; },
    insertSheet(name) { const s = makeSheet(name); sheets.push(s); return s; },
    getSheets() { return sheets; }
  };
}

function buildSandbox(ss) {
  const cache = new Map();
  const sandbox = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest(alg, value) {
        const buf = crypto.createHash('sha256').update(String(value), 'utf8').digest();
        return Array.from(buf).map((b) => (b > 127 ? b - 256 : b)); // signed bytes, like Apps Script
      },
      getUuid() { return crypto.randomUUID(); }
    },
    CacheService: {
      getScriptCache() {
        return {
          get(k) { return cache.has(k) ? cache.get(k) : null; },
          put(k, v) { cache.set(k, v); },
          remove(k) { cache.delete(k); }
        };
      }
    },
    Session: {
      getActiveUser() { return { getEmail: () => '' }; },
      getEffectiveUser() { return { getEmail: () => '' }; },
      getScriptTimeZone() { return 'Asia/Kolkata'; }
    },
    Logger: { log() {} }
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(SRC, context, { filename: 'code-auth.gs' });
  return sandbox;
}

/* ---------------- tiny test runner ---------------- */

let passes = 0;
let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log('PASS  ' + name);
    passes++;
  } catch (e) {
    console.log('FAIL  ' + name + ' — ' + e.message);
    failures++;
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

/* ---------------- environment ---------------- */

const ss = makeSpreadsheet();
const ctx = buildSandbox(ss);

const users = ss.insertSheet('Authorized Users');
users.appendRow(['Email', 'Role', 'Active']);
users.appendRow(['owner@example.com', 'OWNER', 'ON']);

let nowMs = Date.parse('2026-10-09T12:00:00Z');
ctx.authNow_ = function () { return new Date(nowMs); };

ctx.seedUserPassword('owner@example.com', 'secret123', 'OWNER');

/* ---------------- tests ---------------- */

let token = '';

check('password hash + verify', () => {
  const salt = ctx.authGenerateSalt_();
  const hash = ctx.authHashPassword_('hunter2', salt);
  assert(ctx.authVerifyPassword_('hunter2', salt, hash), 'correct password rejected');
  assert(!ctx.authVerifyPassword_('hunter3', salt, hash), 'wrong password accepted');
  assert(ctx.authHashPassword_('hunter2', salt) === hash, 'hash not deterministic for same salt');
});

check('login succeeds and issues a validating token', () => {
  const res = ctx.authLogin_({ email: 'owner@example.com', password: 'secret123' });
  assert(res.token && res.token.length === 64, 'token missing or wrong length');
  assert(res.role === 'OWNER', 'role mismatch: ' + res.role);
  token = res.token;
  const v = ctx.authValidateToken_(token);
  assert(v.ok, 'fresh token rejected: ' + JSON.stringify(v));
});

check('wrong password rejected with generic AUTH_FAILED', () => {
  let err = '';
  try { ctx.authLogin_({ email: 'owner@example.com', password: 'nope' }); } catch (e) { err = e.message; }
  assert(/^AUTH_FAILED/.test(err), 'expected AUTH_FAILED, got: ' + err);
});

check('expired token rejected', () => {
  const s = ctx.authCreateSession_('owner@example.com', 'OWNER', 1000);
  nowMs += 2000;
  const v = ctx.authValidateToken_(s.token);
  assert(!v.ok && v.reason === 'expired', 'expected expired, got ' + JSON.stringify(v));
});

check('revoked token rejected', () => {
  const s = ctx.authCreateSession_('owner@example.com', 'OWNER', 60000);
  ctx.authRevokeToken_(s.token);
  const v = ctx.authValidateToken_(s.token);
  assert(!v.ok, 'revoked token accepted');
});

check('lockout after 5 failures, unlock after 15 min', () => {
  let lastErr = '';
  for (let i = 0; i < 4; i++) {
    try { ctx.authLogin_({ email: 'owner@example.com', password: 'bad' }); } catch (e) { lastErr = e.message; }
  }
  assert(/^AUTH_LOCKED/.test(lastErr), 'expected AUTH_LOCKED on 5th failure, got: ' + lastErr);
  let locked = false;
  try { ctx.authLogin_({ email: 'owner@example.com', password: 'secret123' }); } catch (e) { locked = /^AUTH_LOCKED/.test(e.message); }
  assert(locked, 'locked account allowed to log in');
  nowMs += 16 * 60 * 1000;
  const res = ctx.authLogin_({ email: 'owner@example.com', password: 'secret123' });
  assert(res.token, 'login after lock expiry failed');
  ctx.authRevokeToken_(res.token);
});

check('purge removes expired/revoked sessions; live session survives', () => {
  const r = ctx.authPurgeExpiredSessions_();
  assert(r.removed >= 2, 'expected >= 2 removals, got ' + r.removed);
  const v = ctx.authValidateToken_(token);
  assert(v.ok, 'main session should survive purge');
});

check('sessions sheet stores only hashed tokens', () => {
  const sheet = ss.getSheetByName('App Sessions');
  if (!sheet || sheet.getLastRow() < 2) return;
  const vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (const row of vals) {
    const v = String(row[0] || '');
    if (v && v === token) throw new Error('raw token found in session sheet');
    if (v && v.length === 64 && v === token) throw new Error('raw token stored');
  }
});

check('seedUserPassword creates + logs in a new user', () => {
  ctx.seedUserPassword('newuser@example.com', 'pass1234', 'OPERATOR');
  const looked = ctx.authLookupUser_('newuser@example.com');
  assert(looked && looked.user.role === 'OPERATOR', 'user not created');
  const res = ctx.authLogin_({ email: 'newuser@example.com', password: 'pass1234' });
  assert(res.role === 'OPERATOR', 'login for new user failed');
  ctx.authRevokeToken_(res.token);
});

check('caller gate: open vs protected vs legacy', () => {
  ctx.apiRole_ = function () { return 'VIEWER'; };
  const open = ctx.authResolveCaller_('health', {}, '');
  assert(open.role === 'VIEWER' && !open.email, 'open action should stay anonymous');
  let threw = false;
  try { ctx.authResolveCaller_('inventory.list', {}, ''); } catch (e) { threw = /^AUTH_REQUIRED/.test(e.message); }
  assert(threw, 'protected action without token/email must throw AUTH_REQUIRED');
  const legacy = ctx.authResolveCaller_('inventory.list', {}, 'legacy@example.com');
  assert(legacy.legacy === true && legacy.email === 'legacy@example.com', 'legacy email path broken');
  const viaToken = ctx.authResolveCaller_('inventory.list', { token: token }, '');
  assert(viaToken.email === 'owner@example.com' && viaToken.legacy === false, 'token path broken: ' + JSON.stringify(viaToken));
});

check('logout revokes token', () => {
  const r = ctx.authLogout_({ token: token });
  assert(r.revoked === true, 'logout did not revoke');
  const v = ctx.authValidateToken_(token);
  assert(!v.ok, 'token still valid after logout');
});

/* ---------------- summary ---------------- */

console.log('\n' + passes + ' passed, ' + failures + ' failed');
process.exit(failures ? 1 : 0);
