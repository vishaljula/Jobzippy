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

const isTestEnvironment = process.env.NODE_ENV === 'test';

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
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  // Firebase Admin
  FIREBASE_PROJECT_ID: z.string().min(1, 'FIREBASE_PROJECT_ID is required'),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  // Stripe
  STRIPE_SECRET_KEY: z.string().min(1, 'STRIPE_SECRET_KEY is required'),
  STRIPE_PRICE_ID: z.string().min(1, 'STRIPE_PRICE_ID is required'),
});

const parsed = envSchema.parse({
  GOOGLE_OAUTH_CLIENT_ID:
    process.env.GOOGLE_OAUTH_CLIENT_ID ?? (isTestEnvironment ? 'test-client' : undefined),
  GOOGLE_OAUTH_CLIENT_SECRET:
    process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? (isTestEnvironment ? 'test-secret' : undefined),
  GOOGLE_OAUTH_TOKEN_ENDPOINT:
    process.env.GOOGLE_OAUTH_TOKEN_ENDPOINT ?? 'https://oauth2.googleapis.com/token',
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  PORT: process.env.PORT ?? process.env.API_PORT ?? '8787',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ?? (isTestEnvironment ? 'test-project' : undefined),
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? (isTestEnvironment ? 'test-stripe-key' : undefined),
  STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID ?? (isTestEnvironment ? 'test-price-id' : undefined),
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
  openai: {
    apiKey: parsed.OPENAI_API_KEY,
  },
  anthropic: {
    apiKey: parsed.ANTHROPIC_API_KEY,
  },
  firebase: {
    projectId: parsed.FIREBASE_PROJECT_ID,
    privateKey: parsed.FIREBASE_PRIVATE_KEY,
    clientEmail: parsed.FIREBASE_CLIENT_EMAIL,
  },
  stripe: {
    secretKey: parsed.STRIPE_SECRET_KEY,
    priceId: parsed.STRIPE_PRICE_ID,
  },
} as const;

export type Config = typeof config;

