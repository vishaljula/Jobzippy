import cors from 'cors';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { config } from './config.js';
import { oauthRouter } from './routes/oauth.js';
import { GoogleOAuthError } from './services/google-oauth.js';

const app = express();

const allowedOrigins = config.security.allowedOrigins;
const isProduction = process.env.NODE_ENV === 'production';

function matchesAllowedOrigin(origin: string, allowed: string): boolean {
  if (allowed === '*') {
    return !isProduction;
  }

  if (allowed === origin) {
    return true;
  }

  if (allowed.endsWith('*')) {
    if (isProduction) {
      return false;
    }
    const prefix = allowed.slice(0, -1);
    return origin.startsWith(prefix);
  }

  return false;
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0) {
        callback(null, origin ?? true);
        return;
      }

      const isAllowed = allowedOrigins.some((allowed) =>
        origin ? matchesAllowedOrigin(origin, allowed) : false,
      );

      if (isAllowed) {
        callback(null, origin ?? true);
        return;
      }
      callback(new Error('Origin not allowed by CORS'));
    },
    credentials: false,
  }),
);

app.use(express.json());

app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/oauth/google', oauthRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'invalid_request',
      message: 'Validation failed',
      details: err.flatten(),
    });
    return;
  }

  if (err instanceof Error && err.message === 'Origin not allowed by CORS') {
    res.status(403).json({ error: 'forbidden', message: err.message });
    return;
  }

  if (err instanceof GoogleOAuthError) {
    res.status(err.status).json({ error: 'oauth_error', message: err.message });
    return;
  }

  console.error('[API] Unhandled error', err);
  res.status(500).json({ error: 'internal_error', message: 'Unexpected server error' });
});

export default app;

