/**
 * Unified Executor V2
 * Stateless executor that performs DOM actions based on commands from background orchestrator.
 *
 * Responsibilities:
 * - Pure DOM manipulation (no orchestration logic)
 * - Execute commands and return results
 * - All logic resides in background orchestrator
 */

import { executePageAction } from './ats/navigator';
import { waitForJobDetailsDom, waitForLinkedInModal, waitForMessage } from '../lib/dom-waits';
import type { ExternalATSOpenedMessage } from '../types/job-session';
import { classifyPage } from './ats/page-classifier';
import { humanClick, humanizeConfig } from '../lib/humanize';

// ============================================================================
// Visibility Helpers (Stealth-safe - works in background tabs)
// ============================================================================

/**
 * Check if an element is actually hidden via CSS properties.
 *
 * NOTE: We intentionally do NOT check offsetWidth/offsetHeight because:
 * 1. In background tabs, Chrome doesn't compute layout dimensions (returns 0)
 * 2. This causes false positives (visible elements marked as hidden)
 * CSS property checks are sufficient to detect truly hidden elements.
 */
function isActuallyHidden(element: HTMLElement): boolean {
  // Check inline style first (faster, catches dynamic visibility toggling)
  const inlineDisplay = element.style.display;
  if (inlineDisplay === 'none') {
    return true;
  }

  const style = getComputedStyle(element);
  return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
}

// ============================================================================
// Double-Load Prevention
// ============================================================================
// Executor-v2 can be loaded via manifest content_scripts AND programmatic injection.
// This guard prevents duplicate message listeners which cause race conditions
// where the second listener returns 'duplicate_ignored' before the first completes.

const ALREADY_LOADED = !!(window as any).__executorV2Loaded;
if (ALREADY_LOADED) {
  console.log('[Executor V2] Already loaded, skipping duplicate initialization');
} else {
  (window as any).__executorV2Loaded = true;
  console.log('[Executor V2] First load, initializing...');
}

// ============================================================================
// Type Definitions
// ============================================================================

interface JobCard {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  description?: string;
  salary?: string;
  postedDate?: string;
  applyType?: 'easy_apply' | 'external' | 'unknown';
}

// ============================================================================
// DOM Action Functions
// ============================================================================

/**
 * Scrape job cards from current page
 */
