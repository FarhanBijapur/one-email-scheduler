import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());
const booleanFromEnvironment = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
  }
  return value;
}, z.boolean().default(false));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_URL: z.string().url().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1).default('postgres://one:one@localhost:5432/one'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  ELASTICSEARCH_URL: z.string().min(1).default('http://localhost:9200'),
  ELASTICSEARCH_API_KEY: optionalString,
  ELASTICSEARCH_USERNAME: optionalString,
  ELASTICSEARCH_PASSWORD: optionalString,

  SESSION_SECRET: z.string().min(16).default('dev-only-change-me-use-a-long-random-string'),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().max(24 * 365).default(168),
  OAUTH_STATE_TTL_SECONDS: z.coerce.number().int().positive().max(3600).default(600),

  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_CALLBACK_URL: z.string().default('http://localhost:3001/auth/google/callback'),

  SLACK_CLIENT_ID: optionalString,
  SLACK_CLIENT_SECRET: optionalString,
  SLACK_REDIRECT_URI: z.string().url().default('http://localhost:3001/api/slack/callback'),
  SLACK_OAUTH_AUTHORIZE_URL: z.string().url().default('https://slack.com/oauth/v2/authorize'),
  SLACK_API_URL: z.string().url().default('https://slack.com/api/'),

  SMTP_HOST: z.string().default('smtp.ethereal.email'),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  SMTP_SECURE: booleanFromEnvironment,
  SMTP_FROM: optionalString,
  RESEND_API_KEY: optionalString,
  RESEND_FROM: optionalString,

  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
});

export type AppConfig = z.infer<typeof envSchema>;

function findMonorepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(resolve(dir, 'docker-compose.yml')) && existsSync(resolve(dir, 'package.json'))) {
      return dir;
    }
    dir = resolve(dir, '..');
  }
  return process.cwd();
}

function loadEnvFiles(): void {
  const root = findMonorepoRoot();
  const fromRoot = resolve(root, '.env');
  const fromCwd = resolve(process.cwd(), '.env');
  if (existsSync(fromRoot)) {
    dotenv.config({ path: fromRoot });
  }
  if (fromCwd !== fromRoot && existsSync(fromCwd)) {
    dotenv.config({ path: fromCwd, override: true });
  }
}

let cached: AppConfig | undefined;

export function loadConfig(): AppConfig {
  if (cached) {
    return cached;
  }

  loadEnvFiles();

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid environment configuration: ${JSON.stringify(details)}`);
  }

  const config = parsed.data;

  if (Boolean(config.ELASTICSEARCH_USERNAME) !== Boolean(config.ELASTICSEARCH_PASSWORD)) {
    throw new Error('ELASTICSEARCH_USERNAME and ELASTICSEARCH_PASSWORD must be set together');
  }

  if (Boolean(config.SLACK_CLIENT_ID) !== Boolean(config.SLACK_CLIENT_SECRET)) {
    throw new Error('SLACK_CLIENT_ID and SLACK_CLIENT_SECRET must be set together');
  }

  if (config.NODE_ENV === 'production') {
    const missing: string[] = [];
    for (const key of ['DATABASE_URL', 'REDIS_URL', 'ELASTICSEARCH_URL', 'SESSION_SECRET'] as const) {
      if (!process.env[key]) {
        missing.push(key);
      }
    }
    if (missing.length > 0) {
      throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
    }
  }

  cached = config;
  return cached;
}

export function getOptionalIntegrations(config: AppConfig) {
  return {
    googleOAuthConfigured: Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET),
    slackOAuthConfigured: Boolean(config.SLACK_CLIENT_ID && config.SLACK_CLIENT_SECRET),
    smtpConfigured: Boolean(config.SMTP_USER && config.SMTP_PASSWORD),
  };
}
