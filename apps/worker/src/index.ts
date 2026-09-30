import {
  createBullMQConnection,
  createElasticsearchClient,
  createLogger,
  EMAIL_SEND_JOB_NAME,
  EMAIL_SEND_QUEUE_NAME,
  EmailRepository,
  EmailSearchIndexService,
  loadConfig,
  SlackClient,
  SlackRepository,
  type EmailSendJobData,
} from '@one/shared';
import { Worker } from 'bullmq';
import { createServer } from 'node:http';
import { createPrismaClient, pingDatabase } from './lib/db.js';
import { EmailClaimService } from './services/email-claim.service.js';
import { EmailDeliveryService } from './services/email-delivery.service.js';
import { EmailRateLimitService } from './services/email-rate-limit.service.js';
import { EmailSendJobProcessor } from './services/email-send-job-processor.js';
import { EmailSearchSyncService } from './services/email-search-sync.service.js';
import { createSmtpTransport } from './lib/smtp.js';
import { SlackHourlyLimitNotificationService } from './services/slack-hourly-limit-notification.service.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger('worker');

  const db = createPrismaClient();
  const connection = createBullMQConnection(config, 'consumer');
  const rateLimitConnection = createBullMQConnection(config, 'producer');
  const elasticsearch = createElasticsearchClient(config);
  const emailRepository = new EmailRepository(db);
  const emailSearchSyncService = new EmailSearchSyncService(
    emailRepository,
    new EmailSearchIndexService(elasticsearch),
    logger,
  );
  const transporter = createSmtpTransport(config, config.WORKER_CONCURRENCY);
  await transporter.verify();
  logger.info('SMTP transport verified');

  const emailClaimService = new EmailClaimService(emailRepository, emailSearchSyncService, logger);
  const emailDeliveryService = new EmailDeliveryService(
    emailRepository,
    transporter,
    config.SMTP_FROM ?? config.SMTP_USER!,
    emailSearchSyncService,
    logger,
  );
  const emailSendJobProcessor = new EmailSendJobProcessor(
    emailClaimService,
    new EmailRateLimitService(rateLimitConnection),
    emailDeliveryService,
    emailRepository,
    emailSearchSyncService,
    new SlackHourlyLimitNotificationService(
      rateLimitConnection,
      new SlackRepository(db),
      new SlackClient(config),
      logger,
    ),
    logger,
  );
  const worker = new Worker<EmailSendJobData, void, typeof EMAIL_SEND_JOB_NAME>(
    EMAIL_SEND_QUEUE_NAME,
    (job, token) => emailSendJobProcessor.process(job, token),
    { connection, concurrency: config.WORKER_CONCURRENCY },
  );

  worker.on('error', (error) => {
    logger.error('BullMQ worker error', error instanceof Error ? error.message : error);
  });

  logger.info('Email claim worker started', {
    queue: EMAIL_SEND_QUEUE_NAME,
    concurrency: config.WORKER_CONCURRENCY,
  });

  const healthPort = process.env.PORT ? Number(process.env.PORT) : 3002;
  const healthServer = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok', service: 'worker' }));
      return;
    }

    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Not found' }));
  });
  healthServer.listen(healthPort, '0.0.0.0', () => {
    logger.info(`Worker health server listening on http://0.0.0.0:${healthPort}`);
  });

  const postgresOk = await pingDatabase(db);
  logger.info('Infrastructure ping', { postgresOk });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down`);
    await Promise.allSettled([
      closeHealthServer(healthServer),
      worker.close(),
      db.$disconnect(),
      connection.quit(),
      rateLimitConnection.quit(),
      elasticsearch.close(),
      Promise.resolve(transporter.close()),
    ]);
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

function closeHealthServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

main().catch((error: unknown) => {
  createLogger('worker').error('Worker startup failed', error instanceof Error ? error.message : error);
  process.exit(1);
});
