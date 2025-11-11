import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { ClientOptions } from 'openai';
import { config } from '../config.js';
import type {
  IntakeLLMResponse,
  IntakeRequestBody,
  ResumeExtractionResult,
} from '../types/intake.js';
import { runHeuristicIntakeLLM } from './intake-heuristics.js';

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? 'claude-3-haiku-20240307';

const openaiClient = (() => {
  if (!config.openai.apiKey) {
    return null;
  }
  const options: ClientOptions = {
    apiKey: config.openai.apiKey,
  };
  return new OpenAI(options);
})();

const claudeClient = (() => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new Anthropic({ apiKey });
})();

const RESPONSE_SCHEMA = {
  name: 'IntakeLLMResponse',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      profile: {
        type: 'object',
        additionalProperties: false,
        required: ['identity', 'work_auth', 'preferences'],
        properties: {
          identity: {
            type: 'object',
            additionalProperties: false,
            required: ['first_name', 'last_name', 'email', 'phone', 'address'],
            properties: {
              first_name: { type: 'string' },
              last_name: { type: 'string' },
              email: { type: 'string' },
              phone: { type: 'string' },
              address: { type: 'string' },
            },
          },
          work_auth: {
            type: 'object',
            additionalProperties: false,
            required: ['visa_type', 'sponsorship_required'],
            properties: {
              visa_type: { type: 'string' },
              sponsorship_required: { type: 'boolean' },
            },
          },
          preferences: {
            type: 'object',
            additionalProperties: false,
            required: ['remote', 'locations', 'salary_min', 'start_date'],
            properties: {
              remote: { type: 'boolean' },
              locations: { type: 'array', items: { type: 'string' } },
              salary_min: { type: 'number' },
              start_date: { type: 'string' },
            },
          },
        },
      },
      compliance: {
        type: 'object',
        additionalProperties: false,
        required: ['veteran_status', 'disability_status', 'criminal_history_policy'],
        properties: {
          veteran_status: { type: 'string' },
          disability_status: { type: 'string' },
          criminal_history_policy: { type: 'string' },
        },
      },
      history: {
        type: 'object',
        additionalProperties: false,
        required: ['employment', 'education'],
        properties: {
          employment: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['company', 'title', 'start', 'end', 'duties', 'city', 'state'],
              properties: {
                company: { type: 'string' },
                title: { type: 'string' },
                start: { type: 'string' },
                end: { type: 'string' },
                duties: { type: 'string' },
                city: { type: 'string' },
                state: { type: 'string' },
              },
            },
          },
          education: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['school', 'degree', 'field', 'start', 'end'],
              properties: {
                school: { type: 'string' },
                degree: { type: 'string' },
                field: { type: 'string' },
                start: { type: 'string' },
                end: { type: 'string' },
              },
            },
          },
        },
      },
      policies: {
        type: 'object',
        additionalProperties: false,
        required: ['eeo', 'salary', 'relocation', 'work_shift'],
        properties: {
          eeo: { type: 'string' },
          salary: { type: 'string' },
          relocation: { type: 'string' },
          work_shift: { type: 'string' },
        },
      },
      previewSections: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'title', 'confidence', 'fields'],
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            confidence: { type: 'number' },
            fields: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'label', 'value'],
                properties: {
                  id: { type: 'string' },
                  label: { type: 'string' },
                  value: {
                    anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
                  },
                  highlight: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
      summary: { type: 'string' },
      confidence: { type: 'number' },
      followUpPrompt: { type: 'string' },
      warnings: { type: 'array', items: { type: 'string' } },
    },
    required: [
      'profile',
      'compliance',
      'history',
      'policies',
      'previewSections',
      'summary',
      'confidence',
    ],
  },
};

function buildSystemPrompt(): string {
  return [
    "You are Jobzippy's Intake Agent. Your job is to read resume text and conversational context, then return a structured JSON payload that fits the ProfileVault schema.",
    'Always respect fields that are already known unless the resume provides higher confidence data.',
    'If information is missing, leave the field empty but include notes in the summary or warnings array.',
    'Provide high-level summary bullet points and confidence estimates for each preview section.',
    'For followUpPrompt, use clear action-oriented language like: "Review the data above. Click Apply updates to save to your vault, or Edit manually to modify first."',
  ].join(' ');
}

