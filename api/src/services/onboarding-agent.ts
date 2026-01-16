import type { ProfileVault } from '../types/intake.js';
import { OPENAI_MODEL, openaiClient } from './openai-client.js';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface OnboardingAgentPayload {
  conversation: ConversationMessage[];
  knownFields?: Partial<ProfileVault>;
  missingFields: string[];
}

export interface OnboardingAgentResponse {
  reply: string;
  updates: Array<{ path: string; value: string }>;
  requestedField?: string | null;
  quickReplies?: string[];
}

type OpenAIResponsesClient = NonNullable<typeof openaiClient>['responses'];
type OpenAIResponsesCreate = Awaited<ReturnType<OpenAIResponsesClient['create']>>;
type OpenAIResponsesCreateParams = Parameters<OpenAIResponsesClient['create']>[0];

// LinkedIn-aligned onboarding fields (MVP1) - Just 5 questions!
const ONBOARDING_FIELD_GUIDANCE = [
  {
    path: 'profile.preferences.target_roles',
    label: 'Target job roles',
    question: 'What roles are you looking for?',
    instructions: 'Extract job titles. Expand abbreviations (SWE → Software Engineer, PM → Product Manager). Return as comma-separated list.',
  },
  {
    path: 'profile.preferences.experience_level',
    label: 'Experience level',
    question: "What's your experience level?",
    instructions: `Map user response to one of: internship, entry, associate, mid_senior, director, executive.
    
Mapping guide:
- "fresh grad", "0-2 years", "junior" → entry
- "2-5 years", "mid-level" → associate
- "5-10 years", "senior", "lead" → mid_senior
- "10+ years", "VP", "head of" → director
- "C-level", "chief", "executive" → executive
- "intern", "student" → internship`,
    quickReplies: ['Entry level', 'Mid-level', 'Senior', 'Director+'],
  },
  {
    path: 'profile.preferences.job_type',
    label: 'Job type',
    question: 'Full-time, part-time, or contract?',
    instructions: 'Map to one of: full_time, part_time, contract, internship. "permanent" = full_time, "gig" = contract.',
    quickReplies: ['Full-time', 'Part-time', 'Contract', 'Internship'],
  },
  {
    path: 'profile.preferences.work_arrangement',
    label: 'Work arrangement',
    question: 'Remote, hybrid, or on-site?',
    instructions: 'Map to one of: remote, hybrid, onsite, any. "WFH" = remote, "flexible" = hybrid, "in office" = onsite.',
    quickReplies: ['Remote', 'Hybrid', 'On-site', 'Any'],
  },
  {
    path: 'profile.preferences.locations',
    label: 'Preferred locations',
    question: 'Where do you want to work?',
    instructions: 'Normalize city names (SF → San Francisco, NYC → New York). Comma-separated list. If user says "remote anywhere", return ["Remote"].',
  },
] as const;

const ONBOARDING_RESPONSE_SCHEMA = {
  name: 'OnboardingAgentResponse',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['reply', 'updates', 'requested_field', 'quick_replies'],
    properties: {
      reply: { type: 'string', description: 'Short message to show the user. Keep under 15 words.' },
      updates: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['path', 'value'],
          properties: {
            path: { type: 'string', description: 'Path of the field being updated.' },
            value: {
              type: 'string',
              description: 'Canonical value for the field. Use string even for numbers/booleans.',
            },
          },
        },
      },
      requested_field: {
        type: ['string', 'null'],
        description: 'Path of the field you are currently asking about, if any.',
      },
      quick_replies: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional quick reply buttons to show. Use for job_type and work_arrangement fields.',
      },
    },
  },
} as const;

