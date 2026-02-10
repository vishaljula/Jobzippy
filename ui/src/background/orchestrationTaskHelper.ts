/**
 * Orchestration Task Helper
 * All task function implementations for Orchestrator V2
 */

import type { SequentialJobState, StepOutput } from './orchestration-types';
import { jobExists } from '../lib/jobs/store';
import { persistJobCompleted, jobIdToMetadata, registerJobFromQueue } from './job-persistence';
import { setOrchestrationStopFlag } from './orchestration';
import { backgroundVaultService, STORES } from './vault-service-worker';
import { deriveVaultPassword } from '../lib/vault/utils';
import { encodeBase64 } from '../lib/vault/crypto';
import {
  registerActiveJob,
  unregisterActiveJob,
  getAtsTabIdForJob,
  clearAtsTabForJob,
} from './orchestration-tab-detection';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Send message to content script and wait for response
 */
function sendMessageToExecutor(tabId: number, message: { type: string; data?: any }): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Broadcast engine state to UI
 */
export function broadcastEngineState(state: 'IDLE' | 'RUNNING' | 'PAUSED', status: string): void {
  chrome.runtime
    .sendMessage({
      type: 'ENGINE_STATE',
      data: {
        state,
        status,
        ts: Date.now(),
      },
    })
    .catch(() => {});
}

// ============================================================================
// TASK FUNCTION IMPLEMENTATIONS
// ============================================================================

/**
 * Step 1: START_AGENT
 * Initialize agent state and broadcast to UI
 * Note: LinkedIn/Indeed tabs are opened by sidepanel BEFORE this step
 */
async function startAgent(
  state: SequentialJobState,
  _data?: StepOutput | undefined
): Promise<StepOutput> {
  console.log('[Orchestrator V2] Step 1: START_AGENT');

  // Reset stop flag
  setOrchestrationStopFlag(false);

  // Initialize state
  state.currentJobIndex = 0;
  state.scrapedJobIds = [];
  state.isProcessing = false;
  state.isActive = true;
  state.currentPage = 0;
  state.hasNextPage = false;

  // Broadcast engine state to UI
  broadcastEngineState('RUNNING', 'Starting agent...');

  return {
    state: {
      currentJobIndex: 0,
      scrapedJobIds: [],
      isProcessing: false,
      isActive: true,
      currentPage: 0,
      hasNextPage: false,
    },
  };
}

/**
 * Step 2: SCRAPE_JOBS
 * Scrape job cards from current page (if scrapedJobIds empty or exhausted)
 */
async function scrapeJobs(
  state: SequentialJobState,
  _data?: StepOutput | undefined
): Promise<StepOutput> {
  console.log('[Orchestrator V2] Step 2: SCRAPE_JOBS');

  // Check if we need to scrape (if scrapedJobIds empty or exhausted)
  if (state.scrapedJobIds.length > 0 && state.currentJobIndex < state.scrapedJobIds.length) {
    console.log('[Orchestrator V2] Jobs already scraped, skipping scrape');
    return {}; // Use default nextStep from mapper
  }

  if (!state.tabId) {
    console.error('[Orchestrator V2] No tabId available for scraping');
    return {};
  }

  try {
    // Send SCRAPE_JOBS command to executor
    const response = await sendMessageToExecutor(state.tabId, {
      type: 'SCRAPE_JOBS',
    });

    if (response?.status === 'ok' && response?.data) {
      const { jobIds, jobs, hasNextPage, currentPage } = response.data;

      // Register job metadata - use state.platform since jobs don't include platform
      jobs.forEach((job: any) => {
        if (!jobIdToMetadata.has(job.id)) {
          registerJobFromQueue(job.id, {
            ...job,
            platform: state.platform, // Add platform from state
          });
        }
      });

      // Broadcast status update
      broadcastEngineState('RUNNING', `Found ${jobs.length} jobs on page ${currentPage}`);

      return {
        state: {
          scrapedJobIds: jobIds || [],
          hasNextPage: hasNextPage || false,
          currentPage: currentPage || 1,
          currentJobIndex: 0, // Add this line - Reset index when scraping new page
        },
        data: { jobs, jobIds, hasNextPage, currentPage },
      };
    } else {
      console.error('[Orchestrator V2] Failed to scrape jobs:', response);
      return {};
    }
  } catch (error) {
    console.error('[Orchestrator V2] Error scraping jobs:', error);
    return {};
  }
}

/**
 * Step 3: CHECK_DUPLICATE
 * Check if current job already exists in IndexedDB with terminal status
 */
