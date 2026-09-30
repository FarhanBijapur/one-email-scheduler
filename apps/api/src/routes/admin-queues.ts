import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import type { EmailSendQueue } from '@one/shared';
import type { Express } from 'express';
import type { AuthService } from '../auth/auth.service.js';
import { requireAuth } from '../middleware/require-auth.js';

const BULL_BOARD_PATH = '/admin/queues';

export function mountQueueDashboard(app: Express, authService: AuthService, emailSendQueue: EmailSendQueue): void {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(BULL_BOARD_PATH);
  createBullBoard({
    queues: [new BullMQAdapter(emailSendQueue, { readOnlyMode: true })],
    serverAdapter,
  });

  app.use(BULL_BOARD_PATH, requireAuth(authService), serverAdapter.getRouter());
}
