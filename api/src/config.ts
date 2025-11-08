import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

if (process.env.NODE_ENV !== 'test') {
  const projectRoot = resolve(process.cwd());
  const rootCandidates = [projectRoot, resolve(projectRoot, '..')];
  for (const root of rootCandidates) {
    const envPath = resolve(root, '.env');
    if (existsSync(envPath)) {
      loadEnv({ path: envPath, override: true });
      break;
    }
  }
}

const envSchema = z.object({
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1, 'GOOGLE_OAUTH_CLIENT_ID is required'),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1, 'GOOGLE_OAUTH_CLIENT_SECRET is required'),
  GOOGLE_OAUTH_TOKEN_ENDPOINT: z
    .string()
    .url()
    .default('https://oauth2.googleapis.com/token'),
  ALLOWED_ORIGINS: z.string().optional(),
  PORT: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : 8787))
    .pipe(z.number().int().positive()),
});

const parsed = envSchema.parse({
  GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_TOKEN_ENDPOINT:
    process.env.GOOGLE_OAUTH_TOKEN_ENDPOINT ?? 'https://oauth2.googleapis.com/token',
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  PORT: (process.env.PORT ?? process.env.API_PORT ?? '8787'),
});

const allowedOrigins = parsed.ALLOWED_ORIGINS
  ? parsed.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
  : [];

export const config = {
  google: {
    clientId: parsed.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: parsed.GOOGLE_OAUTH_CLIENT_SECRET,
    tokenEndpoint: parsed.GOOGLE_OAUTH_TOKEN_ENDPOINT,
  },
  server: {
    port: parsed.PORT,
  },
  security: {
    allowedOrigins,
  },
} as const;

export type Config = typeof config;