async function checkDuplicate(
  state: SequentialJobState,
  _data?: StepOutput | undefined
): Promise<StepOutput> {
  console.log('[Orchestrator V2] Step 3: CHECK_DUPLICATE');

  const currentJobId = state.scrapedJobIds[state.currentJobIndex];
  if (!currentJobId) {
    console.error('[Orchestrator V2] No current job ID');
    return {};
  }

  try {
    const existing = await jobExists(state.platform.toLowerCase(), currentJobId);

    if (existing) {
      const terminalStatuses = ['completed', 'failed', 'skipped'];
      if (terminalStatuses.includes(existing.status)) {
        console.log(
          `[Orchestrator V2] Duplicate detected - job ${currentJobId} already ${existing.status}`
        );
        return {};
      }
    }

    // Job doesn't exist or can be processed
    // Register this job as active for tab detection
    if (state.tabId) {
      registerActiveJob(state.tabId, currentJobId);
    }

    // Broadcast status update
    const jobNum = state.currentJobIndex + 1;
    const totalJobs = state.scrapedJobIds.length;
    if (totalJobs > 0) {
      broadcastEngineState('RUNNING', `Processing job ${jobNum}/${totalJobs}`);
    }

    return {
      state: {
        currentJobId,
      },
    };
  } catch (error) {
    console.error('[Orchestrator V2] Error checking duplicate:', error);
    return {};
  }
}

/**
 * Step 4: CLICK_JOB_CARD
 * Click job card and wait for details to load
 */
async function clickJobCard(
  state: SequentialJobState,
  _data?: StepOutput | undefined
): Promise<StepOutput> {
  console.log('[Orchestrator V2] Step 4: CLICK_JOB_CARD');

  if (!state.tabId || !state.currentJobId) {
    console.error('[Orchestrator V2] Missing tabId or currentJobId');
    return {};
  }

  try {
    // Dismiss any lingering modals before clicking next job
    // This prevents "Save this application?" or other modals from blocking the UI
    console.log('[Orchestrator V2] Dismissing any lingering modals before clicking job card');
    try {
      await sendMessageToExecutor(state.tabId, { type: 'CLOSE_MODAL' });
      // Wait for modal close animation to complete
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.warn('[Orchestrator V2] Failed to close modal (non-fatal):', error);
      // Continue anyway - modal might not exist
    }

    // Send CLICK_JOB_BY_ID command to executor
    const response = await sendMessageToExecutor(state.tabId, {
      type: 'CLICK_JOB_BY_ID',
      data: { jobId: state.currentJobId },
    });

    if (response?.success && response?.description) {
      return {
        state: {
          jobDescription: response.description,
          applyType: response.applyType,
        },
        data: response,
      };
    } else {
      console.error('[Orchestrator V2] Failed to click job card:', response);
      return {};
    }
  } catch (error) {
    console.error('[Orchestrator V2] Error clicking job card:', error);
    return {};
  }
}

/**
 * Step 5: VERIFY_JOB_DETAILS_LOADED
 * Verify that job details were successfully loaded
 */
async function verifyJobDetailsLoaded(
  state: SequentialJobState,
  data?: StepOutput | undefined
): Promise<StepOutput> {
  console.log('[Orchestrator V2] Step 5: VERIFY_JOB_DETAILS_LOADED');

  if (!state.jobDescription || !data?.data?.success) {
    console.error('[Orchestrator V2] Job details not loaded');
    return {};
  }

  return {}; // Use default nextStep from mapper
}

/**
 * Step 6: CLICK_APPLY_BUTTON
 * Click apply button and detect modal vs external ATS
 */
async function clickApplyButton(
  state: SequentialJobState,
  _data?: StepOutput | undefined
): Promise<StepOutput> {
  console.log('[Orchestrator V2] Step 6: CLICK_APPLY_BUTTON');

  if (!state.tabId || !state.currentJobId) {
    console.error('[Orchestrator V2] Missing tabId or currentJobId');
    return {};
  }

  try {
    // Send CLICK_APPLY_BUTTON command to executor
    const response = await sendMessageToExecutor(state.tabId, {
      type: 'CLICK_APPLY_BUTTON',
      data: { jobId: state.currentJobId },
    });

    if (response?.timeout) {
      console.error('[Orchestrator V2] Timeout waiting for apply button response');
      return {};
    }

    if (response?.type === 'modal') {
      return {
        data: response,
      };
    } else if (response?.type === 'external') {
      // External ATS: tab may already be open (atsTabId present) or URL provided
      // If atsUrl is undefined, we'll get it from the tab later
      return {
        state: {
          ...(response.atsUrl ? { atsUrl: response.atsUrl } : {}),
          atsTabId: response.atsTabId || null,
        },
        data: response, // Preserve type: 'external' for mapper routing
      };
    } else {
      console.error('[Orchestrator V2] Unknown apply button response:', response);
      // Return error data so condition evaluator can handle it
      // Include atsTabId in state if present (even for unknown responses) so cleanup can close the tab
      return {
        data: { ...response, type: 'error' },
        state: response?.atsTabId
          ? {
              atsTabId: response.atsTabId,
            }
          : undefined,
      };
    }
  } catch (error) {
    console.error('[Orchestrator V2] Error clicking apply button:', error);
    return {};
  }
}

