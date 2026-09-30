import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from '@one/shared';
import { AuthError } from '../auth/auth-error.js';
import { AuthService } from '../auth/auth.service.js';
import { clearSessionCookie, getSessionId, setSessionCookie } from '../auth/session-cookie.js';

export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: AppConfig,
  ) {}

  startGoogle = (request: Request, response: Response, next: NextFunction): void => {
    void this.startGoogleOAuth(request, response, next);
  };

  googleCallback = (request: Request, response: Response, next: NextFunction): void => {
    void this.completeGoogleOAuth(request, response, next);
  };

  me = (request: Request, response: Response): void => {
    const { user } = request.auth!;
    response.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
    });
  };

  logout = (request: Request, response: Response, next: NextFunction): void => {
    void this.logoutSession(request, response, next);
  };

  private async startGoogleOAuth(_request: Request, response: Response, next: NextFunction): Promise<void> {
    try {
      response.redirect(302, await this.authService.startGoogleOAuth());
    } catch (error) {
      next(error);
    }
  }

  private async completeGoogleOAuth(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const code = queryValue(request.query.code);
      const state = queryValue(request.query.state);
      if (!code || !state) {
        throw new AuthError(400, 'Invalid Google authentication callback');
      }

      const { session } = await this.authService.completeGoogleOAuth(code, state);
      setSessionCookie(response, session.id, session.expiresAt, this.config);
      response.redirect(302, `${this.config.WEB_URL.replace(/\/$/, '')}/dashboard`);
    } catch (error) {
      next(error);
    }
  }

  private async logoutSession(request: Request, response: Response, next: NextFunction): Promise<void> {
    try {
      await this.authService.logout(getSessionId(request));
      clearSessionCookie(response, this.config);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  }
}

function queryValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
