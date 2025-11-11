import type {
  IntakeConversationSnapshot,
  IntakePreviewSection,
  IntakeStatusStep,
  ProfileVault,
} from '@/lib/types';

export interface IntakeAgentSnapshot extends IntakeConversationSnapshot {}

export type IntakeProgressStage =
  | 'prepare'
  | 'extract'
  | 'analyze'
  | 'persist'
  | 'complete'
  | 'error';

export interface IntakeProgressUpdate {
  stage: IntakeProgressStage;
  step: IntakeStatusStep;
}

export interface ResumeExtractionMetadata {
  fileName: string;
  fileType: string;
  fileSize: number;
  pageCount?: number;
  wordCount?: number;
  language?: string;
}

export interface ResumeExtractionResult {
  text: string;
  raw: ArrayBuffer;
  metadata: ResumeExtractionMetadata;
}

export type IntakeConversationRole = 'assistant' | 'user' | 'system';

export interface IntakeConversationMessage {
  role: IntakeConversationRole;
  content: string;
}

export interface IntakeLLMResponse {
  profile: ProfileVault['profile'];
  compliance: ProfileVault['compliance'];
  history: ProfileVault['history'];
  policies: ProfileVault['policies'];
  previewSections: IntakePreviewSection[];
  summary: string;
  confidence: number;
  followUpPrompt?: string;
  warnings?: string[];
}

export interface IntakeKnownFields {
  profile?: Partial<ProfileVault['profile']>;
  compliance?: Partial<ProfileVault['compliance']>;
  history?: Partial<ProfileVault['history']>;
  policies?: Partial<ProfileVault['policies']>;
}

export interface IntakeLLMRequestPayload {
  resumeText: string;
  resumeMetadata: ResumeExtractionMetadata;
  conversation: IntakeConversationMessage[];
  knownFields?: IntakeKnownFields;
  missingFields?: string[];
}

export interface IntakeProcessResult {
  extraction: ResumeExtractionResult;
  llm: IntakeLLMResponse;
  knownFields?: IntakeKnownFields;
  missingFields?: string[];
}

export interface IntakeAgentConfig {
  systemPrompt: string;
  followUps: {
    confirmApply: string;
    deferAck: string;
    resumeReceived: string;
    resumeFailed: string;
    editManual: string;
  };
  prompts: {
    welcome: string;
    resumeRequest: string;
    deferLater: string;
  };
  fieldMappings: Array<{
    path: string;
    label: string;
    section: 'profile' | 'compliance' | 'history' | 'policies';
  }>;
}

export interface IntakeAgentDependencies {
  extractResume: (file: File) => Promise<ResumeExtractionResult>;
  runLLM: (
    input: ResumeExtractionResult,
    payload: IntakeLLMRequestPayload
  ) => Promise<IntakeLLMResponse>;
}

export interface IntakeAgentOptions {
  config: IntakeAgentConfig;
  deps: IntakeAgentDependencies;
}

export interface IntakeDraftSnapshot {
  profile: ProfileVault['profile'];
  compliance: ProfileVault['compliance'];
  history: ProfileVault['history'];
  policies: ProfileVault['policies'];
}
