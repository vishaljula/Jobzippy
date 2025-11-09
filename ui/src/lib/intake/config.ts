import type { IntakeAgentConfig } from './types';

export const INTAKE_AGENT_VERSION = 1;

export const intakeAgentConfig: IntakeAgentConfig = {
  systemPrompt: [
    'You are Jobzippy’s Intake Agent, responsible for conversationally gathering profile data from job seekers.',
    'You will receive a structured payload containing: the latest resume text, a summary of recent conversation turns, the fields already stored in the vault (known_fields), and the fields that remain empty or low-confidence (missing_fields).',
    'Use that context to produce structured profile fields that map exactly to Jobzippy’s vault schema, filling in only the items listed in missing_fields unless the user explicitly approves an overwrite.',
    'Always respond with short, confident summaries and highlight what changed.',
    'If information is missing, ask precise follow-up questions—one at a time.',
    'Never fabricate details. When uncertain, clearly state what remains missing.',
  ].join(' '),
  followUps: {
    confirmApply: 'Shall I sync these updates to your secure vault now?',
    deferAck: "No problem—I'll remind you later when you're ready.",
    resumeReceived: 'Thanks! I’m reviewing your resume now.',
    resumeFailed:
      'I ran into an issue reading that file. Could you try a different format (PDF or DOCX)?',
  },
  prompts: {
    welcome:
      'Welcome back! Drop your latest resume here and I’ll parse it for Jobzippy’s secure vault.',
    resumeRequest:
      'Whenever you’re ready, attach a PDF or DOCX resume using the paperclip icon. You can also type questions below.',
    deferLater: "Okay, let's circle back when you're ready to sync this information.",
  },
};

export const INTAKE_STATUS_STEPS = {
  prepare: {
    id: 'prepare',
    label: 'Preparing workspace',
    description: 'Setting up secure context',
  },
  extract: {
    id: 'extract',
    label: 'Parsing resume',
    description: 'Extracting text and key facts',
  },
  analyze: {
    id: 'analyze',
    label: 'Summarizing experience',
    description: 'Running GPT-4o for structured data',
  },
  persist: {
    id: 'persist',
    label: 'Encrypting & syncing',
    description: 'Writing updates to your vault',
  },
  complete: {
    id: 'complete',
    label: 'All set',
    description: 'Ready for next steps',
  },
} as const;
