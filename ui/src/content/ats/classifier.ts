/**
 * Dynamic Page Classification System
 * Intelligently classifies web pages and their elements for ATS automation
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type PageType =
  | 'modal' // Overlay/dialog (cookie consent, options modal)
  | 'form' // Application form on page
  | 'form_modal' // Application form inside modal
  | 'signup' // Account creation/login page
  | 'intermediate' // Page with Apply button (not final form)
  | 'captcha' // Page with CAPTCHA
  | 'unknown'; // Unrecognized page type

export type FieldPurpose =
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'email'
  | 'phone'
  | 'resume'
  | 'coverLetter'
  | 'experience'
  | 'linkedin'
  | 'website'
  | 'password'
  | 'captcha'
  | 'workAuth'
  | 'sponsorship'
  | 'clearance'
  | 'exportControls'
  | 'country'
  | 'phoneCountryCode'
  | 'previousApplication'
  | 'previousEmployment'
  | 'conflictOfInterest'
  | 'submit'
  | 'apply'
  | 'close'
  | 'skip'
  | 'guest'
  | 'edit'
  | 'unknown';

export type ElementType = 'input' | 'file' | 'checkbox' | 'button' | 'link' | 'select';

export interface DetectedField {
  type: ElementType;
  purpose: FieldPurpose;
  element: HTMLElement;
  confidence: number;
  selectors: string[]; // How we found it
  labelText?: string; // Question/label text for unknown fields (used by LLM)
  value?: string; // Optional value hint (e.g. for resume radios)
}

export interface PageClassification {
  type: PageType;
  confidence: number;
  fields: DetectedField[];
  actions: DetectedField[]; // Buttons/links
  metadata: {
    hasOverlay: boolean;
    hasPasswordField: boolean;
    hasFileUpload: boolean;
    hasMultipleInputs: boolean;
    formCount: number;
    modalCount: number;
  };
}

export interface ClassificationRule {
  indicators: Indicator[];
  minConfidence: number;
  priority: number; // Higher priority rules checked first
}

export interface Indicator {
  type: 'selector' | 'text' | 'attribute' | 'count' | 'combination';
  value?: string | number;
  selectors?: string[];
  weight: number;
  check?: (container: Document | Element) => boolean;
}

// ============================================================================
// CONFIGURABLE RULES
// ============================================================================

export const PAGE_TYPE_RULES: Record<PageType, ClassificationRule> = {
  // Application form inside a modal (check this BEFORE generic modal)
  form_modal: {
    priority: 1, // Higher priority than generic modal
    minConfidence: 0.7,
    indicators: [
      {
        type: 'combination',
        weight: 1.0,
        check: (doc) => {
          const hasModal = doc.querySelector('[role="dialog"], .modal, .popup, .modal-overlay');
          if (!hasModal) return false;

          // Count text inputs
          const textInputs =
            hasModal.querySelectorAll(
              'input[type="text"], input[type="email"], input[type="tel"], textarea'
            ).length || 0;

          // Count file inputs (resume uploads count as form fields)
          const fileInputs = hasModal.querySelectorAll('input[type="file"]').length || 0;

          // Check for LinkedIn Easy Apply indicators (Next/Submit/Review buttons with data attributes)
          const hasLinkedInDataAttrs = !!(
            doc.querySelector('[data-easy-apply-next-button]') ||
            doc.querySelector('[data-live-test-easy-apply-next-button]') ||
            doc.querySelector('[data-live-test-easy-apply-submit-button]') ||
            doc.querySelector('[data-live-test-easy-apply-review-button]')
          );

          // Check for any Next/Continue/Submit/Review button inside the modal (fallback)
          const buttons = hasModal.querySelectorAll('button, [role="button"]');
          let hasProgressionButton = false;
          buttons.forEach((btn) => {
            const text = (btn.textContent || '').toLowerCase();
            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (
              text.includes('next') ||
              text.includes('continue') ||
              text.includes('submit') ||
              text.includes('review') ||
              ariaLabel.includes('next') ||
              ariaLabel.includes('continue') ||
              ariaLabel.includes('submit') ||
              ariaLabel.includes('review')
            ) {
              hasProgressionButton = true;
            }
          });

          // Form modal if:
          // - has at least 2 text inputs, OR
          // - has at least 1 input (text or file) AND (LinkedIn data attrs OR progression button)
          const totalInputs = textInputs + fileInputs;
          const hasFormIndicators = hasLinkedInDataAttrs || hasProgressionButton;
          return textInputs >= 2 || (totalInputs >= 1 && hasFormIndicators);
        },
      },
    ],
  },

  // Cookie consent or options modal (generic, lower priority)
  modal: {
    priority: 2, // Lower priority than form_modal
    minConfidence: 0.6,
    indicators: [
      { type: 'selector', selectors: ['[role="dialog"]', '[aria-modal="true"]'], weight: 0.8 },
      {
        type: 'selector',
        selectors: ['.modal', '.popup', '.dialog', '[data-automation-id*="popup"]'],
        weight: 0.6,
      },
      {
        type: 'attribute',
        value: 'fixed',
        weight: 0.5,
        check: (doc) => {
          const elements = doc.querySelectorAll(
            '[style*="position: fixed"], [style*="position:fixed"]'
          );
          return elements.length > 0;
        },
      },
      {
        type: 'selector',
        selectors: ['button[aria-label*="Close" i]', '.close-button'],
        weight: 0.4,
      },
    ],
  },

  // Application form on the page
  form: {
    priority: 3,
    minConfidence: 0.8,
    indicators: [
      {
        type: 'selector',
        selectors: [
          'input[autocomplete="given-name"]',
          'input[name*="first" i]',
          'input[id*="first" i]',
        ],
        weight: 0.3,
      },
      {
        type: 'selector',
        selectors: [
          'input[autocomplete="family-name"]',
          'input[name*="last" i]',
          'input[id*="last" i]',
        ],
        weight: 0.3,
      },
      {
        type: 'selector',
        selectors: ['input[type="email"]', 'input[autocomplete="email"]'],
        weight: 0.3,
      },
      { type: 'selector', selectors: ['input[type="file"]', 'input[accept*="pdf"]'], weight: 0.4 },
      {
        type: 'count',
        value: 3,
        weight: 0.2,
        check: (doc) => {
          const inputs = doc.querySelectorAll(
            'input[type="text"], input[type="email"], input[type="tel"]'
          );
          return inputs.length >= 3;
        },
      },
    ],
  },

  // Account creation or login page
  signup: {
    priority: 4,
    minConfidence: 0.7,
    indicators: [
      { type: 'selector', selectors: ['input[type="password"]'], weight: 0.9 },
      {
        type: 'text',
        value: 'create account',
        weight: 0.7,
        check: (container) => {
          // Handle both Document (use body) and Element
          const root = container instanceof Document ? container.body : container;
          const text = root?.textContent?.toLowerCase() || '';
          return text.includes('create account') || text.includes('sign up');
        },
      },
    ],
  },

  // Intermediate page with Apply button
  intermediate: {
    priority: 5,
    minConfidence: 0.5,
    indicators: [
      {
        type: 'selector',
        selectors: ['button[aria-label*="Apply" i]', 'a[href*="apply"]'],
        weight: 0.7,
      },
      {
        type: 'text',
        value: 'apply',
        weight: 0.5,
        check: (doc) => {
          const buttons = Array.from(doc.querySelectorAll('button, a'));
          return buttons.some((btn) => btn.textContent?.toLowerCase().includes('apply'));
        },
      },
      {
        type: 'combination',
        weight: 0.3,
        check: (doc) => {
          // Has apply button but not a full form
          const hasApply = doc.querySelector('button[aria-label*="Apply" i], a[href*="apply"]');
          const hasForm =
            doc.querySelectorAll('input[type="text"], input[type="email"]').length >= 3;
          return !!(hasApply && !hasForm);
        },
      },
    ],
  },

  // CAPTCHA page
  captcha: {
    priority: 6,
    minConfidence: 0.8,
    indicators: [
      {
        type: 'selector',
        selectors: ['iframe[src*="recaptcha"]', 'iframe[src*="captcha"]'],
        weight: 0.9,
      },
      {
        type: 'selector',
        selectors: ['input[id*="captcha" i]', 'input[name*="captcha" i]'],
        weight: 0.7,
      },
      {
        type: 'text',
        value: 'captcha',
        weight: 0.5,
        check: (container) => {
          const root = container instanceof Document ? container.body : container;
          const text = root?.textContent?.toLowerCase() || '';
          return text.includes('captcha') || text.includes('verify you are human');
        },
      },
    ],
  },

  // Unknown page type
  unknown: {
    priority: 999,
    minConfidence: 0,
    indicators: [],
  },
};

// ============================================================================
// FIELD PURPOSE DETECTION RULES
// ============================================================================

export const FIELD_PURPOSE_RULES: Record<FieldPurpose, { selectors: string[]; weight: number }> = {
  firstName: {
    selectors: [
      'input[autocomplete="given-name"]',
      'input[name*="first" i]',
      'input[id*="first" i]',
      'input[placeholder*="first" i]',
    ],
    weight: 0.9,
  },

  lastName: {
    selectors: [
      'input[autocomplete="family-name"]',
      'input[name*="last" i]',
      'input[id*="last" i]',
      'input[placeholder*="last" i]',
    ],
    weight: 0.9,
  },

  email: {
    selectors: [
      'input[type="email"]',
      'input[autocomplete="email"]',
      'input[name*="email" i]',
      'input[id*="email" i]',
      // LinkedIn uses select dropdowns for email (pre-populated from profile)
      'select[name*="email" i]',
      'select[id*="email" i]',
    ],
    weight: 1.0,
  },

  phone: {
    selectors: [
      'input[type="tel"]',
      'input[autocomplete="tel"]',
      'input[name*="phone" i]',
      'input[id*="phone" i]',
    ],
    weight: 0.9,
  },

  phoneCountryCode: {
    selectors: [
      'select[name*="phone" i][name*="country" i]',
      'select[id*="phone" i][id*="country" i]',
      'select[name*="country" i][name*="code" i]',
      'select[autocomplete="tel-country-code"]',
    ],
    weight: 0.95,
  },

  // Combined full name field (e.g. "Full name")
  fullName: {
    selectors: [
      'input[name="fullName"]',
      'input[name*="full" i][name*="name" i]',
      'input[id*="full" i][id*="name" i]',
      'input[placeholder*="full name" i]',
    ],
    weight: 0.8,
  },

  resume: {
    selectors: [
      'input[type="file"][accept*="pdf"]',
      'input[name*="resume" i]',
      'input[id*="resume" i]',
      'input[name*="cv" i]',
    ],
    weight: 1.0,
  },

  coverLetter: {
    selectors: ['input[name*="cover" i]', 'textarea[name*="cover" i]', 'input[id*="cover" i]'],
    weight: 0.8,
  },

  linkedin: {
    selectors: [
      'input[name*="linkedin" i]',
      'input[id*="linkedin" i]',
      'input[placeholder*="linkedin" i]',
    ],
    weight: 0.9,
  },

  // Generic experience selector (e.g. "Years of experience")
  experience: {
    selectors: ['select[name*="experience" i]', 'select[id*="experience" i]'],
    weight: 0.8,
  },

  website: {
    selectors: [
      'input[type="url"]',
      'input[name*="website" i]',
      'input[id*="website" i]',
      'input[placeholder*="website" i]',
    ],
    weight: 0.8,
  },

  workAuth: {
    selectors: [
      'select[name*="work" i][name*="authorization" i]',
      'select[name*="work" i][name*="auth" i]',
      'select[id*="work" i][id*="authorization" i]',
      'select[id*="work" i][id*="auth" i]',
      'select[name*="authorization" i]',
      'select[id*="authorization" i]',
    ],
    weight: 0.9,
  },

  sponsorship: {
    selectors: [
      'select[name*="sponsor" i]',
      'select[name*="visa" i]',
      'select[id*="sponsor" i]',
      'select[id*="visa" i]',
      'select[name*="h1b" i]',
      'select[id*="h1b" i]',
    ],
    weight: 0.9,
  },

  clearance: {
    selectors: ['select[name*="clearance" i]', 'select[id*="clearance" i]'],
    weight: 0.8,
  },

  exportControls: {
    selectors: [
      'select[name*="export" i]',
      'select[id*="export" i]',
      'select[name*="citizen" i]',
      'select[id*="citizen" i]',
    ],
    weight: 0.8,
  },

  country: {
    selectors: ['select[name*="country" i]', 'select[id*="country" i]', 'select[name="country"]'],
    weight: 0.9,
  },

  previousApplication: {
    selectors: [
      'select[name*="previous" i][name*="application" i]',
      'select[name*="application" i]',
      'select[id*="previous" i][id*="application" i]',
    ],
    weight: 0.8,
  },

  previousEmployment: {
    selectors: [
      'select[name*="previous" i][name*="employment" i]',
      'select[name*="employment" i]',
      'select[id*="previous" i][id*="employment" i]',
    ],
    weight: 0.8,
  },

  conflictOfInterest: {
    selectors: ['select[name*="conflict" i]', 'select[id*="conflict" i]'],
    weight: 0.8,
  },

  password: {
    selectors: ['input[type="password"]'],
    weight: 1.0,
  },

  captcha: {
    selectors: [
      'input[id*="captcha" i]',
      'input[name*="captcha" i]',
      'input[type="checkbox"][id*="recaptcha" i]',
    ],
    weight: 0.9,
  },

  submit: {
    selectors: ['button[type="submit"]', 'button[aria-label*="submit" i]', 'input[type="submit"]'],
    weight: 1.0,
  },

  apply: {
    selectors: [
      'button[aria-label*="apply" i]',
      'a[href*="apply"]',
      'button[data-automation-id*="apply"]',
      'a[data-automation-id="autofillWithResume"]',
      'a[data-automation-id="applyManually"]',
      'a[data-automation-id="useMyLastApplication"]',
      'a[href*="autofill"]',
      'a[href*="manual"]',
      '.option-button',
      '.option-button.primary',
    ],
    weight: 0.9,
  },

  close: {
    selectors: [
      // LinkedIn-specific (most stable - data-test attributes rarely change)
      '[data-test-modal-close-btn]',
      // LinkedIn uses "Dismiss" for modal close buttons (aria-label pattern)
      '[role="dialog"] button[aria-label*="dismiss" i]',
      '.jobs-easy-apply-modal button[aria-label*="dismiss" i]',
      // LinkedIn class (combined with role to avoid false positives)
      '[role="dialog"] .artdeco-modal__dismiss',
      // Generic close patterns (fallback)
      'button[aria-label*="close" i]',
      'button[data-automation-id*="close"]',
      '.close-button',
      '.modal-close',
    ],
    weight: 0.8,
  },

  skip: {
    selectors: ['button[aria-label*="skip" i]', 'a[href*="skip"]'],
    weight: 0.7,
  },

  guest: {
    selectors: [
      'button[aria-label*="guest" i]',
      'a[href*="guest"]',
      'button[data-automation-id*="guest"]',
    ],
    weight: 0.9,
  },

  edit: {
    selectors: [
      'button[aria-label*="edit" i]', // Strong signal
      'a[href*="edit" i]',
      'button[name*="edit" i]',
      '.edit-button',
      '[data-control-name*="edit" i]',
    ],
    weight: 0.9,
  },

  unknown: {
    selectors: [],
    weight: 0,
  },
};
