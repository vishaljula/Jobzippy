import { intelligentNavigate } from '../ats/navigator';
import { logger } from '../../lib/logger';
import {
  waitForJobDetailsDom,
  waitForLinkedInModal,
  waitForMessage,
} from '../../lib/dom-waits';
import type {
  ApplyJobStartMessage,
  JobCompletedMessage,
  ExternalATSOpenedMessage,
  LinkedInModalDetectedMessage,
} from '../../types/job-session';

/**
 * Agent Controller Interfaces
 */
export interface JobCard {
  id: string;
  title: string;
  company: string;
  location: string;
  applyType?: 'easy_apply' | 'external' | 'unknown';
}

export interface AgentConfig {
  platform: 'LinkedIn' | 'Indeed';
  maxApplications?: number;
  delayBetweenJobs?: number;
}

export interface AgentResult {
  success: boolean;
  jobsProcessed: number;
  jobsApplied: number;
  errors: Array<{ jobId: string; error: string; stack?: string }>;
}

/**
 * Agent Controller Class
 * Orchestrates the complete job application flow
 */
class AgentController {
  private config: AgentConfig;
  private shouldStop: boolean = false;

  private lastAlertMessage: string | null = null;
  public lastJobAppliedTime: number = Date.now();
  private inactivityTimeoutId: number | null = null;
  // Promise map for waiting job completion
  public pendingJobs: Map<string, {
    resolve: (result: { success: boolean; error?: string }) => void;
    reject: (error: Error) => void;
    timeoutId?: number;
  }> = new Map();
  public results: AgentResult = {
    success: true,
    jobsProcessed: 0,
    jobsApplied: 0,
    errors: [],
  };

  constructor(config: AgentConfig) {
    this.config = config;
  }

  public resetInactivityTimeout(): void {
    // Clear existing timeout
    if (this.inactivityTimeoutId !== null) {
      clearTimeout(this.inactivityTimeoutId);
      this.inactivityTimeoutId = null;
    }

    // Set new timeout: if no jobs applied in last 2 minutes, stop
    this.inactivityTimeoutId = setTimeout(() => {
      const timeSinceLastApplication = Date.now() - this.lastJobAppliedTime;
      if (timeSinceLastApplication > 120000 && this.results.jobsApplied > 0) {
        logger.log('AgentController', 'Inactivity timeout: No jobs applied in last 2 minutes');
        console.log('[AgentController] Inactivity timeout: No jobs applied in last 2 minutes');
        this.shouldStop = true;
        this.broadcastStatus('IDLE', 'Inactivity timeout: No jobs applied in last 2 minutes');
      }
    }, 120000) as unknown as number;
  }

  private injectAlertHandler(): void {
    // Inject alert override script via src to avoid CSP issues
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('page-script.js');
    script.onload = function () {
      console.log('[Jobzippy] Page script injected successfully');
      (this as HTMLScriptElement).remove();
    };
    (document.head || document.documentElement).appendChild(script);

    // Listen for the custom event
    window.addEventListener('JOBZIPPY_ALERT', (event: any) => {
      this.lastAlertMessage = event.detail.message;
      logger.log('AgentController', `Intercepted alert: ${event.detail.message}`);
    });
  }

  async start(): Promise<AgentResult> {
    this.injectAlertHandler();

    // Add separator for new agent run
    logger.log('AgentController', '='.repeat(80));
    logger.log('AgentController', '========== STARTING AGENT ==========');
    logger.log('AgentController', `Platform: ${this.config.platform}`);
    logger.log('AgentController', `Max applications: ${this.config.maxApplications}`);
    logger.log('AgentController', `Timestamp: ${new Date().toISOString()}`);
    logger.log('AgentController', '='.repeat(80));

    console.log('[AgentController] ========== STARTING AGENT ==========');
    logger.log('AgentController', '========== STARTING AGENT ==========');
    logger.log('AgentController', `Platform: ${this.config.platform}`);
    logger.log('AgentController', `Max applications: ${this.config.maxApplications}`);

    console.log('[AgentController] Platform:', this.config.platform);
    console.log('[AgentController] Max applications:', this.config.maxApplications);

    // Broadcast that agent is starting
    this.broadcastStatus('RUNNING', 'Starting agent...');

    this.shouldStop = false;
    this.results = {
      success: true,
      jobsProcessed: 0,
      jobsApplied: 0,
      errors: [],
    };

    try {
      // Set up inactivity timeout for the whole run: if no jobs applied in last 2 minutes, stop
      this.lastJobAppliedTime = Date.now();
      this.resetInactivityTimeout();

      let pageIndex = 1;
      let jobs = await this.getJobs();
      console.log('[AgentController] Found', jobs.length, 'jobs on page', pageIndex, jobs);

      if (jobs.length === 0) {
        console.warn('[AgentController] No jobs found on first page!');
        this.broadcastStatus('IDLE', 'No jobs found');
        return this.results;
      }

      // Outer loop: iterate over search result pages until limits or end of results
      while (true) {
        console.log('[AgentController] ===== Processing search page', pageIndex, '=====');
        this.broadcastStatus('RUNNING', `Processing ${jobs.length} jobs on page ${pageIndex}...`);

        // Process each job sequentially on the current page
        for (const job of jobs) {
          if (this.shouldStop) {
            console.log('[AgentController] Stopped by user');
            this.broadcastStatus('IDLE', 'Stopped by user');
            break;
          }

          // Check inactivity timeout: if no jobs applied in last 2 minutes, stop
          const timeSinceLastApplication = Date.now() - this.lastJobAppliedTime;
          if (timeSinceLastApplication > 120000 && this.results.jobsApplied > 0) {
            console.log(
              '[AgentController] Inactivity timeout: No jobs applied in last 2 minutes'
            );
            logger.log(
              'AgentController',
              'Inactivity timeout: No jobs applied in last 2 minutes'
            );
            this.broadcastStatus(
              'IDLE',
              'Inactivity timeout: No jobs applied in last 2 minutes'
            );
            this.shouldStop = true;
            break;
          }

          // Check max applications limit
          if (
            this.config.maxApplications &&
            this.results.jobsApplied >= this.config.maxApplications
          ) {
            console.log('[AgentController] Reached max applications limit');
            this.broadcastStatus(
              'IDLE',
              `Completed: ${this.results.jobsApplied} applications submitted`
            );
            this.shouldStop = true;
            break;
          }

          console.log('[AgentController] ========== Processing job', job.id, '==========');
          this.broadcastStatus('RUNNING', `Applying to: ${job.title}`);
          await this.processJob(job);

          // Delay between jobs
          if (this.config.delayBetweenJobs) {
            console.log(
              '[AgentController] Waiting',
              this.config.delayBetweenJobs,
              'ms before next job'
            );
            await this.delay(this.config.delayBetweenJobs);
          }
        }

        // If we were asked to stop or hit limits, exit outer loop
        if (this.shouldStop) {
          break;
        }
        if (
          this.config.maxApplications &&
          this.results.jobsApplied >= this.config.maxApplications
        ) {
          break;
        }

        // Only LinkedIn currently supports multi-page navigation in this controller.
        if (this.config.platform !== 'LinkedIn') {
          console.log(
            '[AgentController] Non-LinkedIn platform: skipping pagination and stopping after first page'
          );
          break;
        }

        // Attempt to navigate to next page and wait for new jobs to load.
        const nextJobs = await this.goToNextPageAndLoadJobs(jobs);
        if (!nextJobs || nextJobs.length === 0) {
          console.log(
            '[AgentController] No next page available or next page has no jobs, stopping agent'
          );
          break;
        }

        pageIndex += 1;
        jobs = nextJobs;
      }

      console.log('[AgentController] ========== AGENT COMPLETED ==========');
      console.log('[AgentController] Results:', this.results);
      this.broadcastStatus('IDLE', `Completed: ${this.results.jobsApplied} applications submitted`);
      return this.results;
    } catch (error) {
      console.error('[AgentController] ========== AGENT ERROR ==========');
      console.error('[AgentController] Error:', error);
      this.results.success = false;
      this.broadcastStatus('IDLE', 'Error occurred');
      return this.results;
    }
  }

