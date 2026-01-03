/**
 * Orchestrator V2 - Main Execution Loop
 * Centralized control flow with step-based execution
 *
 * Responsibilities:
 * - Orchestration logic and control flow
 * - State management
 */

import type { SequentialJobState, StepOutput, ConditionalNextStep } from './orchestration-types';
import { taskOrchestrationMapper } from './orchestrationMapper';
import {
  orchestrationTasks,
  taskActionParamHandlers,
  broadcastEngineState,
} from './orchestrationTaskHelper';
import { evaluateConditionalNextStep } from './orchestrationHelper';
import { broadcastJobStatusOnly } from './job-persistence';

// ============================================================================
// FEATURE FLAG
// ============================================================================
export const USE_ORCHESTRATOR_V2 = true; // Set to true only after tests pass

// ============================================================================
// STOP FLAG
// ============================================================================
let shouldStopOrchestration = false;

export function setOrchestrationStopFlag(value: boolean): void {
  shouldStopOrchestration = value;
}

// ============================================================================
// QUOTA CHECKING
// ============================================================================

/**
 * Check if daily/monthly quota has been reached
 * TODO: Implement actual quota checking from storage/state
 * For now, returns false (quota not reached) to allow flow to continue
 */
async function isQuotaReached(_state: SequentialJobState): Promise<boolean> {
  // TODO: Implement quota checking logic
  // - Check daily quota from chrome.storage or state
  // - Check monthly quota if applicable
  // - Return true if quota reached, false otherwise
  return false;
}

// ============================================================================
// MAIN EXECUTION LOOP
// ============================================================================

/**
 * Main orchestration execution loop
 * Processes steps sequentially until completion, quota reached, or error
 */
export async function executeOrchestration(
  state: SequentialJobState,
  initialStep: string = 'START_AGENT'
): Promise<void> {
  let currentStep: string | null = initialStep;
  let data: StepOutput | undefined;

  console.log(`[Orchestrator V2] Starting orchestration from step: ${initialStep}`);

  while (currentStep !== null) {
    // Check stop flag
    if (shouldStopOrchestration) {
      console.log('[Orchestrator V2] Stop requested, exiting orchestration');
      state.isActive = false;
      broadcastEngineState('IDLE', 'Agent stopped');
      break;
    }

    // Get step configuration from mapper
    const step = taskOrchestrationMapper[currentStep];
    if (!step) {
      console.error(`[Orchestrator V2] Step "${currentStep}" not found in mapper`);
      break;
    }

    console.log(`[Orchestrator V2] Executing: ${step.name}`);

    try {
      // 1. Prepare step data (e.g., load vault data)
      data = await prepareStepData(step, state, data);
      // 2. Execute step action
      const actionOutput = await executeStepAction(step, state, data);
      data = actionOutput; // Pass output to next step

      // 3. Determine next step
      currentStep = determineNextStep(step, actionOutput, state);

      // Broadcast job status based on step completion
      if (state.currentJobId) {
        // After CHECK_DUPLICATE completes, job is "applying"
        if (step.name === 'CHECK_DUPLICATE') {
          broadcastJobStatusOnly(state.currentJobId, 'applying');
        }
        // When about to fill form, job is "ats_filling"
        else if (currentStep === 'FILL_MODAL_FORM' || currentStep === 'FILL_ATS_FORM') {
          broadcastJobStatusOnly(state.currentJobId, 'ats_filling');
        }
      }

      // 4. Check quota after successful application (PERSIST_COMPLETION)
      if (step.name === 'PERSIST_COMPLETION' && state.fillFormResult?.success) {
        const quotaReached = await isQuotaReached(state);
        if (quotaReached) {
          console.log('[Orchestrator V2] Daily/monthly quota reached, stopping orchestration');
          currentStep = 'DONE';
        }
      }

      // 5. Handle completion
      if (currentStep === null) {
        console.log('[Orchestrator V2] Orchestration completed');
      }
    } catch (error) {
      console.error(`[Orchestrator V2] Error in step ${step.name}:`, error);
      // On error, skip to next job
      currentStep = 'SKIP_TO_NEXT_JOB';
    }
  }
}

