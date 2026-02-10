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
import { startDebugRun, logStep, logStepResult } from './orchestration-debug';

// ============================================================================
// FEATURE FLAG
// ============================================================================
export const USE_ORCHESTRATOR_V2 = true; // Set to true only after tests pass

// ============================================================================
// STOP FLAG & STATE PERSISTENCE
// ============================================================================
let shouldStopOrchestration = false;
let currentOrchestrationState: SequentialJobState | null = null;

export function setOrchestrationStopFlag(value: boolean): void {
  shouldStopOrchestration = value;
}

/** Save orchestration state to chrome.storage for resume */
export async function saveOrchestrationState(state: SequentialJobState): Promise<void> {
  // Only save serializable parts of state
  const stateToSave = {
    platform: state.platform,
    tabId: state.tabId,
    atsTabId: state.atsTabId,
    scrapedJobIds: state.scrapedJobIds,
    currentJobIndex: state.currentJobIndex,
    currentJobId: state.currentJobId,
    currentPage: state.currentPage,
    hasNextPage: state.hasNextPage,
    savedAt: Date.now(),
  };
  await chrome.storage.local.set({ orchestrationState: stateToSave });
  console.log('[Orchestrator V2] State saved for resume:', stateToSave);
}

/** Load saved orchestration state from chrome.storage */
export async function loadOrchestrationState(): Promise<Partial<SequentialJobState> | null> {
  const result = await chrome.storage.local.get('orchestrationState');
  const saved = result.orchestrationState;

  if (!saved) {
    console.log('[Orchestrator V2] No saved state found');
    return null;
  }

  // Check if state is stale (older than 1 hour)
  const ONE_HOUR = 60 * 60 * 1000;
  if (Date.now() - saved.savedAt > ONE_HOUR) {
    console.log('[Orchestrator V2] Saved state is stale, discarding');
    await clearOrchestrationState();
    return null;
  }

  console.log('[Orchestrator V2] Loaded saved state:', saved);
  return saved;
}

/** Clear saved orchestration state */
export async function clearOrchestrationState(): Promise<void> {
  await chrome.storage.local.remove('orchestrationState');
  console.log('[Orchestrator V2] Saved state cleared');
}

