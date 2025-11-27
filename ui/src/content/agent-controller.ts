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
  /**
   * Process a single job by delegating to background script
   */
  private async processJob(job: JobCard): Promise<void> {
    console.log('[AgentController] Processing job:', job.title, 'at', job.company);
    this.results.jobsProcessed++;

    try {
      // Send message to background to process this job in a new tab
      // This ensures sequential processing and proper tab management
      const response = await chrome.runtime.sendMessage({
        type: 'PROCESS_JOB',
        data: {
          job,
          platform: this.config.platform,
        },
      });

      if (response && response.success) {
        console.log('[AgentController] ✓ Successfully applied to', job.title);
        this.results.jobsApplied++;
      } else {
        const error = response?.error || 'Unknown error';
        console.warn('[AgentController] Failed to apply to', job.title, error);
        this.results.errors.push({ jobId: job.id, error });
      }
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