// ============================================================================
// STEP EXECUTION HELPERS
// ============================================================================

/**
 * Prepare step data by running custom action params handlers (e.g., load vault data)
 * Merges prepared data with existing data and updates state
 */
async function prepareStepData(
  step: { customActionParams?: string },
  state: SequentialJobState,
  currentData?: StepOutput
): Promise<StepOutput | undefined> {
  if (!step.customActionParams) {
    return currentData;
  }

  const handler = taskActionParamHandlers[step.customActionParams];
  if (!handler) {
    console.warn(
      `[Orchestrator V2] Task action param handler "${step.customActionParams}" not found`
    );
    return currentData;
  }

  console.log(`[Orchestrator V2] Preparing data: ${step.customActionParams}`);
  const preparedData = await handler(state);

  // Merge prepared data with existing data
  const mergedData: StepOutput = {
    ...currentData,
    ...preparedData,
    data: {
      ...currentData?.data,
      ...preparedData?.data,
    },
    state: {
      ...currentData?.state,
      ...preparedData?.state,
    },
  };

  // Update state if provided
  if (preparedData?.state) {
    Object.assign(state, preparedData.state);
  }

  return mergedData;
}

/**
 * Execute the step action and update state
 * Returns the action output data
 */
async function executeStepAction(
  step: { name: string; action: string },
  state: SequentialJobState,
  data?: StepOutput
): Promise<StepOutput> {
  const actionFunction = orchestrationTasks[step.action];
  if (!actionFunction) {
    throw new Error(`Action "${step.action}" not found in helper`);
  }

  const actionOutput = await actionFunction(state, data);

  // Update state if provided
  if (actionOutput?.state) {
    Object.assign(state, actionOutput.state);
  }

  return actionOutput;
}

/**
 * Determine the next step based on:
 * 1. Conditional nextStep from mapper (evaluates based on action output data)
 * 2. Static nextStep from mapper
 *
 * Robust error handling: defaults to SKIP_TO_NEXT_JOB when null is returned
 * (except for DONE step which is explicitly allowed to return null)
 */
function determineNextStep(
  step: { name: string; nextStep: string | null | ConditionalNextStep },
  actionOutput: StepOutput,
  state: SequentialJobState
): string | null {
  // 1. Conditional nextStep - evaluate conditions based on action output
  if (step.nextStep && typeof step.nextStep === 'object' && 'conditions' in step.nextStep) {
    const conditionalNextStep = step.nextStep as ConditionalNextStep;
    try {
      const nextStep = evaluateConditionalNextStep(conditionalNextStep, state, actionOutput);

      // Robust error handling: if null is returned and step is not DONE, default to SKIP_TO_NEXT_JOB
      if (nextStep === null && step.name !== 'DONE') {
        console.warn(
          `[Orchestrator V2] No conditions matched and no defaultStep for step "${step.name}", ` +
            `defaulting to SKIP_TO_NEXT_JOB to continue flow`
        );
        return 'SKIP_TO_NEXT_JOB';
      }

      return nextStep;
    } catch (error) {
      console.error(
        `[Orchestrator V2] Error evaluating conditions for step "${step.name}":`,
        error
      );
      // On error, default to SKIP_TO_NEXT_JOB (except for DONE step)
      if (step.name === 'DONE') {
        return null;
      }
      return 'SKIP_TO_NEXT_JOB';
    }
  }

  // 2. Static nextStep from mapper
  const staticNextStep = typeof step.nextStep === 'string' ? step.nextStep : step.nextStep;

  // Robust error handling: if null is returned and step is not DONE, default to SKIP_TO_NEXT_JOB
  if (staticNextStep === null && step.name !== 'DONE') {
    console.warn(
      `[Orchestrator V2] Static nextStep is null for step "${step.name}", ` +
        `defaulting to SKIP_TO_NEXT_JOB to continue flow`
    );
    return 'SKIP_TO_NEXT_JOB';
  }

  return staticNextStep;
}
