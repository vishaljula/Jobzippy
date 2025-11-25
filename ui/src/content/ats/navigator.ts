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
import {
  waitForNavigation,
  waitForDOMStable,
  waitForElement,
} from '../../lib/dom-events';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Extract jobId from URL (e.g., ?job=123457)
 */
function extractJobIdFromUrl(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  const jobId = urlParams.get('job');
  return jobId || null;
}

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
  initialUrl: '',
  history: [],
};

// ============================================================================
// NAVIGATION RESULT
// ============================================================================

export interface NavigationResult {
  success: boolean;
  finalClassification?: PageClassification;
  reason?:
  | 'form_found'
  | 'account_required'
  | 'complex_captcha'
  | 'max_attempts'
  | 'unknown_page'
  | 'external_ats';
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
  console.log('[Navigator] Current URL:', window.location.href);

  navState.initialUrl = window.location.href;
  navState.attempts = 0;
  navState.visitedUrls.clear();
  navState.clickedElements.clear();
  navState.history = [];

  // ========================================================================
  // STEP 1: Classification loop
  // Note: External tab detection is handled by background script via webNavigation.onCreatedNavigationTarget
  // This function is called AFTER the external tab is detected and content script is injected
  // ========================================================================
  while (navState.attempts < navState.maxAttempts) {
    navState.attempts++;
    logger.log('Navigator', `Navigation attempt ${navState.attempts}/${navState.maxAttempts}`);
    console.log(`[Navigator] Navigation attempt ${navState.attempts}/${navState.maxAttempts}`);

    // Check if URL changed - if so, clear clicked elements (new page = new elements)
    const currentUrl = window.location.href;
    if (currentUrl !== navState.initialUrl && navState.attempts > 1) {
      logger.log('Navigator', `URL changed from ${navState.initialUrl} to ${currentUrl}, clearing clicked elements`);
      console.log(`[Navigator] URL changed, clearing clicked elements`);
      navState.clickedElements.clear();
      navState.initialUrl = currentUrl; // Update initial URL for next check
    }

    // Classify current page
    logger.log('Navigator', 'Classifying current page...');
    console.log('[Navigator] Classifying current page...');
    const classification = classifyPage();
    logClassification(classification);
    logger.log('Navigator', `Classification result: ${classification.type} (confidence: ${(classification.confidence * 100).toFixed(1)}%)`);
    console.log(`[Navigator] Classification result: ${classification.type} (confidence: ${(classification.confidence * 100).toFixed(1)}%)`);

    // Record in history
    navState.history.push({
      url: currentUrl,
      classification,
      action: '',
      timestamp: Date.now(),
    });

    // Handle based on page type
    logger.log('Navigator', `Handling page type: ${classification.type}`);
    console.log(`[Navigator] Handling page type: ${classification.type}`);
    
    let result: NavigationResult | null = null;
    try {
      result = await handlePageType(classification);
    } catch (error) {
      logger.error('Navigator', `Error handling page type ${classification.type}:`, error);
      console.error(`[Navigator] Error handling page type ${classification.type}:`, error);
      // Continue loop - might recover on next attempt
      navState.attempts++;
      if (navState.attempts >= navState.maxAttempts) {
        // Max attempts reached, return failure
        return {
          success: false,
          reason: 'error',
          message: `Error handling page type ${classification.type}: ${error instanceof Error ? error.message : String(error)}`,
          finalClassification: classification,
        };
      }
      continue; // Retry
    }

    if (result) {
      logger.log('Navigator', `Navigation complete: ${result.reason}`, result);
      console.log('[Navigator] Navigation complete:', result);
      return result;
    }

    // Wait for page changes (event-driven: popstate, hashchange, or MutationObserver)
    logger.log('Navigator', 'Waiting for page changes (event-driven)...');
    console.log('[Navigator] Waiting for page changes (event-driven)...');
    
    // Use event-driven waitForNavigation (no timeout - waits indefinitely for events)
    const navigated = await waitForNavigation(0);
    
    if (navigated) {
      // After navigation, check if URL changed and continue loop
      const newUrl = window.location.href;
      if (newUrl !== navState.initialUrl) {
        logger.log('Navigator', `URL changed after navigation event: ${navState.initialUrl} -> ${newUrl}, continuing loop...`);
        console.log(`[Navigator] URL changed, continuing loop...`);
        navState.clickedElements.clear();
        navState.initialUrl = newUrl;
      }
    } else {
      // No navigation event fired, but check if URL changed anyway (might have been programmatic)
      const newUrl = window.location.href;
      if (newUrl !== navState.initialUrl) {
        logger.log('Navigator', `URL changed (no event detected): ${navState.initialUrl} -> ${newUrl}, continuing loop...`);
        console.log(`[Navigator] URL changed (no event), continuing loop...`);
        navState.clickedElements.clear();
        navState.initialUrl = newUrl;
      } else {
        logger.log('Navigator', `No navigation detected, continuing loop anyway...`);
        console.log(`[Navigator] No navigation, continuing loop...`);
      }
    }
  }