  private broadcastStatus(state: 'IDLE' | 'RUNNING' | 'PAUSED', status: string): void {
    chrome.runtime
      .sendMessage({
        type: 'ENGINE_STATE',
        data: { state, status },
      })
      .catch(() => { });
  }

  stop(): void {
    console.log('[AgentController] Stopping agent...');
    this.shouldStop = true;
  }

  /**
   * NEW ARCHITECTURE: Event-driven processJob
   * Uses DOM-based waits and event-driven communication instead of polling
   */
  private async processJob(job: JobCard): Promise<void> {
    logger.log('AgentController', `Processing job: ${job.title} at ${job.company}`);
    logger.log('AgentController', 'Job details', job);
    this.results.jobsProcessed++;

    try {
      const jobId = job.id;
      logger.log('AgentController', `Step 0: Starting processJob for jobId=${jobId}`);

      // 1. Register job with background BEFORE clicking anything
      // Note: Background script will extract sourceTabId from message sender
      logger.log('AgentController', 'Step 1: Registering job with background...');
      await chrome.runtime.sendMessage({
        type: 'APPLY_JOB_START',
        data: { jobId },
      } as ApplyJobStartMessage);
      logger.log('AgentController', `Job ${jobId} registered with background`);

      // 2. Setup promise BEFORE clicking Apply button
      logger.log('AgentController', 'Step 2: Setting up job completion promise...');
      const jobPromise = this.waitForJobCompletion(jobId);

      // 3. Click job card and wait for details (DOM-based)
      logger.log('AgentController', 'Step 3: Clicking job card...');
      await this.clickJobCard(job);
      try {
        await waitForJobDetailsDom(5000);
        logger.log('AgentController', 'Job details panel loaded');
      } catch (error) {
        logger.error('AgentController', 'Job details panel did not load:', error);
        this.results.errors.push({ jobId, error: 'Job details panel did not load' });
        return;
      }

      // 4. Click Apply button
      logger.log('AgentController', 'Step 4: Clicking Apply button...');
      const applyClicked = await this.clickApplyButton();
      if (!applyClicked) {
        logger.error('AgentController', `Could not click apply button for ${jobId}`);
        this.results.errors.push({ jobId, error: 'Apply button not found' });
        return;
      }

          // 5. Race between LinkedIn modal vs External ATS tab (event-driven, no timeouts)
          logger.log('AgentController', 'Step 5: Waiting for modal or external ATS...');
          try {
            // Pure event-driven: wait for either modal (DOM event) or external ATS (message event)
            // No timeouts - events will fire when they occur
            const outcome = await Promise.race([
              // Option 1: LinkedIn modal appears (DOM-based, event-driven)
              waitForLinkedInModal(0).then((hasModal) => ({
                type: 'LINKEDIN_MODAL' as const,
                hasModal,
              })),
              // Option 2: External ATS tab opened (event from background, event-driven)
              waitForMessage<ExternalATSOpenedMessage['data']>('EXTERNAL_ATS_OPENED', jobId, 0).then(
                (message) => ({
                  type: 'EXTERNAL_ATS_OPENED' as const,
                  data: message.data,
                })
              ),
            ]).catch((error) => {
              // If Promise.race fails, handle it
              logger.error('AgentController', `Error in Promise.race:`, error);
              throw error; // Re-throw to be caught by outer catch
            });

            if (outcome.type === 'LINKEDIN_MODAL' && outcome.hasModal) {
              // LinkedIn modal flow
              logger.log('AgentController', 'LinkedIn modal detected, filling form...');
              
              // Notify background that LinkedIn modal was detected
              await chrome.runtime.sendMessage({
                type: 'LINKEDIN_MODAL_DETECTED',
                data: { jobId },
              } as LinkedInModalDetectedMessage).catch(() => {});
              
              this.lastAlertMessage = null;
              logger.log('AgentController', 'Calling intelligentNavigate() to fill LinkedIn modal form...');
              console.log('[AgentController] Calling intelligentNavigate() to fill LinkedIn modal form...');
      const result = await intelligentNavigate();
              logger.log('AgentController', 'intelligentNavigate() completed', result);
              console.log('[AgentController] intelligentNavigate() completed:', result);

              // Check for success alert
      const alertMsg = this.lastAlertMessage;
      if (
        !result.success &&
        alertMsg &&
        ((alertMsg as string).toLowerCase().includes('success') ||
          (alertMsg as string).toLowerCase().includes('submitted'))
      ) {
        result.success = true;
        result.message = 'Application submitted successfully (via alert)';
      }

              const success = result.success;
              logger.log('AgentController', `LinkedIn modal result: ${success}`);

              // Notify background
              await chrome.runtime.sendMessage({
                type: 'JOB_COMPLETED',
                data: { jobId, success, error: result.message },
              } as JobCompletedMessage);

              if (success) {
        logger.log('AgentController', `✓ Successfully applied to ${job.title}`);
        this.results.jobsApplied++;
                this.lastJobAppliedTime = Date.now();
                this.resetInactivityTimeout();
        chrome.runtime
          .sendMessage({
            type: 'JOB_APPLIED',
            data: { job, platform: this.config.platform },
          })
                  .catch(() => {});
      } else {
                logger.error('AgentController', `Failed to submit LinkedIn modal for ${jobId}`);
        this.results.errors.push({
                  jobId,
          error: result.message || 'Form submission failed',
        });
      }

      await this.closeModal();
            } else if (outcome.type === 'EXTERNAL_ATS_OPENED') {
              // External ATS flow - wait for completion
              logger.log('AgentController', `External ATS opened: tab ${outcome.data.atsTabId}`);
              logger.log('AgentController', 'Waiting for external ATS to complete...');

              await this.closeModal();

              // Wait for EXTERNAL_ATS_DONE message (event-driven, no timeout)
              logger.log('AgentController', `Waiting for jobPromise to resolve for jobId=${jobId}...`);
              try {
                // Pure event-driven: wait for jobPromise to resolve (no timeout)
                // High-level inactivity timeout (2 minutes) will stop the agent if nothing happens
                const result = await jobPromise;
                logger.log('AgentController', `External ATS completed: success=${result.success}`);

                if (result.success) {
                  logger.log('AgentController', `✓ Successfully applied to ${job.title} (external ATS)`);
                  this.results.jobsApplied++;
                  this.lastJobAppliedTime = Date.now();
                  this.resetInactivityTimeout();
                  chrome.runtime
                    .sendMessage({
                      type: 'JOB_APPLIED',
                      data: { job, platform: this.config.platform },
                    })
                    .catch(() => {});
                } else {
                  logger.error('AgentController', `External ATS failed for ${jobId}: ${result.error}`);
                  this.results.errors.push({
                    jobId,
                    error: result.error || 'External ATS application failed',
                  });
                }
    } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                const errorStack = error instanceof Error ? error.stack : undefined;
                logger.error('AgentController', `ERROR: Error waiting for EXTERNAL_ATS_DONE for jobId=${jobId}:`, {
                  message: errorMessage,
                  stack: errorStack,
                  error: error,
                });
                console.error('[AgentController] ERROR: Error waiting for EXTERNAL_ATS_DONE:', error);
                this.results.errors.push({
                  jobId,
                  error: errorMessage,
                  stack: errorStack,
                });
              }
            } else {
              // This should never happen in pure event-driven architecture
              // Both waitForLinkedInModal and waitForMessage wait indefinitely
              // This branch is only reached if outcome.type doesn't match either case
              logger.error('AgentController', `Unexpected outcome type: ${(outcome as any).type} for jobId=${jobId}`);
              this.results.errors.push({
                jobId,
                error: 'Unexpected outcome: neither modal nor external ATS',
              });
              // Reject the jobPromise to ensure it doesn't hang
              const pending = this.pendingJobs.get(jobId);
              if (pending) {
                clearTimeout(pending.timeoutId);
                pending.reject(new Error('Unexpected outcome: neither modal nor external ATS'));
                this.pendingJobs.delete(jobId);
              }
            }
          } catch (error) {
          logger.error('AgentController', `Error in race condition:`, error);
          this.results.errors.push({
            jobId,
            error: error instanceof Error ? error.message : String(error),
          });
          // Reject the jobPromise to ensure it doesn't hang
          const pending = this.pendingJobs.get(jobId);
          if (pending) {
            clearTimeout(pending.timeoutId);
            pending.reject(error instanceof Error ? error : new Error(String(error)));
            this.pendingJobs.delete(jobId);
          }
        }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      console.error('[AgentController] Error processing job', job.id, ':', error);
      logger.error('AgentController', `Error processing job ${job.id}:`, errorMessage);
      if (errorStack) {
        logger.error('AgentController', `Error stack:`, errorStack);
      }
      
      this.results.errors.push({ 
        jobId: job.id, 
        error: errorMessage,
        stack: errorStack 
      });
    }
  }

  /**
   * Wait for job completion (external ATS flow)
   * Returns a promise that resolves when EXTERNAL_ATS_DONE is received
   */
  private waitForJobCompletion(
    jobId: string
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.pendingJobs.has(jobId)) {
          logger.error('AgentController', `Timeout waiting for job completion: ${jobId}`);
          this.pendingJobs.delete(jobId);
          reject(new Error('Job completion timeout (5 minutes)'));
        }
      }, 300000) as unknown as number; // 5 minutes

      this.pendingJobs.set(jobId, {
        resolve,
        reject,
        timeoutId,
      });

      logger.log('AgentController', `Promise stored for job ${jobId}, waiting for EXTERNAL_ATS_DONE...`);
    });
  }

  private async getJobs(): Promise<JobCard[]> {
    // Call scrapeJobCards directly instead of message passing
    const scrapedJobs = scrapeJobCards();
    console.log('[AgentController] Found', scrapedJobs.length, 'jobs on page');
    return scrapedJobs;
  }

  /**
   * Navigate to the next search results page and wait for a fresh set of jobs.
   * Returns null if there is no next page or jobs failed to change within timeout.
   */
  private async goToNextPageAndLoadJobs(previousJobs: JobCard[]): Promise<JobCard[] | null> {
    const previousIds = previousJobs.map((j) => j.id);
    console.log('[AgentController] Attempting to navigate to next search results page...', {
      previousIds,
    });

    const navigated = navigateToNextPage();
    if (!navigated) {
      console.log(
        '[AgentController] navigateToNextPage() returned false - no next page button/link found or it is disabled'
      );
      return null;
    }

    const timeoutMs = 10000;
    const start = performance.now();

    while (performance.now() - start < timeoutMs) {
      const newJobs = scrapeJobCards();
      const newIds = newJobs.map((j) => j.id);

      const sameLength = previousIds.length === newIds.length;
      const sameIds =
        sameLength && previousIds.every((id, idx) => id === newIds[idx]);

      if (newJobs.length > 0 && !sameIds) {
        console.log(
          '[AgentController] Next page jobs loaded',
          newJobs.length,
          'jobs:',
          newJobs
        );
        return newJobs;
      }

      await this.delay(200);
    }

    console.warn(
      '[AgentController] Timeout waiting for next page jobs to load; stopping pagination'
    );
    return null;
  }

  private async clickJobCard(job: JobCard): Promise<void> {
    console.log('[AgentController] Clicking job card:', job.id);
    if (this.config.platform === 'LinkedIn') {
      await this.clickLinkedInJobCard(job);
    } else if (this.config.platform === 'Indeed') {
      await this.clickIndeedJobCard(job);
    }
  }

  private async clickLinkedInJobCard(job: JobCard): Promise<void> {
    const card = document.querySelector(`[data-job-id="${job.id}"]`) as HTMLElement;
    if (!card) throw new Error('Job card not found');

    // Click the card container directly to trigger the details panel update
    console.log('[AgentController] Clicking job card container for:', job.id);
    card.click();
  }

  private async clickIndeedJobCard(job: JobCard): Promise<void> {
    let card = document.querySelector(`[data-jk="${job.id}"]`) as HTMLElement;
    if (!card && job.id.startsWith('mock-')) {
      card = document
        .querySelector(`a[href*="${job.id}"]`)
        ?.closest('.jobsearch-SerpJobCard') as HTMLElement;
    }
    if (!card) throw new Error('Job card not found');

    // Click the card container directly
    console.log('[AgentController] Clicking job card container for:', job.id);
    card.click();
  }

  private async clickApplyButton(): Promise<boolean> {
    console.log('[AgentController] Looking for Apply button...');
    if (this.config.platform === 'LinkedIn') {
      return await this.clickLinkedInApply();
    } else if (this.config.platform === 'Indeed') {
      return await this.clickIndeedApply();
    }
    return false;
  }

  private async clickLinkedInApply(): Promise<boolean> {
    // First try to find the button in the job details panel (right side)
    const detailsPanel = document.querySelector(
      '.jobs-details__main-content, .jobs-search__job-details--container'
    );

    const selectors = [
      'button[aria-label*="Easy Apply"]',
      'button[data-testid*="easy-apply"]',
      'a[data-testid*="apply"]', // For external apply links
    ];

    for (const selector of selectors) {
      try {
        // First try within the details panel
        let button = detailsPanel?.querySelector(selector) as HTMLButtonElement | HTMLAnchorElement;

        // Fallback to document-wide search
        if (!button) {
          button = document.querySelector(selector) as HTMLButtonElement | HTMLAnchorElement;
        }

        if (button && button.offsetParent !== null) {
          console.log('[AgentController] Clicking Apply button:', selector);
          // DEPRECATED: APPLY_CLICK_START removed - new architecture uses APPLY_JOB_START before clicking
          // Job is already registered with background via APPLY_JOB_START in processJob()
          button.click();
          return true;
        }
      } catch (e) {
        /* ignore */
      }
    }
    console.warn('[AgentController] Easy Apply button not found');
    return false;
  }

  private async clickIndeedApply(): Promise<boolean> {
    const selectors = [
      '#indeedApplyButton',
      'button[id*="apply"]',
      'button[data-testid*="apply"]',
      '.apply-button',
    ];
    for (const selector of selectors) {
      const button = document.querySelector(selector) as HTMLButtonElement;
      if (button && button.offsetParent !== null) {
        console.log('[AgentController] Clicking Apply button');
        button.click();
        return true;
      }
    }
    console.warn('[AgentController] Apply button not found');
    return false;
  }

  private async closeModal(): Promise<void> {
    const closeSelectors = [
      'button[aria-label="Close"]',
      'button.close-button',
      '.modal-overlay button[aria-label*="Close"]',
    ];
    for (const selector of closeSelectors) {
      const closeBtn = document.querySelector(selector) as HTMLButtonElement;
      if (closeBtn) {
        closeBtn.click();
        await this.delay(500);
        return;
      }
    }
    const overlay = document.querySelector('.modal-overlay') as HTMLElement;
    if (overlay) overlay.click();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

async function startAgent(config: AgentConfig): Promise<AgentResult> {
  const controller = new AgentController(config);
  currentAgentController = controller; // Store reference for message handler
  const result = await controller.start();
  currentAgentController = null; // Clear reference when done
  return result;
}

/**
 * LinkedIn Content Script
 * Handles job search and Easy Apply automation on LinkedIn
 */

console.log('[Jobzippy] LinkedIn content script loaded');

// Check if we're on a LinkedIn jobs page (real or mock)
const isJobsPage = () => {
  const url = window.location.href;
  const isMock = url.startsWith('http://localhost:') && url.includes('linkedin-jobs.html');
  const isRealPage = url.includes('linkedin.com/jobs');
  const result = isRealPage || isMock;
  console.log(
    '[Jobzippy] LinkedIn isJobsPage - url:',
    url,
    'isMock:',
    isMock,
    'isRealPage:',
    isRealPage,
    'result:',
    result
  );
  return result;
};

// Store reference to current AgentController instance for message handler access
let currentAgentController: AgentController | null = null;

// Initialize content script
function init() {
  if (!isJobsPage()) {
    console.log('[Jobzippy] Not on LinkedIn jobs page, skipping initialization');
    return;
  }

  console.log('[Jobzippy] Initializing LinkedIn automation');

  // Add visual indicator that extension is active (dev-only)
  if (import.meta.env.DEV) {
    addActiveIndicator();
  }

  // Notify side panel that LinkedIn is active
  chrome.runtime
    .sendMessage({ type: 'PAGE_ACTIVE', data: { platform: 'LinkedIn' } })
    .catch(() => { });

  // Report auth state heuristic
  try {
    const loggedIn = detectLoggedIn();
    console.log('[Jobzippy] LinkedIn init - sending AUTH_STATE:', loggedIn);
    chrome.runtime
      .sendMessage({ type: 'AUTH_STATE', data: { platform: 'LinkedIn', loggedIn } })
      .then(() => console.log('[Jobzippy] LinkedIn AUTH_STATE sent successfully'))
      .catch((err) => console.error('[Jobzippy] Error sending AUTH_STATE:', err));
  } catch (err) {
    console.error('[Jobzippy] Error in LinkedIn init auth check:', err);
  }

  // Observe SPA route/content changes and re-emit AUTH_STATE on change
  setupAuthObservers();

  // User interaction detection (pause on click/keyboard)
  setupUserInteractionDetection();

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.type) {
      case 'AUTH_PROBE':
        try {
          const loggedIn = detectLoggedIn();
          chrome.runtime
            .sendMessage({ type: 'AUTH_STATE', data: { platform: 'LinkedIn', loggedIn } })
            .catch(() => { });
          sendResponse({ status: 'ok' });
        } catch {
          sendResponse({ status: 'error' });
        }
        break;
      case 'START_AUTO_APPLY':
        console.log('[Jobzippy] Starting auto-apply on LinkedIn');
        // Background script will send SCRAPE_JOBS commands
        sendResponse({ status: 'started' });
        break;

      case 'LOG_MESSAGE': {
        // Forward background script logs to agent-logs.txt
        const { component, message: logMessage, data } = message.data;
        logger.log(component, logMessage, data);
        sendResponse({ status: 'ok' });
        break;
      }

      case 'EXTERNAL_ATS_DONE': {
        // External ATS tab completed - mark the job as applied
        const { success, jobId, error } = message.data || {};
        logger.log('AgentController', `Received EXTERNAL_ATS_DONE: success=${success}, jobId=${jobId}`);
        console.log('[AgentController] External ATS done:', { success, jobId });
        
        // Access the current AgentController instance
        if (!currentAgentController) {
          logger.error('AgentController', 'Received EXTERNAL_ATS_DONE but no active AgentController instance');
          console.error('[AgentController] No active AgentController instance');
          sendResponse({ status: 'error', message: 'No active agent controller' });
          break;
        }
        
        // Resolve promise from pendingJobs
        logger.log('AgentController', `Looking for pending promise for job ${jobId}, pendingJobs size: ${currentAgentController.pendingJobs.size}`);
        console.log('[AgentController] Pending jobs:', Array.from(currentAgentController.pendingJobs.keys()));
        const pending = currentAgentController.pendingJobs.get(jobId);
        
        if (pending) {
          logger.log('AgentController', `Found pending promise for job ${jobId}, resolving...`);
          console.log('[AgentController] Found pending promise, resolving...');
          
          // Resolve the promise - processJob() will handle incrementing jobsApplied on success
          // Do NOT increment here to avoid double-counting
          if (success) {
            logger.log('AgentController', `External ATS completed successfully for job ${jobId}`);
            console.log('[AgentController] External ATS completed successfully');
            pending.resolve({ success: true });
          } else {
            const errorMessage = error || 'External ATS application failed';
            logger.error('AgentController', `ERROR: External ATS failed for job ${jobId}: ${errorMessage}`);
            console.error('[AgentController] ERROR: External ATS failed:', errorMessage);
            currentAgentController.results.errors.push({
              jobId: jobId,
              error: errorMessage,
            });
            // Reject the promise to continue processing (but mark as error)
            const rejectionError = new Error(errorMessage);
            logger.error('AgentController', `ERROR: Rejecting promise for job ${jobId} with error:`, {
              message: rejectionError.message,
              stack: rejectionError.stack,
            });
            pending.reject(rejectionError);
          }
          // Remove from pending map
          currentAgentController.pendingJobs.delete(jobId);
        } else {
          logger.log('AgentController', `WARNING: Received EXTERNAL_ATS_DONE for unknown job ${jobId}`);
          console.warn(`[AgentController] Received EXTERNAL_ATS_DONE for unknown job ${jobId}`);
        }
        sendResponse({ status: 'ok' });
        break;
      }

      case 'START_AGENT': {
        console.log('[Jobzippy] Starting agent on LinkedIn');
        addActiveIndicator(); // Ensure indicator is visible
        (async () => {
          try {
            const result = await startAgent({
              platform: 'LinkedIn',
              maxApplications: message.data?.maxApplications || 10,
              delayBetweenJobs: 3000,
            });
            chrome.runtime
              .sendMessage({
                type: 'AGENT_COMPLETED',
                data: result,
              })
              .catch(() => { });
          } catch (error) {
            console.error('[Jobzippy] Agent error:', error);
            chrome.runtime
              .sendMessage({
                type: 'AGENT_ERROR',
                data: { error: String(error) },
              })
              .catch(() => { });
          }
        })();
        sendResponse({ status: 'started' });
        break;
      }

      case 'STOP_AUTO_APPLY':
        console.log('[Jobzippy] Stopping auto-apply on LinkedIn');
        sendResponse({ status: 'stopped' });
        break;

      case 'SCRAPE_JOBS': {
        console.log('[Jobzippy] LinkedIn received SCRAPE_JOBS command');
        try {
          // Scrape immediately - page should already be loaded when SCRAPE_JOBS is received
          // (event-driven: SCRAPE_JOBS is sent after tabs.onUpdated with status === 'complete')
            const jobs = scrapeJobCards();
            const hasNextPage =
              getNextPageUrl() !== null ||
              document.querySelector('button[aria-label*="Next"]:not([disabled])') !== null;
            const currentPage =
              parseInt(new URLSearchParams(window.location.search).get('start') || '0', 10) / 25 +
              1;

            chrome.runtime
              .sendMessage({
                type: 'JOBS_SCRAPED',
                data: {
                  platform: 'LinkedIn',
                  jobs: jobs.map((j) => ({ ...j, platform: 'LinkedIn' as const })),
                  hasNextPage,
                  currentPage,
                },
              })
              .catch((err) => console.error('[Jobzippy] Error sending scraped jobs:', err));
          sendResponse({ status: 'ok' });
        } catch (error) {
          console.error('[Jobzippy] Error scraping jobs:', error);
          sendResponse({ status: 'error', message: String(error) });
        }
        break;
      }

      case 'CLICK_JOB_CARD': {
        const { jobId } = message.data;
        console.log('[Jobzippy] LinkedIn received CLICK_JOB_CARD for:', jobId);
        clickJobCard(jobId)
          .then((details) => {
            if (details) {
              chrome.runtime
                .sendMessage({
                  type: 'JOB_DETAILS_SCRAPED',
                  data: {
                    platform: 'LinkedIn',
                    jobId,
                    ...details,
                  },
                })
                .catch(() => { });
            } else {
              console.warn('[Jobzippy] Failed to scrape details for:', jobId);
              // Send failure so background doesn't hang (or let timeout handle it)
            }
          })
          .catch((err) => console.error('[Jobzippy] Error clicking job card:', err));
        sendResponse({ status: 'processing' });
        break;
      }

      case 'NAVIGATE_NEXT_PAGE': {
        console.log('[Jobzippy] Navigating to next page on LinkedIn');
        try {
          const navigated = navigateToNextPage();
          if (navigated) {
            // Wait for navigation to complete, then notify
            setTimeout(() => {
              chrome.runtime
                .sendMessage({
                  type: 'PAGE_NAVIGATED',
                  data: { platform: 'LinkedIn', url: window.location.href },
                })
                .catch(() => { });
            }, 2000);
            sendResponse({ status: 'ok', navigated: true });
          } else {
            sendResponse({ status: 'ok', navigated: false, hasNextPage: false });
          }
        } catch (error) {
          console.error('[Jobzippy] Error navigating to next page:', error);
          sendResponse({ status: 'error', message: String(error) });
        }
        break;
      }

      default:
        sendResponse({ status: 'unknown_command' });
    }
    return true;
  });
}

