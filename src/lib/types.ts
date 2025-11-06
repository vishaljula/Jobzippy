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

// Message Types for chrome.runtime messaging
export type MessageType =
  | 'PING'
  | 'GET_PROFILE'
  | 'SAVE_PROFILE'
  | 'JOB_APPLIED'
  | 'START_AUTO_APPLY'
  | 'STOP_AUTO_APPLY';

export interface Message<T = any> {
  type: MessageType;
  data?: T;
}

export interface MessageResponse<T = any> {
  status: 'success' | 'error' | 'ok';
  data?: T;
  message?: string;
}

// Storage Types
export interface ExtensionStorage {
  version: string;
  installedAt: string;
  onboardingComplete: boolean;
  sheetId?: string;
  userId?: string;
  lastSync?: string;
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

