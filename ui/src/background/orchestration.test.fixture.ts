/**
 * Test Fixture: Expected Step Sequences for Each Job
 * Maps job IDs to their expected step execution sequences
 *
 * This file defines what steps should execute for each job in strict sequential order.
 * Used by integration test to validate orchestrator execution.
 */

export interface JobExpectation {
  jobId: string;
  jobIndex: number;
  expectedSteps: string[]; // Expected step sequence in order
  shouldSubmit: boolean;
  applyType?: 'modal' | 'external'; // Only for jobs that submit
}

/**
 * Expected step sequences for all jobs
 * Based on mapper flow and test setup:
 * - Jobs 123456 and 123460 use modal flow (FILL_MODAL_FORM)
 * - Other submitting jobs use external flow (OPEN_ATS_TAB → WAIT_FOR_ATS_READY → FILL_ATS_FORM)
 * - Job 123461 is skipped (SKIP_TO_NEXT_JOB)
 */
export const JOB_EXPECTATIONS: JobExpectation[] = [
  {
    jobId: '123463',
    jobIndex: 0,
    shouldSubmit: true,
    applyType: 'external',
    expectedSteps: [
      'CHECK_DUPLICATE',
      'CLICK_JOB_CARD',
      'VERIFY_JOB_DETAILS_LOADED',
      'CLICK_APPLY_BUTTON',
      'OPEN_ATS_TAB',
      'WAIT_FOR_ATS_READY',
      'FILL_ATS_FORM',
      'PERSIST_COMPLETION',
      'CLEANUP',
      'INCREMENT_JOB_INDEX',
      'CHECK_MORE_JOBS_ON_PAGE',
    ],
  },
  {
    jobId: '123457',
    jobIndex: 1,
    shouldSubmit: true,
    applyType: 'external',
    expectedSteps: [
      'CHECK_DUPLICATE',
      'CLICK_JOB_CARD',
      'VERIFY_JOB_DETAILS_LOADED',
      'CLICK_APPLY_BUTTON',
      'OPEN_ATS_TAB',
      'WAIT_FOR_ATS_READY',
      'FILL_ATS_FORM',
      'PERSIST_COMPLETION',
      'CLEANUP',
      'INCREMENT_JOB_INDEX',
      'CHECK_MORE_JOBS_ON_PAGE',
    ],
  },
  {
    jobId: '123456',
    jobIndex: 2,
    shouldSubmit: true,
    applyType: 'modal',
    expectedSteps: [
      'CHECK_DUPLICATE',
      'CLICK_JOB_CARD',
      'VERIFY_JOB_DETAILS_LOADED',
      'CLICK_APPLY_BUTTON',
      'FILL_MODAL_FORM',
      'PERSIST_COMPLETION',
      'CLEANUP',
      'INCREMENT_JOB_INDEX',
      'CHECK_MORE_JOBS_ON_PAGE',
    ],
  },
  {
    jobId: '123464',
    jobIndex: 3,
    shouldSubmit: true,
    applyType: 'external',
    expectedSteps: [
      'CHECK_DUPLICATE',
      'CLICK_JOB_CARD',
      'VERIFY_JOB_DETAILS_LOADED',
      'CLICK_APPLY_BUTTON',
      'OPEN_ATS_TAB',
      'WAIT_FOR_ATS_READY',
      'FILL_ATS_FORM',
      'PERSIST_COMPLETION',
      'CLEANUP',
      'INCREMENT_JOB_INDEX',
      'CHECK_MORE_JOBS_ON_PAGE',
    ],
  },
  {
    jobId: '123459',
    jobIndex: 4,
    shouldSubmit: true,
    applyType: 'external',
    expectedSteps: [
      'CHECK_DUPLICATE',
      'CLICK_JOB_CARD',
      'VERIFY_JOB_DETAILS_LOADED',
      'CLICK_APPLY_BUTTON',
      'OPEN_ATS_TAB',
      'WAIT_FOR_ATS_READY',
      'FILL_ATS_FORM',
      'PERSIST_COMPLETION',
      'CLEANUP',
      'INCREMENT_JOB_INDEX',
      'CHECK_MORE_JOBS_ON_PAGE',
    ],
  },
  {
    jobId: '123462',
    jobIndex: 5,
    shouldSubmit: true,
    applyType: 'external',
    expectedSteps: [
      'CHECK_DUPLICATE',
      'CLICK_JOB_CARD',
      'VERIFY_JOB_DETAILS_LOADED',
      'CLICK_APPLY_BUTTON',
      'OPEN_ATS_TAB',
      'WAIT_FOR_ATS_READY',
      'FILL_ATS_FORM',
      'PERSIST_COMPLETION',
      'CLEANUP',
      'INCREMENT_JOB_INDEX',
      'CHECK_MORE_JOBS_ON_PAGE',
    ],
  },
  {
    jobId: '123458',
    jobIndex: 6,
    shouldSubmit: true,
    applyType: 'external',
    expectedSteps: [
      'CHECK_DUPLICATE',
      'CLICK_JOB_CARD',
      'VERIFY_JOB_DETAILS_LOADED',
      'CLICK_APPLY_BUTTON',
      'OPEN_ATS_TAB',
      'WAIT_FOR_ATS_READY',
      'FILL_ATS_FORM',
      'PERSIST_COMPLETION',
      'CLEANUP',
      'INCREMENT_JOB_INDEX',
      'CHECK_MORE_JOBS_ON_PAGE',
    ],
  },
  {
    jobId: '123460',
    jobIndex: 7,
    shouldSubmit: true,
    applyType: 'modal',
    expectedSteps: [
      'CHECK_DUPLICATE',
      'CLICK_JOB_CARD',
      'VERIFY_JOB_DETAILS_LOADED',
      'CLICK_APPLY_BUTTON',
      'FILL_MODAL_FORM',
      'PERSIST_COMPLETION',
      'CLEANUP',
      'INCREMENT_JOB_INDEX',
      'CHECK_MORE_JOBS_ON_PAGE',
    ],
  },
  {
    jobId: '123461',
    jobIndex: 8,
    shouldSubmit: false,
    expectedSteps: [
      'CHECK_DUPLICATE',
      'SKIP_TO_NEXT_JOB',
      'INCREMENT_JOB_INDEX',
      'CHECK_MORE_JOBS_ON_PAGE',
    ],
  },
];

/**
 * Get expected steps for a job by jobId
 */
export function getJobExpectation(jobId: string): JobExpectation | undefined {
  return JOB_EXPECTATIONS.find((exp) => exp.jobId === jobId);
}

/**
 * Get expected steps for a job by index
 */
export function getJobExpectationByIndex(jobIndex: number): JobExpectation | undefined {
  return JOB_EXPECTATIONS.find((exp) => exp.jobIndex === jobIndex);
}
