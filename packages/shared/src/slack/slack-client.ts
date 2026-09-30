import { WebClient } from '@slack/web-api';
import type { AppConfig } from '../config.js';

export const SLACK_OAUTH_SCOPES = ['chat:write'] as const;

export type SlackOAuthInstallation = {
  accessToken: string;
  teamId: string;
  teamName: string | null;
  slackUserId: string;
};

type SlackOAuthResponse = {
  ok?: unknown;
  access_token?: unknown;
  team?: { id?: unknown; name?: unknown };
  authed_user?: { id?: unknown };
};

export class SlackClient {
  constructor(private readonly config: AppConfig) {}

  createAuthorizationUrl(state: string): string {
    if (!this.config.SLACK_CLIENT_ID || !this.config.SLACK_CLIENT_SECRET) {
      throw new Error('Slack OAuth is not configured');
    }

    const url = new URL(this.config.SLACK_OAUTH_AUTHORIZE_URL);
    url.searchParams.set('client_id', this.config.SLACK_CLIENT_ID);
    url.searchParams.set('redirect_uri', this.config.SLACK_REDIRECT_URI);
    url.searchParams.set('scope', SLACK_OAUTH_SCOPES.join(','));
    url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeCode(code: string): Promise<SlackOAuthInstallation> {
    if (!this.config.SLACK_CLIENT_ID || !this.config.SLACK_CLIENT_SECRET) {
      throw new Error('Slack OAuth is not configured');
    }

    const response = (await this.client().oauth.v2.access({
      client_id: this.config.SLACK_CLIENT_ID,
      client_secret: this.config.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: this.config.SLACK_REDIRECT_URI,
    })) as SlackOAuthResponse;

    if (
      response.ok !== true ||
      typeof response.access_token !== 'string' ||
      typeof response.team?.id !== 'string' ||
      typeof response.authed_user?.id !== 'string'
    ) {
      throw new Error('Slack OAuth returned an invalid installation response');
    }

    return {
      accessToken: response.access_token,
      teamId: response.team.id,
      teamName: typeof response.team.name === 'string' ? response.team.name : null,
      slackUserId: response.authed_user.id,
    };
  }

  async postMessage(accessToken: string, channel: string, text: string): Promise<void> {
    await this.client(accessToken).chat.postMessage({ channel, text });
  }

  async revokeToken(accessToken: string): Promise<void> {
    await this.client(accessToken).auth.revoke();
  }

  private client(accessToken?: string): WebClient {
    return new WebClient(accessToken, {
      slackApiUrl: this.config.SLACK_API_URL,
      timeout: 5_000,
    });
  }
}
