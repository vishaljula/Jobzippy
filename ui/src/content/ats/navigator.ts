/**
 * Intelligent Navigation System
 * Uses page classification to navigate through multi-step ATS flows
 */

import { PageClassification, DetectedField } from './classifier';

import {
  classifyPage,
  findBestAction,
  isSimpleCaptcha,
  hasGuestOption,
  logClassification,
} from './page-classifier';
import { createFormFillerFromVault } from './form-filler';
import { logger } from '../../lib/logger';

// ============================================================================
// NAVIGATION STATE
// ============================================================================

interface NavigationState {
  visitedUrls: Set<string>;
  clickedElements: Set<string>;
  attempts: number;
  maxAttempts: number;
  history: Array<{
    url: string;
    classification: PageClassification;
    action: string;
    timestamp: number;
  }>;
}

const navState: NavigationState = {
  visitedUrls: new Set(),
  clickedElements: new Set(),
  attempts: 0,
  maxAttempts: 5,
  history: [],
};

// ============================================================================
// NAVIGATION RESULT
// ============================================================================

export interface NavigationResult {
  success: boolean;
  finalClassification?: PageClassification;
  reason?: 'form_found' | 'account_required' | 'complex_captcha' | 'max_attempts' | 'unknown_page';
  message?: string;
}

// ============================================================================
// INTELLIGENT NAVIGATION LOOP
// ============================================================================

/**
 * Main intelligent navigation function
 * Navigates through multi-step flows until reaching application form
 */
export async function intelligentNavigate(): Promise<NavigationResult> {
  logger.log('Navigator', 'Starting intelligent navigation...');
  console.log('[Navigator] Starting intelligent navigation...');

  navState.attempts = 0;
  navState.visitedUrls.clear();
  navState.clickedElements.clear();
  navState.history = [];

  while (navState.attempts < navState.maxAttempts) {
    navState.attempts++;

    // Classify current page
    const classification = classifyPage();
    logClassification(classification);

    // Record in history
    navState.history.push({
      url: window.location.href,
      classification,
      action: '',
      timestamp: Date.now(),
    });

    // Handle based on page type
    const result = await handlePageType(classification);

    if (result) {
      return result;
    }

    // Wait for page changes
    await waitForPageChange();
  }

  console.log('[Navigator] Max attempts reached');
  return {
    success: false,
    reason: 'max_attempts',
    message: 'Maximum navigation attempts reached without finding application form',
  };
}

/**
 * Handle page based on its classification
 */
async function handlePageType(
  classification: PageClassification
): Promise<NavigationResult | null> {
  switch (classification.type) {
    case 'form':
    case 'form_modal':
      return handleForm(classification);

    case 'modal':
      return await handleModal(classification);

    case 'signup':
      return await handleSignup(classification);

    case 'intermediate':
      return await handleIntermediate(classification);

    case 'captcha':
      return await handleCaptcha(classification);

    case 'unknown':
      return handleUnknown(classification);

    default:
      return null;
  }
}

/**
 * Handle application form (fill and submit!)
 */
async function handleForm(classification: PageClassification): Promise<NavigationResult> {
  logger.log('Navigator', '✓ Application form found!');
  console.log('[Navigator] ✓ Application form found!');

  try {
    // Create form filler from vault data
    const filler = await createFormFillerFromVault();
    if (!filler) {
      console.error('[Navigator] Could not create form filler');
      return {
        success: false,
        finalClassification: classification,
        reason: 'unknown_page',
        message: 'Could not load user data from vault',
      };
    }

    // Fill the form
    await filler.fillForm(classification);
    logger.log('Navigator', '✓ Form filled successfully');
    console.log('[Navigator] ✓ Form filled successfully');

    // Wait a bit for any validation
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Submit the form
    const submitted = await submitForm(classification);

    if (submitted) {
      console.log('[Navigator] ✓ Form submitted successfully');
      return {
        success: true,
        finalClassification: classification,
        reason: 'form_found',
        message: 'Application form filled and submitted',
      };
    } else {
      console.warn('[Navigator] Form filled but not submitted');
      return {
        success: true,
        finalClassification: classification,
        reason: 'form_found',
        message: 'Application form filled (manual submission required)',
      };
    }
  } catch (error) {
    console.error('[Navigator] Error handling form:', error);
    return {
      success: false,
      finalClassification: classification,
      reason: 'unknown_page',
      message: `Error filling form: ${error}`,
    };
  }
}

/**
 * Handle modal (close or select option)
 */
async function handleModal(classification: PageClassification): Promise<NavigationResult | null> {
  console.log('[Navigator] Handling modal...');

  // Check if this is a Workday-style options modal
  const hasApplyOption = classification.actions.some((a) => a.purpose === 'apply');

  if (hasApplyOption) {
    // This is an options modal - select best option
    console.log('[Navigator] Detected options modal');

    // Priority: apply > guest > any action
    const applyAction = findBestAction(classification, 'apply');

    if (applyAction) {
      await clickElement(applyAction, 'apply_option');
      return null; // Continue navigation
    }
  }

  // Regular modal (cookie consent, etc.) - close it
  const closeAction = findBestAction(classification, 'close');

  if (closeAction) {
    console.log('[Navigator] Closing modal');
    await clickElement(closeAction, 'close_modal');
    return null; // Continue navigation
  }

  // No close button - try clicking outside or pressing ESC
  console.log('[Navigator] No close button found, attempting to dismiss modal');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

  return null;
}

