import { Client, errors, type estypes } from '@elastic/elasticsearch';
import type { AppConfig } from '../config.js';
import { createLogger } from '../logger.js';

export const EMAIL_SEARCH_INDEX = 'emails';

export type EmailSearchDocument = {
  emailId: string;
  batchId: string;
  userId: string;
  recipient: string;
  sender: string;
  subject: string;
  body: string;
  status: string;
  plannedSendAt: string;
  sentAt: string | null;
  sequenceIndex: number;
  createdAt: string;
};

export type EmailSearchIndexInput = {
  id: string;
  batchId: string;
  userId: string;
  recipient: string;
  sender: string;
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
  status: string;
  plannedSendAt: Date;
  sentAt: Date | null;
  sequenceIndex: number;
  createdAt: Date;
};

export type EmailSearchQuery = {
  userId: string;
  q?: string;
  status?: string;
  page: number;
  limit: number;
};

export type EmailSearchResult = {
  results: EmailSearchDocument[];
  total: number;
};

export const EMAIL_SEARCH_INDEX_MAPPINGS = {
  dynamic: 'strict' as const,
  properties: {
    emailId: { type: 'keyword' as const },
    batchId: { type: 'keyword' as const },
    userId: { type: 'keyword' as const },
    recipient: {
      type: 'keyword' as const,
      fields: { text: { type: 'text' as const } },
    },
    sender: {
      type: 'keyword' as const,
      fields: { text: { type: 'text' as const } },
    },
    subject: { type: 'text' as const },
    body: { type: 'text' as const },
    status: { type: 'keyword' as const },
    plannedSendAt: { type: 'date' as const },
    sentAt: { type: 'date' as const },
    sequenceIndex: { type: 'integer' as const },
    createdAt: { type: 'date' as const },
  },
};

export function createElasticsearchClient(config: AppConfig): Client {
  const auth = config.ELASTICSEARCH_USERNAME
    ? {
        username: config.ELASTICSEARCH_USERNAME,
        password: config.ELASTICSEARCH_PASSWORD!,
      }
    : undefined;

  return new Client({ node: config.ELASTICSEARCH_URL, auth });
}

export async function pingElasticsearch(client: Client): Promise<boolean> {
  try {
    return await client.ping();
  } catch {
    return false;
  }
}

/**
 * Creates the index only when absent. Existing mappings are deliberately left
 * untouched: changing an indexed mapping requires an explicit migration plan.
 */
export async function ensureEmailSearchIndex(client: Client): Promise<void> {
  const exists = await client.indices.exists({ index: EMAIL_SEARCH_INDEX });
  if (exists) {
    return;
  }

  try {
    await client.indices.create({
      index: EMAIL_SEARCH_INDEX,
      mappings: EMAIL_SEARCH_INDEX_MAPPINGS,
    });
  } catch (error) {
    if (isResourceAlreadyExistsError(error)) {
      return;
    }
    throw error;
  }
}

export function toEmailSearchDocument(email: EmailSearchIndexInput): EmailSearchDocument {
  return {
    emailId: email.id,
    batchId: email.batchId,
    userId: email.userId,
    recipient: email.recipient,
    sender: email.sender,
    subject: email.subject,
    body: email.bodyText ?? email.bodyHtml,
    status: email.status,
    plannedSendAt: email.plannedSendAt.toISOString(),
    sentAt: email.sentAt?.toISOString() ?? null,
    sequenceIndex: email.sequenceIndex,
    createdAt: email.createdAt.toISOString(),
  };
}

/**
 * This service never writes PostgreSQL. Strict methods log then rethrow ES
 * failures; the explicitly named best-effort method logs and preserves caller
 * progress for lifecycle synchronization.
 */
export class EmailSearchIndexService {
  private readonly logger = createLogger('email-search-index');

  constructor(private readonly client: Client) {}

  async indexEmail(email: EmailSearchIndexInput): Promise<void> {
    await this.indexEmails([email]);
  }

  async indexEmails(emails: readonly EmailSearchIndexInput[]): Promise<void> {
    if (emails.length === 0) {
      return;
    }

    const documents = emails.map(toEmailSearchDocument);

    try {
      await ensureEmailSearchIndex(this.client);
      const result = await this.client.bulk({
        operations: documents.flatMap((document) => [
          { index: { _index: EMAIL_SEARCH_INDEX, _id: document.emailId } },
          document,
        ]),
      });

      if (result.errors) {
        throw new Error('Elasticsearch rejected one or more email index operations');
      }
    } catch (error) {
      this.logger.error('Elasticsearch email indexing failed', {
        emailIds: documents.map((document) => document.emailId),
        batchIds: [...new Set(documents.map((document) => document.batchId))],
        userIds: [...new Set(documents.map((document) => document.userId))],
        error: error instanceof Error ? error.message : 'Unknown Elasticsearch error',
      });
      throw error;
    }
  }

  async indexEmailsBestEffort(emails: readonly EmailSearchIndexInput[]): Promise<void> {
    try {
      await this.indexEmails(emails);
    } catch {
      // indexEmails already emitted structured context for the failed operation.
    }
  }

  async searchEmails(query: EmailSearchQuery): Promise<EmailSearchResult> {
    const filters = [
      { term: { userId: query.userId } },
      ...(query.status ? [{ term: { status: query.status } }] : []),
    ];
    const textQuery = query.q
      ? {
          bool: {
            should: [
              {
                multi_match: {
                  query: query.q,
                  fields: ['subject^3', 'body', 'recipient.text^2', 'sender.text^2'],
                  type: 'best_fields' as const,
                },
              },
              { term: { recipient: query.q.toLowerCase() } },
              { term: { sender: query.q.toLowerCase() } },
            ],
            minimum_should_match: 1,
          },
        }
      : undefined;

    try {
      const sort: estypes.Sort = [
        { _score: { order: 'desc' } },
        { plannedSendAt: 'asc' },
        { emailId: 'asc' },
      ];
      const response = await this.client.search<EmailSearchDocument>({
        index: EMAIL_SEARCH_INDEX,
        from: (query.page - 1) * query.limit,
        size: query.limit,
        track_total_hits: true,
        query: {
          bool: {
            filter: filters,
            ...(textQuery ? { must: [textQuery] } : {}),
          },
        },
        sort,
      });
      const total = typeof response.hits.total === 'number'
        ? response.hits.total
        : response.hits.total?.value ?? 0;

      return {
        results: response.hits.hits.flatMap((hit) => (hit._source ? [hit._source] : [])),
        total,
      };
    } catch (error) {
      this.logger.error('Elasticsearch email search failed', {
        userId: query.userId,
        status: query.status ?? null,
        hasQuery: Boolean(query.q),
        error: error instanceof Error ? error.message : 'Unknown Elasticsearch error',
      });
      throw error;
    }
  }
}

function isResourceAlreadyExistsError(error: unknown): boolean {
  if (!(error instanceof errors.ResponseError)) {
    return false;
  }

  const body = error.meta.body;
  if (!body || typeof body !== 'object') {
    return false;
  }

  const errorBody = (body as { error?: unknown }).error;
  return Boolean(
    errorBody &&
      typeof errorBody === 'object' &&
      (errorBody as { type?: unknown }).type === 'resource_already_exists_exception',
  );
}
