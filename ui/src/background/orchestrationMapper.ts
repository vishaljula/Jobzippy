/**
 * Orchestration Mapper
 * Maps step names to their default next step and action name string
 *
 * This file is pure configuration - no logic, only declarative mappings.
 * All orchestration logic lives in orchestrator.ts (the "brain").
 * Actions are defined in orchestrationTaskHelper.ts - only their names are referenced here.
 */

import type { ConditionalNextStep } from './orchestration-types';

// ============================================================================
// TASK ORCHESTRATION MAPPER
// ============================================================================
export const taskOrchestrationMapper: Record<
  string,
  {
    name: string;
    nextStep: string | null | ConditionalNextStep;
    action: string; // Action name string (not function reference) - actions defined in orchestrationTaskHelper.ts
    customActionParams?: string; // Optional data preparer function name (e.g., 'loadVaultData')
  }
> = {
  START_AGENT: {
    name: 'START_AGENT',
    nextStep: 'SCRAPE_JOBS',
    action: 'startAgent',
  },
  SCRAPE_JOBS: {
    name: 'SCRAPE_JOBS',
    nextStep: 'CHECK_DUPLICATE',
    action: 'scrapeJobs',
  },
  CHECK_DUPLICATE: {
    name: 'CHECK_DUPLICATE',
    nextStep: 'CLICK_JOB_CARD',
    action: 'checkDuplicate',
  },
  CLICK_JOB_CARD: {
    name: 'CLICK_JOB_CARD',
    nextStep: 'VERIFY_JOB_DETAILS_LOADED',
    action: 'clickJobCard',
  },
  VERIFY_JOB_DETAILS_LOADED: {
    name: 'VERIFY_JOB_DETAILS_LOADED',
    nextStep: 'CLICK_APPLY_BUTTON',
    action: 'verifyJobDetailsLoaded',
  },
  CLICK_APPLY_BUTTON: {
    name: 'CLICK_APPLY_BUTTON',
    nextStep: {
      conditions: [
        {
          prop: 'data.type',
          val: 'modal',
          step: 'FILL_MODAL_FORM',
        },
        {
          // External ATS: tab is already open (via link click), atsTabId is set
          prop: 'data.type',
          val: 'external',
          step: 'WAIT_FOR_ATS_READY',
        },
      ],
      defaultStep: 'SKIP_TO_NEXT_JOB', // Handle unknown response types (e.g., error, timeout, unexpected)
    },
    action: 'clickApplyButton',
  },
  FILL_MODAL_FORM: {
    name: 'FILL_MODAL_FORM',
    nextStep: 'PERSIST_COMPLETION',
    action: 'fillModalForm',
    customActionParams: 'loadVaultData', // Pull vault data before filling form
  },
  WAIT_FOR_ATS_READY: {
    name: 'WAIT_FOR_ATS_READY',
    nextStep: {
      conditions: [
        {
          prop: 'data.pageType',
          val: 'form',
          step: 'FILL_ATS_FORM',
        },
        {
          prop: 'data.pageType',
          val: 'form_modal',
          step: 'FILL_ATS_FORM',
        },
        {
          prop: 'data.pageType',
          val: 'modal',
          step: 'CLICK_ATS_MODAL_BUTTON', // Changed: click button first, then re-classify
        },
        {
          prop: 'data.pageType',
          val: 'intermediate',
          step: 'CLICK_ATS_INTERMEDIATE_BUTTON',
        },
      ],
      defaultStep: 'SKIP_TO_NEXT_JOB',
    },
    action: 'waitForAtsReady',
  },
  CLICK_ATS_INTERMEDIATE_BUTTON: {
    name: 'CLICK_ATS_INTERMEDIATE_BUTTON',
    nextStep: 'WAIT_FOR_ATS_READY', // Re-classify after clicking
    action: 'clickAtsIntermediateButton',
  },
  CLICK_ATS_MODAL_BUTTON: {
    name: 'CLICK_ATS_MODAL_BUTTON',
    nextStep: 'WAIT_FOR_ATS_READY', // Re-classify after clicking
    action: 'clickAtsModalButton',
  },
  FILL_ATS_FORM: {
    name: 'FILL_ATS_FORM',
    nextStep: 'PERSIST_COMPLETION',
    action: 'fillAtsForm',
    customActionParams: 'loadVaultData', // Pull vault data before filling form
  },
  PERSIST_COMPLETION: {
    name: 'PERSIST_COMPLETION',
    nextStep: 'CLEANUP',
    action: 'persistCompletion',
  },
  CLEANUP: {
    name: 'CLEANUP',
    nextStep: 'INCREMENT_JOB_INDEX',
    action: 'cleanup',
  },
  INCREMENT_JOB_INDEX: {
    name: 'INCREMENT_JOB_INDEX',
    nextStep: 'CHECK_MORE_JOBS_ON_PAGE',
    action: 'incrementJobIndex',
  },
  CHECK_MORE_JOBS_ON_PAGE: {
    name: 'CHECK_MORE_JOBS_ON_PAGE',
    nextStep: {
      conditions: [
        {
          prop: 'state.currentJobIndex',
          operator: '<',
          compareTo: 'state.scrapedJobIds.length',
          step: 'CHECK_DUPLICATE',
        },
      ],
      defaultStep: 'CHECK_NEXT_PAGE', // If no more jobs on current page, check next page
    },
    action: 'checkMoreJobsOnPage',
  },
  CHECK_NEXT_PAGE: {
    name: 'CHECK_NEXT_PAGE',
    nextStep: {
      conditions: [
        {
          prop: 'data.success',
          val: true,
          step: 'SCRAPE_JOBS',
        },
      ],
      defaultStep: 'DONE', // If navigation failed or no next page, we're done
    },
    action: 'checkNextPage',
  },
  SKIP_TO_NEXT_JOB: {
    name: 'SKIP_TO_NEXT_JOB',
    nextStep: 'CLEANUP', // Run cleanup to close tabs before moving to next job
    action: 'skipToNextJob',
  },
  DONE: {
    name: 'DONE',
    nextStep: null,
    action: 'done',
  },
};
