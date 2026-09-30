import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from '@one/shared';
import { AuthError } from '../auth/auth-error.js';
import { SlackOAuthService } from '../services/slack-oauth.service.js';

export class SlackController {
  constructor(
    private readonly slackOAuthService: SlackOAuthService,
    private readonly config: AppConfig,
  ) {}

  connect = (request: Request, response: Response, next: NextFunction): void => {
    void this.startConnection(request, response, next);
  };

  callback = (request: Request, response: Response, next: NextFunction): void => {
    void this.completeConnection(request, response, next);
  };

  status = (request: Request, response: Response, next: NextFunction): void => {
    void this.getStatus(request, response, next);
  };

  disconnect = (request: Request, response: Response, next: NextFunction): void => {
    void this.disconnectConnection(request, response, next);
  };

  private async startConnection(request: Request, response: Response, next: NextFunction): Promise<void> {
    try {
      response.redirect(302, await this.slackOAuthService.startConnection(request.auth!.user.id));
    } catch (error) {
      next(error);
    }
  }

  private async completeConnection(request: Request, response: Response, next: NextFunction): Promise<void> {
    try {
      const state = queryValue(request.query.state);
      if (!state) {
        throw new AuthError(400, 'Invalid Slack connection callback');
      }

      if (queryValue(request.query.error)) {
        await this.slackOAuthService.rejectConnection(state);
        response.redirect(302, this.webRedirect('slack=denied'));
        return;
      }

      const code = queryValue(request.query.code);
      if (!code) {
        throw new AuthError(400, 'Invalid Slack connection callback');
      }

      await this.slackOAuthService.completeConnection(code, state);
      response.redirect(302, this.webRedirect('slack=connected'));
    } catch (error) {
      next(error);
    }
  }

  private async getStatus(request: Request, response: Response, next: NextFunction): Promise<void> {
    try {
      response.json(await this.slackOAuthService.getStatus(request.auth!.user.id));
    } catch (error) {
      next(error);
    }
  }

  private async disconnectConnection(request: Request, response: Response, next: NextFunction): Promise<void> {
    try {
      await this.slackOAuthService.disconnect(request.auth!.user.id);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  }

  private webRedirect(query: string): string {
    return `${this.config.WEB_URL.replace(/\/$/, '')}/dashboard?${query}`;
  }
}

function queryValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
