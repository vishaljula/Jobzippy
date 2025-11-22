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
    .catch(() => {});

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
            .catch(() => {});
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

      case 'STOP_AUTO_APPLY':
        console.log('[Jobzippy] Stopping auto-apply on LinkedIn');
        sendResponse({ status: 'stopped' });
        break;

      case 'SCRAPE_JOBS': {
        console.log('[Jobzippy] LinkedIn received SCRAPE_JOBS command');
        try {
          // Wait a bit for page to be fully loaded
          setTimeout(() => {
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
                .catch(() => {});
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
  await new Promise((resolve) => setTimeout(resolve, 500));

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
            .catch(() => {});
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
