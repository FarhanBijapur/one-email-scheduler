import { EmailStatus } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { ApiError } from '../lib/api-error.js';
import { EmailSearchService } from '../services/email-search.service.js';

const optionalTrimmedQuery = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().max(500).optional(),
);

export const emailSearchQuerySchema = z.object({
  q: optionalTrimmedQuery,
  status: z.nativeEnum(EmailStatus).optional(),
  page: z.coerce.number().int().min(1).max(100).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export class EmailSearchController {
  constructor(private readonly emailSearchService: EmailSearchService) {}

  search = (request: Request, response: Response, next: NextFunction): void => {
    void this.searchEmails(request, response, next);
  };

  private async searchEmails(request: Request, response: Response, next: NextFunction): Promise<void> {
    try {
      const input = emailSearchQuerySchema.parse(request.query);
      response.json(await this.emailSearchService.search(request.auth!.user.id, input));
    } catch (error) {
      next(error instanceof ZodError ? new ApiError(400, 'Invalid request input') : error);
    }
  }
}
