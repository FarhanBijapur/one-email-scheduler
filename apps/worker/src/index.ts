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
import { createPrismaClient } from './lib/db.js';
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
  const healthPort = process.env.PORT ? Number(process.env.PORT) : 3002;
  const healthServer = startHealthServer(healthPort, logger);

  const db = createPrismaClient();
  const connection = createBullMQConnection(config, 'consumer');
  const rateLimitConnection = createBullMQConnection(config, 'producer');
  const elasticsearch = createElasticsearchClient(config);

  await checkStartupDependency(logger, config, 'PostgreSQL connection', async () => {
    await db.$queryRaw`SELECT 1`;
  });

  await checkStartupDependency(logger, config, 'Redis connection', async () => {
    await Promise.all([pingRedisConnection(connection), pingRedisConnection(rateLimitConnection)]);
  });

  let elasticsearchOk = false;
  try {
    await elasticsearch.ping();
    elasticsearchOk = true;
  } catch (error) {
    logger.warn('Elasticsearch is unavailable — search indexing will be best-effort', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
  logger.info('Startup dependency status', { elasticsearchOk });

  const emailRepository = new EmailRepository(db);
  const emailSearchSyncService = new EmailSearchSyncService(
    emailRepository,
    new EmailSearchIndexService(elasticsearch),
    logger,
  );
  const transporter = createSmtpTransport(config, config.WORKER_CONCURRENCY);
  try {
    await transporter.verify();
    logger.info('SMTP transport verified');
  } catch (error) {
    logger.warn('SMTP verification failed — delivery will be attempted when jobs are processed', {
      message: error instanceof Error ? error.message : String(error),
      code: isErrorWithCode(error) ? error.code : undefined,
    });
  }

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
  const worker = await checkStartupDependency(logger, config, 'BullMQ initialization', async () => {
    const emailWorker = new Worker<EmailSendJobData, void, typeof EMAIL_SEND_JOB_NAME>(
      EMAIL_SEND_QUEUE_NAME,
      (job, token) => emailSendJobProcessor.process(job, token),
      { connection, concurrency: config.WORKER_CONCURRENCY },
    );
    emailWorker.on('ready', () => {
      logger.info('BullMQ worker is ready and listening for jobs');
    });
    return emailWorker;
  });

  worker.on('error', (error) => {
    logger.error('BullMQ worker error', error instanceof Error ? error.message : error);
  });
  worker.on('failed', (job, error) => {
    logger.error('Job failed', {
      jobId: job?.id ?? null,
      jobName: job?.name ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
  });
  worker.on('completed', (job) => {
    logger.info('Job completed', {
      jobId: job?.id ?? null,
      jobName: job?.name ?? null,
    });
  });

  logger.info('Email claim worker started', {
    queue: EMAIL_SEND_QUEUE_NAME,
    concurrency: config.WORKER_CONCURRENCY,
  });

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

function startHealthServer(
  port: number,
  logger: ReturnType<typeof createLogger>,
): ReturnType<typeof createServer> {
  const healthServer = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok', service: 'worker' }));
      return;
    }

    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Not found' }));
  });
  healthServer.listen(port, '0.0.0.0', () => {
    logger.info(`Worker health server listening on http://0.0.0.0:${port}`);
  });
  return healthServer;
}

async function pingRedisConnection(connection: ReturnType<typeof createBullMQConnection>): Promise<void> {
  if (connection.status === 'wait' || connection.status === 'close' || connection.status === 'end') {
    await connection.connect();
  }

  if ((await connection.ping()) !== 'PONG') {
    throw new Error('Redis ping did not return PONG');
  }
}

async function checkStartupDependency<T>(
  logger: ReturnType<typeof createLogger>,
  config: ReturnType<typeof loadConfig>,
  dependency: string,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    logger.error(`Worker ${dependency} failed`, startupErrorDetails(error, config));
    throw error;
  }
}

function startupErrorDetails(error: unknown, config?: ReturnType<typeof loadConfig>): Record<string, string> {
  const details: Record<string, string> = {
    message: redactStartupValue(error instanceof Error ? error.message : String(error), config),
  };

  if (isErrorWithCode(error)) {
    details.code = redactStartupValue(error.code, config);
  }
  if (error instanceof Error && error.cause !== undefined) {
    details.cause = redactStartupValue(errorMessage(error.cause), config);
  }

  return details;
}

function isErrorWithCode(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function redactStartupValue(value: string, config?: ReturnType<typeof loadConfig>): string {
  const secrets = [
    config?.DATABASE_URL ?? process.env.DATABASE_URL,
    config?.REDIS_URL ?? process.env.REDIS_URL,
    config?.SMTP_USER ?? process.env.SMTP_USER,
    config?.SMTP_PASSWORD ?? process.env.SMTP_PASSWORD,
    config?.ELASTICSEARCH_API_KEY ?? process.env.ELASTICSEARCH_API_KEY,
    config?.ELASTICSEARCH_USERNAME ?? process.env.ELASTICSEARCH_USERNAME,
    config?.ELASTICSEARCH_PASSWORD ?? process.env.ELASTICSEARCH_PASSWORD,
    config?.SESSION_SECRET ?? process.env.SESSION_SECRET,
    config?.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET,
    config?.SLACK_CLIENT_SECRET ?? process.env.SLACK_CLIENT_SECRET,
  ].filter((secret): secret is string => Boolean(secret));

  return secrets.reduce((result, secret) => result.replaceAll(secret, '[REDACTED]'), value);
}

function closeHealthServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

main().catch((error: unknown) => {
  createLogger('worker').error('Worker startup failed', startupErrorDetails(error));
  process.exit(1);
});
