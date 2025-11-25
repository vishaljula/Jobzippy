/**
 * Universal ATS Content Script
 * Handles auto-filling and submitting application forms across all ATS platforms
 * (Greenhouse, Workday, Lever, iCIMS, Taleo, Motion Recruitment, etc.)
 *
 * Features:
 * - Dynamic page classification with confidence scoring
 * - Configurable rules for intelligent page detection
 * - Adaptive navigation through multi-step flows
 * - Auto-closes cookie consent modals
 * - Handles Workday-style option modals (Autofill/Manual/Last Application)
 * - Skips account creation when possible
 * - Handles simple checkbox CAPTCHA only
 * - Prevents infinite loops with navigation tracking
 */

console.log('[Jobzippy] Universal ATS content script loaded');

// Import dynamic classifier
import { intelligentNavigate, NavigationResult } from './navigator';
import { logger } from '../../lib/logger';
import {
  waitForElementRemoval,
  waitForNavigation,
  waitForElement,
  waitForFormReady,
  waitForDOMStable,
  waitForCheckboxChecked,
} from '../../lib/dom-events';

// Send ready signal to background script when content script loads
logger.log('ATS', 'Content script loaded, sending ready signal');
console.log('[ATS] Content script loaded, sending ready signal');

// Extract jobId from URL (e.g., ?job=123457)
function extractJobIdFromUrl(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  const jobId = urlParams.get('job');
  return jobId || null;
}

// Send ready signal with jobId
const jobId = extractJobIdFromUrl();
if (jobId) {
  console.log(`[ATS] Extracted jobId from URL: ${jobId}`);
  chrome.runtime.sendMessage({
    type: 'ATS_CONTENT_SCRIPT_READY',
    data: { jobId },
  }).catch(() => {
    // Ignore if background script isn't ready yet
  });
} else {
  // Fallback: send without jobId, background will look it up
  console.log('[ATS] No jobId in URL, sending ready signal without jobId');
  chrome.runtime.sendMessage({ type: 'ATS_CONTENT_SCRIPT_READY', data: {} }).catch(() => {});
}

/*
 * LEGACY CODE (Preserved for reference)
 * The following code was the original hardcoded implementation.
 * It has been replaced by the dynamic classifier above.
 * Keeping it here for reference and potential fallback.
 */

// Legacy navigation state tracking
/*
interface NavigationState {
  visitedUrls: Set<string>;
  clickedElements: Set<string>;
  navigationDepth: number;
  maxDepth: number;
  currentStep: 'initial' | 'intermediate' | 'options_modal' | 'account_creation' | 'form';
}

const navState: NavigationState = {
  visitedUrls: new Set([window.location.href]),
  clickedElements: new Set(),
  navigationDepth: 0,
  maxDepth: 5, // Prevent infinite loops
  currentStep: 'initial',
};
*/

/*
 * LEGACY HELPER FUNCTIONS (Commented out - replaced by dynamic classifier)
 * These functions were part of the original hardcoded implementation.
 * They are preserved here for reference only.
 */

