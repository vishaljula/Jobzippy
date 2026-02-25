/**
 * Intelligent Navigation System
 * Uses page classification to navigate through multi-step ATS flows
 */

import { PageClassification, DetectedField } from './classifier';

import { classifyPage, findBestAction, logClassification } from './page-classifier';
import { fillAllFields } from './field-filler';
import { logger } from '../../lib/logger';
import { waitForNavigation, waitForDOMStable } from '../../lib/dom-events';
import { humanClick, jitter, humanizeConfig, scrollIntoViewIfNeeded } from '../../lib/humanize';

// ============================================================================
// MODULE STATE
// ============================================================================

// Store validation errors from last submit attempt for retry
let lastValidationErrors: Map<HTMLElement, string> = new Map();

/**
 * Get validation errors from last submit attempt
 */
export function getLastValidationErrors(): Map<HTMLElement, string> {
  return lastValidationErrors;
}

/**
 * Clear validation errors
 */
export function clearValidationErrors(): void {
  lastValidationErrors.clear();
}

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

/**
 * Check if an element is actually hidden via CSS properties.
 *
 * NOTE: We intentionally do NOT check offsetWidth/offsetHeight because:
 * 1. In background tabs, Chrome doesn't compute layout dimensions (returns 0)
 * 2. This causes false positives (visible buttons marked as hidden)
 *
 * CSS property checks are sufficient to detect truly hidden elements.
 */
function isActuallyHiddenNav(element: HTMLElement): boolean {
  const style = getComputedStyle(element);

  // Check inline style first (faster, catches mock button visibility toggling)
  const inlineDisplay = element.style.display;
  if (inlineDisplay === 'none') {
    return true;
  }

  // Check computed styles
  return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
}

/**
 * Check if an element is truly visible (top-most layer) using elementsFromPoint.
 * This prevents clicking buttons hidden behind modals.
 */
function isTrulyVisible(el: HTMLElement): boolean {
  if (!el) return false;

  // First check basic visibility
  if (isActuallyHiddenNav(el)) return false;

  const rect = el.getBoundingClientRect();

  // Check if element has size
  if (rect.width === 0 || rect.height === 0) return false;

  // Calculate center point
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  // elementsFromPoint returns an array from TOP (z-index) to BOTTOM
  const elementsAtPoint = document.elementsFromPoint(centerX, centerY);

  if (elementsAtPoint.length === 0) return false;

  // The first element in the array is the one the user actually sees.
  // If it's not our element or a descendant/ancestor of it, it's obscured.
  const topElement = elementsAtPoint[0];

  return el.contains(topElement!) || topElement!.contains(el);
}

// ============================================================================
// NAVIGATION STATE
// ============================================================================

// ============================================================================
// STATELESS PAGE ACTION EXECUTOR
// ============================================================================

export interface PageActionResult {
  status: 'progressed' | 'completed' | 'blocked' | 'skipped' | 'account_required' | 'unknown_state';
  reason?: string;
  action?: string;
  finalClassification?: PageClassification;
}

/**
 * Single Atomic Execution Step
 * Classifies the current page and takes exactly ONE action (Fill -> Click Next).
 */
