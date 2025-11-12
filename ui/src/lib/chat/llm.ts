/**
 * OpenAI Chat client for onboarding conversation
 * Uses low-cost mini model (default gpt-4o-mini) configured via Vite env
 */
import type { ProfileVault } from '@/lib/types';

type ChatMessageRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatMessageRole;
  content: string;
}

interface ChatOptions {
  knownFields?: Partial<ProfileVault>;
  missingFields?: string[];
  model?: string;
  temperature?: number;
}

function getModel(): string {
  return import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini';
}

function getApiKey(): string | undefined {
  return import.meta.env.VITE_OPENAI_API_KEY;
}

function buildSystemPrompt(): string {
  return [
    "You are Jobzippy's Onboarding Assistant.",
    'Your job is to help the user complete their profile by asking precise, concise questions.',
    'Rules:',
    '- Ask only about fields listed in missing_fields.',
    '- Ask ONE question at a time.',
    '- Prefer short, friendly phrasing. No long intros.',
    '- Never invent data. If user declines, acknowledge and move on.',
    '- If everything is complete, instruct user to "Apply updates" or "Edit manually".',
  ].join(' ');
}

function buildUserEnvelope(knownFields?: Partial<ProfileVault>, missingFields?: string[]) {
  return JSON.stringify(
    {
      known_fields: knownFields ?? {},
      missing_fields: missingFields ?? [],
      instructions: [
        'Return ONLY a short natural language question or confirmation line suitable for a chat bubble.',
        'Do not include JSON or metadata; just the next question or confirmation.',
      ],
    },
    null,
    2
  );
}

export async function chatOnboarding(
  history: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  const apiKey = getApiKey();
  // Fallback: deterministic question for dev without key
  if (!apiKey) {
    const missing = options.missingFields ?? [];
    if (missing.length === 0) {
      return "Looks complete. Say 'Apply updates' to sync, or 'Edit manually' to tweak first.";
    }
    const next = missing[0] ?? 'profile.identity.first_name';
    const label = next.split('.').slice(-1)[0]?.replace(/_/g, ' ') ?? 'field';
    return `What is your ${label}?`;
  }

  const body = {
    model: options.model ?? getModel(),
    temperature: options.temperature ?? 0.2,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      ...history.map(({ role, content }) => ({ role, content })),
      {
        role: 'user',
        content: buildUserEnvelope(options.knownFields, options.missingFields),
      },
    ],
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || 'OpenAI chat request failed');
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('OpenAI chat response missing content');
  }
  return content;
}