/*
// Auto-close common modals (cookie consent, etc.)
async function closeModals() {
  console.log('[ATS] Checking for modals to close...');

  // Common close button selectors
  const closeSelectors = [
    // Cookie consent
    'button[aria-label*="Accept"]',
    'button[aria-label*="Accept all"]',
    'button:has-text("Accept")',
    'button:has-text("Accept All")',
    'button:has-text("I Accept")',
    '.CybotCookiebotDialogBodyButton',
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    // Generic close buttons
    'button[aria-label*="Close"]',
    'button.close',
    '.modal-close',
    '[data-dismiss="modal"]',
  ];

  for (const selector of closeSelectors) {
    try {
      // Use querySelectorAll to handle :has-text pseudo-selector manually
      let buttons: NodeListOf<HTMLElement>;

      if (selector.includes(':has-text')) {
        const text = selector.match(/has-text\("(.+?)"\)/)?.[1];
        if (text) {
          buttons = document.querySelectorAll('button') as NodeListOf<HTMLElement>;
          buttons = Array.from(buttons).filter((btn) =>
            btn.textContent?.toLowerCase().includes(text.toLowerCase())
          ) as any;
        } else {
          continue;
        }
      } else {
        buttons = document.querySelectorAll(selector) as NodeListOf<HTMLElement>;
      }

      if (buttons.length > 0) {
        console.log(`[ATS] Found modal close button: ${selector}`);
        const button = buttons[0] as HTMLElement;
        const modal = button.closest('.modal, [role="dialog"], .overlay') as HTMLElement;
        button.click();
        // Wait for modal to be removed (event-driven)
        if (modal) {
          await waitForElementRemoval(modal.className.split(' ')[0] || '[role="dialog"]', 2000);
        } else {
          await waitForDOMStable(300, 1000);
        }
        return true;
      }
    } catch (error) {
      // Continue to next selector
    }
  }

  return false;
}

// Detect and handle Workday-style option modals
async function handleWorkdayOptionsModal(): Promise<boolean> {
  console.log('[ATS] Checking for Workday options modal...');

  // Look for Workday modal with application options
  const workdayModal = document.querySelector(
    '[data-automation-id="wd-popup-frame"], .workday-popup'
  );
  if (!workdayModal) {
    return false;
  }

  console.log('[ATS] Found Workday options modal');
  navState.currentStep = 'options_modal';

  // Priority order: Autofill > Manual > Last Application
  const optionSelectors = [
    {
      selector: 'a[data-automation-id="autofillWithResume"], a[href*="autofillWithResume"]',
      name: 'Autofill with Resume',
    },
    {
      selector: 'a[data-automation-id="applyManually"], a[href*="applyManually"]',
      name: 'Apply Manually',
    },
    {
      selector: 'a[data-automation-id="useMyLastApplication"], a[href*="useMyLastApplication"]',
      name: 'Use My Last Application',
    },
  ];

  for (const option of optionSelectors) {
    const element = workdayModal.querySelector(option.selector) as HTMLAnchorElement;
    if (element) {
      const elementId = `workday-option-${option.name}`;

      // Check if we've already clicked this
      if (navState.clickedElements.has(elementId)) {
        console.log(`[ATS] Already clicked ${option.name}, skipping`);
        continue;
      }

      console.log(`[ATS] Clicking Workday option: ${option.name}`);
      navState.clickedElements.add(elementId);
      navState.navigationDepth++;

      element.click();
      // Wait for navigation or DOM change (event-driven)
      await Promise.race([
        waitForNavigation(3000),
        waitForDOMStable(500, 3000),
      ]);
      return true;
    }
  }

  return false;
}

// Detect if we're on an account creation/login page
function detectAccountPage(): boolean {
  const hasSignUp = document.querySelector(
    'button:has-text("Sign Up"), button:has-text("Create Account"), a:has-text("Sign Up")'
  );
  const hasLogin = document.querySelector(
    'button:has-text("Log In"), button:has-text("Sign In"), input[type="password"]'
  );
  const hasAccountForm = document.querySelector(
    'form[action*="account"], form[action*="login"], form[action*="signup"]'
  );

  return !!(hasSignUp || hasLogin || hasAccountForm);
}

// Try to skip account creation (look for guest/continue without account options)
async function trySkipAccountCreation(): Promise<boolean> {
  console.log('[ATS] Looking for guest/skip account options...');

  const guestSelectors = [
    'button:has-text("Continue as Guest")',
    'button:has-text("Skip")',
    'button:has-text("Continue without account")',
    'a:has-text("Continue as Guest")',
    'a:has-text("Skip")',
    '[data-automation-id*="guest"]',
  ];

  for (const selector of guestSelectors) {
    try {
      let elements: NodeListOf<HTMLElement>;

      if (selector.includes(':has-text')) {
        const text = selector.match(/has-text\("(.+?)"\)/)?.[1];
        const tagName = selector.split(':')[0];
        if (text && tagName) {
          elements = document.querySelectorAll(tagName) as NodeListOf<HTMLElement>;
          elements = Array.from(elements).filter((el) =>
            el.textContent?.toLowerCase().includes(text.toLowerCase())
          ) as any;
        } else {
          continue;
        }
      } else {
        elements = document.querySelectorAll(selector) as NodeListOf<HTMLElement>;
      }

      if (elements.length > 0) {
        console.log(`[ATS] Found guest option: ${selector}`);
        (elements[0] as HTMLElement).click();
        // Wait for navigation or form to appear (event-driven)
        await Promise.race([
          waitForNavigation(3000),
          waitForFormReady('form', 3000),
          waitForDOMStable(500, 3000),
        ]);
        return true;
      }
    } catch (error) {
      // Continue to next selector
    }
  }

  console.log('[ATS] No guest option found - account creation required');
  return false;
}

// Find and click "Apply" button
async function findAndClickApplyButton(): Promise<boolean> {
  console.log('[ATS] Looking for Apply button...');

  // Check navigation depth
  if (navState.navigationDepth >= navState.maxDepth) {
    console.log('[ATS] Max navigation depth reached, stopping');
    return false;
  }

  const applySelectors = [
    'button[aria-label*="Apply"]',
    'button:has-text("Apply")',
    'button:has-text("Submit Application")',
    'a:has-text("Apply")',
    '[data-testid*="apply"]',
    '.apply-button',
    '#apply-button',
  ];

  for (const selector of applySelectors) {
    try {
      let elements: NodeListOf<HTMLElement>;

      if (selector.includes(':has-text')) {
        const text = selector.match(/has-text\("(.+?)"\)/)?.[1];
        const tagName = selector.split(':')[0];
        if (text && tagName) {
          elements = document.querySelectorAll(tagName) as NodeListOf<HTMLElement>;
          elements = Array.from(elements).filter((el) =>
            el.textContent?.toLowerCase().includes(text.toLowerCase())
          ) as any;
        } else {
          continue;
        }
      } else {
        elements = document.querySelectorAll(selector) as NodeListOf<HTMLElement>;
      }

      if (elements.length > 0) {
        console.log(`[ATS] Found Apply button: ${selector}`);
        (elements[0] as HTMLElement).click();
        // Wait for navigation or modal to appear (event-driven)
        await Promise.race([
          waitForNavigation(3000),
          waitForElement('.modal, [role="dialog"]', 3000).then(() => true),
          waitForDOMStable(500, 3000),
        ]);
        return true;
      }
    } catch (error) {
      // Continue to next selector
    }
  }

  return false;
}

// Detect if application form is present
function detectApplicationForm(): boolean {
  const hasFirstName = document.querySelector(
    'input[id*="first" i], input[name*="first" i], input[autocomplete="given-name"]'
  );
  const hasLastName = document.querySelector(
    'input[id*="last" i], input[name*="last" i], input[autocomplete="family-name"]'
  );
  const hasEmail = document.querySelector('input[type="email"], input[autocomplete="email"]');
  const hasResume = document.querySelector(
    'input[type="file"][accept*="pdf"], input[id*="resume" i], input[name*="resume" i]'
  );

  return !!(hasFirstName && hasLastName && hasEmail && hasResume);
}

// Initialize: intelligent navigation through multi-step ATS flows
async function initialize() {
  console.log('[ATS] Initializing intelligent navigation...');

  // Prevent re-initialization on same URL
  if (navState.visitedUrls.has(window.location.href) && navState.navigationDepth > 0) {
    console.log('[ATS] Already processed this URL');
    return;
  }

  navState.visitedUrls.add(window.location.href);

  // Step 1: Close any modals (cookie consent, etc.)
  await closeModals();

  // Step 2: Check for Workday options modal
  const handledWorkdayModal = await handleWorkdayOptionsModal();
  if (handledWorkdayModal) {
    console.log('[ATS] Handled Workday options modal, waiting for next page...');
    // The page will navigate, initialize will be called again
    return;
  }

  // Step 3: Check if we're on account creation/login page
  if (detectAccountPage()) {
    console.log('[ATS] Detected account creation/login page');
    navState.currentStep = 'account_creation';

    // Try to skip account creation
    const skipped = await trySkipAccountCreation();
    if (skipped) {
      console.log('[ATS] Successfully skipped account creation');
      // Wait for form to appear (event-driven)
      const form = await waitForFormReady('form', 3000);
      if (form || detectApplicationForm()) {
        console.log('[ATS] Application form detected after skipping account');
        navState.currentStep = 'form';
        notifyBackgroundReady();
        return;
      }
    } else {
      // Account creation is required - notify user
      console.log('[ATS] Account creation required - notifying background');
      chrome.runtime.sendMessage({
        type: 'ATS_ACCOUNT_REQUIRED',
        url: window.location.href,
        message:
          'This application requires account creation. Please create an account manually and try again.',
      });
      return;
    }
  }

  // Step 4: Check if application form is already visible
  if (detectApplicationForm()) {
    console.log('[ATS] Application form detected');
    navState.currentStep = 'form';
    notifyBackgroundReady();
    return;
  }

  // Step 5: Try to find and click Apply button (intermediate pages)
  const clicked = await findAndClickApplyButton();

  if (clicked) {
    navState.currentStep = 'intermediate';
    console.log('[ATS] Clicked Apply button, waiting for next step...');

    // Wait for navigation or modal (event-driven)
    await Promise.race([
      waitForNavigation(3000),
      waitForElement('.modal, [role="dialog"]', 3000).then(() => true),
      waitForDOMStable(500, 3000),
    ]);

    // Re-check for Workday modal after clicking Apply
    const handledModalAfterClick = await handleWorkdayOptionsModal();
    if (handledModalAfterClick) {
      return;
    }

    // Check if form appeared
    if (detectApplicationForm()) {
      console.log('[ATS] Application form detected after clicking Apply');
      navState.currentStep = 'form';
      notifyBackgroundReady();
      return;
    }

    // Check if we're on account page
    if (detectAccountPage()) {
      console.log('[ATS] Navigated to account creation page');
      navState.currentStep = 'account_creation';
      return;
    }
  }

  console.log('[ATS] Navigation complete, current step:', navState.currentStep);
}
*/

