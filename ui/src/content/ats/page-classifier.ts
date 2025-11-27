/**
 * Page Classifier Implementation
 * Analyzes DOM and classifies pages with confidence scoring
 */

import {
  PageType,
  FieldPurpose,
  ElementType,
  DetectedField,
  PageClassification,
  PAGE_TYPE_RULES,
  FIELD_PURPOSE_RULES,
  Indicator,
} from './classifier';
import { logger } from '../../lib/logger';

// ============================================================================
// FIELD DETECTION
// ============================================================================

/**
 * Detect all fields on the page and classify their purpose
 */
export function detectFields(container: Document | Element = document): DetectedField[] {
  const fields: DetectedField[] = [];

  // Detect each field purpose
  for (const [purpose, rules] of Object.entries(FIELD_PURPOSE_RULES)) {
    if (purpose === 'unknown') continue;

    for (const selector of rules.selectors) {
      const elements = container.querySelectorAll(selector);

      elements.forEach((element) => {
        // Skip if already detected
        if (fields.some((f) => f.element === element)) return;

        const field: DetectedField = {
          type: getElementType(element as HTMLElement),
          purpose: purpose as FieldPurpose,
          element: element as HTMLElement,
          confidence: rules.weight,
          selectors: [selector],
        };

        fields.push(field);
      });
    }
  }

  // Also detect select fields by their label text (for fields not caught by name/id selectors)
  const allSelects = container.querySelectorAll('select');
  allSelects.forEach((select) => {
    // Skip if already detected
    if (fields.some((f) => f.element === select)) return;

    // Find associated label
    const label = container.querySelector(`label[for="${select.id}"]`) ||
                  select.closest('.form-group')?.querySelector('label') ||
                  select.previousElementSibling as HTMLElement;
    
    if (label) {
      const labelText = (label.textContent || '').toLowerCase();
      
      // Detect purpose from label text
      let purpose: FieldPurpose = 'unknown';
      if (labelText.includes('work authorization') || labelText.includes('authorized to work')) {
        purpose = 'workAuth';
      } else if (labelText.includes('sponsor') || labelText.includes('visa') || labelText.includes('h1b')) {
        purpose = 'sponsorship';
      } else if (labelText.includes('clearance')) {
        purpose = 'clearance';
      } else if (labelText.includes('export') || labelText.includes('citizen') || labelText.includes('permanent resident')) {
        purpose = 'exportControls';
      } else if (labelText.includes('country')) {
        purpose = 'country';
      } else if (labelText.includes('previously applied') || labelText.includes('history with')) {
        purpose = 'previousApplication';
      } else if (labelText.includes('previously employed') || labelText.includes('ever been employed')) {
        purpose = 'previousEmployment';
      } else if (labelText.includes('conflict of interest')) {
        purpose = 'conflictOfInterest';
      }

      if (purpose !== 'unknown') {
        fields.push({
          type: 'select',
          purpose,
          element: select as HTMLElement,
          confidence: 0.7, // Lower confidence for label-based detection
          selectors: ['label-based'],
        });
      }
    }
  });

  // Also detect by text content for buttons/links
  const buttons = container.querySelectorAll('button, a');
  buttons.forEach((element) => {
    if (fields.some((f) => f.element === element)) return;

    const text = element.textContent?.toLowerCase() || '';
    const purpose = inferPurposeFromText(text);

    if (purpose !== 'unknown') {
      fields.push({
        type: element.tagName.toLowerCase() === 'button' ? 'button' : 'link',
        purpose,
        element: element as HTMLElement,
        confidence: 0.7,
        selectors: ['text-based'],
      });
    }
  });

  return fields;
}

/**
 * Get element type from HTML element
 */
function getElementType(element: HTMLElement): ElementType {
  const tagName = element.tagName.toLowerCase();

  if (tagName === 'input') {
    const type = (element as HTMLInputElement).type;
    if (type === 'file') return 'file';
    if (type === 'checkbox') return 'checkbox';
    return 'input';
  }

  if (tagName === 'button') return 'button';
  if (tagName === 'a') return 'link';
  if (tagName === 'select') return 'select';

  return 'input';
}

/**
 * Infer field purpose from text content
 */
function inferPurposeFromText(text: string): FieldPurpose {
  const lowerText = text.toLowerCase().trim();

  // Workday-style options: prioritize autofill, then manual, then last application
  if (lowerText.includes('autofill') || lowerText.includes('auto-fill') || lowerText.includes('auto fill')) return 'apply';
  if (lowerText.includes('apply manually') || lowerText.includes('manual')) return 'apply';
  if (lowerText.includes('use my last') || lowerText.includes('last application')) return 'apply';
  
  // Generic apply buttons
  if (lowerText.includes('apply')) return 'apply';
  if (lowerText.includes('submit')) return 'submit';
  if (lowerText.includes('close')) return 'close';
  if (lowerText.includes('skip')) return 'skip';
  if (lowerText.includes('guest') || lowerText.includes('continue without')) return 'guest';
  if (lowerText.includes('sign up') || lowerText.includes('create account')) return 'unknown'; // Handled by signup detection

  return 'unknown';
}

// ============================================================================
// PAGE CLASSIFICATION
// ============================================================================

/**
 * Classify the current page
 */