function buildUserPrompt(payload: IntakeRequestBody): string {
  const envelope = {
    resume_text: payload.resumeText,
    resume_metadata: payload.resumeMetadata,
    conversation: payload.conversation,
    known_fields: payload.knownFields ?? {},
    missing_fields: payload.missingFields ?? [],
    instructions: [
      'Return JSON that strictly matches the IntakeLLMResponse schema.',
      'Populate previewSections with the most relevant insights (contact, skills, experience, education).',
      'Include followUpPrompt when additional confirmation from the user would be helpful.',
    ],
  };

  return JSON.stringify(envelope, null, 2);
}

function coerceNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function normaliseLLMResponse(payload: Partial<IntakeLLMResponse>): IntakeLLMResponse {
  const identity = payload.profile?.identity;
  const preferences = payload.profile?.preferences;
  const workAuth = payload.profile?.work_auth;

  return {
    profile: {
      identity: {
        first_name: identity?.first_name ?? '',
        last_name: identity?.last_name ?? '',
        email: identity?.email ?? '',
        phone: identity?.phone ?? '',
        address: identity?.address ?? '',
      },
      work_auth: {
        visa_type: workAuth?.visa_type ?? '',
        sponsorship_required: Boolean(workAuth?.sponsorship_required),
      },
      preferences: {
        remote: Boolean(preferences?.remote),
        locations: Array.isArray(preferences?.locations) ? preferences.locations.map(String) : [],
        salary_min: coerceNumber(preferences?.salary_min, 0),
        start_date: preferences?.start_date ?? '',
      },
    },
    compliance: {
      veteran_status: (payload.compliance?.veteran_status as IntakeLLMResponse['compliance']['veteran_status']) ??
        'prefer_not',
      disability_status:
        (payload.compliance?.disability_status as IntakeLLMResponse['compliance']['disability_status']) ??
        'prefer_not',
      criminal_history_policy:
        (payload.compliance?.criminal_history_policy as IntakeLLMResponse['compliance']['criminal_history_policy']) ??
        'ask_if_required',
    },
    history: {
      employment: Array.isArray(payload.history?.employment)
        ? payload.history.employment.map((job) => ({
            company: job?.company ?? '',
            title: job?.title ?? '',
            start: job?.start ?? '',
            end: job?.end ?? '',
            duties: job?.duties ?? '',
            city: job?.city ?? '',
            state: job?.state ?? '',
          }))
        : [],
      education: Array.isArray(payload.history?.education)
        ? payload.history.education.map((school) => ({
            school: school?.school ?? '',
            degree: school?.degree ?? '',
            field: school?.field ?? '',
            start: school?.start ?? '',
            end: school?.end ?? '',
          }))
        : [],
    },
    policies: {
      eeo: (payload.policies?.eeo as IntakeLLMResponse['policies']['eeo']) ?? 'ask_if_required',
      salary: (payload.policies?.salary as IntakeLLMResponse['policies']['salary']) ?? 'ask_if_required',
      relocation:
        (payload.policies?.relocation as IntakeLLMResponse['policies']['relocation']) ?? 'ask_if_required',
      work_shift:
        (payload.policies?.work_shift as IntakeLLMResponse['policies']['work_shift']) ??
        'ask_if_required',
    },
    previewSections: Array.isArray(payload.previewSections)
      ? payload.previewSections.map((section) => ({
          id: section?.id ?? '',
          title: section?.title ?? '',
          confidence: coerceNumber(section?.confidence, 0),
          fields: Array.isArray(section?.fields)
            ? section.fields.map((field) => ({
                id: field?.id ?? '',
                label: field?.label ?? '',
                value: Array.isArray(field?.value)
                  ? field.value.map(String)
                  : typeof field?.value === 'string'
                    ? field.value
                    : '',
                highlight: Boolean(field?.highlight),
              }))
            : [],
        }))
      : [],
    summary: payload.summary ?? '',
    confidence: coerceNumber(payload.confidence, 0.5),
    followUpPrompt: payload.followUpPrompt,
    warnings: Array.isArray(payload.warnings) ? payload.warnings.map(String) : [],
  };
}

