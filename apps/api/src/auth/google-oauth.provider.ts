import type { AppConfig } from '@one/shared';
import { OAuth2Client } from 'google-auth-library';
import { AuthError } from './auth-error.js';

const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

export type GoogleIdentity = {
  googleSub: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

export class GoogleOAuthProvider {
  constructor(private readonly config: AppConfig) {}

  createAuthorizationUrl(state: string): string {
    return this.client().generateAuthUrl({
      access_type: 'online',
      scope: ['openid', 'email', 'profile'],
      state,
    });
  }

  async verifyIdentity(code: string): Promise<GoogleIdentity> {
    const client = this.client();
    const tokenResponse = await client.getToken(code);
    const idToken = tokenResponse.tokens.id_token;

    if (!idToken) {
      throw new AuthError(401, 'Google authentication failed');
    }

    const ticket = await client.verifyIdToken({
      idToken,
      audience: this.config.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (
      !payload ||
      !payload.sub ||
      !payload.email ||
      payload.email_verified !== true ||
      !GOOGLE_ISSUERS.has(payload.iss)
    ) {
      throw new AuthError(401, 'Google authentication failed');
    }

    return {
      googleSub: payload.sub,
      email: payload.email,
      name: payload.name ?? null,
      avatarUrl: payload.picture ?? null,
    };
  }

  private client(): OAuth2Client {
    const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret, GOOGLE_CALLBACK_URL: redirectUri } =
      this.config;

    if (!clientId || !clientSecret) {
      throw new AuthError(503, 'Google authentication is not configured');
    }

    return new OAuth2Client(clientId, clientSecret, redirectUri);
  }
}