function scrapeJobCards(): JobCard[] {
  const jobs: JobCard[] = [];

  // LinkedIn 2024/2025 job card selectors - most specific first
  const jobSelectors = [
    'li.ember-view.jobs-search-results__list-item', // Most reliable for 2024/2025
    'li.jobs-search-results__list-item',
    'div[data-job-id]',
    'div.job-card-container',
    'div.job-card-list__entity-lockup',
    '.scaffold-layout__list-item', // Newer LinkedIn selector
  ];

  let jobElements: NodeListOf<Element> | null = null;
  let matchedSelector = '';
  for (const selector of jobSelectors) {
    jobElements = document.querySelectorAll(selector);
    console.log(`[Executor V2] Selector "${selector}" found ${jobElements.length} elements`);
    if (jobElements.length > 0) {
      matchedSelector = selector;
      break;
    }
  }

  if (!jobElements || jobElements.length === 0) {
    console.log('[Executor V2] No job cards found with any selector');
    // Debug: log what's on the page
    console.log('[Executor V2] Page URL:', window.location.href);
    console.log(
      '[Executor V2] Has job list container:',
      !!document.querySelector('.jobs-search-results-list')
    );
    return jobs;
  }

  console.log(
    `[Executor V2] Using selector "${matchedSelector}", found ${jobElements.length} job cards`
  );

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

      // Extract title (LinkedIn 2024/2025 - note both single and double dash variants exist)
      const titleEl =
        card.querySelector<HTMLElement>('a.job-card-list__title--link') || // Double dash (LinkedIn 2024)
        card.querySelector<HTMLElement>('a.job-card-list__title-link') || // Single dash (LinkedIn 2025 / mock)
        card.querySelector<HTMLElement>('a.job-card-container__link') ||
        card.querySelector<HTMLElement>('a[data-control-name="job_card_title_link"]') ||
        card.querySelector<HTMLElement>('h3.base-search-card__title') ||
        card.querySelector<HTMLElement>('span.job-card-list__title') ||
        card.querySelector<HTMLElement>('.artdeco-entity-lockup__title a') ||
        card.querySelector<HTMLElement>('.job-card-list__title'); // Generic fallback
      const title = titleEl?.textContent?.trim().replace(/\s+/g, ' ') || '';

      // Extract company (LinkedIn 2024/2025)
      const companyEl =
        card.querySelector<HTMLElement>('.artdeco-entity-lockup__subtitle span') ||
        card.querySelector<HTMLElement>('h4.base-search-card__subtitle') ||
        card.querySelector<HTMLElement>('a.job-card-container__company-name') ||
        card.querySelector<HTMLElement>('span.job-card-container__company-name');
      const company = companyEl?.textContent?.trim() || '';

      // Extract location (LinkedIn 2024/2025)
      const locationEl =
        card.querySelector<HTMLElement>('.artdeco-entity-lockup__caption li span') ||
        card.querySelector<HTMLElement>('span.job-card-container__metadata-item') ||
        card.querySelector<HTMLElement>('span.job-card-container__primary-description') ||
        card.querySelector<HTMLElement>('li.job-card-container__metadata-item');
      const location = locationEl?.textContent?.trim() || '';

      // Extract URL
      const linkEl = card.querySelector<HTMLAnchorElement>('a[href*="/jobs/view/"]');
      const url = linkEl?.href || window.location.href;

      // Extract optional fields
      const descEl = card.querySelector<HTMLElement>(
        'p.job-card-list__description, p.base-search-card__snippet'
      );
      const description = descEl?.textContent?.trim();

      const salaryEl = card.querySelector<HTMLElement>('span.job-card-container__salary-info');
      const salary = salaryEl?.textContent?.trim();

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

      // Debug logging for selector issues
      if (!title || !company) {
        console.warn(`[Executor V2] Job card ${index} missing data:`, {
          hasTitle: !!title,
          hasCompany: !!company,
          titleText: title || '(empty)',
          companyText: company || '(empty)',
          cardClasses: card.className,
          cardHTML: card.outerHTML.substring(0, 500),
        });
      }

      // Include jobs even without company (fallback to generate ID)
      if (title || jobId) {
        jobs.push({
          id: jobId,
          title: title || 'Unknown Title',
          company: company || 'Unknown Company',
          location,
          url,
          description,
          salary,
          postedDate,
          applyType,
        });
      }
    } catch (error) {
      console.warn('[Executor V2] Error scraping job card:', error);
    }
  });

  return jobs;
}

/**
 * Click job card by ID and wait for details to load
 */
async function clickJobCard(jobId: string): Promise<{
  description: string;
  applyType: 'easy_apply' | 'external';
}> {
  console.log('[Executor V2] Clicking job card:', jobId);

  const jobCard = document.querySelector(`[data-job-id="${jobId}"]`) as HTMLElement;
  if (!jobCard) {
    console.error('[Executor V2] Job card not found:', jobId);
    return { description: '', applyType: 'external' };
  }

  // Use humanized click for job card selection
  if (humanizeConfig.enabled) {
    await humanClick(jobCard, { jitterBefore: true, minJitter: 500, maxJitter: 1000 });
  } else {
    jobCard.click();
  }

  // Wait for job details panel to load
  await waitForJobDetailsDom(5000);

  // Extract job description and apply type
  const detailsContainer = document.querySelector(
    '.jobs-search__job-details--container, .jobs-details__main-content'
  );
  if (!detailsContainer) {
    console.error('[Executor V2] Details container not found');
    return { description: '', applyType: 'external' };
  }

  const descriptionElement = detailsContainer.querySelector(
    '.jobs-description, .jobs-description-content, #job-details'
  );
  const description = descriptionElement?.textContent?.trim() || '';

  // Detect apply type
  let easyApplyButton = detailsContainer.querySelector('button[aria-label*="Easy Apply"]');
  if (!easyApplyButton) {
    const buttons = Array.from(detailsContainer.querySelectorAll('button'));
    easyApplyButton = buttons.find((btn) => btn.textContent?.includes('Easy Apply')) || null;
  }

  const applyType: 'easy_apply' | 'external' = easyApplyButton ? 'easy_apply' : 'external';

  console.log('[Executor V2] Scraped details:', {
    descriptionLength: description.length,
    applyType,
  });

  return { description, applyType };
}

/**
 * Click apply button and detect modal vs external ATS
 */
