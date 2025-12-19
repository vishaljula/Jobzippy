/**
 * Event-Driven DOM Wait Functions
 * Replace setTimeout delays with proper DOM event waits
 */

import { logger } from './logger';

/**
 * Wait for an element to be removed from the DOM
 */
export function waitForElementRemoval(
  selector: string,
  timeoutMs = 5000
): Promise<boolean> {
  return new Promise((resolve) => {
    const element = document.querySelector(selector);
    if (!element) {
      logger.log('DOM Events', `Element ${selector} already removed`);
      console.log(`[DOM Events] Element ${selector} already removed`);
      resolve(true); // Already removed
      return;
    }

    logger.log('DOM Events', `Waiting for element removal: ${selector} (timeout: ${timeoutMs}ms)`);
    console.log(`[DOM Events] Waiting for element removal: ${selector} (timeout: ${timeoutMs}ms)`);

    const observer = new MutationObserver(() => {
      if (!document.querySelector(selector)) {
        logger.log('DOM Events', `Element ${selector} removed`);
        console.log(`[DOM Events] Element ${selector} removed`);
        observer.disconnect();
        resolve(true);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      logger.log('DOM Events', `Timeout waiting for element removal: ${selector}`);
      console.log(`[DOM Events] Timeout waiting for element removal: ${selector}`);
      observer.disconnect();
      resolve(false);
    }, timeoutMs);
  });
}

/**
 * Wait for navigation to occur (URL change)
 */
export function waitForNavigation(timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const currentUrl = window.location.href;

    logger.log('DOM Events', `Waiting for navigation from ${currentUrl} (timeout: ${timeoutMs}ms)`);
    console.log(`[DOM Events] Waiting for navigation from ${currentUrl} (timeout: ${timeoutMs}ms)`);

    // Check if URL already changed
    if (window.location.href !== currentUrl) {
      logger.log('DOM Events', `URL already changed: ${currentUrl} -> ${window.location.href}`);
      console.log(`[DOM Events] URL already changed: ${currentUrl} -> ${window.location.href}`);
      resolve(true);
      return;
    }

    // Use MutationObserver to watch for programmatic navigation (SPA routing)
    const observer = new MutationObserver(() => {
      if (window.location.href !== currentUrl) {
        logger.log('DOM Events', `Navigation detected via MutationObserver: ${currentUrl} -> ${window.location.href}`);
        console.log(`[DOM Events] Navigation detected via MutationObserver: ${currentUrl} -> ${window.location.href}`);
        observer.disconnect();
        window.removeEventListener('popstate', handlePopState);
        window.removeEventListener('hashchange', handleHashChange);
        resolve(true);
      }
    });

    // Watch document for changes that might indicate navigation
    observer.observe(document, {
      childList: true,
      subtree: true,
    });

    // Listen for navigation events
    const handlePopState = () => {
      logger.log('DOM Events', `Navigation detected via popstate event: ${currentUrl} -> ${window.location.href}`);
      console.log(`[DOM Events] Navigation detected via popstate event: ${currentUrl} -> ${window.location.href}`);
      observer.disconnect();
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handleHashChange);
      resolve(true);
    };

    const handleHashChange = () => {
      logger.log('DOM Events', `Navigation detected via hashchange event: ${currentUrl} -> ${window.location.href}`);
      console.log(`[DOM Events] Navigation detected via hashchange event: ${currentUrl} -> ${window.location.href}`);
      observer.disconnect();
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handleHashChange);
      resolve(true);
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handleHashChange);

    // Only add timeout if explicitly requested (timeoutMs > 0)
    // Without timeout, waits indefinitely for navigation events
    if (timeoutMs > 0) {
      setTimeout(() => {
        logger.log('DOM Events', `Timeout waiting for navigation (still at ${currentUrl})`);
        console.log(`[DOM Events] Timeout waiting for navigation (still at ${currentUrl})`);
        observer.disconnect();
        window.removeEventListener('popstate', handlePopState);
        window.removeEventListener('hashchange', handleHashChange);
        resolve(false);
      }, timeoutMs);
    }
    // If timeoutMs === 0, listeners stay active indefinitely until navigation event fires
  });
}

/**
 * Wait for an element to appear in the DOM
 */
