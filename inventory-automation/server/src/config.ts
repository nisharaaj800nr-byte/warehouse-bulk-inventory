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

function tryLoadEnv(): void {
  try {
    process.loadEnvFile?.();
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      // Ignore if .env is missing; rethrow unexpected file system errors
    }
  }
}

export function loadConfig(env?: NodeJS.ProcessEnv): Config {
  if (!env) {
    tryLoadEnv();
  }
  const activeEnv = env ?? process.env;
  const dbPathRaw = activeEnv.DB_PATH && activeEnv.DB_PATH.trim() !== '' ? activeEnv.DB_PATH.trim() : './data/bulkrepair.db';
  const dbPath = dbPathRaw === ':memory:' ? dbPathRaw : path.resolve(process.cwd(), dbPathRaw);

  return {
    port: intFromEnv(activeEnv.PORT, 5050, 'PORT', 1, 65535),
    host: activeEnv.HOST && activeEnv.HOST.trim() !== '' ? activeEnv.HOST.trim() : '0.0.0.0',
    dbPath,
    sessionTtlHours: intFromEnv(activeEnv.SESSION_TTL_HOURS, 168, 'SESSION_TTL_HOURS', 1, 24 * 365),
    logLevel: activeEnv.LOG_LEVEL && activeEnv.LOG_LEVEL.trim() !== '' ? activeEnv.LOG_LEVEL.trim() : 'info',
    env: activeEnv.NODE_ENV && activeEnv.NODE_ENV.trim() !== '' ? activeEnv.NODE_ENV.trim() : 'production'
  };
}
