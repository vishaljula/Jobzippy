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

      case 'STOP_AUTO_APPLY':
        console.log('[Jobzippy] Stopping auto-apply on Indeed');
        sendResponse({ status: 'stopped' });
        break;

      case 'SCRAPE_JOBS': {
        console.log('[Jobzippy] Scraping jobs from Indeed page');
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
      const externalBtn = card.querySelector<HTMLElement>(
        'a[href*="apply"], a:contains("Apply on company website")'
      );
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
    const res = origPush.apply(history, args as any);
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
    // Only detect interactions when tab is active/visible
    if (!isTabActive || document.hidden) return;

    // Only detect trusted events (user actions, not programmatic)
    // isTrusted is false for events created/dispatched by scripts
    if (!event.isTrusted) {
      return; // Ignore programmatic events from automation
    }

    const now = Date.now();
    if (now - lastInteractionTime < INTERACTION_THROTTLE) return;
    lastInteractionTime = now;

    chrome.runtime
      .sendMessage({ type: 'USER_INTERACTION', data: { platform: 'Indeed' } })
      .catch(() => {});
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