/**
 * Handle signup/account page
 */
async function handleSignup(classification: PageClassification): Promise<NavigationResult | null> {
  console.log('[Navigator] Handling signup/account page...');

  // Try to find guest option
  if (hasGuestOption(classification)) {
    const guestAction =
      findBestAction(classification, 'guest') || findBestAction(classification, 'skip');

    if (guestAction) {
      console.log('[Navigator] Found guest/skip option');
      await clickElement(guestAction, 'guest_option');
      return null; // Continue navigation
    }
  }

  // No guest option - account creation required
  console.log('[Navigator] ✗ Account creation required');

  return {
    success: false,
    finalClassification: classification,
    reason: 'account_required',
    message:
      'This application requires account creation. Please create an account manually and try again.',
  };
}

/**
 * Handle intermediate page (has Apply button)
 */
async function handleIntermediate(
  classification: PageClassification
): Promise<NavigationResult | null> {
  console.log('[Navigator] Handling intermediate page...');

  const applyAction = findBestAction(classification, 'apply');

  if (applyAction) {
    console.log('[Navigator] Clicking Apply button');
    await clickElement(applyAction, 'apply_button');
    return null; // Continue navigation
  }

  console.log('[Navigator] No Apply button found on intermediate page');
  return null;
}

/**
 * Handle CAPTCHA page
 */
async function handleCaptcha(classification: PageClassification): Promise<NavigationResult | null> {
  console.log('[Navigator] Handling CAPTCHA...');

  if (isSimpleCaptcha(classification)) {
    console.log('[Navigator] Simple checkbox CAPTCHA detected');

    const captchaField = classification.fields.find((f) => f.purpose === 'captcha');

    if (captchaField && captchaField.type === 'checkbox') {
      const checkbox = captchaField.element as HTMLInputElement;
      if (!checkbox.checked) {
        checkbox.click();
        console.log('[Navigator] Checked CAPTCHA checkbox');
      }
    }

    return null; // Continue navigation
  }

  // Complex CAPTCHA
  console.log('[Navigator] ✗ Complex CAPTCHA detected');

  return {
    success: false,
    finalClassification: classification,
    reason: 'complex_captcha',
    message: 'This application requires solving a complex CAPTCHA. Please solve it manually.',
  };
}

/**
 * Handle unknown page type
 */
function handleUnknown(classification: PageClassification): NavigationResult {
  console.log('[Navigator] ✗ Unknown page type');

  return {
    success: false,
    finalClassification: classification,
    reason: 'unknown_page',
    message: 'Unable to classify this page. It may not be a supported ATS platform.',
  };
}

// ============================================================================
// FORM SUBMISSION
// ============================================================================

/**
 * Submit the form
 */
async function submitForm(classification: PageClassification): Promise<boolean> {
  console.log('[Navigator] Attempting to submit form...');

  // Find submit button
  const submitAction = findBestAction(classification, 'submit');
  if (!submitAction) {
    console.warn('[Navigator] No submit button found');
    return false;
  }

  // Check if form is valid (if it's in a form element)
  const formElement = document.querySelector('form');
  if (formElement && !formElement.checkValidity()) {
    console.warn('[Navigator] Form validation failed');
    formElement.reportValidity();
    return false;
  }

  try {
    // Click submit button
    console.log('[Navigator] Clicking submit button...');
    submitAction.element.click();

    // Wait for submission
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return true;
  } catch (error) {
    console.error('[Navigator] Error submitting form:', error);
    return false;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Click an element and track it
 */
async function clickElement(field: DetectedField, actionType: string): Promise<void> {
  const elementId = getElementId(field.element);

  // Check if already clicked
  if (navState.clickedElements.has(elementId)) {
    console.log(`[Navigator] Already clicked ${actionType}, skipping`);
    return;
  }

  // Mark as clicked
  navState.clickedElements.add(elementId);

  // Update history
  const lastHistoryItem = navState.history[navState.history.length - 1];
  if (lastHistoryItem) {
    lastHistoryItem.action = actionType;
  }

  // Click the element
  field.element.click();

  // Wait for action to complete
  await new Promise((resolve) => setTimeout(resolve, 1500));
}

/**
 * Generate unique ID for an element
 */
function getElementId(element: HTMLElement): string {
  if (element.id) return `id:${element.id} `;
  if (element.className) return `class:${element.className} `;

  const tagName = element.tagName.toLowerCase();
  const text = element.textContent?.slice(0, 20) || '';

  return `${tagName}:${text} `;
}

/**
 * Wait for page change (navigation or DOM update)
 */
async function waitForPageChange(): Promise<void> {
  const currentUrl = window.location.href;
  const startTime = Date.now();
  const timeout = 3000;

  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      const urlChanged = window.location.href !== currentUrl;
      const timedOut = Date.now() - startTime > timeout;

      if (urlChanged || timedOut) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);
  });
}

/**
 * Get navigation history for debugging
 */
export function getNavigationHistory() {
  return navState.history.map((h) => ({
    url: h.url,
    type: h.classification.type,
    confidence: h.classification.confidence,
    action: h.action || 'none',
    timestamp: new Date(h.timestamp).toISOString(),
  }));
}