async function clickApplyButton(jobId: string): Promise<{
  type: 'modal' | 'external' | 'timeout';
  atsUrl?: string;
  atsTabId?: number;
  timeout?: boolean;
}> {
  console.log('[Executor V2] Clicking apply button for job:', jobId);

  // LinkedIn 2024/2025 selectors - updated to match current HTML structure
  const detailsContainer = document.querySelector(
    '.job-details-jobs-unified-top-card__container--two-pane, ' +
      '.jobs-search__job-details--container, ' +
      '.jobs-details__main-content, ' +
      '.jobs-unified-top-card'
  );

  console.log(
    '[Executor V2] Details container found:',
    !!detailsContainer,
    detailsContainer?.className
  );

  if (!detailsContainer) {
    // Fallback: search entire document if container not found
    console.warn('[Executor V2] Details container not found, searching entire document');
  }

  const searchRoot = detailsContainer || document;

  // Find apply element using multiple strategies (LinkedIn 2024/2025 structure)
  // Strategy 1: Direct ID (most reliable)
  let applyElement: HTMLElement | null = searchRoot.querySelector('#jobs-apply-button-id');

  // Strategy 2: Class-based selector
  if (!applyElement) {
    applyElement = searchRoot.querySelector('.jobs-apply-button');
  }

  // Strategy 3: Data attribute selector
  if (!applyElement) {
    applyElement = searchRoot.querySelector('button[data-live-test-job-apply-button]');
  }

  // Strategy 4: aria-label based (Easy Apply)
  if (!applyElement) {
    applyElement =
      searchRoot.querySelector('button[aria-label*="Easy Apply" i]') ||
      searchRoot.querySelector('button[aria-label*="easy apply" i]');
  }

  // Strategy 5: External apply link
  if (!applyElement) {
    applyElement = searchRoot.querySelector('a[data-testid="external-apply-button"]');
  }

  // Strategy 6: Fallback - find any VISIBLE button with "apply" text
  if (!applyElement) {
    const allElements = Array.from(searchRoot.querySelectorAll('button, a'));
    applyElement =
      (allElements.find((el) => {
        const htmlEl = el as HTMLElement;
        const text = el.textContent?.toLowerCase() || '';
        const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';

        // Must contain "apply"
        const hasApplyText = text.includes('apply') || ariaLabel.includes('apply');
        if (!hasApplyText) return false;

        // Exclude non-apply buttons by text patterns
        const excludePatterns = ['save', 'show results', 'filter', 'search', 'clear'];
        if (excludePatterns.some((p) => text.includes(p) || ariaLabel.includes(p))) return false;

        // Stealth-safe visibility check (works in background tabs)
        if (isActuallyHidden(htmlEl)) return false;

        return true;
      }) as HTMLElement) || null;
  }

  console.log(
    '[Executor V2] Apply element found:',
    !!applyElement,
    applyElement?.tagName,
    applyElement?.className,
    applyElement?.getAttribute('aria-label')?.substring(0, 50)
  );

  if (!applyElement) {
    console.error('[Executor V2] Apply button/link not found after all strategies');
    return { type: 'timeout', timeout: true };
  }

  // Pre-register listener for external ATS to avoid race condition
  const externalATSOpenedPromise = waitForMessage<ExternalATSOpenedMessage['data']>(
    'EXTERNAL_ATS_OPENED',
    jobId,
    60000
  );

  // Check if this is an external link - if so, open via background to avoid tab focus
  const isExternalLink =
    applyElement.tagName === 'A' &&
    (applyElement as HTMLAnchorElement).href &&
    (applyElement.getAttribute('target') === '_blank' ||
      !(applyElement as HTMLAnchorElement).href.includes('linkedin.com'));

  if (isExternalLink) {
    const href = (applyElement as HTMLAnchorElement).href;
    console.log('[Executor V2] External apply link detected, opening via background:', href);

    // Ask background to open tab with active: false
    chrome.runtime.sendMessage({
      type: 'OPEN_ATS_TAB',
      data: { url: href, jobId },
    });
  } else {
    // Click apply element directly (for modal/Easy Apply) with humanized click
    if (humanizeConfig.enabled) {
      await humanClick(applyElement, { jitterBefore: true, minJitter: 800, maxJitter: 1500 });
    } else {
      applyElement.click();
    }
  }

  // Wait for either modal or external ATS
  // Modal check: only resolve if modal is actually found, otherwise let it timeout
  const result = await Promise.race([
    waitForLinkedInModal(5000)
      .then((hasModal) => {
        console.log('[Executor V2] Modal check resolved:', hasModal);
        // Only return modal if actually detected
        if (hasModal) {
          return {
            type: 'modal' as const,
            hasModal: true,
          };
        }
        // If no modal, reject this promise so it doesn't win the race
        // The race will continue with external ATS or timeout
        return Promise.reject(new Error('No modal detected'));
      })
      .catch(() => {
        // Return a special type that indicates "keep waiting"
        return { type: 'no-modal' as const };
      }),
    externalATSOpenedPromise.then((message) => {
      console.log('[Executor V2] External ATS message received:', message);
      return {
        type: 'external' as const,
        data: message.data,
      };
    }),
    new Promise<{ type: 'timeout' }>((resolve) => {
      setTimeout(() => {
        console.log('[Executor V2] Race timeout after 60s');
        resolve({ type: 'timeout' });
      }, 60000);
    }),
  ]);

  console.log('[Executor V2] Promise.race resolved with:', result);

  if (result.type === 'modal') {
    return { type: 'modal' };
  } else if (result.type === 'external' && 'data' in result) {
    // Get URL from the opened tab or use a placeholder
    // The atsUrl is not in the message type, but we can get it from the tab URL
    const atsTabId = result.data.atsTabId;
    return {
      type: 'external' as const,
      atsUrl: undefined, // URL will be determined later from tab
      atsTabId: atsTabId,
    };
  } else if (result.type === 'no-modal') {
    // No modal detected, continue waiting for external ATS
    console.log('[Executor V2] No modal detected, waiting for external ATS...');
    try {
      const externalResult = await Promise.race([
        externalATSOpenedPromise.then((message) => ({
          type: 'external' as const,
          data: message.data,
        })),
        new Promise<{ type: 'timeout' }>((resolve) => {
          setTimeout(() => resolve({ type: 'timeout' }), 55000);
        }),
      ]);

      if (externalResult.type === 'external' && 'data' in externalResult) {
        const atsTabId = externalResult.data.atsTabId;
        return {
          type: 'external' as const,
          atsUrl: undefined, // URL will be determined later from tab
          atsTabId: atsTabId,
        };
      }
    } catch (error) {
      console.error('[Executor V2] Error waiting for external ATS:', error);
    }
    return { type: 'timeout', timeout: true };
  } else {
    return { type: 'timeout', timeout: true };
  }
}