/**
 * Step 7b: FILL_MODAL_FORM
 * Fill LinkedIn modal form using intelligentNavigate()
 */
async function fillModalForm(
  state: SequentialJobState,
  data?: StepOutput | undefined
): Promise<StepOutput> {
  console.log('[Orchestrator V2] Step 7b: FILL_MODAL_FORM');

  // Broadcast status update
  if (state.currentJobId) {
    const metadata = jobIdToMetadata.get(state.currentJobId);
    const jobTitle = metadata?.title || 'job';
    broadcastEngineState('RUNNING', `Filling application form for ${jobTitle}`);
  }

  if (!state.tabId || !state.currentJobId) {
    console.error('[Orchestrator V2] Missing tabId or currentJobId');
    return {};
  }

  // Get vault data from data parameter (prepared by orchestrator via customActionParams)
  // NOTE: State should NEVER have vault data - only get from data?.data
  const vaultProfile = data?.data?.vaultProfile;
  const vaultResume = data?.data?.vaultResume;

  // Debug: Check if vaultResume is an ArrayBuffer with data
  if (vaultResume instanceof ArrayBuffer) {
    console.log(
      '[Orchestrator V2] vaultResume is ArrayBuffer, byteLength:',
      vaultResume.byteLength
    );
  } else if (vaultResume) {
    console.log(
      '[Orchestrator V2] vaultResume is not ArrayBuffer, type:',
      typeof vaultResume,
      'value:',
      vaultResume
    );
  } else {
    console.log('[Orchestrator V2] vaultResume is null/undefined');
  }

  if (!vaultProfile) {
    console.error('[Orchestrator V2] No vault profile available');
    return {};
  }

  try {
    // Convert ArrayBuffer to base64 for serialization through chrome.tabs.sendMessage
    // Use robust check for ArrayBuffer (handles cross-realm issues)
    const isArrayBuffer =
      vaultResume &&
      typeof vaultResume === 'object' &&
      'byteLength' in vaultResume &&
      Object.prototype.toString.call(vaultResume) === '[object ArrayBuffer]';

    const resumeData = isArrayBuffer
      ? {
          base64: encodeBase64(vaultResume as ArrayBuffer),
          fileName: 'resume.pdf',
          mimeType: 'application/pdf',
        }
      : vaultResume;

    console.log('[Orchestrator V2] Converted resumeData:', {
      isArrayBuffer,
      hasByteLength: !!(vaultResume && 'byteLength' in vaultResume),
      byteLength: (vaultResume as any)?.byteLength,
      hasBase64: !!resumeData?.base64,
      base64Length: resumeData?.base64?.length || 0,
      fileName: resumeData?.fileName,
    });

    // Send FILL_FORM command to executor WITH vault data
    const response = await sendMessageToExecutor(state.tabId, {
      type: 'FILL_FORM',
      data: {
        jobId: state.currentJobId,
        formType: 'linkedin_modal',
        context: 'modal',
        vaultProfile, // Pass vault data to executor
        vaultResume: resumeData, // Pass resume as serializable object
      },
    });

    // Use response directly - no need to wait for JOB_COMPLETED
    return {
      state: {
        fillFormResult: {
          success: response?.success || false,
          reason: response?.reason,
          message: response?.message,
        },
      },
      data: response,
    };
  } catch (error) {
    console.error('[Orchestrator V2] Error filling modal form:', error);
    return {
      state: {
        fillFormResult: {
          success: false,
          reason: 'error',
          message: String(error),
        },
      },
    };
  }
}

/**
 * Step 7c: OPEN_ATS_TAB
 * Open external ATS tab
 */
