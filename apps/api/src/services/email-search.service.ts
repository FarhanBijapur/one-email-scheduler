import { EmailSearchIndexService } from '@one/shared';
import { ApiError } from '../lib/api-error.js';

export type EmailSearchInput = {
  q?: string;
  status?: string;
  page: number;
  limit: number;
};

export class EmailSearchService {
  constructor(private readonly emailSearchIndexService: EmailSearchIndexService) {}

  async search(userId: string, input: EmailSearchInput) {
    try {
      const { results, total } = await this.emailSearchIndexService.searchEmails({ userId, ...input });
      return {
        results: results.map((email) => ({
          emailId: email.emailId,
          batchId: email.batchId,
          recipient: email.recipient,
          sender: email.sender,
          subject: email.subject,
          body: email.body,
          status: email.status,
          plannedSendAt: email.plannedSendAt,
          sentAt: email.sentAt,
          sequenceIndex: email.sequenceIndex,
        })),
        pagination: {
          page: input.page,
          limit: input.limit,
          total,
          totalPages: Math.ceil(total / input.limit),
        },
      };
    } catch {
      throw new ApiError(503, 'Email search is temporarily unavailable');
    }
  }
}
