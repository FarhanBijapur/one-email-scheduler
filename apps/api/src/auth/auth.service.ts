import { randomBytes } from 'node:crypto';
import type { Session, User } from '@prisma/client';
import { SessionRepository } from '../repositories/session.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import { AuthError } from './auth-error.js';
import { GoogleOAuthProvider, type GoogleIdentity } from './google-oauth.provider.js';
import { OAuthStateStore } from './oauth-state.store.js';

export type AuthenticatedSession = {
  session: Session;
  user: User;
};

export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly googleOAuth: GoogleOAuthProvider,
    private readonly oauthStateStore: OAuthStateStore,
    private readonly sessionTtlHours: number,
  ) {}

  async startGoogleOAuth(): Promise<string> {
    const state = await this.oauthStateStore.create();
    return this.googleOAuth.createAuthorizationUrl(state);
  }

  async completeGoogleOAuth(code: string, state: string): Promise<AuthenticatedSession> {
    if (!(await this.oauthStateStore.consume(state))) {
      throw new AuthError(400, 'Invalid or expired Google authentication state');
    }

    let identity: GoogleIdentity;
    try {
      identity = await this.googleOAuth.verifyIdentity(code);
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(401, 'Google authentication failed');
    }

    const user = await this.userRepository.upsertGoogleUser(identity);
    const expiresAt = new Date(Date.now() + this.sessionTtlHours * 60 * 60 * 1000);
    const session = await this.sessionRepository.create({
      id: randomBytes(32).toString('base64url'),
      userId: user.id,
      expiresAt,
    });

    return { session, user };
  }

  async authenticate(sessionId: string | undefined): Promise<AuthenticatedSession> {
    if (!sessionId) {
      throw new AuthError(401, 'Authentication required');
    }

    const session = await this.sessionRepository.findById(sessionId);
    if (!session) {
      throw new AuthError(401, 'Authentication required');
    }

    if (session.expiresAt <= new Date()) {
      await this.sessionRepository.deleteById(session.id);
      throw new AuthError(401, 'Session expired');
    }

    const user = await this.userRepository.findById(session.userId);
    if (!user) {
      await this.sessionRepository.deleteById(session.id);
      throw new AuthError(401, 'Authentication required');
    }

    return { session, user };
  }

  async logout(sessionId: string | undefined): Promise<void> {
    if (sessionId) {
      await this.sessionRepository.deleteById(sessionId);
    }
  }
}
