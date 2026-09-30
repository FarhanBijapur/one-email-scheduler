export { loadConfig, getOptionalIntegrations, type AppConfig } from './config.js';
export { createLogger } from './logger.js';
export type { HealthResponse } from './types.js';
export {
  EmailRepository,
  type EmailCounts,
  type FindEmailsForUserOptions,
  type FindScheduledEmailsOptions,
  type PaginatedEmailQuery,
} from './repositories/email.repository.js';
export { SlackRepository, type UpsertSlackConnectionInput } from './repositories/slack.repository.js';
export { createBullMQConnection, type BullMQConnectionRole } from './queue/bullmq-connection.js';
export {
  createEmailSendQueue,
  EMAIL_SEND_BACKOFF_DELAY_MS,
  emailSendJobId,
  EMAIL_SEND_JOB_NAME,
  EMAIL_SEND_MAX_ATTEMPTS,
  EMAIL_SEND_QUEUE_NAME,
  type EmailSendJobData,
  type EmailSendQueue,
} from './queue/email-send.queue.js';
export {
  createElasticsearchClient,
  EMAIL_SEARCH_INDEX,
  EMAIL_SEARCH_INDEX_MAPPINGS,
  EmailSearchIndexService,
  ensureEmailSearchIndex,
  pingElasticsearch,
  toEmailSearchDocument,
  type EmailSearchDocument,
  type EmailSearchIndexInput,
  type EmailSearchQuery,
  type EmailSearchResult,
} from './search/email-search-index.js';
export { SlackClient, SLACK_OAUTH_SCOPES, type SlackOAuthInstallation } from './slack/slack-client.js';
