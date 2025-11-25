/**
 * Job Session Types - Single Source of Truth Architecture
 * 
 * Background script owns all job session state.
 * Content scripts are clients that send events and wait for results.
 */

export type JobSessionStatus =
  | 'pending'           // Job started, waiting for Apply click result
  | 'linkedin-modal'   // LinkedIn modal detected, filling locally
  | 'ats-opened'       // External ATS tab opened
  | 'ats-filling'      // ATS content script injected, filling form
  | 'ats-complete'     // ATS form submitted successfully
  | 'failed';          // Failed or timed out

export interface JobSession {
  jobId: string;
  sourceTabId: number;        // LinkedIn tab ID
  atsTabId?: number;          // External ATS tab ID (if external)
  status: JobSessionStatus;
  startedAt: number;
  timerId?: number;           // Single timeout for entire ATS flow
  result?: {
    success: boolean;
    error?: string;
  };
}

/**
 * Message Types - From LinkedIn to Background
 */
export interface ApplyJobStartMessage {
  type: 'APPLY_JOB_START';
  data: {
    jobId: string;
    sourceTabId?: number; // Optional - background script will get it from sender.tab.id
  };
}

export interface LinkedInModalDetectedMessage {
  type: 'LINKEDIN_MODAL_DETECTED';
  data: {
    jobId: string;
  };
}

export interface JobCompletedMessage {
  type: 'JOB_COMPLETED';
  data: {
    jobId: string;
    success: boolean;
    error?: string;
  };
}

/**
 * Message Types - From Background to LinkedIn
 */
export interface ExternalATSOpenedMessage {
  type: 'EXTERNAL_ATS_OPENED';
  data: {
    jobId: string;
    atsTabId: number;
  };
}

export interface ExternalATSDoneMessage {
  type: 'EXTERNAL_ATS_DONE';
  data: {
    jobId: string;
    success: boolean;
    error?: string;
  };
}

/**
 * Message Types - From Background to ATS Tab
 */
export interface FillExternalATSMessage {
  type: 'FILL_EXTERNAL_ATS';
  data: {
    jobId: string;
  };
}

/**
 * Message Types - From ATS Tab to Background
 */
export interface ATSContentScriptReadyMessage {
  type: 'ATS_CONTENT_SCRIPT_READY';
  data: {
    jobId: string;
  };
}

export interface ATSCompleteMessage {
  type: 'ATS_COMPLETE';
  data: {
    jobId: string;
    success: boolean;
    error?: string;
  };
}

export interface ATSNavigationStartingMessage {
  type: 'ATS_NAVIGATION_STARTING';
  data: {
    jobId: string;
    newUrl: string;
  };
}

/**
 * Union type for all job-related messages
 */
export type JobSessionMessage =
  | ApplyJobStartMessage
  | LinkedInModalDetectedMessage
  | JobCompletedMessage
  | ExternalATSOpenedMessage
  | ExternalATSDoneMessage
  | FillExternalATSMessage
  | ATSContentScriptReadyMessage
  | ATSCompleteMessage
  | ATSNavigationStartingMessage;

