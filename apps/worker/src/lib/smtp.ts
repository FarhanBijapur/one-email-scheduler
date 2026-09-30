import type { AppConfig } from '@one/shared';
import nodemailer, { type Transporter } from 'nodemailer';

export function createSmtpTransport(config: AppConfig, maxConnections: number): Transporter {
  if (!config.SMTP_USER || !config.SMTP_PASSWORD) {
    throw new Error('SMTP_USER and SMTP_PASSWORD must be configured before starting the delivery worker');
  }

  return nodemailer.createTransport({
    pool: true,
    maxConnections,
    maxMessages: 100,
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: {
      user: config.SMTP_USER,
      pass: config.SMTP_PASSWORD,
    },
  });
}
