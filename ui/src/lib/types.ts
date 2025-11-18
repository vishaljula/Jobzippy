/**
 * Shared TypeScript types and interfaces for Jobzippy
 */

// Profile Vault Types (from spec §8)
export interface UserProfile {
  identity: {
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
    address: string;
  };
  work_auth: {
    visa_type: string;
    sponsorship_required: boolean;
  };
  preferences: {
    remote: boolean;
    locations: string[];
    salary_min: number;
    salary_currency: string;
    start_date: string;
  };
}

export interface Compliance {
  veteran_status: 'yes' | 'no' | 'prefer_not';
  disability_status: 'yes' | 'no' | 'prefer_not';
  criminal_history_policy: 'answer' | 'skip_if_optional' | 'ask_if_required' | 'never';
}

export interface EmploymentHistory {
  company: string;
  title: string;
  start: string; // YYYY-MM
  end: string; // YYYY-MM or "present"
  duties: string;
  city: string;
  state: string;
}

export interface Education {
  school: string;
  degree: string;
  field: string;
  start: string; // YYYY
  end: string; // YYYY
}

export interface History {
  employment: EmploymentHistory[];
  education: Education[];
}

export interface Policies {
  eeo: 'answer' | 'skip_if_optional' | 'ask_if_required' | 'never';
  salary: 'answer' | 'skip_if_optional' | 'ask_if_required' | 'never';
  relocation: 'answer' | 'skip_if_optional' | 'ask_if_required' | 'never';
  work_shift: 'answer' | 'skip_if_optional' | 'ask_if_required' | 'never';
}

export interface ProfileVault {
  profile: UserProfile;
  compliance: Compliance;
  history: History;
  policies: Policies;
}

// Intake Agent & Conversation Types
export type IntakeRole = 'assistant' | 'user' | 'system';

export type IntakeMessageKind = 'text' | 'status' | 'preview' | 'notice';

export type IntakeStatusState = 'pending' | 'in_progress' | 'completed' | 'error';

export interface IntakeStatusStep {
  id: string;
  label: string;
  description?: string;
  state: IntakeStatusState;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface IntakeAttachment {
  id: string;
  kind: 'file';
  name: string;
  size: number;
  mimeType: string;
  previewUrl?: string;
}

export interface IntakePreviewField {
  id: string;
  label: string;
  value: string | string[];
  highlight?: boolean;
}

export interface IntakePreviewSection {
  id: string;
  title: string;
  confidence: number;
  fields: IntakePreviewField[];
}

export interface IntakeMessage {
  id: string;
  role: IntakeRole;
  kind: IntakeMessageKind;
  content: string;
  createdAt: string;
  attachments?: IntakeAttachment[];
  statusSteps?: IntakeStatusStep[];
  previewSections?: IntakePreviewSection[];
  metadata?: Record<string, unknown>;
}

export interface IntakeDeferredTask {
  id: string;
  prompt: string;
  createdAt: string;
  reason?: string;
  resolved?: boolean;
}

export interface IntakeConversationSnapshot {
  version: number;
  messages: IntakeMessage[];
  deferredTasks: IntakeDeferredTask[];
  lastUpdated: string;
}

// Job Application Types
export type ApplicationStatus =
  | 'applied'
  | 'replied'
  | 'interview_requested'
  | 'offer'
  | 'rejected'
  | 'skipped'
  | 'reply_unmatched';

export type VisaSponsorFlag = 'YES' | 'NO' | 'UNKNOWN';

export type JobPlatform = 'LinkedIn' | 'Indeed' | 'Glassdoor' | 'Dice' | 'ZipRecruiter';

export interface JobApplication {
  app_id: string; // UUID
  date_applied: string; // ISO
  platform: JobPlatform;
  job_title: string;
  company: string;
  location: string;
  job_url: string;
  status: ApplicationStatus;
  email_thread_id?: string;
  email_from?: string;
  email_subject?: string;
  last_email_at?: string; // ISO
  notes?: string;
  salary?: string;
  match_score?: number; // 0-100
  visa_sponsor_flag: VisaSponsorFlag;
}

// Job Scraping Types
export interface ScrapedJob {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  platform: JobPlatform;
  description?: string;
  salary?: string;
  postedDate?: string;
  applyType?: 'easy_apply' | 'external' | 'unknown';
}

export interface ScrapePageResult {
  jobs: ScrapedJob[];
  hasNextPage: boolean;
  nextPageUrl?: string;
  currentPage: number;
}

// Message Types for chrome.runtime messaging
export type MessageType =
  | 'PING'
  | 'GET_PROFILE'
  | 'SAVE_PROFILE'
  | 'JOB_APPLIED'
  | 'START_AUTO_APPLY'
  | 'STOP_AUTO_APPLY'
  | 'SCRAPE_JOBS'
  | 'JOBS_SCRAPED'
  | 'NAVIGATE_NEXT_PAGE'
  | 'PAGE_NAVIGATED'
  | 'ENGINE_STATE'
  | 'AUTH_STATE'
  | 'AUTH_PROBE'
  | 'AUTH_PROBE_ALL'
  | 'PAGE_ACTIVE'
  | 'USER_INTERACTION'
  | 'TAB_ACTIVATED';

export interface Message<T = unknown> {
  type: MessageType;
  data?: T;
}

// Engine State Types
export interface EngineStateData {
  state: 'IDLE' | 'RUNNING' | 'PAUSED';
  status: string;
  ts: number;
  currentPlatform?: JobPlatform;
  jobsScraped?: number;
  jobsProcessed?: number;
  dailyLimit?: number;
  platformLimit?: number;
}

export interface AuthStateData {
  platform: JobPlatform;
  loggedIn: boolean;
}

export interface MessageResponse<T = unknown> {
  status: 'success' | 'error' | 'ok';
  data?: T;
  message?: string;
}

// Storage Types
export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserInfo | null;
  error: string | null;
}

// Onboarding Types
export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped';

export interface OnboardingSnapshot {
  status: OnboardingStatus;
  updatedAt: string;
}

export interface OnboardingConversationSnapshot {
  version: number;
  messages: IntakeMessage[];
  deferredTasks: IntakeDeferredTask[];
  pendingFieldPath?: string | null;
  missingFields: string[];
  progress: {
    completed: number;
    total: number;
    percentage: number;
    status: 'idle' | 'collecting' | 'ready' | 'saving';
  };
  draft?: ProfileVault | null;
  hasResume?: boolean;
  lastUpdated: string;
}

export interface ExtensionStorage {
  version: string;
  installedAt: string;
  onboardingStatus?: OnboardingSnapshot;
  onboardingConversations?: Record<string, OnboardingConversationSnapshot>;
  sheetId?: string;
  userId?: string;
  lastSync?: string;
  intakeConversation?: IntakeConversationSnapshot;
  intakeDraft?: ProfileVault;
  tutorialDismissed?: boolean;
}

// Job Filters
export interface JobFilters {
  titles: string[];
  locations: string[];
  salary_min?: number;
  remote: boolean;
  keywords?: string[];
  sponsorship_required?: boolean;
}

// OAuth Types
export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
  id_token?: string;
  expires_at?: number; // Calculated expiration timestamp
}

export interface UserInfo {
  sub: string; // Google user ID
  email: string;
  email_verified: boolean;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
}