/**
 * Navigate to next page
 * Uses humanized clicks for pagination
 */
async function navigateToNextPage(): Promise<boolean> {
  // Try Next button first
  const nextButton = document.querySelector<HTMLButtonElement>(
    'button[aria-label*="Next"], button[aria-label*="next"], button[data-test-pagination-page-btn-next]'
  );
  if (nextButton && !nextButton.disabled) {
    if (humanizeConfig.enabled) {
      await humanClick(nextButton, { jitterBefore: true, minJitter: 500, maxJitter: 1000 });
    } else {
      nextButton.click();
    }
    return true;
  }

  // Try Next link
  const nextLink = document.querySelector<HTMLAnchorElement>(
    'a[aria-label*="Next"], a[aria-label*="next"], a[data-test-pagination-page-btn-next]'
  );
  if (nextLink) {
    if (humanizeConfig.enabled) {
      await humanClick(nextLink, { jitterBefore: true, minJitter: 500, maxJitter: 1000 });
    } else {
      nextLink.click();
    }
    return true;
  }

  // Try next page number button
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
        if (humanizeConfig.enabled) {
          await humanClick(link, { jitterBefore: true, minJitter: 500, maxJitter: 1000 });
        } else {
          link.click();
        }
        return true;
      }
      if (button && !button.disabled) {
        if (humanizeConfig.enabled) {
          await humanClick(button, { jitterBefore: true, minJitter: 500, maxJitter: 1000 });
        } else {
          button.click();
        }
        return true;
      }
    }
  }

  return false;
}

// ============================================================================
// Message Handler
// ============================================================================

// Check feature flag
const USE_ORCHESTRATOR_V2 = true; // Or read from chrome.storage