// Add a visual indicator that Jobzippy is active
function addActiveIndicator() {
  const indicator = document.createElement('div');
  indicator.id = 'jobzippy-indicator';
  indicator.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: linear-gradient(135deg, #0ea5e9 0%, #a855f7 100%);
    color: white;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    z-index: 10000;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    display: flex;
    align-items: center;
    gap: 8px;
    animation: slideIn 0.3s ease-out;
  `;

  indicator.innerHTML = `
    <div style="width: 6px; height: 6px; background: #22c55e; border-radius: 50%; animation: pulse 2s infinite;"></div>
    <span>Jobzippy Active</span>
  `;

  // Add animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(indicator);

  // Remove indicator after animation completes (event-driven via transitionend)
  indicator.addEventListener('transitionend', () => {
    indicator.remove();
  }, { once: true });
  
  // Start fade-out after 5 seconds (UI-only, acceptable)
  setTimeout(() => {
    indicator.style.transition = 'opacity 0.3s ease-out';
    indicator.style.opacity = '0';
  }, 5000);
}

// Click job card and scrape details
async function clickJobCard(jobId: string): Promise<{
  description: string;
  applyType: 'easy_apply' | 'external';
}> {
  console.log('[LinkedIn] Clicking job card:', jobId);

  // Find the job card
  const jobCard = document.querySelector(`[data-job-id="${jobId}"]`) as HTMLElement;
  if (!jobCard) {
    console.error('[LinkedIn] Job card not found:', jobId);
    return { description: '', applyType: 'external' };
  }

  // Scroll into view
  jobCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // Wait for scroll to complete (event-driven)
  await new Promise<void>((resolve) => {
    const checkScroll = () => {
      const rect = jobCard.getBoundingClientRect();
      const isVisible = rect.top >= 0 && rect.top <= window.innerHeight;
      if (isVisible) {
        resolve();
      } else {
        requestAnimationFrame(checkScroll);
      }
    };
    requestAnimationFrame(checkScroll);
  });

  // Find the title link and click it with preventDefault
  const titleLink = jobCard.querySelector('.job-card-list__title-link') as HTMLAnchorElement;
  if (titleLink) {
    // Create and dispatch a click event that we can preventDefault on
    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
    });

    // Add a one-time listener to prevent navigation
    const preventNav = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    titleLink.addEventListener('click', preventNav, { once: true, capture: true });

    // Click the link
    titleLink.dispatchEvent(clickEvent);

    // Listener is already set to { once: true }, so it auto-removes after first click
  } else {
    // Fallback: click the card itself
    jobCard.click();
  }

  // Wait for details pane to load (DOM-based, event-driven)
  await waitForJobDetailsDom(5000);

  // Scrape the job description from the details pane
  const detailsContainer = document.querySelector(
    '.jobs-search__job-details--container, .jobs-details__main-content'
  );
  if (!detailsContainer) {
    console.error('[LinkedIn] Details container not found');
    return { description: '', applyType: 'external' };
  }

  // Get full description
  const descriptionElement = detailsContainer.querySelector(
    '.jobs-description, .jobs-description-content, #job-details'
  );
  const description = descriptionElement?.textContent?.trim() || '';

  // Determine apply type - look for Easy Apply button
  let easyApplyButton = detailsContainer.querySelector('button[aria-label*="Easy Apply"]');

  // Fallback: check all buttons for "Easy Apply" text
  if (!easyApplyButton) {
    const buttons = Array.from(detailsContainer.querySelectorAll('button'));
    easyApplyButton = buttons.find((btn) => btn.textContent?.includes('Easy Apply')) || null;
  }

  const applyType: 'easy_apply' | 'external' = easyApplyButton ? 'easy_apply' : 'external';

  console.log('[LinkedIn] Scraped details:', { descriptionLength: description.length, applyType });

  return { description, applyType };
}

// Scrape job cards from current page
function scrapeJobCards(): Array<{
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  description?: string;
  salary?: string;
  postedDate?: string;
  applyType?: 'easy_apply' | 'external' | 'unknown';
}> {
  const jobs: Array<{
    id: string;
    title: string;
    company: string;
    location: string;
    url: string;
    description?: string;
    salary?: string;
    postedDate?: string;
    applyType?: 'easy_apply' | 'external' | 'unknown';
  }> = [];

  // LinkedIn job cards - try multiple selectors for robustness
  const jobSelectors = [
    'li.jobs-search-results__list-item',
    'div[data-job-id]',
    'div.job-card-container',
    'div.job-card-list__entity-lockup',
  ];

  let jobElements: NodeListOf<Element> | null = null;
  for (const selector of jobSelectors) {
    jobElements = document.querySelectorAll(selector);
    if (jobElements.length > 0) break;
  }

  if (!jobElements || jobElements.length === 0) {
    console.log('[Jobzippy] No job cards found on LinkedIn page');
    return jobs;
  }

  jobElements.forEach((card, index) => {
    try {
      // Extract job ID
      let jobId = card.getAttribute('data-job-id') || '';
      if (!jobId) {
        const link = card.querySelector<HTMLAnchorElement>('a[href*="/jobs/view/"]');
        if (link?.href) {
          const match = link.href.match(/\/jobs\/view\/(\d+)/);
          jobId = match && match[1] ? match[1] : `linkedin-${index}-${Date.now()}`;
        } else {
          jobId = `linkedin-${index}-${Date.now()}`;
        }
      }

      // Extract title
      const titleEl =
        card.querySelector<HTMLElement>(
          'a.job-card-list__title-link, a[data-control-name="job_card_title_link"]'
        ) ||
        card.querySelector<HTMLElement>('h3.base-search-card__title') ||
        card.querySelector<HTMLElement>('span.job-card-list__title');
      const title = titleEl?.textContent?.trim() || '';

      // Extract company
      const companyEl =
        card.querySelector<HTMLElement>(
          'h4.base-search-card__subtitle, a.job-card-container__company-name'
        ) || card.querySelector<HTMLElement>('span.job-card-container__company-name');
      const company = companyEl?.textContent?.trim() || '';

      // Extract location
      const locationEl =
        card.querySelector<HTMLElement>(
          'span.job-card-container__metadata-item, span.job-card-container__primary-description'
        ) || card.querySelector<HTMLElement>('li.job-card-container__metadata-item');
      const location = locationEl?.textContent?.trim() || '';

      // Extract URL
      const linkEl = card.querySelector<HTMLAnchorElement>('a[href*="/jobs/view/"]');
      const url = linkEl?.href || window.location.href;

      // Extract description snippet
      const descEl = card.querySelector<HTMLElement>(
        'p.job-card-list__description, p.base-search-card__snippet'
      );
      const description = descEl?.textContent?.trim();

      // Extract salary
      const salaryEl = card.querySelector<HTMLElement>('span.job-card-container__salary-info');
      const salary = salaryEl?.textContent?.trim();

      // Extract posted date
      const dateEl = card.querySelector<HTMLElement>('time, span.job-card-container__listed-date');
      const postedDate = dateEl?.getAttribute('datetime') || dateEl?.textContent?.trim();

      // Detect apply type
      let applyType: 'easy_apply' | 'external' | 'unknown' = 'unknown';
      const easyApplyBtn = card.querySelector<HTMLElement>(
        'button[aria-label*="Easy Apply"], button[aria-label*="easy apply"]'
      );
      const externalBtn = card.querySelector<HTMLElement>(
        'a[href*="apply"]:not([aria-label*="Easy Apply"])'
      );
      if (easyApplyBtn) {
        applyType = 'easy_apply';
      } else if (externalBtn) {
        applyType = 'external';
      }

      if (title && company) {
        jobs.push({
          id: jobId,
          title,
          company,
          location,
          url,
          description,
          salary,
          postedDate,
          applyType,
        });
      }
    } catch (error) {
      console.warn('[Jobzippy] Error scraping job card:', error);
    }
  });

  return jobs;
}

// Check if there's a next page
function getNextPageUrl(): string | null {
  const nextButton = document.querySelector<HTMLButtonElement>(
    'button[aria-label*="Next"], button[aria-label*="next"], button[data-test-pagination-page-btn-next]'
  );
  if (nextButton && !nextButton.disabled) {
    return null; // Will trigger click instead
  }

  const nextLink = document.querySelector<HTMLAnchorElement>(
    'a[aria-label*="Next"], a[aria-label*="next"], a[data-test-pagination-page-btn-next]'
  );
  if (nextLink && nextLink.href) {
    return nextLink.href;
  }

  // Check current page number
  const currentPageEl = document.querySelector<HTMLElement>(
    'li[aria-current="page"], button[aria-current="page"]'
  );
  if (currentPageEl) {
    const currentPage = parseInt(currentPageEl.textContent || '1', 10);
    const nextPageEl = document.querySelector<HTMLElement>(
      `button[data-test-pagination-page-btn="${currentPage + 1}"], li[data-test-pagination-page-btn="${currentPage + 1}"]`
    );
    if (nextPageEl) {
      const link = nextPageEl.querySelector<HTMLAnchorElement>('a');
      if (link?.href) return link.href;
    }
  }

  return null;
}

// Navigate to next page
function navigateToNextPage(): boolean {
  const nextButton = document.querySelector<HTMLButtonElement>(
    'button[aria-label*="Next"], button[aria-label*="next"], button[data-test-pagination-page-btn-next]'
  );
  if (nextButton && !nextButton.disabled) {
    nextButton.click();
    return true;
  }

  const nextLink = document.querySelector<HTMLAnchorElement>(
    'a[aria-label*="Next"], a[aria-label*="next"], a[data-test-pagination-page-btn-next]'
  );
  if (nextLink) {
    nextLink.click();
    return true;
  }

  // Try finding next page number button
  const currentPageEl = document.querySelector<HTMLElement>(
    'li[aria-current="page"], button[aria-current="page"]'
  );
  if (currentPageEl) {
    const currentPage = parseInt(currentPageEl.textContent || '1', 10);
    const nextPageEl = document.querySelector<HTMLElement>(
      `button[data-test-pagination-page-btn="${currentPage + 1}"], li[data-test-pagination-page-btn="${currentPage + 1}"]`
    );
    if (nextPageEl) {
      const link = nextPageEl.querySelector<HTMLAnchorElement>('a');
      const button = nextPageEl.querySelector<HTMLButtonElement>('button');
      if (link) {
        link.click();
        return true;
      }
      if (button && !button.disabled) {
        button.click();
        return true;
      }
    }
  }

  return false;
}

// Helper function to find Easy Apply jobs (legacy, kept for compatibility)
function findEasyApplyJobs(): HTMLElement[] {
  const jobs: HTMLElement[] = [];
  const scraped = scrapeJobCards();
  scraped.forEach((job) => {
    if (job.applyType === 'easy_apply') {
      const element = document.querySelector(`[data-job-id="${job.id}"], a[href*="${job.id}"]`);
      if (element) jobs.push(element as HTMLElement);
    }
  });
  return jobs;
}

// Helper function to click Easy Apply button
async function clickEasyApply(jobElement: HTMLElement): Promise<boolean> {
  // TODO: Implement Easy Apply automation
  console.log('[Jobzippy] Clicking Easy Apply for job:', jobElement);
  return false;
}

function detectLoggedIn(): boolean {
  // Mock pages (localhost URLs) are always "logged in"
  const url = window.location.href;
  const isMockPage = url.startsWith('http://localhost:') && url.includes('linkedin-jobs.html');
  console.log(
    '[Jobzippy] LinkedIn detectLoggedIn - url:',
    url,
    'isMockPage:',
    isMockPage,
    'startsWith localhost:',
    url.startsWith('http://localhost:'),
    'includes linkedin-jobs.html:',
    url.includes('linkedin-jobs.html')
  );
  if (isMockPage) {
    console.log('[Jobzippy] LinkedIn mock page detected, returning loggedIn=true');
    return true;
  }

  // Heuristics: presence of login form elements or login routes => not logged in
  if (/\/login|\/signin|auth/.test(url)) return false;
  if (
    document.querySelector(
      'input[name="session_key"], input[name="username"], form[action*="login"]'
    )
  ) {
    return false;
  }
  // Presence of global nav avatar or me-menu indicates logged-in
  if (
    document.querySelector(
      'img.global-nav__me-photo, button.global-nav__me, a[href*="/mynetwork/"]'
    )
  ) {
    return true;
  }
  // Default to true on jobs page unless clear login signals found
  return true;
}

function setupAuthObservers() {
  let lastState: boolean | null = null;
  let timer: number | null = null;
  const debounceCheck = () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = window.setTimeout(() => {
      try {
        const state = detectLoggedIn();
        if (state !== lastState) {
          lastState = state;
          chrome.runtime
            .sendMessage({ type: 'AUTH_STATE', data: { platform: 'LinkedIn', loggedIn: state } })
            .catch(() => { });
        }
      } catch {
        // ignore
      }
    }, 400);
  };

  // Initial capture
  debounceCheck();

  // Observe DOM changes for stable signed-in UI
  const obs = new MutationObserver(debounceCheck);
  obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });

  // Hook history changes for SPA navigations
  const origPush = history.pushState;
  history.pushState = function (...args) {
    const res = origPush.apply(history, args as unknown as Parameters<typeof history.pushState>);
    debounceCheck();
    return res;
  } as typeof history.pushState;
  window.addEventListener('popstate', debounceCheck);
}

// User interaction detection (pause on click/keyboard)
function setupUserInteractionDetection() {
  let lastInteractionTime = 0;
  const INTERACTION_THROTTLE = 1000; // Throttle to max once per second
  let isTabActive = !document.hidden;

  // Track tab visibility
  document.addEventListener('visibilitychange', () => {
    isTabActive = !document.hidden;
  });

  const handleInteraction = (event: Event) => {
    console.log('[Jobzippy] LinkedIn interaction detected:', {
      type: event.type,
      isTrusted: event.isTrusted,
      isTabActive,
      documentHidden: document.hidden,
    });

    // Only detect interactions when tab is active/visible
    if (!isTabActive || document.hidden) {
      console.log('[Jobzippy] LinkedIn interaction ignored - tab not active');
      return;
    }

    // Only detect trusted events (user actions, not programmatic)
    // isTrusted is false for events created/dispatched by scripts
    if (!event.isTrusted) {
      console.log('[Jobzippy] LinkedIn interaction ignored - not trusted');
      return; // Ignore programmatic events from automation
    }

    const now = Date.now();
    if (now - lastInteractionTime < INTERACTION_THROTTLE) {
      console.log('[Jobzippy] LinkedIn interaction throttled');
      return;
    }
    lastInteractionTime = now;

    console.log('[Jobzippy] LinkedIn sending USER_INTERACTION message');
    chrome.runtime
      .sendMessage({ type: 'USER_INTERACTION', data: { platform: 'LinkedIn' } })
      .then(() => console.log('[Jobzippy] LinkedIn USER_INTERACTION sent successfully'))
      .catch((err) => console.error('[Jobzippy] LinkedIn USER_INTERACTION failed:', err));
  };

  // Listen for clicks
  document.addEventListener('click', handleInteraction, true);
  // Listen for keyboard input
  document.addEventListener('keydown', handleInteraction, true);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export for testing
export { findEasyApplyJobs, clickEasyApply, scrapeJobCards, getNextPageUrl, navigateToNextPage };
