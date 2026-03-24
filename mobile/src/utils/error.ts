import { APIError } from '../services/api';

export function formatError(err: unknown, fallback = 'Something went wrong.'): string {
  if (err instanceof APIError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
