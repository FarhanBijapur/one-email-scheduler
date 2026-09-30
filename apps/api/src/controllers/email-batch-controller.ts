import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../lib/api-error.js';
import {
  createEmailBatchSchema,
  EmailBatchService,
  paginationSchema,
} from '../services/email-batch.service.js';

export class EmailBatchController {
  constructor(private readonly emailBatchService: EmailBatchService) {}

  create = (request: Request, response: Response, next: NextFunction): void => {
    void this.createBatch(request, response, next);
  };

  scheduled = (request: Request, response: Response, next: NextFunction): void => {
    void this.listScheduled(request, response, next);
  };

  sent = (request: Request, response: Response, next: NextFunction): void => {
    void this.listSent(request, response, next);
  };

  counts = (request: Request, response: Response, next: NextFunction): void => {
    void this.getCounts(request, response, next);
  };

  detail = (request: Request, response: Response, next: NextFunction): void => {
    void this.getDetail(request, response, next);
  };

  private async createBatch(request: Request, response: Response, next: NextFunction): Promise<void> {
    try {
      const input = createEmailBatchSchema.parse(request.body);
      const result = await this.emailBatchService.create(request.auth!.user.id, request.auth!.user.email, input);
      response.status(201).json({ data: result.batch, jobsQueued: result.jobsQueued });
    } catch (error) {
      next(validationError(error));
    }
  }

  private async listScheduled(request: Request, response: Response, next: NextFunction): Promise<void> {
    try {
      response.json(await this.emailBatchService.listScheduled(request.auth!.user.id, parsePagination(request)));
    } catch (error) {
      next(validationError(error));
    }
  }

  private async listSent(request: Request, response: Response, next: NextFunction): Promise<void> {
    try {
      response.json(await this.emailBatchService.listSent(request.auth!.user.id, parsePagination(request)));
    } catch (error) {
      next(validationError(error));
    }
  }

  private async getCounts(request: Request, response: Response, next: NextFunction): Promise<void> {
    try {
      response.json(await this.emailBatchService.counts(request.auth!.user.id));
    } catch (error) {
      next(error);
    }
  }

  private async getDetail(request: Request, response: Response, next: NextFunction): Promise<void> {
    try {
      response.json({ data: await this.emailBatchService.findDetail(request.auth!.user.id, request.params.id) });
    } catch (error) {
      next(error);
    }
  }
}

function parsePagination(request: Request) {
  return paginationSchema.parse(request.query);
}

function validationError(error: unknown): unknown {
  if (error instanceof ZodError) {
    return new ApiError(400, 'Invalid request input');
  }
  return error;
}
