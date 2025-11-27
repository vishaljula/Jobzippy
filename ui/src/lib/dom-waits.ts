/**
 * DOM-Based Wait Functions
 * Replace arbitrary sleeps with robust DOM readiness checks
 */

/**
 * Wait for LinkedIn job details panel to load
 * Uses DOM checks instead of arbitrary sleep(1500)
 */
export async function waitForJobDetailsDom(timeoutMs = 5000): Promise<void> {
  const start = performance.now();

  while (performance.now() - start < timeoutMs) {
    // LinkedIn-specific selectors for job details panel
    const panel =
      document.querySelector('[data-job-details-panel]') ||
      document.querySelector('.jobs-details__main-content') ||
      document.querySelector('.jobs-details-top-card') ||
      document.querySelector('[data-test-id="job-details"]');

    if (panel) {
      // Check if job title/content is actually loaded
      const title =
        panel.querySelector('h2') ||
        panel.querySelector('[data-job-title]') ||
        panel.querySelector('.jobs-details-top-card__job-title') ||
        panel.querySelector('h1');

      if (title && title.textContent?.trim()) {
        console.log('[DOM Waits] Job details panel loaded');
        return; // Job details loaded
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error('Job details panel did not load within timeout');
}

/**
 * Wait for LinkedIn Easy Apply modal to appear
 * Uses MutationObserver to watch for LinkedIn-specific modal selectors
 * Event-driven: waits indefinitely until modal DOM elements appear (no timeout by default)
 * 
 * This checks for specific LinkedIn modal CSS selectors:
 * - .jobs-easy-apply-modal
 * - [data-test-modal]
 * - .jobs-easy-apply-content
 * - etc.
 * 
 * Returns true if modal is detected, false if timeout occurs (when timeoutMs > 0)
 */
export async function waitForLinkedInModal(timeoutMs = 0): Promise<boolean> {
  return new Promise((resolve) => {
    console.log('[DOM Waits] Starting to wait for modal (heuristic detection)...');
    
    // Check immediately if modal is already visible
    if (isModalVisible()) {
      console.log('[DOM Waits] Modal already visible');
      resolve(true);
      return;
    }

    // Watch for modal appearance via DOM mutations (event-driven)
    const observer = new MutationObserver(() => {
      if (isModalVisible()) {
        console.log('[DOM Waits] Modal detected via MutationObserver (heuristic detection)');
        observer.disconnect();
        resolve(true);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    // Only add timeout if explicitly requested (timeoutMs > 0)
    // Without timeout, waits indefinitely for modal to appear
    if (timeoutMs > 0) {
      setTimeout(() => {
        observer.disconnect();
        const visible = isModalVisible();
        console.log(`[DOM Waits] LinkedIn modal check timeout: ${visible}`);
        resolve(visible);
      }, timeoutMs);
    }
    // If timeoutMs === 0, observer stays active indefinitely until modal appears
  });
}

/**
 * Heuristically detect if an application modal is currently visible
 * 
 * Uses dynamic heuristics to detect modals without hardcoding platform-specific selectors.
 * Looks for common modal patterns:
 * - Elements with role="dialog" or aria-label containing "apply"/"modal"
 * - Overlay elements (fixed positioning, high z-index, covers viewport)
 * - Elements containing form fields that appear after apply button click
 * - Elements with modal-related classes/attributes
 * 
 * Returns true only if:
 * 1. A modal-like element is found using heuristics
 * 2. The element is actually visible (not hidden via CSS)
 * 3. The element contains form fields (indicating it's an application form)
 */
function isModalVisible(): boolean {
  // Heuristic 1: Look for elements with dialog role or modal-related aria-labels
  const dialogElements = Array.from(document.querySelectorAll('[role="dialog"], [aria-label*="apply" i], [aria-label*="modal" i], [aria-label*="application" i]'));
  
  // Heuristic 2: Look for overlay elements (fixed positioning, high z-index)
  const overlayElements = Array.from(document.querySelectorAll('*')).filter(el => {
    const style = window.getComputedStyle(el);
    const hasFixedPosition = style.position === 'fixed';
    const hasHighZIndex = parseInt(style.zIndex) > 100;
    const coversViewport = hasFixedPosition && (
      (style.top === '0px' || style.top === '0') &&
      (style.left === '0px' || style.left === '0') &&
      (style.width === '100%' || style.right === '0px' || style.right === '0')
    );
    return hasFixedPosition && (hasHighZIndex || coversViewport);
  });
  
  // Heuristic 3: Look for elements with modal-related class names or IDs
  const modalKeywords = ['modal', 'dialog', 'overlay', 'popup', 'easy-apply', 'apply-form'];
  const keywordElements = Array.from(document.querySelectorAll('*')).filter(el => {
    const id = el.id?.toLowerCase() || '';
    const className = el.className?.toString().toLowerCase() || '';
    return modalKeywords.some(keyword => id.includes(keyword) || className.includes(keyword));
  });
  
  // Combine all candidates
  const candidates = new Set([...dialogElements, ...overlayElements, ...keywordElements]);
  
  // Filter to only visible elements that contain form fields
  for (const candidate of candidates) {
    const style = window.getComputedStyle(candidate);
    const isVisible = (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      candidate.offsetWidth > 0 &&
      candidate.offsetHeight > 0
    );
    
    if (!isVisible) continue;
    
    // Check if it contains form fields (indicating it's an application form)
    const hasFormFields = candidate.querySelector('input, textarea, select, form') !== null;
    
    // Check if it's positioned as an overlay (covers content)
    const isOverlay = style.position === 'fixed' || style.position === 'absolute';
    
    if (hasFormFields && isOverlay) {
      console.log('[DOM Waits] Modal detected via heuristics:', {
        element: candidate.tagName,
        id: candidate.id,
        className: candidate.className,
        hasFormFields,
        isOverlay,
        position: style.position,
        zIndex: style.zIndex
      });
      return true;
    }
  }
  
  return false;
}

/**
 * Wait for a specific message from background script
 * Used for event-driven communication
 * Event-driven: waits indefinitely until message arrives (no timeout by default)
 */
export function waitForMessage<T = any>(
  messageType: string,
  jobId: string,
  timeoutMs = 0
): Promise<{ type: string; data: T }> {
  return new Promise((resolve, reject) => {
    let timeoutId: number | undefined;

    // Only add timeout if explicitly requested (timeoutMs > 0)
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        chrome.runtime.onMessage.removeListener(listener);
        reject(
          new Error(`Timeout waiting for ${messageType} for job ${jobId}`)
        );
      }, timeoutMs);
    }

    const listener = (message: any) => {
      if (message.type === messageType && message.data?.jobId === jobId) {
        if (timeoutId) clearTimeout(timeoutId);
        chrome.runtime.onMessage.removeListener(listener);
        console.log(`[DOM Waits] Received ${messageType} for job ${jobId}`);
        resolve(message);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
  });
}

/**
 * Sleep utility function
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