// ============================================================================
// NEW DYNAMIC CLASSIFIER INTEGRATION
// ============================================================================

/**
 * Initialize: Use dynamic classifier for intelligent navigation
 * NOTE: This function is no longer auto-called. It's kept for reference/fallback.
 * The content script now waits for FILL_EXTERNAL_ATS command from background script.
 */
// Legacy function - removed (no longer used, we wait for FILL_EXTERNAL_ATS command)
/*
async function initialize() {
  console.log('[ATS] Initializing with dynamic classifier...');
  // ... legacy code removed ...
}
*/

// Detect ATS type
// const detectATSType = (): string | null => {
//   const url = window.location.hostname;
//   const body = document.body;

//   // Check for known ATS platforms
//   if (url.includes('greenhouse.io') || body.getAttribute('data-ats-type') === 'greenhouse') {
//     return 'greenhouse';
//   }
//   if (url.includes('myworkdayjobs.com') || url.includes('workday.com')) {
//     return 'workday';
//   }
//   if (url.includes('lever.co')) {
//     return 'lever';
//   }
//   if (url.includes('icims.com')) {
//     return 'icims';
//   }
//   if (url.includes('taleo.net')) {
//     return 'taleo';
//   }
//   if (
//     url.includes('motionrecruitment.com') ||
//     body.getAttribute('data-ats-type') === 'motion-recruitment'
//   ) {
//     return 'motion-recruitment';
//   }

