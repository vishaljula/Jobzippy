import { z } from 'zod';

const conversationMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
});

export const onboardingChatRequestSchema = z.object({
  conversation: z.array(conversationMessageSchema).min(1),
  knownFields: z.record(z.any()).optional(),
  missingFields: z.array(z.string()).default([]),
});

export type OnboardingChatRequestInput = z.infer<typeof onboardingChatRequestSchema>;

