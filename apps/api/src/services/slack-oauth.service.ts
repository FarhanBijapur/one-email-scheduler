import { SlackClient, SlackRepository, type SlackOAuthInstallation } from '@one/shared';
import { AuthError } from '../auth/auth-error.js';
import { SlackOAuthStateStore } from '../auth/slack-oauth-state.store.js';

export type SlackConnectionStatus =
  | { connected: false }
  | { connected: true; teamId: string; teamName: string | null; channelName: string | null };

export class SlackOAuthService {
  constructor(
    private readonly slackRepository: SlackRepository,
    private readonly slackClient: SlackClient,
    private readonly stateStore: SlackOAuthStateStore,
  ) {}

  async startConnection(userId: string): Promise<string> {
    const state = await this.stateStore.create(userId);
    try {
      return this.slackClient.createAuthorizationUrl(state);
    } catch {
      throw new AuthError(503, 'Slack OAuth is not configured');
    }
  }

  async completeConnection(code: string, state: string): Promise<void> {
    const userId = await this.stateStore.consume(state);
    if (!userId) {
      throw new AuthError(400, 'Invalid or expired Slack connection state');
    }

    let installation: SlackOAuthInstallation;
    try {
      installation = await this.slackClient.exchangeCode(code);
    } catch {
      throw new AuthError(401, 'Slack connection failed');
    }

    await this.slackRepository.upsertConnection({
      userId,
      teamId: installation.teamId,
      teamName: installation.teamName,
      accessToken: installation.accessToken,
      // A bot token with chat:write can use the installing user's App Home as its destination.
      channelId: installation.slackUserId,
      channelName: 'App Home',
    });
  }

  async rejectConnection(state: string): Promise<void> {
    if (!(await this.stateStore.consume(state))) {
      throw new AuthError(400, 'Invalid or expired Slack connection state');
    }
  }

  async getStatus(userId: string): Promise<SlackConnectionStatus> {
    const connection = await this.slackRepository.findActiveByUser(userId);
    if (!connection) {
      return { connected: false };
    }

    return {
      connected: true,
      teamId: connection.teamId,
      teamName: connection.teamName,
      channelName: connection.channelName,
    };
  }

  async disconnect(userId: string): Promise<void> {
    const connections = await this.slackRepository.findActiveForUser(userId);
    if (connections.length === 0) {
      return;
    }

    await Promise.allSettled(connections.map(({ accessToken }) => this.slackClient.revokeToken(accessToken)));
    await this.slackRepository.deleteByUser(userId);
  }
}
