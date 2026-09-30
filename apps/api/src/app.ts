import express from 'express';
import type { AppConfig, EmailSearchIndexService, EmailSendQueue } from '@one/shared';
import type { AuthService } from './auth/auth.service.js';
import { errorHandler } from './middleware/error-handler.js';
import { createAuthRouter } from './routes/auth.js';
import { createEmailBatchRouter } from './routes/email-batches.js';
import { createEmailSearchRouter } from './routes/email-search.js';
import { mountQueueDashboard } from './routes/admin-queues.js';
import { healthRouter } from './routes/health.js';
import { createSlackRouter } from './routes/slack.js';
import type { EmailQueueService } from './services/email-queue.service.js';
import type { SlackOAuthService } from './services/slack-oauth.service.js';
import type { PrismaClient } from '@prisma/client';

type AppDependencies = {
  config: AppConfig;
  authService: AuthService;
  prisma: PrismaClient;
  emailQueueService: EmailQueueService;
  emailSendQueue: EmailSendQueue;
  emailSearchIndexService: EmailSearchIndexService;
  slackOAuthService: SlackOAuthService;
};

export function createApp({
  config,
  authService,
  prisma,
  emailQueueService,
  emailSendQueue,
  emailSearchIndexService,
  slackOAuthService,
}: AppDependencies) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors(config));
  app.use(express.json({ limit: '1mb' }));
  app.use(healthRouter);
  app.use(createAuthRouter(config, authService));
  app.use(createSlackRouter(config, authService, slackOAuthService));
  mountQueueDashboard(app, authService, emailSendQueue);
  app.use(createEmailSearchRouter(authService, emailSearchIndexService));
  app.use(createEmailBatchRouter(authService, prisma, emailQueueService, emailSearchIndexService));
  app.use(errorHandler);
  return app;
}

function cors(config: AppConfig) {
  return (request: express.Request, response: express.Response, next: express.NextFunction): void => {
    const origin = request.headers.origin;
    if (origin === config.WEB_URL) {
      response.setHeader('Access-Control-Allow-Origin', config.WEB_URL);
      response.setHeader('Access-Control-Allow-Credentials', 'true');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      response.setHeader('Vary', 'Origin');
      if (request.method === 'OPTIONS') {
        response.status(204).end();
        return;
      }
    }
    next();
  };
}
