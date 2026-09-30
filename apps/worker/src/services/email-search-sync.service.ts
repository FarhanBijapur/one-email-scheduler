import { createLogger, EmailRepository, EmailSearchIndexService } from '@one/shared';

type WorkerLogger = ReturnType<typeof createLogger>;

/**
 * Reads the committed PostgreSQL row before updating the Elasticsearch read
 * model. Search synchronization must never affect the delivery state machine.
 */
export class EmailSearchSyncService {
  constructor(
    private readonly emailRepository: EmailRepository,
    private readonly emailSearchIndexService: EmailSearchIndexService,
    private readonly logger: WorkerLogger,
  ) {}

  async indexPersistedEmail(emailId: string): Promise<void> {
    try {
      const email = await this.emailRepository.findById(emailId);
      if (!email) {
        this.logger.warn('Skipping Elasticsearch indexing for missing persisted email', { emailId });
        return;
      }

      await this.emailSearchIndexService.indexEmailsBestEffort([email]);
    } catch (error) {
      this.logger.error('Could not load persisted email for Elasticsearch indexing', {
        emailId,
        error: error instanceof Error ? error.message : 'Unknown database error',
      });
    }
  }
}