export async function executePageAction(
  providedResume?: { data: string; fileName?: string; mimeType?: string },
  providedProfile?: any,
  mode?: 'autonomous' | 'autofill'
): Promise<PageActionResult> {
  logger.log('Navigator', 'Executing atomic page action...');
  console.log('[Navigator] Validating context and executing page action...');

  // 1. Context Scoping: Check for modal first
  let container: HTMLElement | undefined;
  const potentialModal = document.querySelector(
    '.jobs-easy-apply-modal, [role="dialog"], .modal-overlay.active, [data-automation-id="wd-popup-frame"]'
  ) as HTMLElement;

  logger.log(
    'Navigator',
    `Modal detection: found=${!!potentialModal}, visible=${potentialModal ? isTrulyVisible(potentialModal) : false}, mode=${mode}`
  );
  console.log('[Navigator] Modal detection:', {
    found: !!potentialModal,
    visible: potentialModal ? isTrulyVisible(potentialModal) : false,
    mode,
  });

  if (potentialModal && isTrulyVisible(potentialModal)) {
    container = potentialModal;
    logger.log('Navigator', 'Scoped execution to visible modal container');
  }

  // 2. Classification
  const classification = classifyPage(container);
  logClassification(classification);

  logger.log(
    'Navigator',
    `Before reclassification: type=${classification.type}, fields=${classification.fields.length}, container=${!!container}, mode=${mode}`
  );
  console.log('[Navigator] Before reclassification:', {
    type: classification.type,
    fields: classification.fields.length,
    container: !!container,
    mode,
  });

  // Reclassify modal/form/unknown pages with fields as form_modal
  // In autofill mode, also reclassify even without container (user opened modal manually)
  if (
    (container || mode === 'autofill') &&
    (classification.type === 'form' ||
      classification.type === 'unknown' ||
      classification.type === 'modal')
  ) {
    if (classification.fields.length > 0) {
      classification.type = 'form_modal';
      logger.log(
        'Navigator',
        `Reclassified as form_modal (${classification.fields.length} fields)`
      );
      console.log(
        '[Navigator] ✅ Reclassified as form_modal:',
        classification.fields.length,
        'fields'
      );
    } else {
      classification.type = 'modal';
    }
  }

  // 3. Handle Classification
  try {
    const result = await handlePageActionType(
      classification,
      providedResume,
      providedProfile,
      container,
      mode
    );
    if (!result) {
      return {
        status: 'unknown_state',
        reason: 'No action taken',
        finalClassification: classification,
      };
    }
    return result;
  } catch (error) {
    logger.error('Navigator', 'Error executing page action', error);
    return { status: 'blocked', reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Handle page based on its classification
 */
/**
 * Handle page based on its classification (Stateless Dispatcher)
 */
async function handlePageActionType(
  classification: PageClassification,
  providedResume?: { data: string; fileName?: string; mimeType?: string },
  providedProfile?: any,
  container?: HTMLElement,
  mode?: 'autonomous' | 'autofill'
): Promise<PageActionResult> {
  switch (classification.type) {
    case 'form':
    case 'form_modal':
      return handleFormAction(classification, providedResume, providedProfile, container, mode);

    case 'modal':
      return await handleModalAction(classification, container, mode);

    case 'signup':
      return { status: 'account_required', reason: 'signup_detected' };

    case 'intermediate':
      return await handleIntermediateAction(classification);

    case 'captcha':
      return { status: 'blocked', reason: 'captcha_detected' };

    case 'unknown':
      // If we have fields detected, treat it as a form and try to fill
      // Page type classification can fail but fields can still be detected
      if (classification.fields && classification.fields.length > 0) {
        console.log('[Navigator] Unknown page type but has fields, treating as form');
        return handleFormAction(classification, providedResume, providedProfile, container, mode);
      }
      return {
        status: 'unknown_state',
        reason: 'page_type_unknown',
        finalClassification: classification,
      };

    default:
      return { status: 'blocked', reason: 'unhandled_type' };
  }
}

/**
 * Handle application form (fill and click next/submit)
 * Single pass - no looping.
 */
async function handleFormAction(
  classification: PageClassification,
  providedResume?: { data: string; fileName?: string; mimeType?: string },
  providedProfile?: any,
  container?: HTMLElement,
  mode?: 'autonomous' | 'autofill'
): Promise<PageActionResult> {
  logger.log('Navigator', 'Handling form action...');

  // 1. Fill Fields
  logger.log('Navigator', 'Calling consolidated field filler...');
  const fillStats = await fillAllFields(classification, {
    resume: providedResume,
    profile: providedProfile,
    mode, // Pass mode to determine skipPreFilled behavior
  });

  if (!fillStats.success) {
    logger.error('Navigator', 'Fill failed');
    return { status: 'blocked', reason: 'fill_failed' };
  }

  logger.log(
    'Navigator',
    `Fill complete: ${fillStats.filled} filled, ${fillStats.skipped} skipped`
  );

  // Skip submission in autofill mode - user will manually submit
  if (mode === 'autofill') {
    logger.log('Navigator', 'Autofill mode: skipping auto-submit, waiting for manual submission');
    console.log('[Navigator] Autofill mode: form filled, awaiting manual submit');
    return { status: 'completed', reason: 'autofill_complete_awaiting_manual_submit' };
  }

  // 2. Submit / Next (only in autonomous mode)
  logger.log('Navigator', 'Attempting to submit/progress form...');

  try {
    const result = await submitForm(classification, container);
    if (result === 'success') {
      return { status: 'completed', reason: 'submitted_successfully' };
    } else if (result === 'progressed') {
      return { status: 'progressed', reason: 'clicked_button' };
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    if (errorMessage.includes('manual_input_required')) {
      logger.warn('Navigator', 'Manual input required:', errorMessage);
      return { status: 'blocked', reason: 'manual_input_required' };
    }
    logger.error('Navigator', 'Error interacting with submit button', e);
    return { status: 'blocked', reason: 'submit_interaction_error' };
  }

  return { status: 'blocked', reason: 'no_progression_button_found' };
}

/**
 * Handle modal (close or select option)
 */
async function handleModalAction(
  classification: PageClassification,
  container?: HTMLElement,
  mode?: 'autonomous' | 'autofill'
): Promise<PageActionResult> {
  logger.log('Navigator', 'Handling modal action...');

  // In autofill mode, skip all autonomous actions - user will interact manually
  if (mode === 'autofill') {
    logger.log('Navigator', 'Autofill mode: skipping autonomous modal actions');
    return { status: 'blocked', reason: 'autofill_mode_manual_interaction_required' };
  }

  // Check for SUBMIT / REVIEW (Final Step)
  // Use findProgressionButton to leverage LinkedIn-specific selectors and avoid clicking settings links
  const { action: submitAction, isFinalSubmit } = findProgressionButton(classification, container);
  if (submitAction && isFinalSubmit) {
    logger.log('Navigator', 'Found SUBMIT action in modal (Review/Submit page)');
    console.log('[Navigator] Found SUBMIT action in modal');

    await clickElement(submitAction, 'submit_modal');
    return { status: 'completed', reason: 'submitted_modal' };
  }

  // Check if this is a Workday-style options modal
  const hasApplyOption = classification.actions.some((a) => a.purpose === 'apply');

  if (hasApplyOption) {
    // This is an options modal - select best option
    logger.log('Navigator', 'Detected options modal with apply buttons');

    // First, check if modal is visible - if not, we need to click a button to show it
    const modalElement =
      container ||
      (document.querySelector(
        '[role="dialog"], .modal-overlay, [data-automation-id="wd-popup-frame"]'
      ) as HTMLElement);

    // Check validation of the found element
    const isModalVisible = modalElement && isTrulyVisible(modalElement);

    // Open the modal if it's not visible yet
    if (!isModalVisible) {
      logger.log('Navigator', 'Modal is hidden, looking for button to show modal...');

      const allShowModalButtons = Array.from(document.querySelectorAll('button, a')).filter(
        (el) => {
          const text = el.textContent?.toLowerCase() || '';
          return (
            text.includes('apply') &&
            !text.includes('autofill') &&
            !text.includes('manual') &&
            !text.includes('last application')
          );
        }
      ) as HTMLElement[];

      // Filter to only visible buttons (check parent chain and z-index)
      const visibleShowModalButtons = allShowModalButtons.filter((btn) => isTrulyVisible(btn));

      if (visibleShowModalButtons.length > 0) {
        const showButton = visibleShowModalButtons[0]!;
        logger.log(
          'Navigator',
          `Clicking button to show modal: ${showButton.textContent?.substring(0, 50)}`
        );

        await clickElement(
          {
            element: showButton,
            purpose: 'apply',
            type: showButton.tagName.toLowerCase() as any,
            confidence: 0.8,
            selectors: [],
          },
          'show_modal_button'
        );
        // Re-classify the page now that modal is visible
        logger.log('Navigator', 'Re-classifying page with visible modal...');
        console.log('[Navigator] Re-classifying page');
        const newClassification = await classifyPage();
        classification = newClassification;
      } else {
        logger.warn('Navigator', 'No button found to show modal');
        console.warn('[Navigator] No button found to show modal');
        return { status: 'blocked', reason: 'no_modal_trigger_button' };
      }
    }

    // Find all apply actions and filter to only visible ones
    const allApplyActions = classification.actions.filter((a) => a.purpose === 'apply');

    logger.log(
      'Navigator',
      `[MODAL] Found ${allApplyActions.length} apply actions, checking visibility...`
    );
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

    logger.log(
      'Navigator',
      `[MODAL] Filtered to ${visibleApplyActions.length} visible apply actions`
    );
    console.log(`[Navigator] [MODAL] ${visibleApplyActions.length} visible apply actions`);

    if (visibleApplyActions.length === 0) {
      logger.warn('Navigator', '[MODAL] No visible apply actions found - all are hidden');
      console.warn('[Navigator] [MODAL] No visible apply actions found');
      return { status: 'blocked', reason: 'no_visible_apply_actions' };
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
      logger.log(
        'Navigator',
        `[MODAL] Clicking apply option: ${bestAction.element.textContent?.substring(0, 50)}`
      );
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
      return { status: 'progressed', reason: 'clicked_apply_option' };
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
    return { status: 'progressed', reason: 'closed_modal' };
  }

  // No close button - try clicking outside or pressing ESC
  logger.log('Navigator', 'No close button found, attempting to dismiss modal');
  console.log('[Navigator] No close button found, attempting to dismiss modal');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

  return { status: 'progressed', reason: 'dismissed_modal_with_escape' };
}

/**
 * Handle signup/account page
 */

/**
 * Handle intermediate page (has Apply button)
 */
/**
 * Handle intermediate page (has Apply button)
 */
async function handleIntermediateAction(
  classification: PageClassification
): Promise<PageActionResult> {
  logger.log('Navigator', 'Handling intermediate page...');

  const applyAction = findBestAction(classification, 'apply');

  if (applyAction) {
    logger.log('Navigator', 'Clicking Apply button');
    await clickElement(applyAction, 'apply_button');
    return { status: 'progressed', reason: 'clicked_intermediate_apply' };
  }

  logger.log('Navigator', 'No Apply button found on intermediate page');
  return { status: 'blocked', reason: 'no_intermediate_action' };
}

// ============================================================================
// VALIDATION ERROR CAPTURE
// ============================================================================

/**
 * Capture validation errors and map them to their associated input fields
 * Returns a map of element -> error message
 */
function captureValidationErrors(container?: HTMLElement): Map<HTMLElement, string> {
  const root = container || document;
  const fieldErrors = new Map<HTMLElement, string>();

  // Find all visible error messages
  const errorSelectors = [
    '.artdeco-inline-feedback--error', // LinkedIn
    '[role="alert"]',
    '.error-message',
    '.field-error',
    '.form-error',
    '.invalid-feedback',
  ];

  const errorElements = root.querySelectorAll(errorSelectors.join(', '));
  const visibleErrors = Array.from(errorElements).filter((el) => {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  });

  for (const errorEl of visibleErrors) {
    const errorText = errorEl.textContent?.trim() || '';
    if (!errorText) continue;

    let associatedField: HTMLElement | null = null;

    // Strategy 1: Check if error is inside a form element container
    const container = errorEl.closest('.fb-dash-form-element, .form-group, fieldset, .form-field');
    if (container) {
      const input = container.querySelector('input, select, textarea');
      if (input) {
        associatedField = input as HTMLElement;
      }
    }

    // Strategy 2: Check if error has aria-describedby linking to field
    if (!associatedField) {
      const errorId = errorEl.id;
      if (errorId) {
        const field = root.querySelector(`[aria-describedby*="${errorId}"]`);
        if (field) {
          associatedField = field as HTMLElement;
        }
      }
    }

    // Strategy 3: Check previous sibling (error might be after the input)
    if (!associatedField) {
      let sibling = errorEl.previousElementSibling;
      while (sibling) {
        if (
          sibling.tagName === 'INPUT' ||
          sibling.tagName === 'SELECT' ||
          sibling.tagName === 'TEXTAREA'
        ) {
          associatedField = sibling as HTMLElement;
          break;
        }
        // Check inside sibling
        const input = sibling.querySelector('input, select, textarea');
        if (input) {
          associatedField = input as HTMLElement;
          break;
        }
        sibling = sibling.previousElementSibling;
      }
    }

    if (associatedField) {
      fieldErrors.set(associatedField, errorText);
      logger.log('Navigator', `Captured validation error for field`, {
        fieldId: associatedField.id || 'unknown',
        error: errorText.substring(0, 50),
      });
    } else {
      logger.log(
        'Navigator',
        `Could not associate error with field: ${errorText.substring(0, 50)}`
      );
    }
  }

  return fieldErrors;
}

// ============================================================================
// FORM SUBMISSION
// ============================================================================

/**
 * Find the best progression button (Submit > Review > Next > Continue)
 * Returns the action and whether it's a final submit
 *
 * LinkedIn Easy Apply specific selectors:
 * - Submit: [data-live-test-easy-apply-submit-button]
 * - Review: [data-live-test-easy-apply-review-button]
 * - Next:   [data-easy-apply-next-button]
 */
function findProgressionButton(
  classification: PageClassification,
  container?: HTMLElement
): { action: DetectedField | null; isFinalSubmit: boolean } {
  // Use container or fallback to document
  const root = container || document;

  // =========================================================================
  // PRIORITY 0: LinkedIn Easy Apply specific selectors (most reliable)
  // =========================================================================

  // LinkedIn Submit button
  const linkedInSubmit = root.querySelector(
    '[data-live-test-easy-apply-submit-button]:not(:disabled)'
  ) as HTMLElement;
  if (linkedInSubmit && !isActuallyHiddenNav(linkedInSubmit)) {
    logger.log('Navigator', 'Found LinkedIn Submit button via data attribute');
    return {
      action: {
        purpose: 'submit',
        type: 'button',
        confidence: 0.95,
        selectors: ['[data-live-test-easy-apply-submit-button]'],
        element: linkedInSubmit,
      },
      isFinalSubmit: true,
    };
  }

  // LinkedIn Review button (last step before submit)
  const linkedInReview = root.querySelector(
    '[data-live-test-easy-apply-review-button]:not(:disabled)'
  ) as HTMLElement;
  if (linkedInReview && !isActuallyHiddenNav(linkedInReview)) {
    logger.log('Navigator', 'Found LinkedIn Review button via data attribute');
    return {
      action: {
        purpose: 'unknown',
        type: 'button',
        confidence: 0.95,
        selectors: ['[data-live-test-easy-apply-review-button]'],
        element: linkedInReview,
      },
      isFinalSubmit: false,
    };
  }

  // LinkedIn Next button
  const linkedInNext = root.querySelector(
    '[data-easy-apply-next-button]:not(:disabled), [data-live-test-easy-apply-next-button]:not(:disabled)'
  ) as HTMLElement;
  if (linkedInNext && !isActuallyHiddenNav(linkedInNext)) {
    logger.log('Navigator', 'Found LinkedIn Next button via data attribute');
    return {
      action: {
        purpose: 'unknown',
        type: 'button',
        confidence: 0.95,
        selectors: ['[data-easy-apply-next-button]'],
        element: linkedInNext,
      },
      isFinalSubmit: false,
    };
  }

  // =========================================================================
  // PRIORITY 1: Generic Submit buttons from classification
  // =========================================================================
  const submitAction = findBestAction(classification, 'submit');
  if (submitAction?.element) {
    const el = submitAction.element as HTMLElement;
    if (!isActuallyHiddenNav(el)) {
      return { action: submitAction, isFinalSubmit: true };
    }
  }

  // =========================================================================
  // PRIORITY 2: Generic Review/Next/Continue buttons by text
  // =========================================================================
  const progressionKeywords = ['review', 'next', 'continue'];
  const buttons = root.querySelectorAll(
    'button:not(:disabled), [role="button"]:not([aria-disabled="true"])'
  );

  for (const btn of Array.from(buttons)) {
    const htmlBtn = btn as HTMLElement;
    const text = (btn.textContent?.toLowerCase() || '').trim();
    const ariaLabel = (btn.getAttribute('aria-label')?.toLowerCase() || '').trim();

    // Check if this is a progression button
    const isProgressionButton = progressionKeywords.some(
      (kw) => text.includes(kw) || ariaLabel.includes(kw)
    );

    if (isProgressionButton && !isActuallyHiddenNav(htmlBtn)) {
      // Don't match "next page" pagination buttons
      if (text.includes('page') || ariaLabel.includes('page')) continue;

      return {
        action: {
          purpose: 'unknown',
          type: 'button',
          confidence: 0.8,
          selectors: [],
          element: htmlBtn,
        },
        isFinalSubmit: false,
      };
    }
  }

  return { action: null, isFinalSubmit: false };
}

/**
 * Submit the form (or click Next/Continue for multi-step forms)
 * Returns: true if final submit, false if progressed to next step, throws if no button found
 */
async function submitForm(
  classification: PageClassification,
  container?: HTMLElement
): Promise<'success' | 'progressed' | 'failed'> {
  logger.log('Navigator', 'Looking for progression button (Submit/Review/Next/Continue)...');
  console.log('[Navigator] Looking for progression button...');

  // Snapshot pre-submit state for lightweight before/after comparison
  const beforeUrl = window.location.href.toLowerCase();
  const beforeText = (document.body.innerText || document.body.textContent || '').toLowerCase();

  // Find the best progression button (Submit > Review > Next > Continue)
  const { action: progressionAction, isFinalSubmit } = findProgressionButton(classification);

  // Fallback to old behavior if findProgressionButton doesn't find anything
  const submitAction = progressionAction || findBestAction(classification, 'submit');

  if (!submitAction) {
    logger.log('Navigator', 'No submit/next button found');
    console.warn('[Navigator] No submit/next button found');
    return 'failed';
  }

  const buttonType = isFinalSubmit ? 'Submit' : progressionAction ? 'Next/Continue' : 'Submit';
  logger.log('Navigator', `${buttonType} button found`, {
    purpose: submitAction.purpose,
    confidence: submitAction.confidence,
    selector: submitAction.selectors?.[0] || 'dynamic',
    isFinalSubmit,
  });
  console.log(`[Navigator] ${buttonType} button found:`, submitAction.selectors?.[0] || 'dynamic');

  // For Next/Continue buttons, click and then check for validation errors
  if (!isFinalSubmit && progressionAction) {
    logger.log('Navigator', 'Clicking Next/Continue button...');
    console.log('[Navigator] Clicking Next/Continue button...');

    await humanClick(submitAction.element as HTMLElement, {
      jitterBefore: true,
      minJitter: 500,
      maxJitter: 1000,
    });

    // Wait for DOM to stabilize after click
    await waitForDOMStable(500, 2000);

    // Check for validation errors even on Next/Continue
    const fieldErrors = captureValidationErrors(container);

    if (fieldErrors.size > 0) {
      logger.log('Navigator', `Validation errors detected after Next click: ${fieldErrors.size}`, {
        errors: Array.from(fieldErrors.values()).map((e) => e.substring(0, 50)),
      });
      console.warn('[Navigator] Validation errors after Next click:', fieldErrors.size);

      // Store errors for retry attempt
      lastValidationErrors = fieldErrors;

      // Return 'progressed' to trigger retry with error context
      return 'progressed';
    }

    // Clear errors if no validation errors found
    lastValidationErrors.clear();

    logger.log(
      'Navigator',
      'Next/Continue clicked successfully, form will re-classify for next step'
    );
    console.log('[Navigator] Next/Continue clicked, waiting for next step...');
    return 'progressed'; // Indicate more steps needed
  }

  // Check if form is valid (if it's in a form element)
  // IMPORTANT: Only check the VISIBLE form, not hidden template forms
  // In multi-template modals, there can be multiple forms in the DOM
  let formElement: HTMLFormElement | null = null;

  // Strategy 1: Find form closest to the submit button (most reliable)
  if (submitAction?.element) {
    const closestForm = (submitAction.element as HTMLElement).closest('form');
    if (closestForm && isElementActuallyVisible(closestForm)) {
      formElement = closestForm;
    }
  }

  // Strategy 2: Find visible form in active modal/content area
  if (!formElement) {
    const visibleForms = Array.from(document.querySelectorAll('form')).filter((form) =>
      isElementActuallyVisible(form as HTMLElement)
    );
    if (visibleForms.length > 0) {
      formElement = visibleForms[0] as HTMLFormElement;
    }
  }

  // Strategy 3: Fallback to first form (old behavior)
  if (!formElement) {
    formElement = document.querySelector('form');
  }

  if (formElement) {
    logger.log('Navigator', 'Checking form validity...');
    console.log('[Navigator] Checking form validity...');

    // Check for invalid fields before calling checkValidity
    // IMPORTANT: Only check VISIBLE fields to avoid false positives from hidden previous steps
    const invalidFields: Array<{ name: string; element: HTMLElement; message: string }> = [];
    const allInputs = formElement.querySelectorAll('input, select, textarea');
    allInputs.forEach((input) => {
      const htmlInput = input as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

      // Skip fields that are not visible (hidden previous steps in multi-step forms)
      const isVisible =
        htmlInput.offsetParent !== null && !isActuallyHiddenNav(htmlInput as HTMLElement);

      if (htmlInput.required && !htmlInput.validity.valid && isVisible) {
        invalidFields.push({
          name: htmlInput.name || htmlInput.id || 'unknown',
          element: htmlInput,
          message: htmlInput.validationMessage || 'Invalid',
        });
      }
    });

    if (invalidFields.length > 0) {
      logger.log(
        'Navigator',
        `Form validation failed: ${invalidFields.length} invalid fields`,
        invalidFields.map((f) => ({ name: f.name, message: f.message }))
      );
      console.warn(
        '[Navigator] Form validation failed. Invalid fields:',
        invalidFields.map((f) => ({
          name: f.name,
          message: f.message,
          value: (f.element as HTMLInputElement | HTMLSelectElement).value,
        }))
      );
      formElement.reportValidity();
      // This form requires answers we don't have (e.g. years of experience).
      // Treat as a "manual input required" page instead of force-submitting.
      const summary = invalidFields.map((f) => f.name).join(', ');
      throw new Error(`manual_input_required: Required fields missing or invalid: ${summary}`);
    }

    if (!formElement.checkValidity()) {
      logger.log('Navigator', 'Form validation failed (checkValidity returned false)');
      console.warn('[Navigator] Form validation failed (checkValidity returned false)');

      // Log which fields are invalid for debugging
      // IMPORTANT: Only check VISIBLE fields
      const allInputs = formElement.querySelectorAll('input, select, textarea');
      const invalidFields: Array<{
        name: string;
        type: string;
        required: boolean;
        value: string;
        message: string;
      }> = [];
      allInputs.forEach((input) => {
        const htmlInput = input as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

        // Skip fields that are not visible
        const isVisible =
          htmlInput.offsetParent !== null && !isActuallyHiddenNav(htmlInput as HTMLElement);

        if (htmlInput.required && !htmlInput.validity.valid && isVisible) {
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
        logger.error(
          'Navigator',
          'Cannot submit form - required fields are missing or invalid. Fields needed:',
          invalidFields.map((f) => ({ name: f.name, type: f.type, message: f.message }))
        );
        console.error(
          '[Navigator] Cannot submit form - required fields are missing or invalid:',
          invalidFields
        );
      }

      formElement.reportValidity();
      return 'failed';
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
          if (msg && Date.now() - timestamp < 5000) {
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

    // Setup MutationObserver for transient success DOM elements (e.g. modals that appear and disappear quickly)
    // This catches "blink and you miss it" success states that aren't window.alerts
    const domSuccessPromise = new Promise<boolean>((resolve) => {
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of Array.from(mutation.addedNodes)) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node as HTMLElement;
              const text = (el.textContent || '').toLowerCase();
              if (
                (text.includes('success') ||
                  text.includes('submitted') ||
                  text.includes('thank you')) &&
                !text.includes('error') &&
                !text.includes('failed')
              ) {
                // Verify visibility just in case
                if (window.getComputedStyle(el).display !== 'none') {
                  console.log(
                    '[Navigator] Transient DOM success element detected:',
                    text.substring(0, 100)
                  );
                  observer.disconnect();
                  resolve(true);
                  return;
                }
              }
            }
          }
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      // Timeout slightly longer than alert timeout
      setTimeout(() => {
        observer.disconnect();
        resolve(false);
      }, 6000);
    });

    // Race logic: if either detects success, return true immediately.
    const combinedSuccessPromise = new Promise<boolean>((resolve) => {
      let resolved = false;
      const onSuccess = () => {
        if (!resolved) {
          resolved = true;
          resolve(true);
        }
      };

      alertPromise.then((res) => {
        if (res) onSuccess();
      });
      domSuccessPromise.then((res) => {
        if (res) onSuccess();
      });

      // If both complete without success, resolve false
      Promise.all([alertPromise, domSuccessPromise]).then((results) => {
        if (!resolved) {
          resolve(results.includes(true));
        }
      });
    });

    // Use humanClick for submit button (proper event sequence)
    await humanClick(submitAction.element as HTMLElement, {
      jitterBefore: true,
      minJitter: 500,
      maxJitter: 1000,
    });
    logger.log('Navigator', 'Submit button clicked with humanized click, waiting for response...');
    console.log('[Navigator] Submit button clicked with humanized click, waiting for response...');

    // Wait for submission or alert
    const alertSuccess = await combinedSuccessPromise;

    if (alertSuccess) {
      logger.log('Navigator', 'Success alert detected!');
      console.log('[Navigator] Success alert detected!');

      // Close any lingering success modal
      await closeSuccessModal();
      return 'success';
    }

    // No alert detected - check for success indicators in DOM
    logger.log('Navigator', 'No alert detected, checking DOM for success indicators...');
    console.log('[Navigator] No alert detected, checking DOM for success indicators...');
    // Wait for DOM to update (event-driven)
    await waitForDOMStable(500, 3000);

    // CRITICAL: Check for post-submit validation errors (e.g. LinkedIn custom errors)
    // If errors appeared after clicking, capture them for retry.
    const fieldErrors = captureValidationErrors(container);

    if (fieldErrors.size > 0) {
      logger.log('Navigator', `Post-submit validation errors detected: ${fieldErrors.size}`, {
        errors: Array.from(fieldErrors.values()).map((e) => e.substring(0, 50)),
      });
      console.warn('[Navigator] Post-submit validation errors detected:', fieldErrors.size);

      // Store errors for retry attempt
      lastValidationErrors = fieldErrors;

      // Return 'progressed' to trigger WAIT_AND_RETRY_FILL loop (not 'failed' which skips job)
      return 'progressed';
    }

    // Clear errors if no validation errors found
    lastValidationErrors.clear();

    // 1) Structural / visual checks (preferred)
    // IMPORTANT: We only treat this as success if we see a *visible* success state,
    // not just success text hidden somewhere in the DOM.
    const hasSuccessIndicator = hasVisibleSuccessIndicator(
      formElement as HTMLFormElement | null,
      submitAction.element as HTMLElement | null
    );

    if (hasSuccessIndicator) {
      logger.log('Navigator', 'Success indicator found in DOM');
      console.log('[Navigator] Success indicator found in DOM');

      // Close success modal to prevent stale modals during job processing
      await closeSuccessModal();
      return 'success';
    }

    // 2) Lightweight before/after heuristic based on URL + page text,
    // inspired by common post-submit classifiers used by other tools.
    const afterUrl = window.location.href.toLowerCase();
    const afterText = (document.body.innerText || document.body.textContent || '').toLowerCase();
    const urlChanged = afterUrl !== beforeUrl;
    const textChanged = afterText !== beforeText;

    const successTextPatterns = [
      'application submitted',
      'submitted successfully',
      'thank you for applying',
      'thanks for applying',
      'we received your application',
      'we have received your application',
      'your application has been submitted',
      'your application was submitted',
      'you have successfully submitted',
    ];

    const errorTextPatterns = [
      'went wrong',
      'try again',
      'unable to submit',
      'unable to process',
      'unexpected error',
      'error',
      'failed',
      'problem submitting',
    ];

    const successUrlPatterns = ['thank', 'success', 'submitted', 'confirmation'];

    const containsAny = (text: string, patterns: string[]): boolean =>
      patterns.some((p) => text.includes(p));

    // URL-based success: redirect to confirmation-like URL
    if (urlChanged && containsAny(afterUrl, successUrlPatterns)) {
      logger.log('Navigator', 'Heuristic URL-based success detected after submission', {
        beforeUrl,
        afterUrl,
      });
      console.log('[Navigator] Heuristic URL-based success detected:', {
        beforeUrl,
        afterUrl,
      });

      // Close any lingering success modal
      await closeSuccessModal();
      return 'success';
    }

    // Text-based success: page text changed and now clearly contains success language,
    // without obvious fatal error language.
    if (
      textChanged &&
      containsAny(afterText, successTextPatterns) &&
      !containsAny(afterText, errorTextPatterns)
    ) {
      logger.log('Navigator', 'Heuristic text-based success detected after submission', {
        beforeSnippet: beforeText.slice(0, 200),
        afterSnippet: afterText.slice(0, 200),
      });
      console.log('[Navigator] Heuristic text-based success detected');

      // Close any lingering success modal
      await closeSuccessModal();
      return 'success';
    }

    // 3) Fallback: If it was a final submit and the button is gone/disabled, assume success
    // This handles cases where the modal simply closes or changes state without a prominent success message
    if (isFinalSubmit) {
      // Check if the original submit button is still in the DOM and visible/enabled
      const buttonStillActive =
        submitAction.element &&
        document.body.contains(submitAction.element) &&
        isElementActuallyVisible(submitAction.element) &&
        !(submitAction.element as HTMLButtonElement).disabled;

      // If the button is gone/hidden/disabled, and we didn't see an error...
      if (!buttonStillActive && !containsAny(afterText, errorTextPatterns)) {
        logger.log(
          'Navigator',
          'Submit button disappeared/disabled after click - assuming success'
        );
        console.log('[Navigator] Submit button disappeared/disabled - assuming success');
        await closeSuccessModal();
        return 'success';
      }
    }

    // No success detected - return 'progressed' if we are unsure, but if it was final submit and failed checks, maybe 'failed'?
    // User complaint: "progressed" shouldn't happen after submit.
    // If we've reached here after a FINAL submit, and we didn't detect success or error, it's ambiguous.
    // But returning 'failed' stops the process. Returning 'progressed' continues but might be wrong state.
    // Let's bias towards 'success' if we are fairly sure, otherwise 'failed' to trigger retry?
    // Actually, if we simply return 'progressed', the next loop will try to classify again.
    // If the modal is gone, it might classify as 'unknown'.

    logger.log(
      'Navigator',
      'WARNING: No success alert or DOM/heuristic indicator detected - form submission may have failed'
    );
    console.warn(
      '[Navigator] No success alert or DOM/heuristic indicator detected - form submission may have failed'
    );
    return 'failed';
  } catch (error) {
    logger.error('Navigator', 'Error submitting form', error);
    console.error('[Navigator] Error submitting form:', error);
    return 'failed';
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Close any visible success/post-apply modal to prevent stale modals during job processing.
 * Uses LinkedIn-specific selectors first, then falls back to generic dismiss patterns.
 *
 * Strategy:
 * 1. LinkedIn data-test attribute (most stable)
 * 2. LinkedIn aria-label patterns (accessibility-stable)
 * 3. LinkedIn class within dialog context (avoids false positives)
 * 4. Generic close patterns (last resort)
 */
async function closeSuccessModal(): Promise<boolean> {
  // Ordered by specificity - most reliable first
  const dismissSelectors = [
    // LinkedIn-specific (data-test attributes are stable)
    '[data-test-modal-close-btn]',
    // LinkedIn aria-label pattern (dismiss is LinkedIn's standard)
    '[role="dialog"] button[aria-label*="dismiss" i]',
    '[aria-labelledby="post-apply-modal"] button[aria-label*="dismiss" i]',
    // LinkedIn class within modal context
    '[role="dialog"] .artdeco-modal__dismiss',
    '.jobs-easy-apply-modal .artdeco-modal__dismiss',
    // Generic patterns (fallback)
    '[role="dialog"] button[aria-label*="close" i]',
    '.modal [aria-label*="close" i]',
  ];

  for (const selector of dismissSelectors) {
    const dismissBtn = document.querySelector(selector) as HTMLElement | null;
    if (dismissBtn && isElementActuallyVisible(dismissBtn)) {
      logger.log('Navigator', `Closing success modal via: ${selector}`);
      console.log(`[Navigator] Closing success modal via: ${selector}`);

      try {
        // Use humanClick for natural interaction
        await humanClick(dismissBtn, { jitterBefore: true, minJitter: 200, maxJitter: 500 });

        // Wait for modal to close
        await waitForDOMStable(300, 1000);

        logger.log('Navigator', '✓ Success modal closed');
        console.log('[Navigator] ✓ Success modal closed');
        return true;
      } catch (err) {
        logger.warn('Navigator', `Failed to close modal via ${selector}:`, err);
        console.warn(`[Navigator] Failed to close modal via ${selector}:`, err);
        // Continue to try next selector
      }
    }
  }

  // If no dismiss button found, try pressing Escape as last resort
  logger.log('Navigator', 'No dismiss button found, trying Escape key');
  console.log('[Navigator] No dismiss button found, trying Escape key');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await waitForDOMStable(200, 500);

  return false;
}

/**
 * Detect whether the page is clearly in a "submission succeeded" state.
 * This is intentionally conservative to avoid false positives where the UI
 * contains success text but the form was never actually submitted.
 */
function hasVisibleSuccessIndicator(
  formElement: HTMLFormElement | null,
  submitElement: HTMLElement | null
): boolean {
  const href = window.location.href || '';

  // Helper: success heuristics tuned for mocks AND safe for real ATS
  const checkDomSuccess = () => {
    // 1) Visible "success" UI elements with explicit success IDs/classes
    // Include both kebab-case and camelCase variants for mock compatibility
    const explicitSelectors = [
      '.success-message',
      '.success-message.active',
      '#success-message',
      '#successMessage', // Mock uses camelCase ID
    ];
    for (const selector of explicitSelectors) {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (el && isElementActuallyVisible(el)) {
        return true;
      }
    }

    // 2) LinkedIn post-apply success modal detection
    // LinkedIn shows a success modal with aria-labelledby="post-apply-modal"
    // The modal contains success icon and "Your application was sent" text
    const linkedInSuccessModal = document.querySelector(
      '[aria-labelledby="post-apply-modal"], [role="dialog"] .jpac-modal-header'
    ) as HTMLElement | null;
    if (linkedInSuccessModal && isElementActuallyVisible(linkedInSuccessModal)) {
      // Verify it's actually a success modal by checking for success text/icon
      const modalText = linkedInSuccessModal.textContent?.toLowerCase() || '';
      const hasSuccessText =
        modalText.includes('application was sent') ||
        modalText.includes('application submitted') ||
        modalText.includes('successfully applied');

      // Also check for LinkedIn's success icon (signal-success)
      const hasSuccessIcon = !!document.querySelector('[data-test-icon="signal-success"]');

      if (hasSuccessText || hasSuccessIcon) {
        logger.log('Navigator', 'LinkedIn post-apply success modal detected');
        return true;
      }
    }

    // 2) Form is no longer visible (hidden or removed)
    if (formElement) {
      const style = window.getComputedStyle(formElement);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return true;
      }
    }

    // 3) Submit control is disabled AND clearly indicates a submitted state
    if (submitElement) {
      const control = submitElement as HTMLButtonElement | HTMLInputElement;
      const isDisabled = control.disabled ?? false;
      const text = control.textContent?.toLowerCase() || '';
      if (isDisabled && (text.includes('application submitted') || text.includes('submitted'))) {
        return true;
      }
    }

    return false;
  };

  // For localhost mocks, we want an especially tight coupling between visible success
  // state and our notion of "submitted", because the mocks only flip these states
  // after their own submit handlers (which also POST to /mock-submissions).
  if (href.startsWith('http://localhost:') || href.includes('/mocks/')) {
    return checkDomSuccess();
  }

  // For real ATS pages, reuse the same conservative heuristics.
  return checkDomSuccess();
}

/**
 * Check if an element is actually rendered and not hidden by styles.
 * This does NOT enforce being in the viewport; viewport checks are done separately.
 *
 * NOTE: We do NOT check getBoundingClientRect() dimensions because:
 * 1. In background tabs, Chrome doesn't compute layout (returns 0)
 * 2. CSS property checks are sufficient to detect truly hidden elements
 */
function isElementActuallyVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);

  // Check 1: Inline style (faster, catches dynamic visibility toggling)
  const inlineDisplay = element.style.display;
  if (inlineDisplay === 'none') {
    logger.log('Navigator', `[VISIBILITY] Element hidden by inline style:`, {
      element: element.textContent?.substring(0, 30),
    });
    return false;
  }

  // Check 2: Computed style (already accounts for parent styles)
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    logger.log('Navigator', `[VISIBILITY] Element hidden by computed style:`, {
      element: element.textContent?.substring(0, 30),
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
    });
    return false;
  }

  // Check 3: aria-hidden attribute on the element itself
  // Note: We only check the element itself, NOT parents. LinkedIn uses aria-hidden="true"
  // on background content when modals are open (for screen readers), but elements are still
  // visually clickable. Our CSS checks (display, visibility, opacity, dimensions) are sufficient
  // to detect truly hidden elements.
  if (element.getAttribute('aria-hidden') === 'true') {
    logger.log('Navigator', `[VISIBILITY] Element itself has aria-hidden=true`);
    return false;
  }

  return true;
}

/**
 * Check if an element is within the viewport (at least partially visible).
 *
 * NOTE: In background tabs, getBoundingClientRect() returns zeros.
 * We assume elements are "in viewport" if we can't determine otherwise,
 * since the CSS visibility checks are more reliable.
 */
function isElementInViewport(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();

  // In background tabs, all rect values are 0 - assume element is in viewport
  // since we rely on CSS visibility checks instead
  if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0) {
    // Can't determine viewport status - assume true (CSS checks handle hidden elements)
    return true;
  }

  const inViewport =
    rect.top < window.innerHeight &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0;

  if (!inViewport) {
    logger.log(
      'Navigator',
      `[VISIBILITY] Element not in viewport: ${element.textContent?.substring(0, 30)}`
    );
    return false;
  }

  return true;
}

/**
 * Click an element and track it
 */
async function clickElement(field: DetectedField, actionType: string): Promise<void> {
  const element = field.element;

  // Check if already clicked

  // Verify element is visible (rendered) and determine viewport status before attempting click
  const isRenderable = isElementActuallyVisible(element);
  const isInViewport = isElementInViewport(element);

  logger.log('Navigator', `Pre-click check for ${actionType}:`, {
    tagName: element.tagName,
    href: (element as HTMLAnchorElement).href || 'N/A',
    visible: isRenderable,
    inViewport: isInViewport,
    disabled: (element as HTMLButtonElement).disabled || false,
    textContent: element.textContent?.substring(0, 50),
  });
  console.log(`[Navigator] Pre-click check:`, {
    tagName: element.tagName,
    href: (element as HTMLAnchorElement).href || 'N/A',
    visible: isRenderable,
    inViewport: isInViewport,
    disabled: (element as HTMLButtonElement).disabled || false,
  });

  if (!isRenderable) {
    logger.error('Navigator', `Element ${actionType} is not visible, cannot click`);
    console.error(`[Navigator] Element is not visible, cannot click`);
    throw new Error(`Element ${actionType} is not visible`);
  }

  // Scroll element into view if needed (using humanized scroll)
  if (!isInViewport) {
    logger.log('Navigator', `Scrolling element into view for ${actionType}`);
    console.log(`[Navigator] Scrolling element into view`);
    await scrollIntoViewIfNeeded(element);
  }

  // Add jitter before click for human-like behavior
  if (humanizeConfig.enabled) {
    await jitter(800, 1500);
  }

  // Mark as clicked BEFORE clicking (to prevent double-clicks)

  // Update history

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
  console.log(
    `[Navigator] Attempting to click ${actionType}:`,
    element.textContent?.substring(0, 50)
  );

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
        logger.log(
          'Navigator',
          `[LINK CLICK] Starting link click (attempt ${attempt}/${maxRetries})`,
          {
            href: linkHref,
            currentUrl,
            elementTag: element.tagName,
            elementText: element.textContent?.substring(0, 50),
          }
        );
        console.log(`[Navigator] [LINK CLICK] Attempt ${attempt}/${maxRetries}: ${linkHref}`);
        console.log(`[Navigator] [LINK CLICK] Current URL: ${currentUrl}`);

        // CRITICAL: Notify background IMMEDIATELY that navigation is starting
        // This must happen BEFORE clicking to reset the timeout
        // Even if navigation doesn't happen, we'll clear it later if needed
        try {
          const jobId = extractJobIdFromUrl() || 'unknown';
          logger.log(
            'Navigator',
            `[LINK CLICK] Notifying background BEFORE click that navigation is starting: jobId=${jobId}, targetUrl=${linkHref}`
          );
          console.log(`[Navigator] [LINK CLICK] Notifying background BEFORE click: jobId=${jobId}`);

          chrome.runtime
            .sendMessage({
              type: 'ATS_NAVIGATION_STARTING',
              data: { jobId, newUrl: linkHref },
            })
            .catch((err) => {
              logger.error(
                'Navigator',
                `[LINK CLICK] Failed to notify background BEFORE click:`,
                err
              );
              console.error(
                `[Navigator] [LINK CLICK] Failed to notify background BEFORE click:`,
                err
              );
            });
        } catch (notifyError) {
          logger.error(
            'Navigator',
            `[LINK CLICK] Error notifying background BEFORE click:`,
            notifyError
          );
          console.error(
            `[Navigator] [LINK CLICK] Error notifying background BEFORE click:`,
            notifyError
          );
        }

        try {
          // Try .click()
          logger.log('Navigator', `[LINK CLICK] Calling element.click()...`);
          console.log(`[Navigator] [LINK CLICK] Calling element.click()...`);
          element.click();
          logger.log(
            'Navigator',
            `[LINK CLICK] ✓ element.click() completed without error (attempt ${attempt})`
          );
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
        console.log(
          `[Navigator] [LINK CLICK] URL after click: ${urlAfterClick} (changed: ${urlAfterClick !== currentUrl})`
        );

        if (urlAfterClick !== currentUrl) {
          // Navigation happened!
          logger.log(
            'Navigator',
            `[LINK CLICK] ✓ Navigation detected immediately: ${currentUrl} -> ${urlAfterClick}`
          );
          console.log(
            `[Navigator] [LINK CLICK] ✓ Navigation detected: ${currentUrl} -> ${urlAfterClick}`
          );

          // Notify background script that navigation is happening
          try {
            const jobId = extractJobIdFromUrl() || 'unknown';
            logger.log(
              'Navigator',
              `[LINK CLICK] Notifying background of navigation: jobId=${jobId}, newUrl=${urlAfterClick}`
            );
            console.log(`[Navigator] [LINK CLICK] Notifying background: jobId=${jobId}`);

            await chrome.runtime.sendMessage({
              type: 'ATS_NAVIGATION_STARTING',
              data: { jobId, newUrl: urlAfterClick },
            });
            logger.log('Navigator', `[LINK CLICK] ✓ Background notified successfully`);
            console.log(`[Navigator] [LINK CLICK] ✓ Background notified`);
          } catch (msgError) {
            logger.error(
              'Navigator',
              `[LINK CLICK] Failed to notify background of navigation:`,
              msgError
            );
            console.error(`[Navigator] [LINK CLICK] Failed to notify background:`, msgError);
            // Don't throw - navigation happened, that's what matters
          }

          return; // Navigation happened, success! Page may reload and content script will restart
        }

        // If URL didn't change immediately, wait a SHORT time to see if async navigation starts
        // (Some sites use preventDefault + manual navigation, or navigation is delayed)
        logger.log(
          'Navigator',
          `[LINK CLICK] URL unchanged immediately, waiting 200ms for async navigation...`
        );
        console.log(`[Navigator] [LINK CLICK] Waiting 200ms for async navigation...`);
        await new Promise((resolve) => setTimeout(resolve, 200)); // Reduced from 500ms to 200ms
        const urlAfterWait = window.location.href;

        logger.log('Navigator', `[LINK CLICK] URL check after wait:`, {
          before: currentUrl,
          after: urlAfterWait,
          changed: urlAfterWait !== currentUrl,
        });
        console.log(
          `[Navigator] [LINK CLICK] URL after wait: ${urlAfterWait} (changed: ${urlAfterWait !== currentUrl})`
        );

        if (urlAfterWait !== currentUrl) {
          // Navigation happened asynchronously
          logger.log(
            'Navigator',
            `[LINK CLICK] ✓ Async navigation detected: ${currentUrl} -> ${urlAfterWait}`
          );
          console.log(
            `[Navigator] [LINK CLICK] ✓ Async navigation detected: ${currentUrl} -> ${urlAfterWait}`
          );

          try {
            const jobId = extractJobIdFromUrl() || 'unknown';
            logger.log(
              'Navigator',
              `[LINK CLICK] Notifying background of async navigation: jobId=${jobId}, newUrl=${urlAfterWait}`
            );
            console.log(`[Navigator] [LINK CLICK] Notifying background: jobId=${jobId}`);

            await chrome.runtime.sendMessage({
              type: 'ATS_NAVIGATION_STARTING',
              data: { jobId, newUrl: urlAfterWait },
            });
            logger.log('Navigator', `[LINK CLICK] ✓ Background notified successfully`);
            console.log(`[Navigator] [LINK CLICK] ✓ Background notified`);
          } catch (msgError) {
            logger.error(
              'Navigator',
              `[LINK CLICK] Failed to notify background of async navigation:`,
              msgError
            );
            console.error(`[Navigator] [LINK CLICK] Failed to notify background:`, msgError);
            // Don't throw - navigation happened, that's what matters
          }

          return; // Navigation happened, success!
        }

        // .click() didn't trigger navigation - immediately fall back to window.location.href
        // Don't retry - if .click() doesn't work, it likely won't work on retry either
        logger.warn(
          'Navigator',
          `[LINK CLICK] No navigation detected after click, immediately falling back to window.location.href`,
          {
            attempt,
            currentUrl,
            targetUrl: linkHref,
            urlAfterClick,
            urlAfterWait,
          }
        );
        console.warn(
          `[Navigator] [LINK CLICK] No navigation detected, using window.location.href immediately`
        );

        // Notify background script BEFORE navigation so it can reset the timeout
        try {
          const jobId = extractJobIdFromUrl() || 'unknown';
          logger.log(
            'Navigator',
            `[LINK CLICK] Notifying background before fallback navigation: jobId=${jobId}, newUrl=${linkHref}`
          );
          console.log(
            `[Navigator] [LINK CLICK] Notifying background before fallback: jobId=${jobId}`
          );

          await chrome.runtime.sendMessage({
            type: 'ATS_NAVIGATION_STARTING',
            data: { jobId, newUrl: linkHref },
          });
          logger.log('Navigator', `[LINK CLICK] ✓ Background notified before fallback`);
          console.log(`[Navigator] [LINK CLICK] ✓ Background notified`);
        } catch (msgError) {
          logger.error(
            'Navigator',
            `[LINK CLICK] Failed to notify background before fallback:`,
            msgError
          );
          console.error(`[Navigator] [LINK CLICK] Failed to notify background:`, msgError);
          // Continue anyway - we'll navigate regardless
        }

        // Fallback: use programmatic navigation immediately
        logger.log('Navigator', `[LINK CLICK] Setting window.location.href = ${linkHref}`);
        console.log(`[Navigator] [LINK CLICK] Setting window.location.href = ${linkHref}`);
        window.location.href = linkHref;
        return; // Page will reload, content script will restart
      } else {
        // For buttons and other elements, use humanClick for proper event sequence
        await humanClick(element, { jitterBefore: false }); // jitter already added above
        logger.log('Navigator', `✓ Element clicked via humanClick (attempt ${attempt})`);
        console.log(`[Navigator] ✓ Element clicked (attempt ${attempt})`);

        // Wait for action to complete (event-driven)
        logger.log('Navigator', `Waiting for action to complete after clicking ${actionType}`);
        console.log(`[Navigator] Waiting for action to complete`);

        // Use a short timeout to detect if click had any effect
        const clickWorked = await Promise.race([
          Promise.race([waitForNavigation(0), waitForDOMStable(500, 0)]).then(() => true),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1000)), // 1s timeout
        ]);

        if (clickWorked || attempt === maxRetries) {
          logger.log('Navigator', `✓ Action completed after clicking ${actionType}`);
          console.log(`[Navigator] ✓ Action completed`);
          return; // Success or max retries reached
        }

        // Retry if click didn't have effect
        logger.warn(
          'Navigator',
          `Click attempt ${attempt} did not have visible effect, retrying...`
        );
        console.warn(`[Navigator] Click did not have effect, retrying...`);
        await new Promise((resolve) => setTimeout(resolve, 500));
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

      logger.error(
        'Navigator',
        `[ERROR] Error clicking element ${actionType} (attempt ${attempt}/${maxRetries}):`,
        errorDetails
      );
      console.error(
        `[Navigator] [ERROR] Error clicking element (attempt ${attempt}/${maxRetries}):`,
        error
      );
      console.error(`[Navigator] [ERROR] Error details:`, errorDetails);

      if (attempt === maxRetries) {
        logger.error(
          'Navigator',
          `[ERROR] All ${maxRetries} attempts failed, throwing error`,
          errorDetails
        );
        console.error(`[Navigator] [ERROR] All attempts failed, throwing:`, lastError);
        throw lastError; // Throw on final attempt
      }

      logger.warn(
        'Navigator',
        `[ERROR] Retrying after error (attempt ${attempt}/${maxRetries})...`
      );
      console.warn(`[Navigator] [ERROR] Retrying after error...`);
      await new Promise((resolve) => setTimeout(resolve, 500)); // Wait before retry
    }
  }

  // If we get here, all retries failed
  throw lastError || new Error(`Failed to click ${actionType} after ${maxRetries} attempts`);
}

// DEPRECATED: waitForPageChange() removed - use waitForNavigation(0) instead (event-driven)
