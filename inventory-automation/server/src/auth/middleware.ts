import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Db } from '../db/index.js';
import { fail } from '../lib/errors.js';
import { resolveSession, type Role, type SessionUser } from './tokens.js';

export interface AuthContext {
  user: SessionUser;
  token: string;
}

export interface AuthedRequest extends Request {
  auth?: AuthContext;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (!scheme || !value) return null;
  if (scheme.toLowerCase() !== 'bearer') return null;
  const token = value.trim();
  return token.length > 0 ? token : null;
}

export function requireAuth(db: Db): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = bearerToken(req);
    if (!token) {
      next(fail.unauthorized('Missing bearer token'));
      return;
    }

    const user = resolveSession(db, token);
    if (!user) {
      next(fail.unauthorized('Invalid or expired session'));
      return;
    }

    (req as AuthedRequest).auth = { user, token };
    next();
  };
}

export function requireRole(...allowed: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const auth = (req as AuthedRequest).auth;
    if (!auth) {
      next(fail.unauthorized());
      return;
    }
    if (!allowed.includes(auth.user.role)) {
      next(fail.forbidden(`Role ${auth.user.role} cannot perform this action`));
      return;
    }
    next();
  };
}

export function authContext(req: Request): AuthContext {
  const auth = (req as AuthedRequest).auth;
  if (!auth) throw fail.unauthorized();
  return auth;
}