export async function runIntakeAgent(
  request: IntakeRequestBody,
): Promise<IntakeLLMResponse> {
  const extraction: ResumeExtractionResult = {
    text: request.resumeText,
    metadata: request.resumeMetadata,
  };

  console.log('[IntakeAgent] Starting resume parsing...');
  console.log('[IntakeAgent] Claude client available:', !!claudeClient);
  console.log('[IntakeAgent] OpenAI client available:', !!openaiClient);

  // Prefer Claude for parsing due to better JSON accuracy
  if (claudeClient) {
    try {
      console.log('[IntakeAgent] Calling Claude API with model:', CLAUDE_MODEL);
      const systemPrompt = buildSystemPrompt() + `

CRITICAL: Return ONLY valid JSON matching this EXACT schema:

{
  "profile": { "identity": { "first_name": "", "last_name": "", "email": "", "phone": "", "address": "" }, "work_auth": { "visa_type": "", "sponsorship_required": false }, "preferences": { "remote": false, "locations": [], "salary_min": 0, "start_date": "" } },
  "compliance": { "veteran_status": "prefer_not", "disability_status": "prefer_not", "criminal_history_policy": "ask_if_required" },
  "history": { "employment": [], "education": [] },
  "policies": { "eeo": "ask_if_required", "salary": "ask_if_required", "relocation": "ask_if_required", "work_shift": "ask_if_required" },
  "previewSections": [
    { "id": "contact", "title": "Contact Information", "confidence": 0.95, "fields": [{ "id": "name", "label": "Name", "value": "John Doe" }] }
  ],
  "summary": "Brief summary of what was extracted",
  "confidence": 0.85
}

Confidence must be 0-1 range (e.g., 0.85 for 85%). Each previewSection must have "fields" array with objects containing id, label, value.`;
      const userPrompt = buildUserPrompt(request);

      const message = await claudeClient.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        temperature: 0.2,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      });

      console.log('[IntakeAgent] Claude response received');
      const content = message.content[0];
      if (!content || content.type !== 'text') {
        throw new Error('Claude response missing text content');
      }

      console.log('[IntakeAgent] Claude raw response (first 1000 chars):', content.text.substring(0, 1000));
      const parsed = JSON.parse(content.text) as Partial<IntakeLLMResponse>;
      console.log('[IntakeAgent] Parsed previewSections count:', parsed.previewSections?.length ?? 0);
      if (parsed.previewSections && parsed.previewSections.length > 0) {
        console.log('[IntakeAgent] First section from Claude:', JSON.stringify(parsed.previewSections[0], null, 2));
        console.log('[IntakeAgent] Profile identity from Claude:', JSON.stringify(parsed.profile?.identity, null, 2));
      }
      const result = normaliseLLMResponse(parsed);
      console.log('[IntakeAgent] Claude parsing successful, confidence:', result.confidence);
      console.log('[IntakeAgent] Result preview sections:', result.previewSections.length);
      return result;
    } catch (error) {
      console.warn('[IntakeAgent] Claude failed, trying OpenAI', error);
    }
  } else {
    console.log('[IntakeAgent] Claude client not available, skipping to OpenAI');
  }

  if (openaiClient) {
    try {
      console.log('[IntakeAgent] Calling OpenAI API with model:', OPENAI_MODEL);
      const completion = await openaiClient.chat.completions.create({
        model: OPENAI_MODEL,
        temperature: 0.2,
        response_format: {
          type: 'json_schema',
          json_schema: RESPONSE_SCHEMA,
        },
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: buildUserPrompt(request),
              },
            ],
          },
        ],
      });

      console.log('[IntakeAgent] OpenAI response received');
      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('OpenAI response missing content');
      }

      const parsed = JSON.parse(content) as Partial<IntakeLLMResponse>;
      const result = normaliseLLMResponse(parsed);
      console.log('[IntakeAgent] OpenAI parsing successful, confidence:', result.confidence);
      return result;
    } catch (error) {
      console.warn('[IntakeAgent] OpenAI failed, falling back to heuristic', error);
    }
  } else {
    console.log('[IntakeAgent] OpenAI client not available, falling back to heuristic');
  }

  console.log('[IntakeAgent] Using heuristic parsing as fallback');
  return runHeuristicIntakeLLM(extraction);
}