async function openAtsTab(
  state: SequentialJobState,
  _data?: StepOutput | undefined
): Promise<StepOutput> {
  console.log('[Orchestrator V2] Step 7c: OPEN_ATS_TAB');

  if (!state.atsUrl || !state.currentJobId) {
    console.error('[Orchestrator V2] Missing atsUrl or currentJobId');
    return {};
  }

  try {
    const atsUrlWithJob = `${state.atsUrl}?job=${state.currentJobId}`;
    const tab = await chrome.tabs.create({ url: atsUrlWithJob });

    // Programmatically inject executor-v2.js (same pattern as old flow)
    if (tab.id) {
      chrome.scripting
        .executeScript({
          target: { tabId: tab.id },
          files: ['content/executor-v2.js'],
        })
        .then(() => {
          console.log(`[Orchestrator V2] ✓ Executor-v2 injected into ATS tab ${tab.id}`);
        })
        .catch((err) => {
          console.error(
            `[Orchestrator V2] Failed to inject executor-v2 into ATS tab ${tab.id}:`,
            err
          );
        });
    }

    return {
      state: {
        atsTabId: tab.id || null,
      },
    };
  } catch (error) {
    console.error('[Orchestrator V2] Error opening ATS tab:', error);
    return {};
  }
}

/**
 * Step 7d: WAIT_FOR_ATS_READY
 * Wait for executor to be ready and classify the ATS page
 */
