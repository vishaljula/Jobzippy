import type { IntakeAgentConfig } from './types';

export const INTAKE_AGENT_VERSION = 1;

export const intakeAgentConfig: IntakeAgentConfig = {
  systemPrompt: [
    "You are Jobzippy's enthusiastic onboarding buddy! Your mission: help job seekers set up their profile in the most delightful way possible.",
    'Think of yourself as a friendly career coach who genuinely cares about their success.',
    'When asking questions, be specific and upbeat. Instead of "Could you share more?", say "What\'s your visa status? (H-1B, Green Card, US Citizen, etc.)"',
    'Celebrate their answers! If they share salary expectations, acknowledge it positively: "Nice! $250k sounds great for your experience level."',
    'When they express uncertainty, reassure them warmly: "That makes total sense! Experienced engineers like you are definitely in high demand."',
    'Use the payload (resume, conversation, known_fields, missing_fields) to know what you already have and what you still need.',
    "Only ask for fields in missing_fields. Be crystal clear about what you're asking for.",
    'Ask ONE specific question at a time, but make it feel like a natural, friendly conversation.',
    "Never make up data. If something's unclear, ask directly and cheerfully.",
    'Keep responses warm, concise, and human. Add personality but stay professional.',
  ].join(' '),
  followUps: {
    confirmApply:
      'Updates saved to your secure vault! You can continue chatting or upload another document.',
    deferAck: "No problem—I'll remind you later when you're ready.",
    resumeReceived: "Thanks! I'm reviewing your resume now.",
    resumeFailed:
      'I ran into an issue reading that file. Could you try a different format (PDF or DOCX)?',
    editManual: 'Draft saved. Feel free to make manual edits from your vault whenever you like.',
  },
  prompts: {
    welcome:
      'Welcome back! Drop your latest resume here and I’ll parse it for Jobzippy’s secure vault.',
    resumeRequest:
      'Whenever you’re ready, attach a PDF or DOCX resume using the paperclip icon. You can also type questions below.',
    deferLater: "Okay, let's circle back when you're ready to sync this information.",
  },
  fieldMappings: [
    { path: 'profile.identity.first_name', label: 'First name', section: 'profile' },
    { path: 'profile.identity.last_name', label: 'Last name', section: 'profile' },
    { path: 'profile.identity.email', label: 'Email', section: 'profile' },
    { path: 'profile.identity.phone', label: 'Phone', section: 'profile' },
    { path: 'profile.identity.address', label: 'Address', section: 'profile' },
    { path: 'profile.work_auth.visa_type', label: 'Visa type', section: 'profile' },
    {
      path: 'profile.work_auth.sponsorship_required',
      label: 'Sponsorship required',
      section: 'profile',
    },
    { path: 'profile.preferences.remote', label: 'Remote preference', section: 'profile' },
    { path: 'profile.preferences.locations', label: 'Preferred locations', section: 'profile' },
    {
      path: 'profile.preferences.salary_min',
      label: 'Minimum salary (local currency)',
      section: 'profile',
    },
    { path: 'profile.preferences.start_date', label: 'Start date', section: 'profile' },
    { path: 'compliance.veteran_status', label: 'Veteran status', section: 'compliance' },
    { path: 'compliance.disability_status', label: 'Disability status', section: 'compliance' },
    {
      path: 'compliance.criminal_history_policy',
      label: 'Criminal history policy',
      section: 'compliance',
    },
    { path: 'history.employment', label: 'Employment history', section: 'history' },
    { path: 'history.education', label: 'Education history', section: 'history' },
    { path: 'policies.eeo', label: 'EEO policy', section: 'policies' },
    { path: 'policies.salary', label: 'Salary disclosure policy', section: 'policies' },
    { path: 'policies.relocation', label: 'Relocation policy', section: 'policies' },
    { path: 'policies.work_shift', label: 'Work shift policy', section: 'policies' },
  ],
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
    description: 'Running Claude AI for structured data',
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
