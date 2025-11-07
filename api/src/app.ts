import cors from 'cors';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { config } from './config.js';
import { oauthRouter } from './routes/oauth.js';
import { GoogleOAuthError } from './services/google-oauth.js';

const app = express();

const allowedOrigins = config.security.allowedOrigins;

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
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

