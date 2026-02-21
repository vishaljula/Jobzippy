/**
 * Orchestration Types
 * Type definitions for Orchestrator V2
 */

export interface SequentialJobState {
  platform: 'LinkedIn' | 'Indeed';
  tabId: number | null;
  atsTabId: number | null; // Temporary storage during ATS flow
  atsFrameId?: number | null; // Frame ID within atsTabId that has the actual form (for iframe-embedded ATS like Greenhouse)

  // Sequential processing state (NOT a queue - just pointer-based)
  scrapedJobIds: string[]; // List of job IDs on current page
  currentJobIndex: number; // Pointer to current job (0, 1, 2...)
  currentPage: number;
  hasNextPage: boolean;

  isProcessing: boolean; // Currently processing a job
  isActive: boolean; // Agent running

  // Additional state for job processing
  currentJobId?: string;
  jobDescription?: string;
  applyType?: 'easy_apply' | 'external' | 'unknown';
  atsUrl?: string;
  fillFormResult?: {
    success: boolean;
    reason?: string;
    message?: string;
  };

  // NOTE: vaultProfile and vaultResume removed - vault data should NEVER be stored in state
  // Vault data is decrypted per-form via loadVaultData handler and passed via data?.data
}

export interface StepOutput {
  // Removed: nextStep - only mapper controls flow
  data?: any; // Output data for next step (used by mapper conditionals)
  state?: Partial<SequentialJobState>; // State updates
}

/**
 * Conditional next step condition
 * Evaluates a property path against a value or another property to determine if condition matches.
 *
 * For equality checks, use `val`:
 *   { prop: 'data.type', val: 'modal', step: 'FILL_MODAL_FORM' }
 *
 * For comparisons, use `operator` and `compareTo`:
 *   { prop: 'state.currentJobIndex', operator: '<', compareTo: 'state.scrapedJobIds.length', step: 'CHECK_DUPLICATE' }
 */
export interface ConditionalStepCondition {
  prop: string; // Property path to check (e.g., 'data.type', 'state.currentJobIndex')
  val?: any; // Value to compare against (uses strict equality ===) - use this OR compareTo
  compareTo?: string; // Property path to compare against (e.g., 'state.scrapedJobIds.length') - use this OR val
  operator?: '<' | '<=' | '>' | '>='; // Comparison operator (only used with compareTo)
  step: string; // Step name to transition to if condition matches
}

/**
 * Conditional next step structure
 * The orchestrator evaluates conditions in order and uses the first matching condition's step.
 * If no conditions match, uses defaultStep if provided, otherwise null.
 * Conditions are declarative property checks - no functions in the mapper.
 * All logic stays in the orchestrator (the "brain").
 */
export interface ConditionalNextStep {
  conditions: ConditionalStepCondition[];
  defaultStep?: string | null; // Step to use if no conditions match (optional, defaults to null)
}
