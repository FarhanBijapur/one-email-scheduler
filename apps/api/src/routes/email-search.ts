import type { EmailSearchIndexService } from '@one/shared';
import { Router } from 'express';
import type { AuthService } from '../auth/auth.service.js';
import { EmailSearchController } from '../controllers/email-search-controller.js';
import { requireAuth } from '../middleware/require-auth.js';
import { EmailSearchService } from '../services/email-search.service.js';

export function createEmailSearchRouter(
  authService: AuthService,
  emailSearchIndexService: EmailSearchIndexService,
): Router {
  const router = Router();
  const controller = new EmailSearchController(new EmailSearchService(emailSearchIndexService));

  router.get('/api/emails/search', requireAuth(authService), controller.search);
  return router;
}
