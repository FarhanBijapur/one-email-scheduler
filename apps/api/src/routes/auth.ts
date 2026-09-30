import { Router } from 'express';
import type { AppConfig } from '@one/shared';
import { AuthService } from '../auth/auth.service.js';
import { AuthController } from '../controllers/auth-controller.js';
import { requireAuth } from '../middleware/require-auth.js';

export function createAuthRouter(config: AppConfig, authService: AuthService): Router {
  const controller = new AuthController(authService, config);
  const router = Router();

  router.get('/auth/google', controller.startGoogle);
  router.get('/auth/google/callback', controller.googleCallback);
  router.get('/auth/me', requireAuth(authService), controller.me);
  router.post('/auth/logout', controller.logout);

  return router;
}