/** Get current orchestration state (for saving on stop) */
export function getCurrentOrchestrationState(): SequentialJobState | null {
  return currentOrchestrationState;
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

  // Store reference for pause/resume
  currentOrchestrationState = state;
  // Reset stop flag on new orchestration
  shouldStopOrchestration = false;

  // Start debug logging for this run
  const runId = startDebugRun();
  console.log(
    `[Orchestrator V2] Starting orchestration from step: ${initialStep} (runId: ${runId})`
  );

  let stepCounter = 0;
  const MAX_STEPS_PER_JOB = 50; // Reduced safety break (was 50)

  while (currentStep !== null) {
    stepCounter++;
    if (stepCounter > MAX_STEPS_PER_JOB) {
      console.error(
        `[Orchestrator V2] MAX_STEPS_PER_JOB (${MAX_STEPS_PER_JOB}) reached! Safety break triggered.`
      );
      // Log the error
      await logStepResult(0, {
        error: 'MAX_STEPS_PER_JOB reached - potential infinite loop detected',
      });
      currentStep = 'SKIP_TO_NEXT_JOB';
      // Reset counter to allow skip logic to proceed cleanly (though skip usually cleans up fast)
      stepCounter = 0;
      // Force exit if we are already trying to skip? No, SKIP_TO_NEXT_JOB leads to cleanup then loop reset elsewhere?
      // Actually SKIP_TO_NEXT_JOB leads to CLEANUP -> INCREMENT -> CHECK -> etc.
      // So we just break the current job loop.
    }

    // Check stop flag
    if (shouldStopOrchestration) {
      console.log('[Orchestrator V2] Stop requested, performing cleanup before pause');

      // Log the stop event
      await logStep({
        jobId: state.currentJobId || null,
        jobIndex: state.currentJobIndex,
        step: 'STOP_REQUESTED',
        action: 'userStop',
        inputData: { currentStep, reason: 'user_requested' },
        stateSnapshot: {
          currentJobIndex: state.currentJobIndex,
          scrapedJobIds: state.scrapedJobIds || [],
          atsTabId: state.atsTabId || null,
          currentPage: state.currentPage || 1,
          hasNextPage: state.hasNextPage || false,
        },
      });

      state.isActive = false;

      // Quick cleanup: close ATS tab if open
      if (state.atsTabId) {
        console.log(`[Orchestrator V2] Closing ATS tab ${state.atsTabId} before pause`);
        try {
          await chrome.tabs.remove(state.atsTabId);
        } catch (e) {
          console.warn('[Orchestrator V2] Failed to close ATS tab:', e);
        }
        state.atsTabId = null;
      }

      // If we were mid-job (after FILL form), mark it as incomplete so we skip on resume
      if (
        state.currentJobId &&
        (currentStep === 'PERSIST_COMPLETION' ||
          currentStep === 'CLEANUP' ||
          currentStep === 'FILL_ATS_FORM' ||
          currentStep === 'FILL_MODAL_FORM')
      ) {
        console.log(
          `[Orchestrator V2] Mid-job pause detected, clearing currentJobId to skip on resume`
        );
        // Clear current job so resume starts fresh with next job
        state.currentJobId = undefined;
        state.fillFormResult = undefined;
        // Move to SKIP_TO_NEXT_JOB step so resume picks up correctly
        currentStep = 'SKIP_TO_NEXT_JOB';
      }

      // Save state for resume
      await saveOrchestrationState(state);
      broadcastEngineState('IDLE', 'Agent paused - click Start to resume');
      break;
    }

    // Get step configuration from mapper
    const step = taskOrchestrationMapper[currentStep];
    if (!step) {
      console.error(`[Orchestrator V2] Step "${currentStep}" not found in mapper`);
      break;
    }

    console.log(`[Orchestrator V2] Executing: ${step.name}`);

    // Log step start with state snapshot
    const stepStartTime = Date.now();
    const debugEntryId = await logStep({
      jobId: state.currentJobId || null,
      jobIndex: state.currentJobIndex,
      step: step.name,
      action: step.action,
      inputData: data,
      stateSnapshot: {
        currentJobIndex: state.currentJobIndex,
        scrapedJobIds: state.scrapedJobIds || [],
        atsTabId: state.atsTabId || null,
        currentPage: state.currentPage || 1,
        hasNextPage: state.hasNextPage || false,
      },
    });

    try {
      // 1. Prepare step data (e.g., load vault data)
      data = await prepareStepData(step, state, data);
      // 2. Execute step action
      const actionOutput = await executeStepAction(step, state, data);
      data = actionOutput; // Pass output to next step

      // 3. Determine next step
      currentStep = determineNextStep(step, actionOutput, state);

      // Log step success
      await logStepResult(debugEntryId, {
        outputData: actionOutput,
        durationMs: Date.now() - stepStartTime,
      });

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

      // Reset step counter after moving to next job
      if (step.name === 'INCREMENT_JOB_INDEX') {
        console.log(
          `[Orchestrator V2] Resetting stepCounter after INCREMENT_JOB_INDEX (was ${stepCounter})`
        );
        stepCounter = 0;
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
      // Log step error
      await logStepResult(debugEntryId, {
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - stepStartTime,
      });

      console.error(`[Orchestrator V2] Error in step ${step.name}:`, error);
      // On error, skip to next job
      currentStep = 'SKIP_TO_NEXT_JOB';
    }
  }

  // Clear saved state if orchestration completed normally (not paused)
  if (!shouldStopOrchestration) {
    await clearOrchestrationState();
    currentOrchestrationState = null;
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
