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
  Indicator,
} from './classifier';
import { logger } from '../../lib/logger';

// ============================================================================
// FIELD DETECTION
// ============================================================================

/**
 * Check if an element is visible on the page via CSS properties.
 *
 * NOTE: We intentionally do NOT check getBoundingClientRect in the main path because:
 * - It returns zeros in background tabs (breaks background execution)
 * - We use it as a fallback only when offsetParent check might give false negatives
 *
 * We DO recursively check parent visibility because:
 * - Multi-step forms hide inactive steps via parent container display:none
 * - Multiple templates in the DOM hide inactive templates the same way
 */
/**
 * Check if an element is truly visible (top-most layer) using elementsFromPoint.
 * This prevents clicking buttons hidden behind modals.
 *
 * "Check X Check Y" logic requested by user.
 */
function isTrulyVisible(el: HTMLElement): boolean {
  if (!el) return false;

  // 1. Check basic CSS visibility (display, visibility, opacity)
  const style = window.getComputedStyle(el);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.opacity === '0' ||
    style.clipPath === 'inset(100%)'
  ) {
    return false;
  }

  // 2. Check layout dimensions (bounding rect)
  const rect = el.getBoundingClientRect();

  // NOTE: In background tabs, Chrome returns 0 for dimensions.
  // We must allow this case to pass to support background scraping.
  if (rect.width === 0 && rect.height === 0) {
    // If we are in a background tab, we accept it if CSS check passed.
    // If we are in foreground, 0x0 means hidden.
    if (document.visibilityState === 'hidden') {
      return true;
    }
    return false;
  }

  // 3. "Check X Check Y" - Verify element is top-most at its center point
  // This detects elements covered by modals/overlays
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  // elementsFromPoint returns an array from TOP (z-index) to BOTTOM
  const elementsAtPoint = document.elementsFromPoint(centerX, centerY);

  if (elementsAtPoint.length === 0) return false; // Off-screen

  const topElement = elementsAtPoint[0];
  if (!topElement) return false;

  return el.contains(topElement) || topElement.contains(el);
}

// Map the old function name to the new robust one
const isElementVisible = isTrulyVisible;

/**
 * Result of purpose inference with confidence score
 */
type PurposeInference = {
  purpose: FieldPurpose;
  confidence: number;
};

/**
 * Detect all fields on the page and classify their purpose
 */