export function classifyPage(container: Document = document): PageClassification {
  logger.log('Classifier', 'Starting page classification...');
  console.log('[Classifier] Starting page classification...');
  console.log('[Classifier] Current URL:', container.location?.href || window.location.href);

  // Detect all fields first
  const allFields = detectFields(container);
  logger.log('Classifier', `Detected ${allFields.length} total fields`);
  console.log(`[Classifier] Detected ${allFields.length} total fields`);

  // Separate actions from form fields
  const actions = allFields.filter((f) =>
    ['apply', 'submit', 'close', 'skip', 'guest'].includes(f.purpose)
  );
  const formFields = allFields.filter(
    (f) => !['apply', 'submit', 'close', 'skip', 'guest'].includes(f.purpose)
  );

  logger.log('Classifier', `Found ${formFields.length} form fields and ${actions.length} actions`);
  console.log(`[Classifier] Found ${formFields.length} form fields and ${actions.length} actions`);

  // Gather metadata
  const metadata = {
    hasOverlay: checkForOverlay(container),
    hasPasswordField: allFields.some((f) => f.purpose === 'password'),
    hasFileUpload: allFields.some((f) => f.purpose === 'resume' || f.type === 'file'),
    hasMultipleInputs: formFields.filter((f) => f.type === 'input').length >= 3,
    formCount: container.querySelectorAll('form').length,
    modalCount: container.querySelectorAll('[role="dialog"], .modal, .popup').length,
  };

  logger.log('Classifier', 'Page metadata', metadata);
  console.log('[Classifier] Page metadata:', metadata);

  // Calculate confidence for each page type
  const scores: Array<{ type: PageType; confidence: number }> = [];

  for (const [pageType, rules] of Object.entries(PAGE_TYPE_RULES)) {
    if (pageType === 'unknown') continue;

    const confidence = calculateConfidence(rules.indicators, container);

    if (confidence >= rules.minConfidence) {
      scores.push({
        type: pageType as PageType,
        confidence,
      });
      logger.log('Classifier', `Page type ${pageType}: ${(confidence * 100).toFixed(1)}% confidence`);
      console.log(`[Classifier] Page type ${pageType}: ${(confidence * 100).toFixed(1)}% confidence`);
    }
  }

  // Sort by priority and confidence
  scores.sort((a, b) => {
    const priorityA = PAGE_TYPE_RULES[a.type].priority;
    const priorityB = PAGE_TYPE_RULES[b.type].priority;

    if (priorityA !== priorityB) {
      return priorityA - priorityB; // Lower priority number = higher priority
    }

    return b.confidence - a.confidence; // Higher confidence wins
  });

  // Return best match or unknown
  const bestMatch = scores[0];

  const result: PageClassification = {
    type: bestMatch?.type || 'unknown',
    confidence: bestMatch?.confidence || 0,
    fields: formFields,
    actions,
    metadata,
  };

  logger.log('Classifier', `Classification complete: ${result.type} (${(result.confidence * 100).toFixed(1)}%)`);
  console.log(`[Classifier] Classification complete: ${result.type} (${(result.confidence * 100).toFixed(1)}%)`);

  return result;
}

/**
 * Calculate confidence score for a set of indicators
 */
function calculateConfidence(indicators: Indicator[], container: Document): number {
  let totalWeight = 0;
  let matchedWeight = 0;

  for (const indicator of indicators) {
    totalWeight += indicator.weight;

    let matched = false;

    switch (indicator.type) {
      case 'selector':
        if (indicator.selectors) {
          matched = indicator.selectors.some((sel) => container.querySelector(sel) !== null);
        }
        break;

      case 'text':
      case 'attribute':
      case 'count':
      case 'combination':
        if (indicator.check) {
          matched = indicator.check(container);
        }
        break;
    }

    if (matched) {
      matchedWeight += indicator.weight;
    }
  }

  return totalWeight > 0 ? matchedWeight / totalWeight : 0;
}

/**
 * Check if page has an overlay (modal/popup)
 */
function checkForOverlay(container: Document): boolean {
  const overlays = container.querySelectorAll(
    '[role="dialog"], .modal, .popup, [data-automation-id*="popup"]'
  );

  for (const overlay of overlays) {
    const style = window.getComputedStyle(overlay as Element);
    if (style.position === 'fixed' || style.position === 'absolute') {
      return true;
    }
  }

  return false;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Find best action to take based on purpose
 */
export function findBestAction(
  classification: PageClassification,
  purpose: FieldPurpose
): DetectedField | undefined {
  const candidates = classification.actions.filter((a) => a.purpose === purpose);

  if (candidates.length === 0) return undefined;

  // Sort by confidence
  candidates.sort((a, b) => b.confidence - a.confidence);

  return candidates[0];
}

/**
 * Check if this is a simple checkbox CAPTCHA (not complex image puzzle)
 */
export function isSimpleCaptcha(classification: PageClassification): boolean {
  const captchaField = classification.fields.find((f) => f.purpose === 'captcha');

  if (!captchaField) return false;

  // Simple checkbox CAPTCHA
  if (captchaField.type === 'checkbox') return true;

  // Complex CAPTCHA (iframe-based)
  const hasIframe = document.querySelector('iframe[src*="recaptcha"], iframe[src*="captcha"]');
  if (hasIframe) return false;

  return true;
}

/**
 * Check if page has a guest/skip account option
 */
export function hasGuestOption(classification: PageClassification): boolean {
  return classification.actions.some((a) => a.purpose === 'guest' || a.purpose === 'skip');
}

/**
 * Log classification for debugging
 */
export function logClassification(classification: PageClassification): void {
  console.log('[Classifier] Page Classification:', {
    type: classification.type,
    confidence: `${(classification.confidence * 100).toFixed(1)}%`,
    fields: classification.fields.length,
    actions: classification.actions.map((a) => a.purpose),
    metadata: classification.metadata,
  });

  if (classification.fields.length > 0) {
    console.log(
      '[Classifier] Detected Fields:',
      classification.fields.map((f) => ({
        purpose: f.purpose,
        type: f.type,
        confidence: `${(f.confidence * 100).toFixed(1)}%`,
      }))
    );
  }
}
