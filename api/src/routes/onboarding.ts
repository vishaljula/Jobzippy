import { Router } from 'express';

import { onboardingChatRequestSchema } from '../schemas/onboarding.js';
import { runOnboardingAgent } from '../services/onboarding-agent.js';

export const onboardingRouter = Router();

onboardingRouter.post('/chat', async (req, res, next) => {
  try {
    const parsed = onboardingChatRequestSchema.parse(req.body);
    const result = await runOnboardingAgent({
      conversation: parsed.conversation,
      knownFields: parsed.knownFields,
      missingFields: parsed.missingFields,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