//   // Note: Generic detection removed - now handled by dynamic classifier
//   return null;
// };

// Find input field using multiple strategies
const findInput = (
  strategies: Array<{ selector?: string; label?: string; autocomplete?: string }>
): HTMLInputElement | null => {
  for (const strategy of strategies) {
    // Try by selector (ID or name)
    if (strategy.selector) {
      const input = document.querySelector(strategy.selector) as HTMLInputElement;
      if (input) return input;
    }

    // Try by autocomplete attribute
    if (strategy.autocomplete) {
      const input = document.querySelector(
        `input[autocomplete="${strategy.autocomplete}"]`
      ) as HTMLInputElement;
      if (input) return input;
    }

    // Try by label text
    if (strategy.label) {
      const labels = Array.from(document.querySelectorAll('label'));
      for (const label of labels) {
        if (label.textContent?.toLowerCase().includes(strategy.label.toLowerCase())) {
          const forAttr = label.getAttribute('for');
          if (forAttr) {
            const input = document.getElementById(forAttr) as HTMLInputElement;
            if (input) return input;
          }
          // Check if input is nested inside label
          const nestedInput = label.querySelector('input') as HTMLInputElement;
          if (nestedInput) return nestedInput;
        }
      }
    }
  }

  return null;
};

// Auto-fill form with user data
async function autoFillForm(userData: Record<string, unknown>) {
  console.log('[ATS] Auto-filling form with user data');
  console.log('[ATS] Received Data:', {
    firstName: userData.firstName,
    lastName: userData.lastName,
    email: userData.email,
    isMock: userData.firstName === 'John' && userData.lastName === 'Doe',
  });

  // Fill first name
  const firstNameInput = findInput([
    { selector: '#first_name, #firstName, input[name="first_name"], input[name="firstName"]' },
    { autocomplete: 'given-name' },
    { label: 'first name' },
  ]);
  if (firstNameInput && userData.firstName) {
    firstNameInput.value = String(userData.firstName);
    firstNameInput.dispatchEvent(new Event('input', { bubbles: true }));
    firstNameInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Fill last name
  const lastNameInput = findInput([
    { selector: '#last_name, #lastName, input[name="last_name"], input[name="lastName"]' },
    { autocomplete: 'family-name' },
    { label: 'last name' },
  ]);
  if (lastNameInput && userData.lastName) {
    lastNameInput.value = String(userData.lastName);
    lastNameInput.dispatchEvent(new Event('input', { bubbles: true }));
    lastNameInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Fill email
  const emailInput =
    findInput([
      { selector: '#email, input[name="email"]' },
      { autocomplete: 'email' },
      { label: 'email' },
    ]) || (document.querySelector('input[type="email"]') as HTMLInputElement);

  if (emailInput && userData.email) {
    emailInput.value = String(userData.email);
    emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    emailInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Fill phone number
  const phoneInput =
    findInput([
      { selector: '#phone, input[name="phone"]' },
      { autocomplete: 'tel' },
      { label: 'phone' },
    ]) || (document.querySelector('input[type="tel"]') as HTMLInputElement);

  if (phoneInput && userData.phone) {
    phoneInput.value = String(userData.phone);
    phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
    phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Fill LinkedIn
  const linkedinInput = findInput([
    { selector: '#linkedin, input[name="linkedin"]' },
    { label: 'linkedin' },
  ]);
  if (linkedinInput && userData.linkedin) {
    linkedinInput.value = String(userData.linkedin);
    linkedinInput.dispatchEvent(new Event('input', { bubbles: true }));
    linkedinInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Fill website
  const websiteInput = findInput([
    { selector: '#website, input[name="website"]' },
    { label: 'website' },
  ]);
  if (websiteInput && userData.website) {
    websiteInput.value = String(userData.website);
    websiteInput.dispatchEvent(new Event('input', { bubbles: true }));
    websiteInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  console.log('[ATS] Form filled successfully');
}

// Upload resume
async function uploadResume(resumeBlob: Blob, fileName: string) {
  console.log('[ATS] Uploading resume:', fileName);

  // Find resume input using multiple strategies
  const resumeInput =
    findInput([
      { selector: '#resume, #cv, input[name="resume"], input[name="cv"]' },
      { label: 'resume' },
      { label: 'cv' },
    ]) || (document.querySelector('input[type="file"][accept*="pdf"]') as HTMLInputElement);

  if (!resumeInput) {
    console.error('[ATS] Resume input not found');
    return false;
  }

  try {
    // Create a File object from the blob
    const file = new File([resumeBlob], fileName, { type: resumeBlob.type });

    // Create a DataTransfer to simulate file selection
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    resumeInput.files = dataTransfer.files;

    // Trigger change event
    resumeInput.dispatchEvent(new Event('change', { bubbles: true }));

    console.log('[ATS] Resume uploaded successfully');
    return true;
  } catch (error) {
    console.error('[ATS] Resume upload failed:', error);
    return false;
  }
}

// Handle simple checkbox CAPTCHA (skip complex image/puzzle CAPTCHAs)
async function handleSimpleCaptcha(): Promise<boolean> {
  console.log('[ATS] Checking for simple CAPTCHA...');

  // Only handle simple checkbox CAPTCHAs
  const checkboxCaptcha = document.querySelector(
    'input[type="checkbox"][id*="captcha" i], input[type="checkbox"][id*="recaptcha" i]'
  ) as HTMLInputElement;

  if (checkboxCaptcha && !checkboxCaptcha.checked) {
    console.log('[ATS] Found simple checkbox CAPTCHA, checking it');
    checkboxCaptcha.click();
    // Wait for checkbox to be checked (event-driven)
    await waitForCheckboxChecked(checkboxCaptcha, 2000);
    return true;
  }

  // Check for reCAPTCHA v2 checkbox (iframe-based)
  const recaptchaFrame = document.querySelector('iframe[src*="recaptcha"]');
  if (recaptchaFrame) {
    console.log('[ATS] Found reCAPTCHA iframe - skipping (requires manual solving)');
    return false;
  }

  console.log('[ATS] No simple CAPTCHA found or already checked');
  return true;
}

// Submit the form
async function submitForm() {
  console.log('[ATS] Submitting form');

  // Find the form
  const form = document.querySelector('form') as HTMLFormElement;
  if (!form) {
    console.error('[ATS] Form not found');
    return false;
  }

  // Check if form is valid
  if (!form.checkValidity()) {
    console.error('[ATS] Form validation failed');
    form.reportValidity();
    return false;
  }

  // Find submit button using multiple strategies
  const submitButton =
    (document.querySelector('button[type="submit"]') as HTMLButtonElement) ||
    (Array.from(document.querySelectorAll('button')).find(
      (btn) =>
        btn.textContent?.toLowerCase().includes('submit') ||
        btn.textContent?.toLowerCase().includes('apply')
    ) as HTMLButtonElement);

  if (submitButton) {
    submitButton.click();
  } else {
    // Fallback: submit the form directly
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }

  console.log('[ATS] Form submitted');
  return true;
}

// Notify background script that ATS page is ready
// function notifyBackgroundReady() {
//   const atsType = detectATSType();
//   if (atsType) {
//     console.log('[ATS] Notifying background that ATS page is ready:', atsType);
//     chrome.runtime.sendMessage({
//       type: 'ATS_PAGE_READY',
//       atsType,
//       url: window.location.href,
//     });
//   }
// }

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[ATS] Received message:', message.type);

  switch (message.type) {
    case 'FILL_ATS_FORM':
      autoFillForm(message.userData)
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true; // Keep channel open for async response

    case 'UPLOAD_RESUME':
      uploadResume(message.resumeBlob, message.fileName)
        .then((success) => sendResponse({ success }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case 'SUBMIT_ATS_FORM':
      // Handle CAPTCHA first, then submit
      handleSimpleCaptcha()
        .then(() => submitForm())
        .then((success) => sendResponse({ success }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case 'FILL_EXTERNAL_ATS': {
      // Clear the safety timeout since we received the command
      clearTimeout(safetyTimeout);
      fillCommandReceived = true;
      
      // Get jobId from message or URL
      const jobId = message.data?.jobId || extractJobIdFromUrl() || 'unknown';
      
      logger.log('ATS', `Received FILL_EXTERNAL_ATS for jobId=${jobId}, starting intelligent navigation...`);
      console.log('[ATS] Received FILL_EXTERNAL_ATS, starting intelligent navigation...');
      console.log('[ATS] Current URL:', window.location.href);
      console.log('[ATS] JobId:', jobId);
      
      intelligentNavigate()
        .then((result: NavigationResult | null) => {
          logger.log('ATS', 'intelligentNavigate result', result);
          console.log('[ATS] intelligentNavigate result:', result);
          
          // Safety check: ensure result is not null
          if (!result) {
            logger.error('ATS', 'intelligentNavigate returned null - this should not happen');
            console.error('[ATS] intelligentNavigate returned null');
            const errorMsg = 'Navigation returned null result';
            chrome.runtime.sendMessage({
              type: 'ATS_COMPLETE',
              data: { jobId, success: false, error: errorMsg },
            }).catch(() => {});
            sendResponse({ success: false, error: errorMsg });
            return;
          }
          
          // NEW ARCHITECTURE: Send ATS_COMPLETE with jobId
          if (result.success) {
            logger.log('ATS', 'External form filled successfully');
            console.log('[ATS] External form filled successfully');
            chrome.runtime.sendMessage({
              type: 'ATS_COMPLETE',
              data: { jobId, success: true },
            }).catch(() => {});
            sendResponse({ success: true });
          } else {
            logger.error('ATS', 'External form fill failed', { error: result.message });
            console.error('[ATS] External form fill failed:', result.message);
            chrome.runtime.sendMessage({
              type: 'ATS_COMPLETE',
              data: { jobId, success: false, error: result.message },
            }).catch(() => {});
            sendResponse({ success: false, error: result.message });
          }
        })
        .catch((error) => {
          logger.error('ATS', 'Error filling external form', error);
          console.error('[ATS] Error filling external form:', error);
          chrome.runtime.sendMessage({
            type: 'ATS_COMPLETE',
            data: { jobId, success: false, error: String(error) },
          }).catch(() => {});
          sendResponse({ success: false, error: String(error) });
        });
      return true; // Keep channel open for async response
    }

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
      return false;
  }
});

// DO NOT auto-initialize - wait for FILL_EXTERNAL_ATS message from background script
// This prevents race conditions where navigation happens before the background script
// can send the fill command, which would put the tab in back/forward cache and break messaging.
// The background script will send FILL_EXTERNAL_ATS after receiving the ready signal.
console.log('[ATS] Content script loaded, waiting for FILL_EXTERNAL_ATS command from background script');

// Safety timeout: If FILL_EXTERNAL_ATS doesn't arrive within 30 seconds, proceed anyway
// This handles edge cases where the background script fails or message is lost
let fillCommandReceived = false;
const safetyTimeout = setTimeout(() => {
  if (!fillCommandReceived) {
    logger.log('ATS', 'WARNING: FILL_EXTERNAL_ATS not received within 30s, proceeding anyway');
    console.warn('[ATS] FILL_EXTERNAL_ATS not received within 30 seconds, proceeding with intelligent navigation...');
    
    // Proceed with intelligent navigation as fallback
    intelligentNavigate()
      .then((result: NavigationResult) => {
        logger.log('ATS', 'intelligentNavigate result (fallback)', result);
        console.log('[ATS] intelligentNavigate result (fallback):', result);
        
          const jobId = extractJobIdFromUrl() || 'unknown';
          if (result.success) {
            logger.log('ATS', 'External form filled successfully (fallback)');
            console.log('[ATS] External form filled successfully (fallback)');
            chrome.runtime.sendMessage({
              type: 'ATS_COMPLETE',
              data: { jobId, success: true },
            }).catch(() => {});
} else {
            logger.error('ATS', 'External form fill failed (fallback)', result.message);
            console.error('[ATS] External form fill failed (fallback):', result.message);
            chrome.runtime.sendMessage({
              type: 'ATS_COMPLETE',
              data: { jobId, success: false, error: result.message || 'Timeout waiting for fill command' },
            }).catch(() => {});
          }
      })
      .catch((error) => {
        logger.error('ATS', 'Error filling external form (fallback)', error);
        console.error('[ATS] Error filling external form (fallback):', error);
            const jobId = extractJobIdFromUrl() || 'unknown';
            chrome.runtime.sendMessage({
              type: 'ATS_COMPLETE',
              data: { jobId, success: false, error: `Timeout: ${String(error)}` },
            }).catch(() => {});
      });
  }
}, 30000); // 30 second timeout

export { };
