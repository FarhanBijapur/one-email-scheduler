import type { NextFunction, Request, Response } from 'express';
import type { AuthService } from '../auth/auth.service.js';
import { getSessionId } from '../auth/session-cookie.js';

export function requireAuth(authService: AuthService) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    void authService
      .authenticate(getSessionId(request))
      .then((auth) => {
        request.auth = auth;
        next();
      })
      .catch(next);
  };
}
