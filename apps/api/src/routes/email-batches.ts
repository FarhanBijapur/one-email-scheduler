import { Router } from 'express';
import type { EmailSearchIndexService } from '@one/shared';
import type { AuthService } from '../auth/auth.service.js';
import { EmailBatchController } from '../controllers/email-batch-controller.js';
import { requireAuth } from '../middleware/require-auth.js';
import { EmailBatchRepository } from '../repositories/email-batch.repository.js';
import { EmailRepository } from '../repositories/email.repository.js';
import { EmailBatchService } from '../services/email-batch.service.js';
import type { EmailQueueService } from '../services/email-queue.service.js';
import type { PrismaClient } from '@prisma/client';

export function createEmailBatchRouter(
  authService: AuthService,
  prisma: PrismaClient,
  emailQueueService: EmailQueueService,
  emailSearchIndexService: EmailSearchIndexService,
): Router {
  const controller = new EmailBatchController(
    new EmailBatchService(
      new EmailBatchRepository(prisma),
      new EmailRepository(prisma),
      emailQueueService,
      emailSearchIndexService,
    ),
  );
  const router = Router();
  const authenticate = requireAuth(authService);

  router.post('/api/email-batches', authenticate, controller.create);
  router.get('/api/emails/scheduled', authenticate, controller.scheduled);
  router.get('/api/emails/sent', authenticate, controller.sent);
  router.get('/api/emails/counts', authenticate, controller.counts);
  router.get('/api/emails/:id', authenticate, controller.detail);

  return router;
}
