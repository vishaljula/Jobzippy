import { z } from 'zod';

const chromiumRedirectPattern = /^https:\/\/[a-z0-9]{32}\.chromiumapp\.org\/$/i;

export const oauthExchangeSchema = z.object({
  code: z.string().min(1),
  code_verifier: z.string().min(43).max(128),
  redirect_uri: z
    .string()
    .url()
    .refine((value) => chromiumRedirectPattern.test(value), {
      message: 'Invalid Chrome extension redirect URI',
    }),
});

export type OAuthExchangeInput = z.infer<typeof oauthExchangeSchema>;

export const oauthRefreshSchema = z.object({
  refresh_token: z.string().min(10),
});

export type OAuthRefreshInput = z.infer<typeof oauthRefreshSchema>;

