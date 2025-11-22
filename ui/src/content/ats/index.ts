/**
 * Universal ATS Content Script
 * Handles auto-filling and submitting application forms across all ATS platforms
 * (Greenhouse, Workday, Lever, iCIMS, Taleo, Motion Recruitment, etc.)
 *
 * Features:
 * - Auto-closes cookie consent modals
 * - Finds and clicks "Apply" buttons
 * - Detects application forms dynamically
 * - Handles simple checkbox CAPTCHA only
 * - Skips complex image/puzzle CAPTCHAs
 */

console.log('[Jobzippy] Universal ATS content script loaded');

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
        (buttons[0] as HTMLElement).click();
        await new Promise((resolve) => setTimeout(resolve, 500));
        return true;
      }
    } catch (error) {
      // Continue to next selector
    }
  }

  return false;
}

// Find and click "Apply" button
async function findAndClickApplyButton(): Promise<boolean> {
  console.log('[ATS] Looking for Apply button...');

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
        await new Promise((resolve) => setTimeout(resolve, 1000));
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

// Initialize: close modals, find apply button, detect form
async function initialize() {
  console.log('[ATS] Initializing...');

  // Step 1: Close any modals
  await closeModals();

  // Step 2: Check if form is already visible
  if (detectApplicationForm()) {
    console.log('[ATS] Application form detected');
    notifyBackgroundReady();
    return;
  }

  // Step 3: Try to find and click Apply button
  const clicked = await findAndClickApplyButton();

  if (clicked) {
    // Wait for form to appear
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (detectApplicationForm()) {
      console.log('[ATS] Application form detected after clicking Apply');
      notifyBackgroundReady();
    }
  }
}

// Detect ATS type
const detectATSType = (): string | null => {
  const url = window.location.hostname;
  const body = document.body;

  // Check for known ATS platforms
  if (url.includes('greenhouse.io') || body.getAttribute('data-ats-type') === 'greenhouse') {
    return 'greenhouse';
  }
  if (url.includes('myworkdayjobs.com') || url.includes('workday.com')) {
    return 'workday';
  }
  if (url.includes('lever.co')) {
    return 'lever';
  }
  if (url.includes('icims.com')) {
    return 'icims';
  }
  if (url.includes('taleo.net')) {
    return 'taleo';
  }
  if (
    url.includes('motionrecruitment.com') ||
    body.getAttribute('data-ats-type') === 'motion-recruitment'
  ) {
    return 'motion-recruitment';
  }

  // Generic detection
  if (detectApplicationForm()) {
    return 'generic';
  }

  return null;
};

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
async function autoFillForm(userData: any) {
  console.log('[ATS] Auto-filling form with user data');

  // Fill first name
  const firstNameInput = findInput([
    { selector: '#first_name, #firstName, input[name="first_name"], input[name="firstName"]' },
    { autocomplete: 'given-name' },
    { label: 'first name' },
  ]);
  if (firstNameInput && userData.firstName) {
    firstNameInput.value = userData.firstName;
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
    lastNameInput.value = userData.lastName;
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
    emailInput.value = userData.email;
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
    phoneInput.value = userData.phone;
    phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
    phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Fill LinkedIn
  const linkedinInput = findInput([
    { selector: '#linkedin, input[name="linkedin"]' },
    { label: 'linkedin' },
  ]);
  if (linkedinInput && userData.linkedin) {
    linkedinInput.value = userData.linkedin;
    linkedinInput.dispatchEvent(new Event('input', { bubbles: true }));
    linkedinInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Fill website
  const websiteInput = findInput([
    { selector: '#website, input[name="website"]' },
    { label: 'website' },
  ]);
  if (websiteInput && userData.website) {
    websiteInput.value = userData.website;
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
    await new Promise((resolve) => setTimeout(resolve, 500));
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
function notifyBackgroundReady() {
  const atsType = detectATSType();
  if (atsType) {
    console.log('[ATS] Notifying background that ATS page is ready:', atsType);
    chrome.runtime.sendMessage({
      type: 'ATS_PAGE_READY',
      atsType,
      url: window.location.href,
    });
  }
}

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

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
      return false;
  }
});

// Run initialization on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  // DOM already loaded
  initialize();
}

export {};