async function waitForAtsReady(
  state: SequentialJobState,
  _data?: StepOutput | undefined
): Promise<StepOutput> {
  console.log('[Orchestrator V2] Step 7d: WAIT_FOR_ATS_READY');

  if (!state.atsTabId || !state.currentJobId) {
    console.error('[Orchestrator V2] Missing atsTabId or currentJobId');
    return {};
  }

  const maxAttempts = 20;
  const initialDelay = 500; // Increase initial delay to give page time to open
  let lastError: Error | null = null;

  // Wait a bit before first attempt (give page time to open)
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Retry CLASSIFY_PAGE until executor is ready
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(
        `[Orchestrator V2] Attempting to classify ATS page (attempt ${attempt}/${maxAttempts})`
      );
      const classificationResponse = await sendMessageToExecutor(state.atsTabId, {
        type: 'CLASSIFY_PAGE',
      });

      if (classificationResponse?.success && classificationResponse?.pageType) {
        const pageType = classificationResponse.pageType;
        console.log(`[Orchestrator V2] ATS page classified: ${pageType}`);

        return {
          data: {
            tabId: state.atsTabId,
            jobId: state.currentJobId,
            pageType,
            classification: classificationResponse.classification,
          },
        };
      } else {
        throw new Error('Classification response missing success or pageType');
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.log(
        `[Orchestrator V2] Executor not ready yet (attempt ${attempt}/${maxAttempts}):`,
        lastError.message
      );

      // If this is not the last attempt, wait before retrying
      if (attempt < maxAttempts) {
        // Exponential backoff: 200ms, 300ms, 450ms, 675ms, etc. (max ~5 seconds)
        const delay = Math.min(initialDelay * Math.pow(1.5, attempt - 1), 5000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // All attempts failed
  console.error(
    `[Orchestrator V2] Failed to classify ATS page after ${maxAttempts} attempts:`,
    lastError?.message
  );
  return {};
}

/**
 * Step 7e: FILL_ATS_FORM
 * Fill external ATS form using intelligentNavigate()
 */
async function fillAtsForm(
  state: SequentialJobState,
  data?: StepOutput | undefined
): Promise<StepOutput> {
  console.log('[Orchestrator V2] Step 7e: FILL_ATS_FORM');

  // Broadcast status update
  if (state.currentJobId) {
    const metadata = jobIdToMetadata.get(state.currentJobId);
    const jobTitle = metadata?.title || 'job';
    broadcastEngineState('RUNNING', `Filling ATS form for ${jobTitle}`);
  }

  if (!state.atsTabId || !state.currentJobId) {
    console.error('[Orchestrator V2] Missing atsTabId or currentJobId');
    return {};
  }

  // Get vault data from data parameter (prepared by orchestrator via customActionParams)
  // NOTE: State should NEVER have vault data - only get from data?.data
  const vaultProfile = data?.data?.vaultProfile;
  const vaultResume = data?.data?.vaultResume;

  console.log('[Orchestrator V2] fillAtsForm - vault data check:', {
    hasVaultProfile: !!vaultProfile,
    hasVaultResume: !!vaultResume,
    vaultResumeType: vaultResume ? typeof vaultResume : 'null',
    isArrayBuffer: vaultResume && typeof vaultResume === 'object' && 'byteLength' in vaultResume,
  });

  if (!vaultProfile) {
    console.error('[Orchestrator V2] No vault profile available');
    return {};
  }

  try {
    // Convert ArrayBuffer to base64 for serialization through chrome.tabs.sendMessage
    // Use robust check for ArrayBuffer (handles cross-realm issues)
    const isArrayBuffer =
      vaultResume &&
      typeof vaultResume === 'object' &&
      'byteLength' in vaultResume &&
      Object.prototype.toString.call(vaultResume) === '[object ArrayBuffer]';

    const resumeData = isArrayBuffer
      ? {
          base64: encodeBase64(vaultResume as ArrayBuffer),
          fileName: 'resume.pdf',
          mimeType: 'application/pdf',
        }
      : vaultResume;

    console.log('[Orchestrator V2] fillAtsForm - sending FILL_FORM to tabId:', state.atsTabId, {
      jobId: state.currentJobId,
      formType: 'ats',
      hasVaultProfile: !!vaultProfile,
      hasResumeData: !!resumeData,
      resumeDataType: resumeData ? (resumeData.base64 ? 'base64' : 'other') : 'null',
      resumeDataBase64Length: resumeData?.base64?.length || 0,
    });

    // Send FILL_FORM command to ATS tab executor WITH vault data
    const response = await sendMessageToExecutor(state.atsTabId, {
      type: 'FILL_FORM',
      data: {
        jobId: state.currentJobId,
        formType: 'ats',
        context: 'full_page',
        vaultProfile, // Pass vault data to executor
        vaultResume: resumeData, // Pass resume as serializable object
      },
    });

    console.log('[Orchestrator V2] fillAtsForm - received response from executor:', response);

    // Use response directly - no need to wait for ATS_COMPLETE
    return {
      state: {
        fillFormResult: {
          success: response?.success || false,
          reason: response?.reason,
          message: response?.message,
        },
        // Don't clear atsTabId here - let cleanup step handle closing the tab
      },
      data: response,
    };
  } catch (error) {
    console.error('[Orchestrator V2] Error filling ATS form:', error);
    console.error('[Orchestrator V2] Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      atsTabId: state.atsTabId,
      currentJobId: state.currentJobId,
    });
    return {
      state: {
        fillFormResult: {
          success: false,
          reason: 'error',
          message: error instanceof Error ? error.message : String(error),
        },
      },
    };
  }
}

/**
 * Step 7d1: CLICK_ATS_INTERMEDIATE_BUTTON
 * Click the intermediate "Apply" button on ATS page (opens modal/form)
 */
async function clickAtsIntermediateButton(
  state: SequentialJobState,
  _data?: StepOutput | undefined
): Promise<StepOutput> {
  console.log('[Orchestrator V2] Step 7d1: CLICK_ATS_INTERMEDIATE_BUTTON');

  if (!state.atsTabId || !state.currentJobId) {
    console.error('[Orchestrator V2] Missing atsTabId or currentJobId');
    return {};
  }

  try {
    // Send CLICK_INTERMEDIATE_BUTTON command to executor
    const response = await sendMessageToExecutor(state.atsTabId, {
      type: 'CLICK_INTERMEDIATE_BUTTON',
      data: { jobId: state.currentJobId },
    });

    if (response?.success) {
      // After clicking, go back to WAIT_FOR_ATS_READY to re-classify
      return {};
    } else {
      console.error('[Orchestrator V2] Failed to click intermediate button');
      return {};
    }
  } catch (error) {
    console.error('[Orchestrator V2] Error clicking intermediate button:', error);
    return {};
  }
}

/**
 * Step 7d2: CLICK_ATS_MODAL_BUTTON
 * Click the "manual apply" button in ATS modal
 */
async function clickAtsModalButton(
  state: SequentialJobState,
  _data?: StepOutput | undefined
): Promise<StepOutput> {
  console.log('[Orchestrator V2] Step 7d2: CLICK_ATS_MODAL_BUTTON');

  if (!state.atsTabId || !state.currentJobId) {
    console.error('[Orchestrator V2] Missing atsTabId or currentJobId');
    return {};
  }

  try {
    // Send CLICK_MODAL_BUTTON command to executor
    // Pass the selector for "manual apply" button
    const response = await sendMessageToExecutor(state.atsTabId, {
      type: 'CLICK_MODAL_BUTTON',
      data: {
        jobId: state.currentJobId,
        selector: 'a[data-automation-id="applyManually"]', // Manual apply button
      },
    });

    if (response?.success) {
      // After clicking, go back to WAIT_FOR_ATS_READY to re-classify
      return {};
    } else {
      console.error('[Orchestrator V2] Failed to click modal button');
      return {};
    }
  } catch (error) {
    console.error('[Orchestrator V2] Error clicking modal button:', error);
    return {};
  }
}

/**
 * Step 8: PERSIST_COMPLETION
 * Persist job completion to IndexedDB (ONLY persistence point)
 */
async function persistCompletion(
  state: SequentialJobState,
  _data?: StepOutput | undefined
): Promise<StepOutput> {
  console.log('[Orchestrator V2] Step 8: PERSIST_COMPLETION');

  if (!state.currentJobId || !state.fillFormResult) {
    console.error('[Orchestrator V2] Missing currentJobId or fillFormResult');
    return {}; // Continue anyway
  }

  const { success, reason, message } = state.fillFormResult;

  // Determine status based on reason
  let finalSuccess = success;
  let finalError: string | undefined = message || reason;

  if (reason === 'complex_captcha' || reason === 'account_required') {
    finalSuccess = false;
    finalError = reason;
  } else if (reason === 'manual_input_required') {
    finalSuccess = false;
    finalError = reason;
  } else if (reason === 'form_found' && success) {
    finalSuccess = true;
    finalError = undefined;
  } else if (reason === 'form_found' && !success) {
    finalSuccess = false;
    finalError = message || reason;
  } else if (reason === 'max_attempts' || reason === 'unknown_page') {
    finalSuccess = false;
    finalError = reason;
  }

  try {
    await persistJobCompleted(state.currentJobId, finalSuccess, finalError);

    // Track event
    console.log(
      `[Orchestrator V2] Job ${state.currentJobId} ${finalSuccess ? 'successfully applied' : `failed: ${finalError}`}`
    );
  } catch (error) {
    console.error('[Orchestrator V2] Error persisting completion:', error);
  }

  return {};
}

/**
 * Step 9: CLEANUP
 * Clear atsTabId, close ATS tab, and clear any timeouts
 */
async function cleanup(
  state: SequentialJobState,
  _data?: StepOutput | undefined
): Promise<StepOutput> {
  console.log('[Orchestrator V2] Step 9: CLEANUP');

  // Get atsTabId from state, or fallback to tab detection mapping if not in state
  let atsTabIdToClose = state.atsTabId;

  if (!atsTabIdToClose && state.currentJobId) {
    // Fallback: check tab detection mapping for atsTabId (tab might have been opened but not in state)
    atsTabIdToClose = getAtsTabIdForJob(state.currentJobId);
    if (atsTabIdToClose) {
      console.log(
        `[Orchestrator V2] Found atsTabId ${atsTabIdToClose} from tab detection for job ${state.currentJobId}`
      );
    }
  }

  // Close ATS tab if it exists (external ATS like Greenhouse, Workday)
  if (atsTabIdToClose) {
    console.log(`[Orchestrator V2] Closing ATS tab ${atsTabIdToClose}`);
    chrome.tabs.remove(atsTabIdToClose).catch((error) => {
      console.warn(`[Orchestrator V2] Failed to close ATS tab ${atsTabIdToClose}:`, error);
    });
  }

  // Close any open modal on the LinkedIn tab
  // This prevents stale modals when moving to the next job after errors/skips
  if (state.tabId) {
    console.log(`[Orchestrator V2] Closing modal on tab ${state.tabId}`);
    try {
      await sendMessageToExecutor(state.tabId, { type: 'CLOSE_MODAL' });
    } catch (error) {
      console.warn('[Orchestrator V2] Failed to close modal:', error);
      // Non-fatal - modal might already be closed or tab might be gone
    }
  }

  // Clean up tab detection mappings
  if (state.currentJobId) {
    clearAtsTabForJob(state.currentJobId);
  }
  if (state.tabId) {
    unregisterActiveJob(state.tabId);
  }

  return {
    state: {
      atsTabId: null,
      fillFormResult: undefined,
    },
  };
}

/**
 * Step 10: INCREMENT_JOB_INDEX
 * Increment currentJobIndex to move to next job
 */
async function incrementJobIndex(
  state: SequentialJobState,
  _data?: StepOutput | undefined
): Promise<StepOutput> {
  console.log('[Orchestrator V2] Step 10: INCREMENT_JOB_INDEX');

  return {
    state: {
      currentJobIndex: (state.currentJobIndex || 0) + 1,
      currentJobId: undefined,
      jobDescription: undefined,
      applyType: undefined,
      atsUrl: undefined,
    },
  };
}

/**
 * Step 11: CHECK_MORE_JOBS_ON_PAGE
 * Check if there are more jobs on current page
 */
async function checkMoreJobsOnPage(
  _state: SequentialJobState,
  _data?: StepOutput | undefined
): Promise<StepOutput> {
  console.log('[Orchestrator V2] Step 11: CHECK_MORE_JOBS_ON_PAGE');

  // Condition is evaluated in mapper based on state
  // No need to return nextStep here - orchestrator will handle it
  return {};
}

/**
 * Step 12: CHECK_NEXT_PAGE
 * Check if there's a next page and navigate if available
 */
async function checkNextPage(
  state: SequentialJobState,
  _data?: StepOutput | undefined
): Promise<StepOutput> {
  console.log('[Orchestrator V2] Step 12: CHECK_NEXT_PAGE');

  if (state.hasNextPage && state.tabId) {
    try {
      // Send NAVIGATE_NEXT_PAGE command to executor
      const response = await sendMessageToExecutor(state.tabId, {
        type: 'NAVIGATE_NEXT_PAGE',
      });

      if (response?.success) {
        // Navigate to scrape new page
        return { data: { success: true, ...response } };
      } else {
        console.error('[Orchestrator V2] Failed to navigate to next page');
        return { data: { success: false } };
      }
    } catch (error) {
      console.error('[Orchestrator V2] Error navigating to next page:', error);
      return { data: { success: false } };
    }
  } else {
    // No next page - done (condition evaluator will check hasNextPage)
    return { data: { success: false } };
  }
}

/**
 * Step 13: SKIP_TO_NEXT_JOB
 * Skip current job (duplicate or error) and move to next
 */
async function skipToNextJob(
  state: SequentialJobState,
  _data?: StepOutput | undefined
): Promise<StepOutput> {
  console.log('[Orchestrator V2] Step 13: SKIP_TO_NEXT_JOB');

  // Just increment index - no persistence needed (already handled or will be handled)
  return {
    state: {
      currentJobIndex: (state.currentJobIndex || 0) + 1,
      currentJobId: undefined,
      jobDescription: undefined,
      applyType: undefined,
      atsUrl: undefined,
    },
  };
}

/**
 * Step 14: DONE
 * Cleanup and mark orchestration as complete
 */
async function done(
  _state: SequentialJobState,
  _data?: StepOutput | undefined
): Promise<StepOutput> {
  console.log('[Orchestrator V2] Step 14: DONE');

  // Set engine state to IDLE
  broadcastEngineState('IDLE', 'Agent stopped');

  // Cleanup state
  return {
    state: {
      isActive: false,
      isProcessing: false,
      currentJobIndex: 0,
      scrapedJobIds: [],
      currentJobId: undefined,
      jobDescription: undefined,
      applyType: undefined,
      atsUrl: undefined,
      atsTabId: null,
      fillFormResult: undefined,
    },
  };
}

// ============================================================================
// TASK ACTION PARAM HANDLERS
// ============================================================================
// These functions prepare data needed by tasks (vault decryption, etc.)

/**
 * Load and decrypt vault profile and resume data
 * Called before tasks that need vault data (FILL_MODAL_FORM, FILL_ATS_FORM)
 *
 * IMPORTANT:
 * - Vault data is decrypted per-form, NOT stored in state
 * - Subscription must be checked BEFORE decryption
 * - Never returns mock data - fails properly if data missing
 */
export async function loadVaultData(_state: SequentialJobState): Promise<Partial<StepOutput>> {
  console.log('[Orchestrator V2] Loading vault data...');

  try {
    // TODO: Check subscription status BEFORE decrypting
    // If not subscribed, return null and skip form filling
    // const isSubscribed = await checkSubscriptionStatus();
    // if (!isSubscribed) {
    //   console.warn('[Orchestrator V2] User not subscribed, cannot decrypt vault data');
    //   return {
    //     data: {
    //       vaultProfile: null,
    //       vaultResume: null,
    //     },
    //   };
    // }

    // Get user info to derive password
    const storage = await chrome.storage.local.get('user_info');
    const user = storage.user_info;

    if (!user) {
      console.error('[Orchestrator V2] No user info found, cannot load vault');
      return {
        data: {
          vaultProfile: null,
          vaultResume: null,
        },
      };
    }

    const password = deriveVaultPassword(user);
    console.log(
      '[Orchestrator V2] Derived vault password (masked):',
      password.substring(0, 10) + '...'
    );

    // Load BOTH profile and history stores from vault
    const profile = await backgroundVaultService.load(STORES.profile, password);
    const history = await backgroundVaultService.load(STORES.history, password);

    // Load resume from vault
    const resume = await backgroundVaultService.loadResume(password);

    if (!profile) {
      console.error('[Orchestrator V2] No profile found in vault');
      return {
        data: {
          vaultProfile: null,
          vaultResume: null,
        },
      };
    }

    // Merge history into profile so employment/education/skills data is accessible
    const mergedProfile = {
      ...profile,
      history: history || { employment: [], education: [], skills: [] },
    };

    console.log('[Orchestrator V2] Vault data loaded successfully', {
      hasHistory: !!history,
      employmentCount: mergedProfile.history?.employment?.length || 0,
      skillsCount: mergedProfile.history?.skills?.length || 0,
    });

    return {
      // NOTE: Do NOT update state with vault data - it should never be stored in state
      data: {
        vaultProfile: mergedProfile,
        vaultResume: resume,
      },
    };
  } catch (error) {
    console.error('[Orchestrator V2] Error loading vault data:', error);
    return {
      data: {
        vaultProfile: null,
        vaultResume: null,
      },
    };
  }
}

// Registry of task action param handlers
export const taskActionParamHandlers: Record<
  string,
  (state: SequentialJobState) => Promise<Partial<StepOutput>>
> = {
  loadVaultData,
};

// ============================================================================
// EXPORT SINGLE OBJECT
// ============================================================================
/**
 * Step: FILL_MODAL_PAGE (Recursive)
 * Execute strictly ONE page action (stateless)
 * Returns status: 'progressed' | 'completed' | 'blocked'
 */
async function executePageAction(
  state: SequentialJobState,
  data?: StepOutput | undefined
): Promise<StepOutput> {
  console.log('[Orchestrator V2] Step: EXECUTE_PAGE_ACTION');

  if (!state.currentJobId || !state.tabId) {
    console.error('[Orchestrator V2] Missing currentJobId or tabId');
    return { data: { actionResult: 'error' } };
  }

  const vaultProfile = data?.data?.vaultProfile;
  const vaultResume = data?.data?.vaultResume;

  if (!vaultProfile) {
    console.error('[Orchestrator V2] Missing vault profile data');
    return { data: { actionResult: 'error' } };
  }

  try {
    console.log('[Orchestrator V2] Sending EXECUTE_PAGE_ACTION to content script');
    const response = await sendMessageToExecutor(state.tabId, {
      type: 'EXECUTE_PAGE_ACTION',
      data: {
        jobId: state.currentJobId,
        vaultProfile,
        vaultResume,
      },
    });

    console.log('[Orchestrator V2] Page action response:', response);

    // Map content script result to orchestrator state
    // Response: { status: 'progressed' | 'completed' | 'blocked', reason?: string }
    return {
      state: {
        fillFormResult: {
          success: response?.status === 'completed' || response?.status === 'progressed',
          reason: response?.status,
          message: response?.reason,
        },
      },
      data: {
        actionResult: response?.status || 'error',
        message: response?.reason,
      },
    };
  } catch (error) {
    console.error('[Orchestrator V2] Error executing page action:', error);
    return { data: { actionResult: 'error' } };
  }
}

/**
 * Step: WAIT_AND_RETRY_FILL
 * Wait for page load/transition before looping back
 */
async function waitForPageLoad(
  _state: SequentialJobState,
  _data?: StepOutput | undefined
): Promise<StepOutput> {
  console.log('[Orchestrator V2] Step: WAIT_AND_RETRY_FILL (Sleeping 1s)');
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return {};
}

/**
 * Step: CLEANUP_AND_SKIP
 * Close modal and advance to next job
 */
async function closeModalAndSkip(
  state: SequentialJobState,
  _data?: StepOutput | undefined
): Promise<StepOutput> {
  console.log('[Orchestrator V2] Step: CLEANUP_AND_SKIP');

  if (state.tabId) {
    try {
      // Attempt to close modal
      await sendMessageToExecutor(state.tabId, { type: 'CLOSE_MODAL' });
    } catch (e) {
      console.warn('[Orchestrator V2] Failed to close modal during cleanup:', e);
    }
  }

  return { data: { status: 'skipped' } };
}

export const orchestrationTasks: Record<
  string,
  (state: SequentialJobState, data?: StepOutput | undefined) => Promise<StepOutput>
> = {
  startAgent,
  scrapeJobs,
  checkDuplicate,
  clickJobCard,
  verifyJobDetailsLoaded,
  clickApplyButton,
  executePageAction, // New
  waitForPageLoad, // New
  closeModalAndSkip, // New
  fillModalForm, // Keep for backward compatibility if needed, or delete? Lets keep but not use.
  openAtsTab,
  waitForAtsReady,
  fillAtsForm,
  persistCompletion,
  cleanup,
  incrementJobIndex,
  checkMoreJobsOnPage,
  checkNextPage,
  skipToNextJob,
  done,
  clickAtsIntermediateButton,
  clickAtsModalButton,
};