export function waitForElement(
  selector: string,
  timeoutMs = 5000
): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const element = document.querySelector(selector) as HTMLElement;
    if (element) {
      logger.log('DOM Events', `Element ${selector} already exists`);
      console.log(`[DOM Events] Element ${selector} already exists`);
      resolve(element);
      return;
    }

    logger.log('DOM Events', `Waiting for element: ${selector} (timeout: ${timeoutMs}ms)`);
    console.log(`[DOM Events] Waiting for element: ${selector} (timeout: ${timeoutMs}ms)`);

    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector) as HTMLElement;
      if (found) {
        logger.log('DOM Events', `Element ${selector} appeared`);
        console.log(`[DOM Events] Element ${selector} appeared`);
        observer.disconnect();
        resolve(found);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      logger.log('DOM Events', `Timeout waiting for element: ${selector}`);
      console.log(`[DOM Events] Timeout waiting for element: ${selector}`);
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

/**
 * Wait for form to become visible/ready
 */
export function waitForFormReady(
  formSelector: string = 'form',
  timeoutMs = 5000
): Promise<HTMLFormElement | null> {
  return new Promise((resolve) => {
    const form = document.querySelector(formSelector) as HTMLFormElement;
    if (form && form.offsetParent !== null) {
      logger.log('DOM Events', `Form ${formSelector} already ready`);
      console.log(`[DOM Events] Form ${formSelector} already ready`);
      resolve(form);
      return;
    }

    logger.log('DOM Events', `Waiting for form ready: ${formSelector} (timeout: ${timeoutMs}ms)`);
    console.log(`[DOM Events] Waiting for form ready: ${formSelector} (timeout: ${timeoutMs}ms)`);

    const observer = new MutationObserver(() => {
      const found = document.querySelector(formSelector) as HTMLFormElement;
      if (found && found.offsetParent !== null) {
        logger.log('DOM Events', `Form ${formSelector} is now ready`);
        console.log(`[DOM Events] Form ${formSelector} is now ready`);
        observer.disconnect();
        resolve(found);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    setTimeout(() => {
      logger.log('DOM Events', `Timeout waiting for form ready: ${formSelector}`);
      console.log(`[DOM Events] Timeout waiting for form ready: ${formSelector}`);
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

/**
 * Wait for DOM to stabilize after a click (no mutations for a period)
 */
export function waitForDOMStable(
  stableTimeMs = 500,
  timeoutMs = 5000
): Promise<boolean> {
  return new Promise((resolve) => {
    logger.log('DOM Events', `Waiting for DOM to stabilize (stable: ${stableTimeMs}ms, timeout: ${timeoutMs}ms)`);
    console.log(`[DOM Events] Waiting for DOM to stabilize (stable: ${stableTimeMs}ms, timeout: ${timeoutMs}ms)`);

    let stableTimer: number | null = null;
    let timeoutTimer: number | null = null;
    let mutationCount = 0;

    const observer = new MutationObserver(() => {
      mutationCount++;
      // Reset stable timer on any mutation
      if (stableTimer) {
        clearTimeout(stableTimer);
      }
      stableTimer = setTimeout(() => {
        logger.log('DOM Events', `DOM stabilized after ${mutationCount} mutations`);
        console.log(`[DOM Events] DOM stabilized after ${mutationCount} mutations`);
        observer.disconnect();
        if (timeoutTimer) clearTimeout(timeoutTimer);
        resolve(true);
      }, stableTimeMs) as unknown as number;
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    // Start stable timer
    stableTimer = setTimeout(() => {
      logger.log('DOM Events', `DOM stable (no mutations detected)`);
      console.log(`[DOM Events] DOM stable (no mutations detected)`);
      observer.disconnect();
      if (timeoutTimer) clearTimeout(timeoutTimer);
      resolve(true);
    }, stableTimeMs) as unknown as number;

    // Timeout fallback
    timeoutTimer = setTimeout(() => {
      logger.log('DOM Events', `Timeout waiting for DOM stability (${mutationCount} mutations detected)`);
      console.log(`[DOM Events] Timeout waiting for DOM stability (${mutationCount} mutations detected)`);
      observer.disconnect();
      if (stableTimer) clearTimeout(stableTimer);
      resolve(false);
    }, timeoutMs) as unknown as number;
  });
}

/**
 * Wait for checkbox to be checked (for CAPTCHA)
 */
export function waitForCheckboxChecked(
  checkbox: HTMLInputElement,
  timeoutMs = 2000
): Promise<boolean> {
  return new Promise((resolve) => {
    if (checkbox.checked) {
      logger.log('DOM Events', `Checkbox already checked`);
      console.log(`[DOM Events] Checkbox already checked`);
      resolve(true);
      return;
    }

    logger.log('DOM Events', `Waiting for checkbox to be checked (timeout: ${timeoutMs}ms)`);
    console.log(`[DOM Events] Waiting for checkbox to be checked (timeout: ${timeoutMs}ms)`);

    // Use MutationObserver to watch for checkbox state changes
    const observer = new MutationObserver(() => {
      if (checkbox.checked) {
        logger.log('DOM Events', `Checkbox checked via MutationObserver`);
        console.log(`[DOM Events] Checkbox checked via MutationObserver`);
        observer.disconnect();
        checkbox.removeEventListener('change', handleChange);
        resolve(true);
      }
    });

    observer.observe(checkbox, {
      attributes: true,
      attributeFilter: ['checked'],
    });

    // Also listen for change event
    const handleChange = () => {
      if (checkbox.checked) {
        logger.log('DOM Events', `Checkbox checked via change event`);
        console.log(`[DOM Events] Checkbox checked via change event`);
        observer.disconnect();
        checkbox.removeEventListener('change', handleChange);
        resolve(true);
      }
    };
    checkbox.addEventListener('change', handleChange);

    // Timeout fallback
    setTimeout(() => {
      logger.log('DOM Events', `Timeout waiting for checkbox to be checked`);
      console.log(`[DOM Events] Timeout waiting for checkbox to be checked`);
      observer.disconnect();
      checkbox.removeEventListener('change', handleChange);
      resolve(false);
    }, timeoutMs);
  });
}

