import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from './logger.js';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const fail = {
  validation: (details: unknown, message = 'Invalid request payload') =>
    new ApiError(400, 'VALIDATION_ERROR', message, details),
  unauthorized: (message = 'Authentication required') => new ApiError(401, 'UNAUTHORIZED', message),
  forbidden: (message = 'Insufficient role') => new ApiError(403, 'FORBIDDEN', message),
  notFound: (message = 'Resource not found') => new ApiError(404, 'NOT_FOUND', message),
  duplicate: (message: string, details?: unknown) => new ApiError(409, 'DUPLICATE', message, details),
  locked: (message: string, details?: unknown) => new ApiError(423, 'ACCOUNT_LOCKED', message, details),
  rateLimited: (message: string, details?: unknown) => new ApiError(429, 'RATE_LIMITED', message, details),
  internal: (message = 'Internal server error') => new ApiError(500, 'INTERNAL_ERROR', message)
};

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError(404, 'NOT_FOUND', `No route for ${req.method} ${req.originalUrl}`));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      ok: false,
      error: { code: err.code, message: err.message, ...(err.details === undefined ? {} : { details: err.details }) }
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
      }
    });
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  logger.error('unhandled_request_error', { path: req.originalUrl, method: req.method, message });
  res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
}
