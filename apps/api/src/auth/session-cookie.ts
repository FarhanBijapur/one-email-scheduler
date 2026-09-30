import type { CookieOptions, Request, Response } from 'express';
import type { AppConfig } from '@one/shared';

export const SESSION_COOKIE_NAME = 'session_id';

export function getSessionId(request: Request): string | undefined {
  const header = request.headers.cookie;
  if (!header) {
    return undefined;
  }

  for (const value of header.split(';')) {
    const [name, ...parts] = value.trim().split('=');
    if (name === SESSION_COOKIE_NAME) {
      const encoded = parts.join('=');
      if (!encoded) {
        return undefined;
      }
      try {
        return decodeURIComponent(encoded);
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}

export function setSessionCookie(
  response: Response,
  sessionId: string,
  expiresAt: Date,
  config: AppConfig,
): void {
  response.cookie(SESSION_COOKIE_NAME, sessionId, sessionCookieOptions(config, expiresAt));
}

export function clearSessionCookie(response: Response, config: AppConfig): void {
  response.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions(config));
}

function sessionCookieOptions(config: AppConfig, expires?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(expires ? { expires } : {}),
  };
}
