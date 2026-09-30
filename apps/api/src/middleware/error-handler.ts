import type { NextFunction, Request, Response } from 'express';
import { createLogger } from '@one/shared';
import { AuthError } from '../auth/auth-error.js';
import { ApiError } from '../lib/api-error.js';

const logger = createLogger('api');

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AuthError || err instanceof ApiError) {
    logger.warn('Request rejected', { statusCode: err.statusCode, message: err.message });
    res.status(err.statusCode).json({
      error: err.message,
      ...(err instanceof ApiError && err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  logger.error('Unhandled request error', err instanceof Error ? err.message : err);
  res.status(500).json({ error: 'Internal server error' });
}
