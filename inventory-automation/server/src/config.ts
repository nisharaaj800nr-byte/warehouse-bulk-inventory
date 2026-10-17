import path from 'node:path';

export interface Config {
  port: number;
  host: string;
  dbPath: string;
  sessionTtlHours: number;
  logLevel: string;
  env: string;
}

function intFromEnv(value: string | undefined, fallback: number, name: string, min: number, max: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Invalid ${name}: "${value}" (expected integer between ${min} and ${max})`);
  }
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dbPathRaw = env.DB_PATH && env.DB_PATH.trim() !== '' ? env.DB_PATH.trim() : './data/bulkrepair.db';
  const dbPath = dbPathRaw === ':memory:' ? dbPathRaw : path.resolve(process.cwd(), dbPathRaw);

  return {
    port: intFromEnv(env.PORT, 5000, 'PORT', 1, 65535),
    host: env.HOST && env.HOST.trim() !== '' ? env.HOST.trim() : '0.0.0.0',
    dbPath,
    sessionTtlHours: intFromEnv(env.SESSION_TTL_HOURS, 168, 'SESSION_TTL_HOURS', 1, 24 * 365),
    logLevel: env.LOG_LEVEL && env.LOG_LEVEL.trim() !== '' ? env.LOG_LEVEL.trim() : 'info',
    env: env.NODE_ENV && env.NODE_ENV.trim() !== '' ? env.NODE_ENV.trim() : 'production'
  };
}
