import {
  createBullMQConnection,
  createEmailSendQueue,
  createLogger,
  EmailSearchIndexService,
  getOptionalIntegrations,
  loadConfig,
  SlackClient,
  SlackRepository,
} from '@one/shared';
import { createApp } from './app.js';
import { AuthService } from './auth/auth.service.js';
import { GoogleOAuthProvider } from './auth/google-oauth.provider.js';
import { OAuthStateStore } from './auth/oauth-state.store.js';
import { SlackOAuthStateStore } from './auth/slack-oauth-state.store.js';
import { createPrismaClient, pingDatabase } from './lib/db.js';
import { createElasticsearchClient, pingElasticsearch } from './lib/elasticsearch.js';
import { createRedisClient, pingRedis } from './lib/redis.js';
import { SessionRepository } from './repositories/session.repository.js';
import { UserRepository } from './repositories/user.repository.js';
import { EmailQueueService } from './services/email-queue.service.js';
import { SlackOAuthService } from './services/slack-oauth.service.js';

const config = loadConfig();
const logger = createLogger('api');

const db = createPrismaClient();
const redis = createRedisClient(config);
const elasticsearch = createElasticsearchClient(config);
const bullmqConnection = createBullMQConnection(config, 'producer');
const emailSendQueue = createEmailSendQueue(bullmqConnection);
const authService = new AuthService(
  new UserRepository(db),
  new SessionRepository(db),
  new GoogleOAuthProvider(config),
  new OAuthStateStore(redis, config.OAUTH_STATE_TTL_SECONDS),
  config.SESSION_TTL_HOURS,
);
const slackOAuthService = new SlackOAuthService(
  new SlackRepository(db),
  new SlackClient(config),
  new SlackOAuthStateStore(redis, config.OAUTH_STATE_TTL_SECONDS),
);

const app = createApp({
  config,
  authService,
  prisma: db,
  emailQueueService: new EmailQueueService(emailSendQueue),
  emailSendQueue,
  emailSearchIndexService: new EmailSearchIndexService(elasticsearch),
  slackOAuthService,
});

const port = process.env.PORT ? Number(process.env.PORT) : config.API_PORT;

const server = app.listen(port, config.API_HOST, () => {
  const integrations = getOptionalIntegrations(config);
  logger.info(`API listening on http://${config.API_HOST}:${port}`, {
    integrations,
  });
});

void (async () => {
  const postgresOk = await pingDatabase(db);
  const redisOk = await pingRedis(redis);
  const elasticsearchOk = await pingElasticsearch(elasticsearch);
  logger.info('Infrastructure ping', { postgresOk, redisOk, elasticsearchOk });
})();

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down`);
  server.close();
  await Promise.allSettled([
    db.$disconnect(),
    redis.quit(),
    emailSendQueue.close(),
    bullmqConnection.quit(),
    elasticsearch.close(),
  ]);
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
