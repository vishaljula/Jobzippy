/**
 * OpenAI Chat client for onboarding conversation
 * Uses low-cost mini model (default gpt-4o-mini) configured via Vite env
 */
import type { ProfileVault } from '@/lib/types';
import { intakeAgentConfig } from '@/lib/intake';

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
    '- Prefer short, friendly phrasing. No long intros.',
    '- Start with a brief friendly greeting if the user greets (e.g., "Hey there!")',
    '- When multiple fields are missing, ask in small grouped sets (2-4 items) by section (e.g., contact, work auth, preferences, education).',
    '- Keep the message short and skimmable (bullets or comma-separated).',
    '- Use the human-friendly labels provided in missing_fields_labels; do not echo internal keys like "salary_min".',
    '- For preferences.salary_min, ask for a numeric USD amount (e.g., "$150k" or "150000").',
    '- For preferences.remote, ask as Yes/No.',
    '- For preferences.locations, ask for one or more cities/states.',
    '- Never invent data. If user declines, acknowledge and move on.',
    '- If everything is complete, instruct user to "Apply updates" or "Edit manually".',
  ].join(' ');
}

function labelForPath(path: string): string {
  const found = intakeAgentConfig.fieldMappings.find((m) => m.path === path);
  if (found?.label) return found.label;
  const last = path.split('.').slice(-1)[0] ?? path;
  return last.replace(/_/g, ' ');
}

function groupMissingFields(missingFields?: string[]) {
  const groups: Record<string, string[]> = {};
  (missingFields ?? []).forEach((path) => {
    let section = path.split('.')[0] ?? 'other';
    if (
      path.startsWith('profile.identity') ||
      path.startsWith('profile.work_auth') ||
      path.startsWith('profile.preferences')
    ) {
      section = 'profile';
    }
    groups[section] = groups[section] || [];
    groups[section].push(path);
  });
  return groups;
}

function groupMissingFieldsWithLabels(missingFields?: string[]) {
  const groups: Record<string, { path: string; label: string }[]> = {};
  (missingFields ?? []).forEach((path) => {
    let section = path.split('.')[0] ?? 'other';
    if (
      path.startsWith('profile.identity') ||
      path.startsWith('profile.work_auth') ||
      path.startsWith('profile.preferences')
    ) {
      section = 'profile';
    }
    groups[section] = groups[section] || [];
    groups[section].push({ path, label: labelForPath(path) });
  });
  return groups;
}

function buildUserEnvelope(knownFields?: Partial<ProfileVault>, missingFields?: string[]) {
  return JSON.stringify(
    {
      known_fields: knownFields ?? {},
      missing_fields: missingFields ?? [],
      missing_fields_grouped: groupMissingFields(missingFields),
      missing_fields_labels: (missingFields ?? []).map((p) => ({
        path: p,
        label: labelForPath(p),
      })),
      missing_fields_grouped_labels: groupMissingFieldsWithLabels(missingFields),
      instructions: [
        'Return ONLY a short natural language question or confirmation suitable for a chat bubble.',
        'If multiple fields are missing, group them by section and ask for 2-4 at once (e.g., "Let’s finish contact: last name, phone, address.").',
        'Use the provided human-friendly labels, not internal keys.',
        'Prefer bullets starting with a hyphen "-", or concise comma-separated prompts.',
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