if (!USE_ORCHESTRATOR_V2) {
  // Don't register message handlers if feature flag is off
  console.log('[Executor V2] Feature flag disabled, not registering handlers');
} else if (ALREADY_LOADED) {
  // Don't register if already loaded (prevents duplicate listeners)
  console.log('[Executor V2] Skipping message handler registration (already loaded)');
} else {
  // Register message handlers
  chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
    // Return true to indicate async response
    (async () => {
      try {
        switch (message.type) {
          case 'SCRAPE_JOBS': {
            const jobs = scrapeJobCards();

            // Calculate pagination info
            const currentPageEl = document.querySelector<HTMLElement>(
              'li[aria-current="page"], button[aria-current="page"]'
            );
            const currentPage = currentPageEl ? parseInt(currentPageEl.textContent || '1', 10) : 1;

            const nextButton = document.querySelector<HTMLButtonElement>(
              'button[aria-label*="Next"], button[aria-label*="next"]'
            );
            const hasNextPage = nextButton !== null && !nextButton.disabled;

            sendResponse({
              status: 'ok',
              data: {
                jobIds: jobs.map((job) => job.id),
                jobs,
                hasNextPage,
                currentPage,
              },
            });
            break;
          }

          case 'CLICK_JOB_BY_ID':
          case 'CLICK_JOB_CARD': {
            const { jobId } = message.data;
            const details = await clickJobCard(jobId);

            if (details.description) {
              sendResponse({
                success: true,
                description: details.description,
                applyType: details.applyType,
              });
            } else {
              sendResponse({ success: false, reason: 'No details found' });
            }
            break;
          }

          case 'CLICK_APPLY_BUTTON': {
            const { jobId } = message.data;
            // Store jobId for test helper to retrieve when new tab opens
            (window as any).__currentJobId = jobId;
            const result = await clickApplyButton(jobId);

            if (result.type === 'modal') {
              sendResponse({ type: 'modal' });
            } else if (result.type === 'external') {
              sendResponse({
                type: 'external',
                atsUrl: result.atsUrl || undefined,
                atsTabId: result.atsTabId,
              });
            } else {
              sendResponse({ type: 'timeout', timeout: true });
            }
            break;
          }

          case 'CLASSIFY_PAGE': {
            try {
              const classification = classifyPage();
              console.log('[Executor V2] Page classification:', classification.type);
              sendResponse({
                success: true,
                pageType: classification.type,
                classification,
              });
            } catch (error) {
              console.error('[Executor V2] Error classifying page:', error);
              sendResponse({
                success: false,
                pageType: 'unknown',
                error: error instanceof Error ? error.message : String(error),
              });
            }
            break;
          }

          case 'CLICK_INTERMEDIATE_BUTTON': {
            const { jobId } = message.data;
            console.log('[Executor V2] Clicking intermediate button for job:', jobId);

            try {
              // Find and click the intermediate "Apply" button
              const classification = classifyPage();
              const applyAction = classification.actions.find((a) => a.purpose === 'apply');

              if (applyAction && applyAction.element) {
                // Use humanized click for intermediate button
                if (humanizeConfig.enabled) {
                  await humanClick(applyAction.element as HTMLElement, {
                    jitterBefore: true,
                    minJitter: 800,
                    maxJitter: 1500,
                  });
                } else {
                  (applyAction.element as HTMLElement).click();
                }
                // Wait for page/modal to update
                await new Promise((resolve) => setTimeout(resolve, 1000));
                sendResponse({ success: true });
              } else {
                console.error('[Executor V2] No apply button found for intermediate page');
                sendResponse({ success: false, reason: 'No apply button found' });
              }
            } catch (error) {
              console.error('[Executor V2] Error clicking intermediate button:', error);
              sendResponse({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              });
            }
            break;
          }

          case 'EXECUTE_PAGE_ACTION': {
            if ((window as any).__actionInProgress) {
              console.warn('[Executor V2] EXECUTE_PAGE_ACTION overlapping');
            }
            (window as any).__actionInProgress = true;

            try {
              const { jobId, vaultProfile, vaultResume, mode } = message.data;
              console.log(
                '[Executor V2] EXECUTE_PAGE_ACTION received for job:',
                jobId,
                'mode:',
                mode
              );

              const resumeData = vaultResume
                ? {
                    data: vaultResume.data || vaultResume.base64 || '',
                    fileName: vaultResume.fileName || 'resume.pdf',
                    mimeType: vaultResume.mimeType || 'application/pdf',
                  }
                : undefined;

              const result = await executePageAction(resumeData, vaultProfile, mode);

              sendResponse({
                success: true,
                status: result.status,
                reason: result.reason,
                actionResult: result.action,
              });
            } catch (error) {
              console.error('[Executor V2] Error executing page action:', error);
              sendResponse({
                success: false,
                status: 'error',
                reason: String(error),
              });
            } finally {
              (window as any).__actionInProgress = false;
            }
            break;
          }

          case 'NAVIGATE_NEXT_PAGE': {
            const success = await navigateToNextPage();

            if (success) {
              // Wait for navigation to complete
              await new Promise((resolve) => setTimeout(resolve, 2000));
              sendResponse({ success: true });
            } else {
              sendResponse({ success: false });
            }
            break;
          }

          case 'CLICK_MODAL_BUTTON': {
            const { jobId, selector } = message.data;
            console.log(
              '[Executor V2] Clicking modal button for job:',
              jobId,
              'selector:',
              selector
            );

            try {
              // Find the button by selector
              const button = document.querySelector<HTMLElement>(selector);

              if (button) {
                // Use humanized click for modal button
                if (humanizeConfig.enabled) {
                  await humanClick(button, { jitterBefore: true, minJitter: 800, maxJitter: 1500 });
                } else {
                  button.click();
                }
                // Wait for page/modal to update
                await new Promise((resolve) => setTimeout(resolve, 1000));
                sendResponse({ success: true });
              } else {
                console.error('[Executor V2] Modal button not found:', selector);
                sendResponse({ success: false, reason: `Button not found: ${selector}` });
              }
            } catch (error) {
              console.error('[Executor V2] Error clicking modal button:', error);
              sendResponse({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              });
            }
            break;
          }

          case 'CLOSE_MODAL': {
            // Close ALL Easy Apply modal layers (confirmation dialog + main modal)
            console.log('[Executor V2] Closing all Easy Apply modal layers');

            let totalClosed = 0;
            const maxAttempts = 3; // Close up to 3 modal layers

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
              console.log(`[Executor V2] Modal cleanup attempt ${attempt + 1}/${maxAttempts}`);

              // PRIORITY 1: Check for confirmation dialog first (top layer)
              // This is the "Save this application?" dialog that appears when trying to close mid-application
              const confirmDialog = document.querySelector(
                '[data-test-modal-id*="discard-confirmation"], .artdeco-modal--layer-confirmation'
              );

              if (confirmDialog) {
                console.log('[Executor V2] Found confirmation dialog, clicking Discard');

                // Try Discard button first (preferred - discards the application)
                const discardBtn = confirmDialog.querySelector('[data-test-dialog-secondary-btn]');
                if (discardBtn) {
                  (discardBtn as HTMLElement).click();
                  totalClosed++;
                  await new Promise((resolve) => setTimeout(resolve, 300));
                  continue; // Check for next layer
                }

                // Fallback to X button on confirmation dialog
                const closeBtn = confirmDialog.querySelector('[data-test-modal-close-btn]');
                if (closeBtn) {
                  (closeBtn as HTMLElement).click();
                  totalClosed++;
                  await new Promise((resolve) => setTimeout(resolve, 300));
                  continue;
                }
              }

              // PRIORITY 2: Check for main Easy Apply modal
              const mainModal = document.querySelector(
                '.jobs-easy-apply-modal, [data-test-modal-id="easy-apply-modal"]'
              );

              if (mainModal) {
                console.log('[Executor V2] Found main Easy Apply modal, closing');

                // Try to find the specific close button first
                // Use the selector provided by user findings: data-test-modal-close-btn
                const dismissBtn = mainModal.querySelector(
                  '[data-test-modal-close-btn], button[aria-label="Dismiss"], button[aria-label="Close"]'
                );

                if (dismissBtn) {
                  console.log('[Executor V2] Clicking dismiss button');
                  (dismissBtn as HTMLElement).click();
                  totalClosed++;
                  await new Promise((resolve) => setTimeout(resolve, 500)); // Wait for animation/React state
                  continue;
                }

                // Fallback: If no close button found but modal is open, try Esc key
                console.log('[Executor V2] No dismiss button found, trying Escape key');
                document.dispatchEvent(
                  new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })
                );
                totalClosed++;
                await new Promise((resolve) => setTimeout(resolve, 500));
                continue;
              }

              // PRIORITY 3: Generic modal overlay (fallback)
              const genericOverlay = document.querySelector('.artdeco-modal-overlay--is-top-layer');
              if (genericOverlay) {
                console.log('[Executor V2] Found generic modal overlay, closing');

                const closeBtn = genericOverlay.querySelector(
                  '[data-test-modal-close-btn], button[aria-label*="dismiss" i]'
                );
                if (closeBtn) {
                  (closeBtn as HTMLElement).click();
                  totalClosed++;
                  await new Promise((resolve) => setTimeout(resolve, 300));
                  continue;
                }
              }
            } // End of for loop

            console.log(`[Executor V2] Closed ${totalClosed} modal layer(s)`);

            // Final fallback: press Escape if no modals were closed
            if (totalClosed === 0) {
              document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
              );
              console.log('[Executor V2] No modals found, sent Escape key as fallback');
            }

            // Wait for animations to complete
            await new Promise((resolve) => setTimeout(resolve, 500));
            sendResponse({ success: true, closed: totalClosed });
            break;
          }

          case 'TRACK_MANUAL_SUBMIT': {
            const { jobUrl, jobTitle, company, location } = message.data;
            console.log('[Executor V2] Setting up manual submit tracking for:', jobTitle);

            // Track if we've already saved to avoid duplicates
            let saved = false;

            const saveAppliedJob = async () => {
              if (saved) return;
              saved = true;

              console.log('[Executor V2] Manual submit SUCCESS detected, saving applied job');
              console.log('[Executor V2] Job data:', { jobUrl, jobTitle, company, location });
              try {
                console.log('[Executor V2] Sending SAVE_APPLIED_JOB message to background...');
                await chrome.runtime.sendMessage({
                  type: 'SAVE_APPLIED_JOB',
                  data: {
                    jobUrl,
                    jobTitle,
                    company,
                    location,
                    mode: 'autofill',
                  },
                });
                console.log('[Executor V2] ✅ SAVE_APPLIED_JOB message sent successfully');
              } catch (error) {
                console.error('[Executor V2] ❌ Error sending SAVE_APPLIED_JOB:', error);
              }
            };

            // Method 1: URL change detection (SPA navigation after submit)
            // NOTE: Only works for SPA-style navigation where the page doesn't fully reload.
            // For full page reloads (classic form post → success page), the content script
            // is destroyed before this interval can fire. That's why Method 3 exists.
            const originalUrl = window.location.href;
            const urlCheckInterval = setInterval(() => {
              if (window.location.href !== originalUrl) {
                console.log('[Executor V2] URL changed after submit, assuming success');
                saveAppliedJob();
                clearInterval(urlCheckInterval);
              }
            }, 500); // Faster check (500ms) to catch SPA navigations sooner

            // Success detection logic (extracted to reuse)
            const checkForSuccessMessage = () => {
              // Check for success messages in common containers
              const bodyText = document.body.textContent?.toLowerCase() || '';

              // Look for success keywords in the entire page
              // Use specific phrases to avoid false positives
              const successKeywords = [
                'has been submitted',
                'has been received',
                'application sent',
                'thank you for applying',
                'successfully submitted',
                'application received',
                'congratulations',
                'application has been',
                'we have received your application',
                'application complete',
                'application confirmed',
              ];

              const hasSuccessKeyword = successKeywords.some((keyword) =>
                bodyText.includes(keyword)
              );

              if (hasSuccessKeyword) {
                console.log('[Executor V2] 🔍 Success keyword found in page, checking elements...');

                // Check for specific success message elements first
                const successElements = document.querySelectorAll(
                  '[data-test*="success"], [class*="success"], [class*="confirmation"], [role="alert"], [class*="congratulations"]'
                );

                for (const element of successElements) {
                  const text = element.textContent?.toLowerCase() || '';
                  if (successKeywords.some((keyword) => text.includes(keyword))) {
                    console.log(
                      '[Executor V2] ✅ Success message detected in success element:',
                      text.substring(0, 100)
                    );
                    saveAppliedJob();
                    observer.disconnect();
                    clearInterval(urlCheckInterval);
                    return true;
                  }
                }

                // Fallback: Check all visible text elements (div, p, span, h1-h6)
                // This catches success messages that don't have specific success classes
                const allTextElements = document.querySelectorAll(
                  'div, p, span, h1, h2, h3, h4, h5, h6'
                );
                for (const element of allTextElements) {
                  const text = element.textContent?.toLowerCase() || '';
                  // Only check elements with reasonable text length (not too short, not too long)
                  if (text.length > 20 && text.length < 200) {
                    if (successKeywords.some((keyword) => text.includes(keyword))) {
                      // Verify this is a visible element
                      const rect = element.getBoundingClientRect();
                      if (rect.width > 0 && rect.height > 0) {
                        console.log(
                          '[Executor V2] ✅ Success message detected in text element:',
                          text.substring(0, 100)
                        );
                        saveAppliedJob();
                        observer.disconnect();
                        clearInterval(urlCheckInterval);
                        return true;
                      }
                    }
                  }
                }
              }
              return false;
            };

            // Method 2: Success message detection via MutationObserver
            // Works for SPA-style forms that show success without navigating
            const observer = new MutationObserver(() => {
              checkForSuccessMessage();
            });
            observer.observe(document.body, { childList: true, subtree: true });
            console.log(
              '[Executor V2] ✅ Success detection observer initialized and watching for changes'
            );

            // Method 3: pagehide + submit click interception (PRIMARY trigger for classic form posts)
            //
            // Problem: for traditional form submissions, the page fully navigates to a success
            // page. The content script is destroyed during navigation — before the URL interval
            // or MutationObserver can fire — so we must detect the submit BEFORE it happens.
            //
            // Solution: intercept the submit button click to SET A FLAG, then on `pagehide`
            // (which fires when the browser is actually navigating away) call saveAppliedJob().
            //
            // Why NOT save on click directly?
            //   If form validation fails, the page stays visible. Saving immediately would be
            //   a false positive — user never successfully applied. With the pagehide approach,
            //   if validation fails the page stays → pagehide never fires → no false save.
            //
            // Why pagehide and not beforeunload?
            //   `pagehide` fires more reliably for tab navigations in extension content scripts.

            let submitWasClicked = false;

            const submitSelectors = [
              'button[type="submit"]',
              'input[type="submit"]',
              '[data-test*="submit"]',
              '[data-testid*="submit"]',
              'button[class*="submit"]',
              '[data-submits]', // Greenhouse
              '#submit_app', // Greenhouse
            ];
            const submitButtons = new Set<HTMLElement>();
            for (const selector of submitSelectors) {
              document
                .querySelectorAll<HTMLElement>(selector)
                .forEach((el) => submitButtons.add(el));
            }
            // Also find any visible button with "submit" / "apply" text
            document.querySelectorAll<HTMLElement>('button, input[type="button"]').forEach((el) => {
              const text = (el.textContent || el.getAttribute('value') || '').toLowerCase().trim();
              if (text.includes('submit') || text.includes('apply now') || text === 'apply') {
                submitButtons.add(el);
              }
            });

            const submitClickHandler = () => {
              console.log(
                '[Executor V2] 🖱️ Submit button clicked — flagging, will save on pagehide'
              );
              submitWasClicked = true;
              // Do NOT set saved=true here. If validation fails and page stays,
              // we need to be able to fire again on the actual successful submit.
            };

            console.log(
              `[Executor V2] Attaching submit click listener to ${submitButtons.size} button(s)`
            );
            for (const btn of submitButtons) {
              // No `once:true` — keep listener alive through validation failures
              btn.addEventListener('click', submitClickHandler, { capture: true });
            }

            // pagehide fires when page is actually navigating away (tab close, link, form post).
            // We only care about it when the user already clicked submit on this page.
            const pagehideHandler = () => {
              if (submitWasClicked) {
                console.log(
                  '[Executor V2] 🚪 Page navigating after submit click — saving applied job'
                );
                saveAppliedJob();
              }
            };
            window.addEventListener('pagehide', pagehideHandler, { capture: true, once: true });

            // Clean up after 5 minutes (if user never submits)
            const cleanup = () => {
              observer.disconnect();
              clearInterval(urlCheckInterval);
              for (const btn of submitButtons) {
                btn.removeEventListener('click', submitClickHandler, { capture: true });
              }
              window.removeEventListener('pagehide', pagehideHandler, { capture: true });
              console.log('[Executor V2] Submit tracking cleanup after 5 minutes');
            };
            setTimeout(cleanup, 5 * 60 * 1000);

            sendResponse({ success: true });
            break;
          }

          case 'EXTRACT_JOB_METADATA': {
            console.log('[Executor V2] Extracting job metadata from page');

            try {
              const { extractJobMetadata } = await import('./ats/metadata-extractor');
              const metadata = extractJobMetadata();

              sendResponse({
                success: true,
                title: metadata.title || 'Unknown Job',
                company: metadata.company || 'Unknown Company',
                location: metadata.location || '',
                needsConfirmation: metadata.needsConfirmation,
              });
            } catch (error) {
              console.error('[Executor V2] Error extracting job metadata:', error);
              sendResponse({
                success: false,
                title: 'Unknown Job',
                company: 'Unknown Company',
                location: '',
                needsConfirmation: true,
              });
            }
            break;
          }

          default:
            console.warn('[Executor V2] Unknown command:', message.type);
            sendResponse({ status: 'error', message: `Unknown command: ${message.type}` });
        }
      } catch (error) {
        console.error('[Executor V2] Error handling command:', error);
        sendResponse({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })();

    return true; // Indicates async response
  });
}

if (!ALREADY_LOADED) {
  console.log('[Executor V2] Content script loaded and ready');
}
