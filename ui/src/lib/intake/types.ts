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

export interface IntakeProcessResult {
  extraction: ResumeExtractionResult;
  llm: IntakeLLMResponse;
}

export interface IntakeAgentConfig {
  systemPrompt: string;
  followUps: {
    confirmApply: string;
    deferAck: string;
    resumeReceived: string;
    resumeFailed: string;
  };
  prompts: {
    welcome: string;
    resumeRequest: string;
    deferLater: string;
  };
}

export interface IntakeAgentDependencies {
  extractResume: (file: File) => Promise<ResumeExtractionResult>;
  runLLM: (input: ResumeExtractionResult) => Promise<IntakeLLMResponse>;
  persistToVault: (result: IntakeLLMResponse, resume: ResumeExtractionResult) => Promise<void>;
}

export interface IntakeAgentOptions {
  config: IntakeAgentConfig;
  deps: IntakeAgentDependencies;
}
