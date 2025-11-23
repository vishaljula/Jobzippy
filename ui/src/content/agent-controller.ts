/**
 * Agent Controller
 * Orchestrates the complete job application flow:
 * 1. Find jobs on page
 * 2. Click job card
 * 3. Click Apply button
 * 4. Fill form
 * 5. Submit
 * 6. Move to next job
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
  errors: Array<{ jobId: string; error: string }>;
}

export class AgentController {
  private config: AgentConfig;
  private shouldStop: boolean = false;
  private results: AgentResult = {
    success: true,
    jobsProcessed: 0,
    jobsApplied: 0,
    errors: [],
  };

  constructor(config: AgentConfig) {
    this.config = config;
  }

  /**
   * Start the agent
   */
  async start(): Promise<AgentResult> {
    console.log('[AgentController] Starting agent for', this.config.platform);

    this.shouldStop = false;
    this.results = {
      success: true,
      jobsProcessed: 0,
      jobsApplied: 0,
      errors: [],
    };

    try {
      // Get jobs on current page
      const jobs = await this.getJobs();
      console.log('[AgentController] Found', jobs.length, 'jobs');

      // Process each job
      for (const job of jobs) {
        if (this.shouldStop) {
          console.log('[AgentController] Stopped by user');
          break;
        }

        // Check max applications limit
        if (
          this.config.maxApplications &&
          this.results.jobsApplied >= this.config.maxApplications
        ) {
          console.log('[AgentController] Reached max applications limit');
          break;
        }

        await this.processJob(job);

        // Delay between jobs
        if (this.config.delayBetweenJobs) {
          await this.delay(this.config.delayBetweenJobs);
        }
      }

      console.log('[AgentController] Agent completed', this.results);
      return this.results;
    } catch (error) {
      console.error('[AgentController] Agent error:', error);
      this.results.success = false;
      return this.results;
    }
  }

  /**
   * Stop the agent
   */
  stop(): void {
    console.log('[AgentController] Stopping agent...');
    this.shouldStop = true;
  }

  /**
   * Process a single job
   */
  private async processJob(job: JobCard): Promise<void> {
    console.log('[AgentController] Processing job:', job.title, 'at', job.company);
    this.results.jobsProcessed++;

    try {
      // 1. Click job card to view details
      await this.clickJobCard(job);
      await this.delay(1500);

      // 2. Click Apply button
      const applyClicked = await this.clickApplyButton();
      if (!applyClicked) {
        console.warn('[AgentController] Could not click apply button for', job.id);
        this.results.errors.push({ jobId: job.id, error: 'Apply button not found' });
        return;
      }

      // 3. Wait for form/modal to appear
      await this.delay(2000);

      // 4. Fill and submit form using dynamic classifier
      const submitted = await this.fillAndSubmitForm();

      if (submitted) {
        console.log('[AgentController] ✓ Successfully applied to', job.title);
        this.results.jobsApplied++;

        // Notify background script
        chrome.runtime
          .sendMessage({
            type: 'JOB_APPLIED',
            data: { job, platform: this.config.platform },
          })
          .catch(() => {});
      } else {
        console.warn('[AgentController] Failed to submit application for', job.id);
        this.results.errors.push({ jobId: job.id, error: 'Form submission failed' });
      }

      // Close modal if still open
      await this.closeModal();
    } catch (error) {
      console.error('[AgentController] Error processing job', job.id, error);
      this.results.errors.push({ jobId: job.id, error: String(error) });
    }
  }

  /**
   * Get jobs from the current page
   */
  private async getJobs(): Promise<JobCard[]> {
    // Send message to platform-specific content script
    const response = await chrome.runtime.sendMessage({
      type: 'GET_JOBS',
      data: { platform: this.config.platform },
    });

    return response?.jobs || [];
  }

  /**
   * Click a job card
   */
  private async clickJobCard(job: JobCard): Promise<void> {
    console.log('[AgentController] Clicking job card:', job.id);

    if (this.config.platform === 'LinkedIn') {
      await this.clickLinkedInJobCard(job);
    } else if (this.config.platform === 'Indeed') {
      await this.clickIndeedJobCard(job);
    }
  }

  /**
   * Click LinkedIn job card
   */
  private async clickLinkedInJobCard(job: JobCard): Promise<void> {
    const card = document.querySelector(`[data-job-id="${job.id}"]`) as HTMLElement;
    if (!card) {
      throw new Error('Job card not found');
    }

    // Click the title link to avoid navigation
    const titleLink = card.querySelector('.job-card-list__title-link') as HTMLAnchorElement;
    if (titleLink) {
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
      });
      titleLink.addEventListener('click', (e) => e.preventDefault(), { once: true, capture: true });
      titleLink.dispatchEvent(clickEvent);
    } else {
      card.click();
    }
  }

  /**
   * Click Indeed job card
   */
  private async clickIndeedJobCard(job: JobCard): Promise<void> {
    let card = document.querySelector(`[data-jk="${job.id}"]`) as HTMLElement;

    // Fallback for mock pages
    if (!card && job.id.startsWith('mock-')) {
      card = document
        .querySelector(`a[href*="${job.id}"]`)
        ?.closest('.jobsearch-SerpJobCard') as HTMLElement;
    }

    if (!card) {
      throw new Error('Job card not found');
    }

    // Click the title link
    const titleLink = card.querySelector('.jobTitle a, h2 a') as HTMLAnchorElement;
    if (titleLink) {
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
      });
      titleLink.addEventListener('click', (e) => e.preventDefault(), { once: true, capture: true });
      titleLink.dispatchEvent(clickEvent);
    } else {
      card.click();
    }
  }

  /**
   * Click Apply button
   */
  private async clickApplyButton(): Promise<boolean> {
    console.log('[AgentController] Looking for Apply button...');

    if (this.config.platform === 'LinkedIn') {
      return await this.clickLinkedInApply();
    } else if (this.config.platform === 'Indeed') {
      return await this.clickIndeedApply();
    }

    return false;
  }

  /**
   * Click LinkedIn Easy Apply button
   */
  private async clickLinkedInApply(): Promise<boolean> {
    const selectors = [
      'button[aria-label*="Easy Apply"]',
      'button[data-testid*="easy-apply"]',
      'button:has-text("Easy Apply")', // May not work in all browsers
    ];

    for (const selector of selectors) {
      try {
        const button = document.querySelector(selector) as HTMLButtonElement;
        if (button && button.offsetParent !== null) {
          console.log('[AgentController] Clicking Easy Apply button');
          button.click();
          return true;
        }
      } catch (e) {
        // Selector not supported, try next
      }
    }

    console.warn('[AgentController] Easy Apply button not found');
    return false;
  }

  /**
   * Click Indeed Apply button
   */
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

  /**
   * Fill and submit form using dynamic classifier
   */
  private async fillAndSubmitForm(): Promise<boolean> {
    try {
      // Import navigator (which uses classifier and form filler)
      const { intelligentNavigate } = await import('./ats/navigator');

      console.log('[AgentController] Starting intelligent navigation...');
      const result = await intelligentNavigate();

      return result.success;
    } catch (error) {
      console.error('[AgentController] Error in form filling:', error);
      return false;
    }
  }

  /**
   * Close modal if open
   */
  private async closeModal(): Promise<void> {
    // Try to find and click close button
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

    // Try clicking overlay
    const overlay = document.querySelector('.modal-overlay') as HTMLElement;
    if (overlay) {
      overlay.click();
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create and start agent
 */
export async function startAgent(config: AgentConfig): Promise<AgentResult> {
  const controller = new AgentController(config);
  return await controller.start();
}