export function detectFields(container: Document | Element = document): DetectedField[] {
  const fields: DetectedField[] = [];

  // =========================================================================
  // SINGLE PASS STRATEGY
  // Iterate all potential form elements and infer purpose via traversal
  // =========================================================================

  // Select all candidate elements
  const candidates = container.querySelectorAll('input, select, textarea, button, a');

  candidates.forEach((node) => {
    const element = node as HTMLElement;
    const tagName = element.tagName.toLowerCase();
    const type = (element as HTMLInputElement).type;

    // Special handling for Radio Buttons (often hidden for custom styling)
    if (tagName === 'input' && type === 'radio') {
      // Check if this radio group has already been processed by name
      const name = (element as HTMLInputElement).name;
      if (
        name &&
        fields.some(
          (f) =>
            f.element instanceof HTMLInputElement &&
            f.element.type === 'radio' &&
            f.element.name === name
        )
      ) {
        return; // Already processed this group
      }

      // Allow hidden radio buttons IF they have a visible label or container
      // But we still prefer to use the FIRST visible radio if possible, so we might want to check visibility
      // logic: if invisible, check if parent/label is visible.
      // For now, if it's hidden, let's look for a visible label.
      if (!isElementVisible(element)) {
        const label = container.querySelector(`label[for="${element.id}"]`);
        if (!label || !isElementVisible(label as HTMLElement)) {
          // If both input and label are hidden, skip it
          return;
        }
      }
    } else {
      // For non-radio elements, enforce strict visibility
      if (!isElementVisible(element)) return;
    }

    // Infer purpose using the robust traversal logic
    const inference = inferPurposeFromElement(element);

    // If purpose found (or unknown input that needs LLM fallback)
    if (inference.purpose !== 'unknown') {
      const elementType = getElementType(element);

      // CRITICAL FIX: Don't allow links/buttons to be classified as data fields (like workAuth)
      // They should only be classified if they are actions (submit, apply, etc.)
      // This prevents "Read our Work Authorization Policy" links from being treated as fields.
      const isActionPurpose = ['submit', 'apply', 'close', 'skip', 'guest'].includes(
        inference.purpose
      );

      if ((elementType === 'link' || elementType === 'button') && !isActionPurpose) {
        return; // Skip non-action links/buttons
      }

      fields.push({
        type: elementType,
        purpose: inference.purpose,
        element,
        confidence: inference.confidence, // Dynamic confidence based on match quality
        selectors: ['inference-traversal'],
      });
    } else {
      // It's unknown. If it's an input/select/textarea, we should still capture it
      // so the LLM can try to answer it based on labelText (which we can try to extract)
      if (['input', 'select', 'textarea'].includes(tagName)) {
        // Exclude buttons/links from 'unknown' catch-all
        // Exclude submit/hidden inputs (but NOT radio buttons)
        if (tagName === 'input') {
          if (['submit', 'button', 'image', 'hidden'].includes(type)) return;
        }

        // Helper to extract text from label for LLM
        let labelText = '';

        // SPECIAL HANDLING FOR RADIO GROUPS: Get the question from FieldSet Legend
        if (type === 'radio') {
          const fieldset = element.closest('fieldset');
          if (fieldset) {
            const legend = fieldset.querySelector('legend');
            if (legend) {
              labelText = legend.innerText || legend.textContent || '';

              // Also grab the options for context
              const radioName = (element as HTMLInputElement).name;
              const allRadios = fieldset.querySelectorAll(
                `input[type="radio"][name="${CSS.escape(radioName)}"]`
              );
              const options: string[] = [];
              allRadios.forEach((r) => {
                const id = r.id;
                const lbl = container.querySelector(`label[for="${id}"]`);
                if (lbl && lbl.textContent) options.push(lbl.textContent.trim());
              });

              if (options.length > 0) {
                labelText = `${labelText.trim()} [Options: ${options.join(', ')}]`;
              }
            }
          }
        }

        if (!labelText && element.id) {
          const label = container.querySelector(`label[for="${element.id}"]`);
          if (label) labelText = label.textContent || '';
        }

        // If we found a group label for radio, use that as the purpose for inference check one last time?
        // No, inferPurposeFromElement should have caught it if it was "sponsorship".
        // But if inferPurposeFromElement missed it because it didn't look at the legend, we might want to retry here?
        // Actually, let's trust the catch-all to send it to LLM for now, as that was the specific user request.

        fields.push({
          type: getElementType(element),
          purpose: 'unknown',
          element,
          confidence: 0.5,
          selectors: ['catch-all'],
          labelText: labelText.trim(),
        });
      }
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
/**
 * Infer field purpose from text content with confidence scoring
 * @param text The text to analyze
 * @param isActionable Whether the target element is actionable (button/link). If false, skips action-related checks.
 * @returns Object with purpose and confidence (0.5-1.0)
 */
function matchTextToPurpose(
  text: string,
  isActionable: boolean = true
): { purpose: FieldPurpose; confidence: number } {
  const lowerText = text.toLowerCase().trim();

  // Helper for strict word boundary matching (prevents "easyapply" matching "apply")
  const hasWord = (word: string) => new RegExp(`\\b${word}\\b`, 'i').test(lowerText);
  // Helper for multiple words (OR condition)
  const hasAnyWord = (words: string[]) => words.some((w) => hasWord(w));

  // 1. Resume / CV / File Uploads
  if (hasAnyWord(['resume', 'cv', 'curriculum vitae']))
    return { purpose: 'resume', confidence: 0.95 };
  if (lowerText.includes('cover letter')) return { purpose: 'coverLetter', confidence: 0.95 };
  if (hasWord('upload') && !lowerText.includes('photo'))
    return { purpose: 'resume', confidence: 0.8 }; // Fallback for generic uploads often being resumes

  // 2. Contact Info
  // STRICTER PHONE CHECK: Prevent "Mobile Development" from matching "mobile"
  // Must match "phone", "cell", or "mobile" AND likely be contacting related

  // Phone Country Code detection
  if (
    hasAnyWord(['country code', 'phone country', 'dialing code']) ||
    (hasWord('country') && hasAnyWord(['code', 'prefix']))
  )
    return { purpose: 'phoneCountryCode', confidence: 0.9 };

  if (hasAnyWord(['phone', 'mobile number', 'cell number']) || lowerText === 'mobile')
    return { purpose: 'phone', confidence: 0.9 };
  if (hasWord('email')) return { purpose: 'email', confidence: 0.95 };
  if (lowerText.includes('first name') || lowerText.includes('given name'))
    return { purpose: 'firstName', confidence: 0.95 };
  if (
    lowerText.includes('last name') ||
    lowerText.includes('family name') ||
    lowerText.includes('surname')
  )
    return { purpose: 'lastName', confidence: 0.95 };
  if (lowerText.includes('full name')) return { purpose: 'fullName', confidence: 0.95 };
  if (lowerText.includes('linkedin') || lowerText.includes('linked in'))
    return { purpose: 'linkedin', confidence: 0.9 };
  if (hasAnyWord(['website', 'portfolio', 'url'])) return { purpose: 'website', confidence: 0.85 };

  // 3. Work & Education
  if (hasAnyWord(['experience', 'years'])) return { purpose: 'experience', confidence: 0.85 };
  if (hasAnyWord(['salary', 'compensation', 'pay'])) return { purpose: 'unknown', confidence: 0.5 }; // TODO: add salary purpose

  // 4. Compliance / Demographics
  if (lowerText.includes('work authorization') || lowerText.includes('authorized to work'))
    return { purpose: 'workAuth', confidence: 0.9 };
  if (hasAnyWord(['sponsor', 'visa', 'h1b'])) return { purpose: 'sponsorship', confidence: 0.9 };
  if (hasAnyWord(['clearance', 'security'])) return { purpose: 'clearance', confidence: 0.85 };
  if (hasAnyWord(['export', 'citizen', 'permanent resident']))
    return { purpose: 'exportControls', confidence: 0.85 };
  if (hasWord('country')) return { purpose: 'country', confidence: 0.8 }; // Generic country check AFTER phone country code

  // 5. History
  if (lowerText.includes('previously applied') || lowerText.includes('history with'))
    return { purpose: 'previousApplication', confidence: 0.9 };
  if (lowerText.includes('previously employed') || lowerText.includes('ever been employed'))
    return { purpose: 'previousEmployment', confidence: 0.9 };
  if (lowerText.includes('conflict of interest'))
    return { purpose: 'conflictOfInterest', confidence: 0.9 };

  // 6. Actions (Buttons/Links)
  // ONLY check these if the element is actually actionable (button/link)
  // This prevents inputs like "Are you willing to relocate?" being classified as 'apply' due to 'willing' or nearby text.
  if (isActionable) {
    // Higher confidence for exact action matches
    if (hasAnyWord(['autofill', 'auto-fill'])) return { purpose: 'apply', confidence: 0.95 };
    if (lowerText.includes('apply manually') || hasWord('manual'))
      return { purpose: 'apply', confidence: 0.9 };
    if (lowerText.includes('use my last') || lowerText.includes('last application'))
      return { purpose: 'apply', confidence: 0.9 };

    // Strict check for "Edit" buttons (must come before Apply/Review to prevent misclassification)
    if (lowerText === 'edit' || lowerText.startsWith('edit ') || hasWord('edit'))
      return { purpose: 'edit', confidence: 0.95 };

    // Strict check for simple "apply" keyword
    if (hasWord('apply') && !lowerText.includes('applying') && !lowerText.includes('application'))
      return { purpose: 'apply', confidence: 0.95 };

    if (hasAnyWord(['next', 'continue', 'review'])) return { purpose: 'apply', confidence: 0.9 };
    if (hasWord('submit')) return { purpose: 'submit', confidence: 0.95 };
    if (hasAnyWord(['close', 'dismiss'])) return { purpose: 'close', confidence: 0.9 };
    if (hasAnyWord(['skip', 'later'])) return { purpose: 'skip', confidence: 0.9 }; // Added 'later'
    if (hasWord('guest') || lowerText.includes('continue without'))
      return { purpose: 'guest', confidence: 0.9 };
  }

  // 7. Security
  if (hasWord('password')) return { purpose: 'password', confidence: 0.95 };
  if (hasWord('captcha') || hasWord('human')) return { purpose: 'captcha', confidence: 0.9 };

  return { purpose: 'unknown', confidence: 0.5 };
}

/**
 * Infer purpose from element attributes with limited parent recursion
 * "Check element attributes -> check parent -> check parent's parent -> STOP"
 */
/**
 * Infer purpose from element by checking attributes, labels, and nearby text.
 * Traverses up the DOM tree checking siblings at each level.
 * Returns both purpose and confidence score based on match quality.
 */
function inferPurposeFromElement(element: HTMLElement, maxDepth: number = 3): PurposeInference {
  let current: HTMLElement | null = element;
  let depth = 0;
  let bestMatch: PurposeInference = { purpose: 'unknown', confidence: 0.5 };

  // Determine if the *target* element is actionable
  const targetTag = element.tagName.toLowerCase();
  const targetType = (element as HTMLInputElement).type;

  const isTargetActionable =
    targetTag === 'button' ||
    targetTag === 'a' ||
    (targetTag === 'input' && ['submit', 'button', 'image', 'reset'].includes(targetType));

  // First check if there is an explicit label[for] linked to this element
  // This is the strongest signal and should be checked globally first
  if (element.id) {
    const root = element.ownerDocument || document;
    // Escape ID for selector
    const escapedId = CSS.escape(element.id);
    const label = root.querySelector(`label[for="${escapedId}"]`);
    if (label && label.textContent) {
      const match = matchTextToPurpose(label.textContent, isTargetActionable);
      if (match.purpose !== 'unknown') {
        // Label match gets high confidence (0.9)
        return { purpose: match.purpose, confidence: Math.min(0.9, match.confidence) };
      }
    }
  }

  while (current && depth < maxDepth) {
    // 1. Check current element attributes
    // (On first pass this is the element itself; on subsequent passes it's the wrapper)
    const attributesToCheck = [
      'name',
      'id',
      'aria-label',
      'placeholder',
      'data-automation-id',
      'data-test-id',
    ];
    for (const attr of attributesToCheck) {
      if (!current.getAttribute) continue;
      const value = (current.getAttribute(attr) || '').toLowerCase();
      if (!value) continue;

      const match = matchTextToPurpose(value, isTargetActionable);
      if (match.purpose !== 'unknown') {
        // Direct element match gets highest confidence
        let confidence =
          depth === 0 ? Math.min(0.95, match.confidence) : match.confidence * (1 - depth * 0.1);

        // Boost confidence for buttons with action purposes
        if (
          depth === 0 &&
          targetTag === 'button' &&
          ['submit', 'apply', 'close'].includes(match.purpose)
        ) {
          confidence = Math.min(1.0, confidence + 0.05);
        }

        if (confidence > bestMatch.confidence) {
          bestMatch = { purpose: match.purpose, confidence };
        }
      }
    }

    // 2. Check if current element IS a label/legend/button/link with meaningful text
    const tagName = current.tagName.toLowerCase();
    if (['label', 'legend', 'button', 'a'].includes(tagName)) {
      const text = current.textContent || '';
      const match = matchTextToPurpose(text, isTargetActionable);
      if (match.purpose !== 'unknown') {
        // Direct element text match - highest confidence for buttons
        let confidence =
          depth === 0 ? Math.min(1.0, match.confidence) : match.confidence * (1 - depth * 0.1);

        // CRITICAL: Button with submit/apply text gets 1.0 confidence
        if (depth === 0 && tagName === 'button' && ['submit', 'apply'].includes(match.purpose)) {
          confidence = 1.0;
        }

        // Links get slightly lower confidence than buttons for actions
        if (tagName === 'a' && ['submit', 'apply', 'close'].includes(match.purpose)) {
          confidence = Math.max(0.7, confidence - 0.15);
        }

        if (confidence > bestMatch.confidence) {
          bestMatch = { purpose: match.purpose, confidence };
        }
      }
    }

    // 3. Check SIBLINGS (from the perspective of the parent)
    // "Check siblings from the parent to see if there is a label or some indicator"
    if (current.parentElement) {
      const siblings = Array.from(current.parentElement.children) as HTMLElement[];
      for (const sibling of siblings) {
        if (sibling === current) continue; // Skip self

        // Check if sibling is a label or legend or has text
        const siblingTag = sibling.tagName.toLowerCase();
        if (siblingTag === 'label' || siblingTag === 'legend') {
          const text = sibling.textContent || '';
          const match = matchTextToPurpose(text, isTargetActionable);
          if (match.purpose !== 'unknown') {
            const confidence = match.confidence * (1 - depth * 0.1);
            if (confidence > bestMatch.confidence) {
              bestMatch = { purpose: match.purpose, confidence };
            }
          }
        }

        // Check if sibling contains a label
        const labelInSibling = sibling.querySelector('label, .label, .field-label');
        if (labelInSibling && labelInSibling.textContent) {
          const match = matchTextToPurpose(labelInSibling.textContent, isTargetActionable);
          if (match.purpose !== 'unknown') {
            const confidence = match.confidence * (1 - depth * 0.1);
            if (confidence > bestMatch.confidence) {
              bestMatch = { purpose: match.purpose, confidence };
            }
          }
        }

        // Check text content of sibling if it looks like a label wrapper (e.g. span)
        // Only if it has direct text content
        if (['span', 'div', 'p', 'h3', 'h4'].includes(siblingTag)) {
          const text = sibling.textContent || '';
          // Limit text length to avoid matching huge blocks of text
          if (text.length < 100) {
            const match = matchTextToPurpose(text, isTargetActionable);
            if (match.purpose !== 'unknown') {
              const confidence = match.confidence * (1 - depth * 0.15); // Slightly lower for generic text
              if (confidence > bestMatch.confidence) {
                bestMatch = { purpose: match.purpose, confidence };
              }
            }
          }
        }
      }
    }

    // Move up to parent
    current = current.parentElement;
    depth++;

    // Stop if we hit a container that likely groups multiple fields (to avoid associating wrong label)
    if (current && (current.tagName === 'FORM' || current.tagName === 'FIELDSET')) {
      if (depth >= 1) break; // Allow checking the fieldset itself vs its siblings
    }
  }

  // Return best match found (or unknown with low confidence)
  return bestMatch;
}

// ============================================================================
// PAGE CLASSIFICATION
// ============================================================================

/**
 * Classify the current page
 */
export function classifyPage(container: Document | Element = document): PageClassification {
  logger.log('Classifier', 'Starting page classification...');
  console.log('[Classifier] Starting page classification...');
  // Check location if container is Document (Element doesn't have location)
  const location = (container as Document).location?.href || window.location.href;
  console.log('[Classifier] Current URL:', location);

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
      logger.log(
        'Classifier',
        `Page type ${pageType}: ${(confidence * 100).toFixed(1)}% confidence`
      );
      console.log(
        `[Classifier] Page type ${pageType}: ${(confidence * 100).toFixed(1)}% confidence`
      );
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

  logger.log(
    'Classifier',
    `Classification complete: ${result.type} (${(result.confidence * 100).toFixed(1)}%)`
  );
  console.log(
    `[Classifier] Classification complete: ${result.type} (${(result.confidence * 100).toFixed(1)}%)`
  );

  return result;
}

/**
 * Calculate confidence score for a set of indicators
 */
function calculateConfidence(indicators: Indicator[], container: Document | Element): number {
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
          // Type guard to ensure we handle both Document and Element if needed,
          // usually these checks might need Document-specific methods, but often querySelector is enough.
          // For now cast to Document as most checks use querySelectorAll which exists on Element too.
          matched = indicator.check(container as Document);
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
function checkForOverlay(container: Document | Element): boolean {
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
