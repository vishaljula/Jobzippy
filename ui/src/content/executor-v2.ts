/**
 * Unified Executor V2
 * Stateless executor that performs DOM actions based on commands from background orchestrator.
 *
 * Responsibilities:
 * - Pure DOM manipulation (no orchestration logic)
 * - Execute commands and return results
 * - All logic resides in background orchestrator
 */

import { intelligentNavigate } from './ats/navigator';
import { waitForJobDetailsDom, waitForLinkedInModal, waitForMessage } from '../lib/dom-waits';
import type { ExternalATSOpenedMessage } from '../types/job-session';
import { classifyPage } from './ats/page-classifier';
import { humanClick, humanizeConfig } from '../lib/humanize';

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
    console.log('[Executor V2] No job cards found');
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

  const detailsContainer = document.querySelector(
    '.jobs-search__job-details--container, .jobs-details__main-content'
  );
  if (!detailsContainer) {
    console.error('[Executor V2] Details container not found');
    return { type: 'timeout', timeout: true };
  }

  // Find apply element: Easy Apply button, regular Apply button, or Apply link
  let applyElement: HTMLElement | null =
    detailsContainer.querySelector('button[aria-label*="Easy Apply" i]') ||
    detailsContainer.querySelector('button[aria-label*="easy apply" i]') ||
    detailsContainer.querySelector('a[data-testid="external-apply-button"]');

  if (!applyElement) {
    // Fallback: find any button or link with "apply" in text
    const allElements = Array.from(detailsContainer.querySelectorAll('button, a'));
    applyElement =
      (allElements.find((el) => {
        const text = el.textContent?.toLowerCase() || '';
        return text.includes('apply');
      }) as HTMLElement) || null;
  }

  if (!applyElement) {
    console.error('[Executor V2] Apply button/link not found');
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

          case 'FILL_FORM': {
            const { jobId, formType, context, vaultProfile, vaultResume } = message.data;
            console.log('[Executor V2] Filling form:', { jobId, formType, context });
            console.log('[Executor V2] vaultResume received:', {
              hasData: !!vaultResume?.data,
              hasBase64: !!vaultResume?.base64,
              fileName: vaultResume?.fileName,
              mimeType: vaultResume?.mimeType,
            });

            // Convert vaultResume to the format expected by intelligentNavigate
            const resumeData = vaultResume
              ? {
                  data: vaultResume.data || vaultResume.base64 || '',
                  fileName: vaultResume.fileName || 'resume.pdf',
                  mimeType: vaultResume.mimeType || 'application/pdf',
                }
              : undefined;

            console.log('[Executor V2] resumeData for intelligentNavigate:', {
              hasData: !!resumeData?.data,
              dataLength: resumeData?.data?.length || 0,
              fileName: resumeData?.fileName,
              mimeType: resumeData?.mimeType,
            });

            const result = await intelligentNavigate(resumeData, vaultProfile);

            // Return result directly via sendResponse (no need for separate ATS_COMPLETE/JOB_COMPLETED)
            if (result?.success) {
              sendResponse({
                success: true,
                reason: result.reason || 'form_found',
                jobId, // Include jobId in response for consistency
              });
            } else {
              sendResponse({
                success: false,
                reason: result?.reason || 'unknown',
                message: result?.message,
                jobId,
              });
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

console.log('[Executor V2] Content script loaded and ready');
