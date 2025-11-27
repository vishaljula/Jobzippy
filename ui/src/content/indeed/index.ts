import { intelligentNavigate } from '../ats/navigator';

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
  errors: Array<{ jobId: string; error: string }>;
}

/**
 * Agent Controller Class
 * Orchestrates the complete job application flow
 */
class AgentController {
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

  async start(): Promise<AgentResult> {
    console.log('[AgentController] Starting agent for', this.config.platform);
    this.shouldStop = false;
    this.results = { success: true, jobsProcessed: 0, jobsApplied: 0, errors: [] };

    try {
      const jobs = await this.getJobs();
      console.log('[AgentController] Found', jobs.length, 'jobs');

      for (const job of jobs) {
        if (this.shouldStop) {
          console.log('[AgentController] Stopped by user');
          break;
        }
        if (
          this.config.maxApplications &&
          this.results.jobsApplied >= this.config.maxApplications
        ) {
          console.log('[AgentController] Reached max applications limit');
          break;
        }

        await this.processJob(job);

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

  stop(): void {
    console.log('[AgentController] Stopping agent...');
    this.shouldStop = true;
  }

  private async processJob(job: JobCard): Promise<void> {
    console.log('[AgentController] Processing job:', job.title, 'at', job.company);
    this.results.jobsProcessed++;

    try {
      await this.clickJobCard(job);
      await this.delay(1500);

      const applyClicked = await this.clickApplyButton();
      if (!applyClicked) {
        console.warn('[AgentController] Could not click apply button for', job.id);
        this.results.errors.push({ jobId: job.id, error: 'Apply button not found' });
        return;
      }

      await this.delay(2000);

      // Use static import instead of dynamic
      console.log('[AgentController] Starting intelligent navigation...');
      const result = await intelligentNavigate();
      const submitted = result.success;

      if (submitted) {
        console.log('[AgentController] ✓ Successfully applied to', job.title);
        this.results.jobsApplied++;
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

      await this.closeModal();
    } catch (error) {
      console.error('[AgentController] Error processing job', job.id, error);
      this.results.errors.push({ jobId: job.id, error: String(error) });
    }
  }

  private async getJobs(): Promise<JobCard[]> {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_JOBS',
      data: { platform: this.config.platform },
    });
    return response?.jobs || [];
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
    const titleLink = card.querySelector('.job-card-list__title-link') as HTMLAnchorElement;
    if (titleLink) {
      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      titleLink.addEventListener('click', (e) => e.preventDefault(), { once: true, capture: true });
      titleLink.dispatchEvent(clickEvent);
    } else {
      card.click();
    }
  }

  private async clickIndeedJobCard(job: JobCard): Promise<void> {
    let card = document.querySelector(`[data-jk="${job.id}"]`) as HTMLElement;
    if (!card && job.id.startsWith('mock-')) {
      card = document
        .querySelector(`a[href*="${job.id}"]`)
        ?.closest('.jobsearch-SerpJobCard') as HTMLElement;
    }
    if (!card) throw new Error('Job card not found');
    const titleLink = card.querySelector('.jobTitle a, h2 a') as HTMLAnchorElement;
    if (titleLink) {
      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      titleLink.addEventListener('click', (e) => e.preventDefault(), { once: true, capture: true });
      titleLink.dispatchEvent(clickEvent);
    } else {
      card.click();
    }
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
    const selectors = [
      'button[aria-label*="Easy Apply"]',
      'button[data-testid*="easy-apply"]',
      'button:has-text("Easy Apply")',
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
  return await controller.start();
}

/**
 * Indeed Content Script
 * Handles job search and apply automation on Indeed
 */

console.log('[Jobzippy] Indeed content script loaded');

// Check if we're on an Indeed jobs page (real or mock)
const isJobsPage = () => {
  const url = window.location.href;
  const isMock = url.startsWith('http://localhost:') && url.includes('indeed-jobs.html');
  const isRealPage = url.includes('indeed.com') && url.includes('jobs');
  const result = isRealPage || isMock;
  console.log(
    '[Jobzippy] Indeed isJobsPage - url:',
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

// Initialize content script
function init() {
  if (!isJobsPage()) {
    console.log('[Jobzippy] Not on Indeed page, skipping initialization');
    return;
  }

  console.log('[Jobzippy] Initializing Indeed automation');

  // Add visual indicator that extension is active (dev-only)
  if (import.meta.env.DEV) {
    addActiveIndicator();
  }

  // Notify side panel that Indeed is active
  chrome.runtime.sendMessage({ type: 'PAGE_ACTIVE', data: { platform: 'Indeed' } }).catch(() => {});

  // Report auth state heuristic
  try {
    const loggedIn = detectLoggedIn();
    console.log('[Jobzippy] Indeed init - sending AUTH_STATE:', loggedIn);
    chrome.runtime
      .sendMessage({ type: 'AUTH_STATE', data: { platform: 'Indeed', loggedIn } })
      .then(() => console.log('[Jobzippy] Indeed AUTH_STATE sent successfully'))
      .catch((err) => console.error('[Jobzippy] Error sending AUTH_STATE:', err));
  } catch (err) {
    console.error('[Jobzippy] Error in Indeed init auth check:', err);
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
            .sendMessage({ type: 'AUTH_STATE', data: { platform: 'Indeed', loggedIn } })
            .catch(() => {});
          sendResponse({ status: 'ok' });
        } catch {
          sendResponse({ status: 'error' });
        }
        break;
      case 'START_AUTO_APPLY':
        console.log('[Jobzippy] Starting auto-apply on Indeed');
        // Background script will send SCRAPE_JOBS commands
        sendResponse({ status: 'started' });
        break;

      case 'START_AGENT': {
        console.log('[Jobzippy] Starting agent on Indeed');
        (async () => {
          try {
            const result = await startAgent({
              platform: 'Indeed',
              maxApplications: message.data?.maxApplications || 10,
              delayBetweenJobs: 3000,
            });
            chrome.runtime
              .sendMessage({
                type: 'AGENT_COMPLETED',
                data: result,
              })
              .catch(() => {});
          } catch (error) {
            console.error('[Jobzippy] Agent error:', error);
            chrome.runtime
              .sendMessage({
                type: 'AGENT_ERROR',
                data: { error: String(error) },
              })
              .catch(() => {});
          }
        })();
        sendResponse({ status: 'started' });
        break;
      }

      case 'STOP_AUTO_APPLY':
        console.log('[Jobzippy] Stopping auto-apply on Indeed');
        sendResponse({ status: 'stopped' });
        break;

      case 'SCRAPE_JOBS': {
        console.log('[Jobzippy] Indeed received SCRAPE_JOBS command');
        try {
          // Wait a bit for page to be fully loaded
          setTimeout(() => {
            const jobs = scrapeJobCards();
            const hasNextPage =
              getNextPageUrl() !== null ||
              document.querySelector('a[aria-label="Next Page"]') !== null;
            const currentPage =
              parseInt(new URLSearchParams(window.location.search).get('start') || '0', 10) / 15 +
              1;

            chrome.runtime
              .sendMessage({
                type: 'JOBS_SCRAPED',
                data: {
                  platform: 'Indeed',
                  jobs: jobs.map((j) => ({ ...j, platform: 'Indeed' as const })),
                  hasNextPage,
                  currentPage,
                },
              })
              .catch((err) => console.error('[Jobzippy] Error sending scraped jobs:', err));
          }, 1000);
          sendResponse({ status: 'ok' });
        } catch (error) {
          console.error('[Jobzippy] Error scraping jobs:', error);
          sendResponse({ status: 'error', message: String(error) });
        }
        break;
      }

      case 'CLICK_JOB_CARD': {
        const { jobId } = message.data;
        console.log('[Jobzippy] Indeed received CLICK_JOB_CARD for:', jobId);
        clickJobCard(jobId)
          .then((details) => {
            if (details) {
              chrome.runtime
                .sendMessage({
                  type: 'JOB_DETAILS_SCRAPED',
                  data: {
                    platform: 'Indeed',
                    jobId,
                    ...details,
                  },
                })
                .catch(() => {});
            } else {
              console.warn('[Jobzippy] Failed to scrape details for:', jobId);
            }
          })
          .catch((err) => console.error('[Jobzippy] Error clicking job card:', err));
        sendResponse({ status: 'processing' });
        break;
      }

      case 'NAVIGATE_NEXT_PAGE': {
        console.log('[Jobzippy] Navigating to next page on Indeed');
        try {
          const navigated = navigateToNextPage();
          if (navigated) {
            // Wait for navigation to complete, then notify
            setTimeout(() => {
              chrome.runtime
                .sendMessage({
                  type: 'PAGE_NAVIGATED',
                  data: { platform: 'Indeed', url: window.location.href },
                })
                .catch(() => {});
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

  // Remove after 5 seconds
  setTimeout(() => {
    indicator.style.transition = 'opacity 0.3s ease-out';
    indicator.style.opacity = '0';
    setTimeout(() => indicator.remove(), 300);
  }, 5000);
}

// Click job card and scrape details
async function clickJobCard(
  jobId: string
): Promise<{ description: string; applyType: 'easy_apply' | 'external' }> {
  console.log('[Indeed] Clicking job card:', jobId);

  // Find the job card by data-jk attribute
  let jobCard = document.querySelector(`[data-jk="${jobId}"]`) as HTMLElement;

  // Fallback for mock pages
  if (!jobCard && jobId.startsWith('mock-')) {
    jobCard = document
      .querySelector(`a[href*="${jobId}"]`)
      ?.closest('.jobsearch-SerpJobCard') as HTMLElement;
  }

  if (!jobCard) {
    console.error('[Indeed] Job card not found:', jobId);
    return { description: '', applyType: 'external' };
  }

  // Scroll into view
  jobCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Find the job title link and click it with preventDefault
  const titleLink = jobCard.querySelector('.jobTitle a, h2 a') as HTMLAnchorElement;
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

    // Clean up listener just in case
    setTimeout(() => titleLink.removeEventListener('click', preventNav, true), 100);
  } else {
    // Fallback: click the card itself
    jobCard.click();
  }

  // Wait for details pane to load
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Scrape the job description from the details pane
  const detailsContainer = document.querySelector(
    '#vjs-container, .jobsearch-ViewJobLayout-jobDisplay'
  );
  if (!detailsContainer) {
    console.error('[Indeed] Details container not found');
    return { description: '', applyType: 'external' };
  }

  // Get full description
  const descriptionElement = detailsContainer.querySelector(
    '#jobDescriptionText, .jobsearch-jobDescriptionText'
  );
  const description = descriptionElement?.textContent?.trim() || '';

  // Determine apply type - Indeed uses specific button IDs
  const indeedApplyButton = detailsContainer.querySelector(
    '#indeedApplyButton, button[id*="apply"]'
  );
  const applyType: 'easy_apply' | 'external' = indeedApplyButton ? 'easy_apply' : 'external';

  console.log('[Indeed] Scraped details:', { descriptionLength: description.length, applyType });

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

  // Indeed job cards - try multiple selectors
  const jobSelectors = [
    'div[data-jk]',
    'div.job_seen_beacon',
    'div.slider_item',
    'td.resultContent',
    'div.jobsearch-SerpJobCard',
  ];

  let jobElements: NodeListOf<Element> | null = null;
  for (const selector of jobSelectors) {
    jobElements = document.querySelectorAll(selector);
    if (jobElements.length > 0) break;
  }

  if (!jobElements || jobElements.length === 0) {
    console.log('[Jobzippy] No job cards found on Indeed page');
    return jobs;
  }

  jobElements.forEach((card, index) => {
    try {
      // Extract job ID
      let jobId = card.getAttribute('data-jk') || '';
      if (!jobId) {
        const link = card.querySelector<HTMLAnchorElement>('a[data-jk], a[href*="/viewjob"]');
        if (link) {
          const match = link.href.match(/jk=([^&]+)/);
          jobId =
            match && match[1]
              ? match[1]
              : link.getAttribute('data-jk') || `indeed-${index}-${Date.now()}`;
        } else {
          jobId = `indeed-${index}-${Date.now()}`;
        }
      }

      // Extract title
      const titleEl =
        card.querySelector<HTMLElement>(
          'a[data-jk], h2.jobTitle a, span[id*="jobTitle"] a, a.jobTitle'
        ) || card.querySelector<HTMLElement>('h2.jobTitle');
      const title = titleEl?.textContent?.trim() || '';

      // Extract company
      const companyEl =
        card.querySelector<HTMLElement>(
          'span[data-testid="company-name"], span.companyName, a[data-testid="company-name"]'
        ) || card.querySelector<HTMLElement>('span.companyName');
      const company = companyEl?.textContent?.trim() || '';

      // Extract location
      const locationEl =
        card.querySelector<HTMLElement>(
          'div[data-testid="attribute_snippet_testid"], div.companyLocation, span[data-testid="text-location"]'
        ) || card.querySelector<HTMLElement>('div.companyLocation');
      const location = locationEl?.textContent?.trim() || '';

      // Extract URL
      const linkEl = card.querySelector<HTMLAnchorElement>(
        'a[data-jk], a[href*="/viewjob"], a.jobTitle'
      );
      let url = linkEl?.href || '';
      if (!url && linkEl) {
        url = new URL(linkEl.getAttribute('href') || '', window.location.origin).href;
      }
      if (!url) {
        url = window.location.href;
      }

      // Extract description snippet
      const descEl = card.querySelector<HTMLElement>('div.job-snippet, span.summary, div.summary');
      const description = descEl?.textContent?.trim();

      // Extract salary
      const salaryEl = card.querySelector<HTMLElement>(
        'span[data-testid="attribute_snippet_testid"], div.salary-snippet-container'
      );
      const salary = salaryEl?.textContent?.trim();

      // Extract posted date
      const dateEl = card.querySelector<HTMLElement>(
        'span.date, span[data-testid="myJobsStateDate"]'
      );
      const postedDate = dateEl?.textContent?.trim();

      // Detect apply type
      let applyType: 'easy_apply' | 'external' | 'unknown' = 'unknown';
      const indeedApplyBtn = card.querySelector<HTMLElement>(
        'a[aria-label*="Apply"], button[aria-label*="Apply"]'
      );

      // Check for external apply links - can't use :contains() in querySelector
      let externalBtn = card.querySelector<HTMLElement>('a[href*="apply"]');

      // Fallback: check all links for "Apply on company website" text
      if (!externalBtn) {
        const links = Array.from(card.querySelectorAll('a'));
        externalBtn =
          links.find((link) => link.textContent?.includes('Apply on company website')) || null;
      }

      if (indeedApplyBtn && !externalBtn) {
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
  const nextButton = document.querySelector<HTMLAnchorElement>(
    'a[aria-label="Next Page"], a[data-testid="pagination-page-next"]'
  );
  if (nextButton && nextButton.href) {
    return nextButton.href;
  }

  // Check current page number
  const currentPageEl = document.querySelector<HTMLElement>(
    'b.pagination-list-current, a[aria-current="page"]'
  );
  if (currentPageEl) {
    const currentPage = parseInt(currentPageEl.textContent || '1', 10);
    const nextPageEl = document.querySelector<HTMLAnchorElement>(
      `a[data-testid="pagination-page-${currentPage + 1}"]`
    );
    if (nextPageEl && nextPageEl.href) {
      return nextPageEl.href;
    }
  }

  return null;
}

// Navigate to next page
function navigateToNextPage(): boolean {
  const nextButton = document.querySelector<HTMLAnchorElement>(
    'a[aria-label="Next Page"], a[data-testid="pagination-page-next"]'
  );
  if (nextButton) {
    nextButton.click();
    return true;
  }

  // Try finding next page number link
  const currentPageEl = document.querySelector<HTMLElement>(
    'b.pagination-list-current, a[aria-current="page"]'
  );
  if (currentPageEl) {
    const currentPage = parseInt(currentPageEl.textContent || '1', 10);
    const nextPageEl = document.querySelector<HTMLAnchorElement>(
      `a[data-testid="pagination-page-${currentPage + 1}"]`
    );
    if (nextPageEl) {
      nextPageEl.click();
      return true;
    }
  }

  return false;
}

// Helper function to find apply now jobs (legacy, kept for compatibility)
function findApplyNowJobs(): HTMLElement[] {
  const jobs: HTMLElement[] = [];
  const scraped = scrapeJobCards();
  scraped.forEach((job) => {
    if (job.applyType === 'easy_apply' || job.applyType === 'external') {
      const element = document.querySelector(`[data-jk="${job.id}"], a[href*="${job.id}"]`);
      if (element) jobs.push(element as HTMLElement);
    }
  });
  return jobs;
}

// Helper function to click Apply Now button
async function clickApplyNow(jobElement: HTMLElement): Promise<boolean> {
  // TODO: Implement Apply Now automation
  console.log('[Jobzippy] Clicking Apply Now for job:', jobElement);
  return false;
}

function detectLoggedIn(): boolean {
  // Mock pages (localhost URLs) are always "logged in"
  const url = window.location.href;
  const isMockPage = url.startsWith('http://localhost:') && url.includes('indeed-jobs.html');
  console.log(
    '[Jobzippy] Indeed detectLoggedIn - url:',
    url,
    'isMockPage:',
    isMockPage,
    'startsWith localhost:',
    url.startsWith('http://localhost:'),
    'includes indeed-jobs.html:',
    url.includes('indeed-jobs.html')
  );
  if (isMockPage) {
    console.log('[Jobzippy] Indeed mock page detected, returning loggedIn=true');
    return true;
  }
  // Explicit login routes
  if (/\/account\/login|\/signin|auth/.test(url)) return false;
  // If we see a clear Profile menu or avatar, assume logged in
  if (
    document.querySelector(
      '#gnav-ProfileMenu, a[data-gnav-element-name="Profile"], button[id^="gnav-Profile"], [data-gnav-element-name="AccountMenu"]'
    )
  ) {
    return true;
  }
  // If we see clear sign-in CTA, assume not logged in
  if (
    document.querySelector(
      'a[data-gnav-element-name="SignIn"], a[href*="/account/login"], form[action*="login"]'
    )
  ) {
    return false;
  }
  // Conservative default: treat as not logged in unless we see profile evidence
  return false;
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
            .sendMessage({ type: 'AUTH_STATE', data: { platform: 'Indeed', loggedIn: state } })
            .catch(() => {});
        }
      } catch {
        // ignore
      }
    }, 400);
  };

  // Initial capture
  debounceCheck();

  // Observe DOM changes (nav bar/login widgets update without URL change)
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
    console.log('[Jobzippy] Indeed interaction detected:', {
      type: event.type,
      isTrusted: event.isTrusted,
      isTabActive,
      documentHidden: document.hidden,
    });

    // Only detect interactions when tab is active/visible
    if (!isTabActive || document.hidden) {
      console.log('[Jobzippy] Indeed interaction ignored - tab not active');
      return;
    }

    // Only detect trusted events (user actions, not programmatic)
    // isTrusted is false for events created/dispatched by scripts
    if (!event.isTrusted) {
      console.log('[Jobzippy] Indeed interaction ignored - not trusted');
      return; // Ignore programmatic events from automation
    }

    const now = Date.now();
    if (now - lastInteractionTime < INTERACTION_THROTTLE) {
      console.log('[Jobzippy] Indeed interaction throttled');
      return;
    }
    lastInteractionTime = now;

    console.log('[Jobzippy] Indeed sending USER_INTERACTION message');
    chrome.runtime
      .sendMessage({ type: 'USER_INTERACTION', data: { platform: 'Indeed' } })
      .then(() => console.log('[Jobzippy] Indeed USER_INTERACTION sent successfully'))
      .catch((err) => console.error('[Jobzippy] Indeed USER_INTERACTION failed:', err));
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
export { findApplyNowJobs, clickApplyNow, scrapeJobCards, getNextPageUrl, navigateToNextPage };
