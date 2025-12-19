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
}

type OpenAIResponsesClient = NonNullable<typeof openaiClient>['responses'];
type OpenAIResponsesCreate = Awaited<ReturnType<OpenAIResponsesClient['create']>>;
type OpenAIResponsesCreateParams = Parameters<OpenAIResponsesClient['create']>[0];

const ONBOARDING_FIELD_GUIDANCE = [
  {
    path: 'profile.identity.phone',
    label: 'Phone number',
    instructions: 'Digits only, include country/area code if provided.',
  },
  {
    path: 'profile.identity.address',
    label: 'Mailing address',
    instructions: 'City and state or region. Mention country if not in US.',
  },
  {
    path: 'profile.work_auth.visa_type',
    label: 'Visa / work authorization',
    instructions: 'Examples: H-1B, Green Card, F-1 OPT, US Citizen.',
  },
  {
    path: 'profile.work_auth.sponsorship_required',
    label: 'Sponsorship requirement',
    instructions: 'Is sponsorship needed now or in the future? yes/no.',
  },
  {
    path: 'profile.preferences.locations',
    label: 'Preferred locations',
    instructions: 'Comma-separated list or “Remote”.',
  },
  {
    path: 'profile.preferences.salary_min',
    label: 'Minimum salary',
    instructions: 'Numeric value (e.g., "150k"). If user gives a range, log the lower bound.',
  },
  {
    path: 'profile.preferences.salary_currency',
    label: 'Salary currency (ISO 4217)',
    instructions:
      'Pick the ISO currency code that matches the user’s stated location(s). Use USD if locations span multiple countries.',
  },
  {
    path: 'policies.salary',
    label: 'Salary question policy',
    instructions: 'answer / skip_if_optional / ask_if_required / never.',
  },
  {
    path: 'policies.relocation',
    label: 'Relocation policy',
    instructions: 'answer / skip_if_optional / ask_if_required / never.',
  },
  {
    path: 'compliance.veteran_status',
    label: 'Veteran status',
    instructions: 'yes / no / prefer_not. Before asking, check known_fields and recent conversation for an answer.',
  },
  {
    path: 'compliance.disability_status',
    label: 'Disability status',
    instructions: 'yes / no / prefer_not. Use the existing context if already provided.',
  },
  {
    path: 'compliance.criminal_history_policy',
    label: 'Criminal history policy',
    instructions:
      'answer / skip_if_optional / ask_if_required / never. Do not re-ask if the user has already answered.',
  },
] as const;

const ONBOARDING_RESPONSE_SCHEMA = {
  name: 'OnboardingAgentResponse',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['reply', 'updates', 'requested_field'],
    properties: {
      reply: { type: 'string', description: 'Message to show the user.' },
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
        "Thanks for the update! Could you share a bit more so I can finish setting up your profile?",
      updates: Array.isArray(parsed?.updates) ? parsed.updates : [],
      requestedField: parsed?.requested_field ?? null,
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
    "You are Jobzippy's onboarding assistant. You have a list of required profile fields that enable the agent to apply to jobs on behalf of the user.",
    'Your job is to hold a friendly, professional conversation to collect the remaining fields.',
    'When the user provides an answer, normalize it and include it in the `updates` array with the correct path.',
    'Only emit updates when you are confident about the value; otherwise ask precise follow-up questions.',
    'Be concise, one topic at a time. After covering contact info, move to preferences, then compliance/policies.',
    'Before asking a compliance or policy question, check known_fields and the latest conversation; if an answer already exists, acknowledge it and move on without repeating the question.',
    'Only re-open a compliance topic if the user says their previous answer was unclear or has changed.',
    'If the user says “later” or similar, simply acknowledge and wait for them to resume.',
  ].join(' ');
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