export async function runOnboardingAgent(
  payload: OnboardingAgentPayload
): Promise<OnboardingAgentResponse> {
  if (!openaiClient) {
    return buildFallbackResponse(
      "I'm still setting up the onboarding agent. Please upload your resume and I'll catch up shortly."
    );
  }

  const systemPrompt = buildOnboardingSystemPrompt();
  const userPrompt = buildOnboardingUserPrompt(payload);

  try {
    const response = await openaiClient.responses.create({
      model: OPENAI_MODEL,
      instructions: systemPrompt,
      input: userPrompt,
      text: {
        format: {
          type: 'json_schema',
          name: ONBOARDING_RESPONSE_SCHEMA.name,
          schema: ONBOARDING_RESPONSE_SCHEMA.schema,
          strict: true,
        },
      } satisfies OpenAIResponsesCreateParams['text'],
    });

    const parsed = extractResponsePayload(response);
    return {
      reply:
        parsed?.reply ??
        "Got it! What's next on your list?",
      updates: Array.isArray(parsed?.updates) ? parsed.updates : [],
      requestedField: parsed?.requested_field ?? null,
      quickReplies: Array.isArray(parsed?.quick_replies) ? parsed.quick_replies : undefined,
    };
  } catch (error) {
    console.warn('[OnboardingAgent] Failed to generate response', error);
    return buildFallbackResponse(
      "I hit a snag interpreting that. Could you rephrase or try again in a moment?"
    );
  }
}

function buildOnboardingSystemPrompt(): string {
  return [
    "You are Jobzippy's onboarding assistant. Your job is to quickly collect 5 job search preferences to set up LinkedIn filters.",
    '',
    'RULES:',
    '1. Ask ONE short question at a time. Keep questions under 10 words.',
    '2. When user answers, normalize the value per field_guidance instructions and add to updates array.',
    '3. For job_type and work_arrangement, include quickReplies array with the suggested options.',
    '4. Map experience to LinkedIn levels (entry/associate/mid_senior/director/executive).',
    '5. Expand abbreviations: SWE→Software Engineer, PM→Product Manager, SF→San Francisco.',
    '6. If user says "later", acknowledge and wait.',
    '',
    'QUESTION STYLE:',
    '- Good: "What roles are you targeting?"',
    '- Bad: "That\'s great! Now I\'d love to know what kind of positions you\'re interested in applying for."',
    '',
    'Be direct and efficient. Users want to finish onboarding fast.',
  ].join('\n');
}

function buildOnboardingUserPrompt(payload: OnboardingAgentPayload): string {
  const envelope = {
    conversation: payload.conversation.slice(-10),
    known_fields: payload.knownFields ?? {},
    missing_fields: payload.missingFields,
    field_guidance: ONBOARDING_FIELD_GUIDANCE,
  };
  return JSON.stringify(envelope, null, 2);
}

function extractResponsePayload(response: OpenAIResponsesCreate):
  | {
      reply?: string;
      updates?: Array<{ path: string; value: string }>;
      requested_field?: string;
    }
  | null {
  const raw = extractTextFromResponse(response);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn('[OnboardingAgent] Failed to parse OpenAI response', error, raw);
    return null;
  }
}

function extractTextFromResponse(response: OpenAIResponsesCreate): string | null {
  const segments: string[] = [];
  const output = (response as { output?: Array<{ content?: Array<{ type: string; text?: unknown }> }> }).output;

  if (Array.isArray(output)) {
    for (const item of output) {
      if (!item?.content) continue;
      for (const piece of item.content) {
        if (!piece) continue;
        if (piece.type === 'output_text' && Array.isArray(piece.text)) {
          segments.push(piece.text.join('').trim());
        } else if ('text' in piece) {
          const textValue = piece.text;
          if (typeof textValue === 'string') {
            segments.push(textValue.trim());
          } else if (Array.isArray(textValue)) {
            segments.push(textValue.join('').trim());
          } else if (typeof textValue === 'object' && textValue && 'value' in (textValue as Record<string, unknown>)) {
            const value = (textValue as { value?: unknown }).value;
            if (typeof value === 'string') {
              segments.push(value.trim());
            }
          }
        }
      }
    }
  }

  const fallbackText = typeof (response as { output_text?: unknown }).output_text === 'string'
    ? ((response as { output_text?: string }).output_text ?? '').trim()
    : '';

  const combined = segments.join('').trim() || fallbackText;
  return combined || null;
}

function buildFallbackResponse(message: string): OnboardingAgentResponse {
  return {
    reply: message,
    updates: [],
    requestedField: null,
  };
}

