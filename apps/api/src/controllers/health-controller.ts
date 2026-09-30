import type { Request, Response } from 'express';
import type { HealthResponse } from '@one/shared';

export function health(_req: Request, res: Response<HealthResponse>): void {
  res.json({ status: 'ok' });
}