  logger.error('Navigator', 'Max attempts reached without finding application form');
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
  logger.log('Navigator', 'Form details', {
    type: classification.type,
    confidence: `${(classification.confidence * 100).toFixed(1)}%`,
    fieldCount: classification.fields.length,
    actionCount: classification.actions.length,
  });

  try {
    // Create form filler from vault data
    logger.log('Navigator', 'Creating form filler from vault...');
    console.log('[Navigator] Creating form filler from vault...');
    const filler = await createFormFillerFromVault();
    if (!filler) {
      logger.error('Navigator', 'Could not create form filler');
      console.error('[Navigator] Could not create form filler');
      return {
        success: false,
        finalClassification: classification,
        reason: 'unknown_page',
        message: 'Could not load user data from vault',
      };
    }

    logger.log('Navigator', 'Form filler created, starting form fill...');
    console.log('[Navigator] Form filler created, starting form fill...');

    // Fill the form
    await filler.fillForm(classification);
    logger.log('Navigator', '✓ Form filled successfully');
    console.log('[Navigator] ✓ Form filled successfully');

    // Wait for form validation to complete (event-driven)
    logger.log('Navigator', 'Waiting for form validation...');
    console.log('[Navigator] Waiting for form validation...');
    await waitForDOMStable(500, 2000); // Wait for DOM to stabilize after filling

    // Submit the form
    logger.log('Navigator', 'Attempting to submit form...');
    console.log('[Navigator] Attempting to submit form...');
    const submitted = await submitForm(classification);

    if (submitted) {
      logger.log('Navigator', '✓ Form submitted successfully');
      console.log('[Navigator] ✓ Form submitted successfully');
      return {
        success: true,
        finalClassification: classification,
        reason: 'form_found',
        message: 'Application form filled and submitted',
      };
    } else {
      // Validation failed, but try to submit anyway (some forms have client-side validation that's too strict)
      logger.log('Navigator', 'Form validation failed, but attempting to submit anyway...');
      console.warn('[Navigator] Form validation failed, but attempting to submit anyway...');
      
      // Try clicking submit button anyway - some forms submit despite validation errors
      const submitAction = findBestAction(classification, 'submit');
      if (submitAction) {
        logger.log('Navigator', 'Clicking submit button despite validation failure...');
        console.log('[Navigator] Clicking submit button despite validation failure...');
        await clickElement(submitAction, 'submit_button_force');
        
        // Wait for success indicators to appear (event-driven)
        await waitForDOMStable(500, 3000);
        
        // Check for success indicators
        const successIndicators = [
          document.querySelector('.success-message'),
          document.body.textContent?.toLowerCase().includes('submitted'),
          document.body.textContent?.toLowerCase().includes('success'),
        ];
        
        if (successIndicators.some(ind => ind)) {
          logger.log('Navigator', '✓ Form submitted successfully (despite validation failure)');
          console.log('[Navigator] ✓ Form submitted successfully (despite validation failure)');
      return {
        success: true,
        finalClassification: classification,
        reason: 'form_found',
            message: 'Application form filled and submitted',
          };
        }
      }
      
      logger.log('Navigator', 'Form filled but not submitted (validation failed and submission attempt failed)');
      console.warn('[Navigator] Form filled but not submitted (validation failed)');
      return {
        success: true, // Still return success since we filled the form - user can manually submit
        finalClassification: classification,
        reason: 'form_found',
        message: 'Application form filled (manual submission required - validation failed)',
      };
    }
  } catch (error) {
    logger.error('Navigator', 'Error handling form', error);
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
  logger.log('Navigator', 'Handling modal...');
  console.log('[Navigator] Handling modal...');
  logger.log('Navigator', `Modal has ${classification.actions.length} actions`, classification.actions.map(a => ({ purpose: a.purpose, text: a.element.textContent?.substring(0, 50) })));
  console.log('[Navigator] Modal actions:', classification.actions.map(a => ({ purpose: a.purpose, text: a.element.textContent?.substring(0, 50) })));

  // Check if this is a Workday-style options modal
  const hasApplyOption = classification.actions.some((a) => a.purpose === 'apply');

  if (hasApplyOption) {
    // This is an options modal - select best option
    logger.log('Navigator', 'Detected options modal with apply buttons');
    console.log('[Navigator] Detected options modal');

    // First, check if modal is visible - if not, we need to click a button to show it
    const modalElement = document.querySelector('[role="dialog"], .modal-overlay, [data-automation-id="wd-popup-frame"]') as HTMLElement;
    const isModalVisible = modalElement && (
      window.getComputedStyle(modalElement).display !== 'none' &&
      window.getComputedStyle(modalElement).visibility !== 'hidden' &&
      window.getComputedStyle(modalElement).opacity !== '0'
    );

    logger.log('Navigator', `Modal visibility check:`, {
      found: !!modalElement,
      visible: isModalVisible,
      display: modalElement ? window.getComputedStyle(modalElement).display : 'N/A',
    });
    console.log('[Navigator] Modal visibility:', { found: !!modalElement, visible: isModalVisible });

    // If modal is not visible, find and click the button that shows it
    if (!isModalVisible) {
      logger.log('Navigator', 'Modal is hidden, looking for button to show modal...');
      console.log('[Navigator] Modal is hidden, looking for button to show modal');
      
      // Look for common buttons that show modals: "Apply", "Apply for this Position", etc.
      const allShowModalButtons = Array.from(document.querySelectorAll('button, a')).filter((el) => {
        const text = el.textContent?.toLowerCase() || '';
        return (
          text.includes('apply') &&
          !text.includes('autofill') &&
          !text.includes('manual') &&
          !text.includes('last application')
        );
      }) as HTMLElement[];

      logger.log('Navigator', `Found ${allShowModalButtons.length} potential buttons to show modal`);
      console.log('[Navigator] Found buttons:', allShowModalButtons.map(b => b.textContent?.substring(0, 50)));

      // Filter to only visible buttons (check parent chain)
      const visibleShowModalButtons = allShowModalButtons.filter((btn) => {
        const isVisible = isElementActuallyVisible(btn);
        logger.log('Navigator', `[MODAL] Show button visibility check:`, {
          text: btn.textContent?.substring(0, 50),
          visible: isVisible,
        });
        return isVisible;
      });

      logger.log('Navigator', `[MODAL] Filtered to ${visibleShowModalButtons.length} visible show buttons`);
      console.log(`[Navigator] [MODAL] ${visibleShowModalButtons.length} visible show buttons`);

      if (visibleShowModalButtons.length > 0) {
        // Click the first visible button that shows the modal
        const showButton = visibleShowModalButtons[0];
        logger.log('Navigator', `Clicking button to show modal: ${showButton.textContent?.substring(0, 50)}`);
        console.log('[Navigator] Clicking button to show modal:', showButton.textContent);
        
        await clickElement(
          {
            element: showButton,
            purpose: 'apply',
            type: showButton.tagName.toLowerCase() as 'button' | 'a',
            confidence: 0.8,
            selectors: [],
          },
          'show_modal_button'
        );

        // Wait for modal to become visible
        logger.log('Navigator', 'Waiting for modal to become visible...');
        console.log('[Navigator] Waiting for modal to become visible');
        
        // Wait up to 3 seconds for modal to appear
        const modalAppeared = await new Promise<boolean>((resolve) => {
          const checkInterval = setInterval(() => {
            const modal = document.querySelector('[role="dialog"], .modal-overlay.active, [data-automation-id="wd-popup-frame"]') as HTMLElement;
            if (modal && (
              window.getComputedStyle(modal).display !== 'none' &&
              window.getComputedStyle(modal).visibility !== 'hidden' &&
              window.getComputedStyle(modal).opacity !== '0'
            )) {
              clearInterval(checkInterval);
              resolve(true);
            }
          }, 100);

          setTimeout(() => {
            clearInterval(checkInterval);
            resolve(false);
          }, 3000);
        });

        if (!modalAppeared) {
          logger.error('Navigator', 'Modal did not appear after clicking show button');
          console.error('[Navigator] Modal did not appear');
          return null; // Continue navigation loop
        }

        logger.log('Navigator', '✓ Modal is now visible');
        console.log('[Navigator] ✓ Modal is now visible');

        // Re-classify the page now that modal is visible
        logger.log('Navigator', 'Re-classifying page with visible modal...');
        console.log('[Navigator] Re-classifying page');
        const newClassification = await classifyPage();
        classification = newClassification;
      } else {
        logger.warn('Navigator', 'No button found to show modal');
        console.warn('[Navigator] No button found to show modal');
        return null; // Continue navigation loop
      }
    }

    // Find all apply actions and filter to only visible ones
    const allApplyActions = classification.actions.filter((a) => a.purpose === 'apply');
    
    logger.log('Navigator', `[MODAL] Found ${allApplyActions.length} apply actions, checking visibility...`);
    console.log(`[Navigator] [MODAL] Found ${allApplyActions.length} apply actions`);
    
    // Filter to only visible actions (avoids hidden modals - getComputedStyle already accounts for parent styles)
    const visibleApplyActions = allApplyActions.filter((action) => {
      const isVisible = isElementActuallyVisible(action.element);
      logger.log('Navigator', `[MODAL] Apply action visibility check:`, {
        text: action.element.textContent?.substring(0, 50),
        visible: isVisible,
        tagName: action.element.tagName,
      });
      return isVisible;
    });
    
    logger.log('Navigator', `[MODAL] Filtered to ${visibleApplyActions.length} visible apply actions`);
    console.log(`[Navigator] [MODAL] ${visibleApplyActions.length} visible apply actions`);
    
    if (visibleApplyActions.length === 0) {
      logger.warn('Navigator', '[MODAL] No visible apply actions found - all are hidden');
      console.warn('[Navigator] [MODAL] No visible apply actions found');
      return null; // Continue navigation loop
    }
    
    // Priority: Autofill > Manual > Last Application > Generic Apply
    // Now only selecting from visible actions
    let bestAction: DetectedField | undefined;
    for (const action of visibleApplyActions) {
      const text = action.element.textContent?.toLowerCase() || '';
      if (text.includes('autofill') || text.includes('auto-fill') || text.includes('auto fill')) {
        bestAction = action;
        logger.log('Navigator', '[MODAL] Found visible Autofill button, selecting it');
        console.log('[Navigator] [MODAL] Found visible Autofill button');
        break;
      }
    }
    
    if (!bestAction) {
      for (const action of visibleApplyActions) {
        const text = action.element.textContent?.toLowerCase() || '';
        if (text.includes('manual')) {
          bestAction = action;
          logger.log('Navigator', '[MODAL] Found visible Manual button, selecting it');
          console.log('[Navigator] [MODAL] Found visible Manual button');
          break;
        }
      }
    }
    
    if (!bestAction) {
      for (const action of visibleApplyActions) {
        const text = action.element.textContent?.toLowerCase() || '';
        if (text.includes('last')) {
          bestAction = action;
          logger.log('Navigator', '[MODAL] Found visible Last Application button, selecting it');
          console.log('[Navigator] [MODAL] Found visible Last Application button');
          break;
        }
      }
    }
    
    // Fallback to first visible apply action
    if (!bestAction && visibleApplyActions.length > 0) {
      bestAction = visibleApplyActions[0];
      logger.log('Navigator', '[MODAL] Using first visible apply action as fallback');
      console.log('[Navigator] [MODAL] Using first visible apply action');
    }

    if (bestAction) {
      logger.log('Navigator', `[MODAL] Clicking apply option: ${bestAction.element.textContent?.substring(0, 50)}`);
      console.log('[Navigator] [MODAL] Clicking apply option:', bestAction.element.textContent);
      
      try {
        await clickElement(bestAction, 'apply_option');
        logger.log('Navigator', '[MODAL] ✓ Apply option clicked successfully');
        console.log('[Navigator] [MODAL] ✓ Apply option clicked');
      } catch (error) {
        logger.error('Navigator', '[MODAL] Error clicking apply option:', error);
        console.error('[Navigator] [MODAL] Error clicking apply option:', error);
        // Re-throw to be caught by handlePageType's try-catch
        throw error;
      }
      
      // If the click triggers full-page navigation (e.g., link with href), the page will reload
      // and content script will restart, so intelligentNavigate() will continue on the new page
      // No need to wait for navigation events here - just return and let the page reload if needed
      logger.log('Navigator', '[MODAL] Modal action clicked, returning...');
      console.log('[Navigator] [MODAL] Modal action clicked, returning...');
      return null; // Continue navigation - page may reload and intelligentNavigate() will restart on new page
    } else {
      logger.warn('Navigator', '[MODAL] No apply action found in modal');
      console.warn('[Navigator] [MODAL] No apply action found in modal');
    }
  }

  // Regular modal (cookie consent, etc.) - close it
  const closeAction = findBestAction(classification, 'close');

  if (closeAction) {
    logger.log('Navigator', 'Closing modal');
    console.log('[Navigator] Closing modal');
    await clickElement(closeAction, 'close_modal');
    return null; // Continue navigation
  }

  // No close button - try clicking outside or pressing ESC
  logger.log('Navigator', 'No close button found, attempting to dismiss modal');
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
  logger.log('Navigator', 'Attempting to submit form...');
  console.log('[Navigator] Attempting to submit form...');

  // Find submit button
  const submitAction = findBestAction(classification, 'submit');
  if (!submitAction) {
    logger.log('Navigator', 'No submit button found in classification');
    console.warn('[Navigator] No submit button found');
    return false;
  }

  logger.log('Navigator', 'Submit button found', { 
    purpose: submitAction.purpose, 
    confidence: submitAction.confidence,
    selector: submitAction.selectors[0] 
  });
  console.log('[Navigator] Submit button found:', submitAction.selectors[0]);

  // Check if form is valid (if it's in a form element)
  const formElement = document.querySelector('form');
  if (formElement) {
    logger.log('Navigator', 'Checking form validity...');
    console.log('[Navigator] Checking form validity...');
    
    // Check for invalid fields before calling checkValidity
    const invalidFields: Array<{ name: string; element: HTMLElement; message: string }> = [];
    const allInputs = formElement.querySelectorAll('input, select, textarea');
    allInputs.forEach((input) => {
      const htmlInput = input as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      if (htmlInput.required && !htmlInput.validity.valid) {
        invalidFields.push({
          name: htmlInput.name || htmlInput.id || 'unknown',
          element: htmlInput,
          message: htmlInput.validationMessage || 'Invalid',
        });
      }
    });
    
    if (invalidFields.length > 0) {
      logger.log('Navigator', `Form validation failed: ${invalidFields.length} invalid fields`, invalidFields.map(f => ({ name: f.name, message: f.message })));
      console.warn('[Navigator] Form validation failed. Invalid fields:', invalidFields.map(f => ({ name: f.name, message: f.message, value: (f.element as HTMLInputElement | HTMLSelectElement).value })));
    formElement.reportValidity();
    return false;
    }
    
    if (!formElement.checkValidity()) {
      logger.log('Navigator', 'Form validation failed (checkValidity returned false)');
      console.warn('[Navigator] Form validation failed (checkValidity returned false)');
      
      // Log which fields are invalid for debugging
      const allInputs = formElement.querySelectorAll('input, select, textarea');
      const invalidFields: Array<{ name: string; type: string; required: boolean; value: string; message: string }> = [];
      allInputs.forEach((input) => {
        const htmlInput = input as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        if (htmlInput.required && !htmlInput.validity.valid) {
          invalidFields.push({
            name: htmlInput.name || htmlInput.id || 'unknown',
            type: htmlInput.type || htmlInput.tagName.toLowerCase(),
            required: htmlInput.required,
            value: (htmlInput as HTMLInputElement).value || '',
            message: htmlInput.validationMessage || 'Invalid',
          });
        }
      });
      
      if (invalidFields.length > 0) {
        logger.log('Navigator', `Invalid required fields: ${invalidFields.length}`, invalidFields);
        console.warn('[Navigator] Invalid required fields:', invalidFields);
        logger.error('Navigator', 'Cannot submit form - required fields are missing or invalid. Fields needed:', invalidFields.map(f => ({ name: f.name, type: f.type, message: f.message })));
        console.error('[Navigator] Cannot submit form - required fields are missing or invalid:', invalidFields);
      }
      
      formElement.reportValidity();
      return false;
    }
    logger.log('Navigator', 'Form validation passed');
    console.log('[Navigator] Form validation passed');
  }

  try {
    // Click submit button
    logger.log('Navigator', 'Clicking submit button...');
    console.log('[Navigator] Clicking submit button...');

    // Setup a one-time alert handler for this submission
    const alertPromise = new Promise<boolean>((resolve) => {
      const handleAlert = (event: Event) => {
        const msg = (event as CustomEvent).detail;
        logger.log('Navigator', 'Alert intercepted during submission', { message: msg });
        console.log('[Navigator] Alert intercepted during submission:', msg);
        if (
          msg &&
          (msg.toLowerCase().includes('success') || msg.toLowerCase().includes('submitted'))
        ) {
          resolve(true);
        } else {
          resolve(false);
        }
        window.removeEventListener('jobzippy-alert', handleAlert);
      };
      window.addEventListener('jobzippy-alert', handleAlert);

      // Timeout after 5 seconds
      setTimeout(() => {
        window.removeEventListener('jobzippy-alert', handleAlert);
        
        // Check if we missed an alert stored in DOM
        const alertDiv = document.getElementById('jobzippy-last-alert');
        if (alertDiv) {
           const msg = alertDiv.textContent;
           const timestamp = parseInt(alertDiv.getAttribute('data-timestamp') || '0');
           // Only consider recent alerts (last 5 seconds)
           if (msg && (Date.now() - timestamp < 5000)) {
             console.log('[Navigator] Found missed alert in DOM:', msg);
             if (msg.toLowerCase().includes('success') || msg.toLowerCase().includes('submitted')) {
               resolve(true);
               return;
             }
           }
        }
        
        resolve(false);
      }, 5000);
    });

    submitAction.element.click();
    logger.log('Navigator', 'Submit button clicked, waiting for response...');
    console.log('[Navigator] Submit button clicked, waiting for response...');

    // Wait for submission or alert
    const alertSuccess = await alertPromise;

    if (alertSuccess) {
      logger.log('Navigator', 'Success alert detected!');
      console.log('[Navigator] Success alert detected!');
      return true;
    }

    // No alert detected - check for success indicators in DOM
    logger.log('Navigator', 'No alert detected, checking DOM for success indicators...');
    console.log('[Navigator] No alert detected, checking DOM for success indicators...');
    // Wait for DOM to update (event-driven)
    await waitForDOMStable(500, 3000);

    // Check for success indicators in the DOM
    const successIndicators = [
      // Success message elements
      document.querySelector('.success-message'),
      document.querySelector('[class*="success"]'),
      document.querySelector('[id*="success"]'),
      // Text content checks
      document.body.textContent?.toLowerCase().includes('application submitted'),
      document.body.textContent?.toLowerCase().includes('submitted successfully'),
      document.body.textContent?.toLowerCase().includes('thank you for applying'),
      // Form state - if form is gone or disabled, might indicate success
      formElement && formElement.style.display === 'none',
      submitAction.element.disabled && submitAction.element.textContent?.toLowerCase().includes('submitted'),
    ];

    const hasSuccessIndicator = successIndicators.some(ind => {
      if (typeof ind === 'boolean') return ind;
      if (ind instanceof Element) {
        const isVisible = window.getComputedStyle(ind).display !== 'none';
        return isVisible;
      }
      return false;
    });

    if (hasSuccessIndicator) {
      logger.log('Navigator', 'Success indicator found in DOM');
      console.log('[Navigator] Success indicator found in DOM');
    return true;
    }

    // No success detected - return false to indicate failure
    logger.log('Navigator', 'WARNING: No success alert or DOM indicator detected - form submission may have failed');
    console.warn('[Navigator] No success alert or DOM indicator detected - form submission may have failed');
    return false;
  } catch (error) {
    logger.error('Navigator', 'Error submitting form', error);
    console.error('[Navigator] Error submitting form:', error);
    return false;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if an element is actually visible
 * Note: getComputedStyle() already accounts for parent styles (display:none, visibility:hidden, opacity:0)
 * So we only need to check the element itself, plus some edge cases
 */
function isElementActuallyVisible(element: HTMLElement): boolean {
  const elementRect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  
  // Check 1: Element must have dimensions
  if (elementRect.width === 0 || elementRect.height === 0) {
    logger.log('Navigator', `[VISIBILITY] Element has no dimensions: ${element.textContent?.substring(0, 30)}`);
    return false;
  }
  
  // Check 2: Computed style (already accounts for parent styles)
  // If parent has display:none, this will already be 'none'
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.opacity === '0'
  ) {
    logger.log('Navigator', `[VISIBILITY] Element hidden by computed style:`, {
      element: element.textContent?.substring(0, 30),
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
    });
    return false;
  }
  
  // Check 3: aria-hidden attribute (not reflected in computed styles, need to check parent chain)
  let current: HTMLElement | null = element;
  while (current) {
    if (current.getAttribute('aria-hidden') === 'true') {
      logger.log('Navigator', `[VISIBILITY] Element has aria-hidden=true in parent chain: ${current.tagName}`);
      return false;
    }
    current = current.parentElement;
    if (current === document.body || current === document.documentElement) {
      break;
    }
  }
  
  // Check 4: Element must be in viewport (or at least partially visible)
  const isInViewport = (
    elementRect.top < window.innerHeight &&
    elementRect.bottom > 0 &&
    elementRect.left < window.innerWidth &&
    elementRect.right > 0
  );
  
  if (!isInViewport) {
    logger.log('Navigator', `[VISIBILITY] Element not in viewport: ${element.textContent?.substring(0, 30)}`);
    return false;
  }
  
  return true;
}

/**
 * Click an element and track it
 */
async function clickElement(field: DetectedField, actionType: string): Promise<void> {
  const elementId = getElementId(field.element);
  const element = field.element;

  // Check if already clicked
  if (navState.clickedElements.has(elementId)) {
    logger.log('Navigator', `Already clicked ${actionType}, skipping`);
    console.log(`[Navigator] Already clicked ${actionType}, skipping`);
    return;
  }

  // Verify element is visible and clickable before attempting click
  // Use the same visibility check we use for filtering buttons
  const isVisible = isElementActuallyVisible(element);
  const rect = element.getBoundingClientRect();
  const isInViewport = (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= window.innerHeight &&
    rect.right <= window.innerWidth
  );

  logger.log('Navigator', `Pre-click check for ${actionType}:`, {
    tagName: element.tagName,
    href: (element as HTMLAnchorElement).href || 'N/A',
    visible: isVisible,
    inViewport: isInViewport,
    disabled: (element as HTMLButtonElement).disabled || false,
    textContent: element.textContent?.substring(0, 50),
  });
  console.log(`[Navigator] Pre-click check:`, {
    tagName: element.tagName,
    href: (element as HTMLAnchorElement).href || 'N/A',
    visible: isVisible,
    inViewport: isInViewport,
    disabled: (element as HTMLButtonElement).disabled || false,
  });

  if (!isVisible) {
    logger.error('Navigator', `Element ${actionType} is not visible, cannot click`);
    console.error(`[Navigator] Element is not visible, cannot click`);
    throw new Error(`Element ${actionType} is not visible`);
  }

  // Scroll element into view if needed
  if (!isInViewport) {
    logger.log('Navigator', `Scrolling element into view for ${actionType}`);
    console.log(`[Navigator] Scrolling element into view`);
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Wait a bit for scroll to complete
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // Mark as clicked BEFORE clicking (to prevent double-clicks)
  navState.clickedElements.add(elementId);

  // Update history
  const lastHistoryItem = navState.history[navState.history.length - 1];
  if (lastHistoryItem) {
    lastHistoryItem.action = actionType;
  }

  // Store current URL before click (for navigation detection)
  const currentUrl = window.location.href;
  const isLink = element.tagName.toLowerCase() === 'a';
  const linkHref = isLink ? (element as HTMLAnchorElement).href : null;

  // Click the element (works for buttons, links, and all clickable elements)
  logger.log('Navigator', `Attempting to click ${actionType}:`, {
    tagName: element.tagName,
    href: linkHref || 'N/A',
    textContent: element.textContent?.substring(0, 50),
  });
  console.log(`[Navigator] Attempting to click ${actionType}:`, element.textContent?.substring(0, 50));

  // Retry logic: try clicking up to 3 times
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.log('Navigator', `Click attempt ${attempt}/${maxRetries} for ${actionType}`);
      console.log(`[Navigator] Click attempt ${attempt}/${maxRetries}`);

      if (isLink && linkHref) {
        // For links, try .click() first (normal user behavior)
        // Retry up to 3 times with delays - if .click() doesn't work, something is wrong
        logger.log('Navigator', `[LINK CLICK] Starting link click (attempt ${attempt}/${maxRetries})`, {
          href: linkHref,
          currentUrl,
          elementTag: element.tagName,
          elementText: element.textContent?.substring(0, 50),
        });
        console.log(`[Navigator] [LINK CLICK] Attempt ${attempt}/${maxRetries}: ${linkHref}`);
        console.log(`[Navigator] [LINK CLICK] Current URL: ${currentUrl}`);
        
        // CRITICAL: Notify background IMMEDIATELY that navigation is starting
        // This must happen BEFORE clicking to reset the timeout
        // Even if navigation doesn't happen, we'll clear it later if needed
        try {
          const jobId = extractJobIdFromUrl() || 'unknown';
          logger.log('Navigator', `[LINK CLICK] Notifying background BEFORE click that navigation is starting: jobId=${jobId}, targetUrl=${linkHref}`);
          console.log(`[Navigator] [LINK CLICK] Notifying background BEFORE click: jobId=${jobId}`);
          
          chrome.runtime.sendMessage({
            type: 'ATS_NAVIGATION_STARTING',
            data: { jobId, newUrl: linkHref },
          }).catch((err) => {
            logger.error('Navigator', `[LINK CLICK] Failed to notify background BEFORE click:`, err);
            console.error(`[Navigator] [LINK CLICK] Failed to notify background BEFORE click:`, err);
          });
        } catch (notifyError) {
          logger.error('Navigator', `[LINK CLICK] Error notifying background BEFORE click:`, notifyError);
          console.error(`[Navigator] [LINK CLICK] Error notifying background BEFORE click:`, notifyError);
        }
        
        try {
          // Try .click()
          logger.log('Navigator', `[LINK CLICK] Calling element.click()...`);
          console.log(`[Navigator] [LINK CLICK] Calling element.click()...`);
          element.click();
          logger.log('Navigator', `[LINK CLICK] ✓ element.click() completed without error (attempt ${attempt})`);
          console.log(`[Navigator] [LINK CLICK] ✓ element.click() completed (attempt ${attempt})`);
        } catch (clickError) {
          logger.error('Navigator', `[LINK CLICK] Error calling element.click():`, clickError);
          console.error(`[Navigator] [LINK CLICK] Error calling element.click():`, clickError);
          throw clickError; // Re-throw to be caught by outer catch
        }
        
        // Check immediately if URL changed (for same-origin navigation, this happens synchronously)
        const urlAfterClick = window.location.href;
        logger.log('Navigator', `[LINK CLICK] URL check after click:`, {
          before: currentUrl,
          after: urlAfterClick,
          changed: urlAfterClick !== currentUrl,
        });
        console.log(`[Navigator] [LINK CLICK] URL after click: ${urlAfterClick} (changed: ${urlAfterClick !== currentUrl})`);
        
        if (urlAfterClick !== currentUrl) {
          // Navigation happened!
          logger.log('Navigator', `[LINK CLICK] ✓ Navigation detected immediately: ${currentUrl} -> ${urlAfterClick}`);
          console.log(`[Navigator] [LINK CLICK] ✓ Navigation detected: ${currentUrl} -> ${urlAfterClick}`);
          
          // Notify background script that navigation is happening
          try {
            const jobId = extractJobIdFromUrl() || 'unknown';
            logger.log('Navigator', `[LINK CLICK] Notifying background of navigation: jobId=${jobId}, newUrl=${urlAfterClick}`);
            console.log(`[Navigator] [LINK CLICK] Notifying background: jobId=${jobId}`);
            
            await chrome.runtime.sendMessage({
              type: 'ATS_NAVIGATION_STARTING',
              data: { jobId, newUrl: urlAfterClick },
            });
            logger.log('Navigator', `[LINK CLICK] ✓ Background notified successfully`);
            console.log(`[Navigator] [LINK CLICK] ✓ Background notified`);
          } catch (msgError) {
            logger.error('Navigator', `[LINK CLICK] Failed to notify background of navigation:`, msgError);
            console.error(`[Navigator] [LINK CLICK] Failed to notify background:`, msgError);
            // Don't throw - navigation happened, that's what matters
          }
          
          return; // Navigation happened, success! Page may reload and content script will restart
        }
        
        // If URL didn't change immediately, wait a SHORT time to see if async navigation starts
        // (Some sites use preventDefault + manual navigation, or navigation is delayed)
        logger.log('Navigator', `[LINK CLICK] URL unchanged immediately, waiting 200ms for async navigation...`);
        console.log(`[Navigator] [LINK CLICK] Waiting 200ms for async navigation...`);
        await new Promise(resolve => setTimeout(resolve, 200)); // Reduced from 500ms to 200ms
        const urlAfterWait = window.location.href;
        
        logger.log('Navigator', `[LINK CLICK] URL check after wait:`, {
          before: currentUrl,
          after: urlAfterWait,
          changed: urlAfterWait !== currentUrl,
        });
        console.log(`[Navigator] [LINK CLICK] URL after wait: ${urlAfterWait} (changed: ${urlAfterWait !== currentUrl})`);
        
        if (urlAfterWait !== currentUrl) {
          // Navigation happened asynchronously
          logger.log('Navigator', `[LINK CLICK] ✓ Async navigation detected: ${currentUrl} -> ${urlAfterWait}`);
          console.log(`[Navigator] [LINK CLICK] ✓ Async navigation detected: ${currentUrl} -> ${urlAfterWait}`);
          
          try {
            const jobId = extractJobIdFromUrl() || 'unknown';
            logger.log('Navigator', `[LINK CLICK] Notifying background of async navigation: jobId=${jobId}, newUrl=${urlAfterWait}`);
            console.log(`[Navigator] [LINK CLICK] Notifying background: jobId=${jobId}`);
            
            await chrome.runtime.sendMessage({
              type: 'ATS_NAVIGATION_STARTING',
              data: { jobId, newUrl: urlAfterWait },
            });
            logger.log('Navigator', `[LINK CLICK] ✓ Background notified successfully`);
            console.log(`[Navigator] [LINK CLICK] ✓ Background notified`);
          } catch (msgError) {
            logger.error('Navigator', `[LINK CLICK] Failed to notify background of async navigation:`, msgError);
            console.error(`[Navigator] [LINK CLICK] Failed to notify background:`, msgError);
            // Don't throw - navigation happened, that's what matters
          }
          
          return; // Navigation happened, success!
        }
        
        // .click() didn't trigger navigation - immediately fall back to window.location.href
        // Don't retry - if .click() doesn't work, it likely won't work on retry either
        logger.warn('Navigator', `[LINK CLICK] No navigation detected after click, immediately falling back to window.location.href`, {
          attempt,
          currentUrl,
          targetUrl: linkHref,
          urlAfterClick,
          urlAfterWait,
        });
        console.warn(`[Navigator] [LINK CLICK] No navigation detected, using window.location.href immediately`);
        
        // Notify background script BEFORE navigation so it can reset the timeout
        try {
          const jobId = extractJobIdFromUrl() || 'unknown';
          logger.log('Navigator', `[LINK CLICK] Notifying background before fallback navigation: jobId=${jobId}, newUrl=${linkHref}`);
          console.log(`[Navigator] [LINK CLICK] Notifying background before fallback: jobId=${jobId}`);
          
          await chrome.runtime.sendMessage({
            type: 'ATS_NAVIGATION_STARTING',
            data: { jobId, newUrl: linkHref },
          });
          logger.log('Navigator', `[LINK CLICK] ✓ Background notified before fallback`);
          console.log(`[Navigator] [LINK CLICK] ✓ Background notified`);
        } catch (msgError) {
          logger.error('Navigator', `[LINK CLICK] Failed to notify background before fallback:`, msgError);
          console.error(`[Navigator] [LINK CLICK] Failed to notify background:`, msgError);
          // Continue anyway - we'll navigate regardless
        }
        
        // Fallback: use programmatic navigation immediately
        logger.log('Navigator', `[LINK CLICK] Setting window.location.href = ${linkHref}`);
        console.log(`[Navigator] [LINK CLICK] Setting window.location.href = ${linkHref}`);
        window.location.href = linkHref;
        return; // Page will reload, content script will restart
      } else {
        // For buttons and other elements, use click()
        element.click();
        logger.log('Navigator', `✓ Element clicked via .click() method (attempt ${attempt})`);
        console.log(`[Navigator] ✓ Element clicked (attempt ${attempt})`);
        
        // Wait for action to complete (event-driven)
        logger.log('Navigator', `Waiting for action to complete after clicking ${actionType}`);
        console.log(`[Navigator] Waiting for action to complete`);
        
        // Use a short timeout to detect if click had any effect
        const clickWorked = await Promise.race([
          Promise.race([
            waitForNavigation(0),
            waitForDOMStable(500, 0),
          ]).then(() => true),
          new Promise<boolean>(resolve => setTimeout(() => resolve(false), 1000)), // 1s timeout
        ]);

        if (clickWorked || attempt === maxRetries) {
          logger.log('Navigator', `✓ Action completed after clicking ${actionType}`);
          console.log(`[Navigator] ✓ Action completed`);
          return; // Success or max retries reached
        }
        
        // Retry if click didn't have effect
        logger.warn('Navigator', `Click attempt ${attempt} did not have visible effect, retrying...`);
        console.warn(`[Navigator] Click did not have effect, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorDetails = {
        message: lastError.message,
        stack: lastError.stack,
        actionType,
        attempt,
        maxRetries,
        elementTag: element.tagName,
        elementHref: isLink ? linkHref : 'N/A',
        currentUrl,
      };
      
      logger.error('Navigator', `[ERROR] Error clicking element ${actionType} (attempt ${attempt}/${maxRetries}):`, errorDetails);
      console.error(`[Navigator] [ERROR] Error clicking element (attempt ${attempt}/${maxRetries}):`, error);
      console.error(`[Navigator] [ERROR] Error details:`, errorDetails);
      
      if (attempt === maxRetries) {
        logger.error('Navigator', `[ERROR] All ${maxRetries} attempts failed, throwing error`, errorDetails);
        console.error(`[Navigator] [ERROR] All attempts failed, throwing:`, lastError);
        throw lastError; // Throw on final attempt
      }
      
      logger.warn('Navigator', `[ERROR] Retrying after error (attempt ${attempt}/${maxRetries})...`);
      console.warn(`[Navigator] [ERROR] Retrying after error...`);
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait before retry
    }
  }

  // If we get here, all retries failed
  throw lastError || new Error(`Failed to click ${actionType} after ${maxRetries} attempts`);
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

// DEPRECATED: waitForPageChange() removed - use waitForNavigation(0) instead (event-driven)

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
