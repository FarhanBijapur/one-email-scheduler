import type { Session, User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        session: Session;
        user: User;
      };
    }
  }
}

export {};
