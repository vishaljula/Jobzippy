import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';

import { exchangeAuthorizationCode, refreshAccessToken } from '../services/google-oauth.js';
import { oauthExchangeSchema, oauthRefreshSchema } from '../schemas/oauth.js';

export const oauthRouter = Router();

oauthRouter.post('/exchange', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = oauthExchangeSchema.parse(req.body);
    const tokens = await exchangeAuthorizationCode(payload);
    res.status(200).json(tokens);
  } catch (error) {
    next(error);
  }
});

oauthRouter.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = oauthRefreshSchema.parse(req.body);
    const tokens = await refreshAccessToken(payload.refresh_token);
    res.status(200).json(tokens);
  } catch (error) {
    next(error);
  }
});

