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
  metadata: ResumeExtractionMetadata;
}

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
  start: string;
  end: string;
  duties: string;
  city: string;
  state: string;
}

export interface EducationHistory {
  school: string;
  degree: string;
  field: string;
  start: string;
  end: string;
}

export interface History {
  employment: EmploymentHistory[];
  education: EducationHistory[];
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

export interface IntakeRequestBody {
  resumeText: string;
  resumeMetadata: ResumeExtractionMetadata;
  conversation: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  knownFields?: IntakeKnownFields;
  missingFields?: string[];
}


