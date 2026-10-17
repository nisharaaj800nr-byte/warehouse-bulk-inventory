import type { z } from 'zod';
import { ApiError } from './errors.js';

/**
 * Parses untrusted input with a zod schema. Throws a 400 ApiError with
 * per-field details when validation fails. Unknown keys are rejected by the
 * schemas themselves (they use .strict()).
 */
export function parseInput<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Invalid request payload',
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
    );
  }
  return result.data;
}
