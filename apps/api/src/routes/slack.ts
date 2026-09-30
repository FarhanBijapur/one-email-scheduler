import { Router } from 'express';
import type { AppConfig } from '@one/shared';
import type { AuthService } from '../auth/auth.service.js';
import { SlackController } from '../controllers/slack-controller.js';
import { requireAuth } from '../middleware/require-auth.js';
import { SlackOAuthService } from '../services/slack-oauth.service.js';

export function createSlackRouter(
  config: AppConfig,
  authService: AuthService,
  slackOAuthService: SlackOAuthService,
): Router {
  const controller = new SlackController(slackOAuthService, config);
  const router = Router();

  router.get('/api/slack/connect', requireAuth(authService), controller.connect);
  router.get('/api/slack/callback', controller.callback);
  router.get('/api/slack/status', requireAuth(authService), controller.status);
  router.post('/api/slack/disconnect', requireAuth(authService), controller.disconnect);

  return router;
}
