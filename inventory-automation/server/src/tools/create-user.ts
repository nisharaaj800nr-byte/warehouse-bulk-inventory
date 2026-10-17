import { loadConfig } from '../config.js';
import { openDb } from '../db/index.js';
import { migrate } from '../db/migrate.js';
import { hashPassword } from '../auth/password.js';
import { ROLES, type Role } from '../auth/tokens.js';
import { writeAudit } from '../lib/audit.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function usage(): never {
  console.error('Usage: node dist/tools/create-user.js <email> <password> [role]');
  console.error(`Roles: ${ROLES.join(', ')} (default: OWNER)`);
  process.exit(1);
}

async function main(): Promise<void> {
  const [emailArg, passwordArg, roleArg] = process.argv.slice(2);
  if (!emailArg || !passwordArg) usage();

  const email = emailArg.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 320) {
    console.error(`Invalid email: ${emailArg}`);
    process.exit(1);
  }
  if (passwordArg.length < 8 || passwordArg.length > 200) {
    console.error('Password must be between 8 and 200 characters');
    process.exit(1);
  }

  const role = (roleArg ? roleArg.trim().toUpperCase() : 'OWNER') as Role;
  if (!ROLES.includes(role)) {
    console.error(`Invalid role: ${roleArg}. Allowed: ${ROLES.join(', ')}`);
    process.exit(1);
  }

  const config = loadConfig();
  const db = openDb(config.dbPath);
  migrate(db);

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined;
  if (existing) {
    console.error(`User already exists: ${email}`);
    db.close();
    process.exit(1);
  }

  const passwordHash = await hashPassword(passwordArg);
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO users (email, password_hash, role, is_active, failed_attempts, locked_until, last_login_at, created_at, updated_at)
       VALUES (?, ?, ?, 1, 0, NULL, NULL, ?, ?)`
    )
    .run(email, passwordHash, role, now, now);

  writeAudit(db, {
    actorEmail: 'cli',
    action: 'USER_CREATED',
    entity: 'user',
    entityId: Number(result.lastInsertRowid),
    details: { email, role }
  });

  db.close();
  console.log(JSON.stringify({ ok: true, created: { id: Number(result.lastInsertRowid), email, role } }, null, 2));
}

main().catch((error) => {
  console.error(`create-user failed: ${(error as Error).message}`);
  process.exit(1);
});
