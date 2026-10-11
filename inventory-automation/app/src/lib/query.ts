/* React Query client + error helpers. */
import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

const NO_RETRY_CODES = ['AUTH_REQUIRED', 'AUTH_FAILED', 'AUTH_LOCKED', 'FORBIDDEN', 'NO_URL'];

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError && NO_RETRY_CODES.includes(error.code)) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
    mutations: { retry: false },
  },
});

export function stripCode(msg: string): string {
  return msg.replace(
    /^(AUTH_REQUIRED|AUTH_FAILED|AUTH_LOCKED|FORBIDDEN|BACKEND_ERROR|BAD_REQUEST|NO_URL|NO_TRANSPORT|BAD_RESPONSE):\s*/,
    '',
  );
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return stripCode(err.message);
  if (err instanceof Error) return err.message;
  return String(err);
}
