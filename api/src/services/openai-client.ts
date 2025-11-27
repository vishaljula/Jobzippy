import OpenAI from 'openai';
import type { ClientOptions } from 'openai';

import { config } from '../config.js';

export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

export const openaiClient = (() => {
  if (!config.openai.apiKey) {
    return null;
  }

  const options: ClientOptions = {
    apiKey: config.openai.apiKey,
  };

  return new OpenAI(options);
})();

