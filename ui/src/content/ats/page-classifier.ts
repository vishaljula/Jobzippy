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
  // IMPORTANT: Skip this check for elements outside the viewport (below/above fold)
  // They're still valid form fields, just need scrolling to interact with them
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  // Check if element is in viewport
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

  const isInViewport =
    centerY >= 0 && centerY <= viewportHeight && centerX >= 0 && centerX <= viewportWidth;

  // Only do the elementsFromPoint check if element is in viewport
  // Elements outside viewport are still "visible" (just need scrolling)
  if (isInViewport) {
    // elementsFromPoint returns an array from TOP (z-index) to BOTTOM
    const elementsAtPoint = document.elementsFromPoint(centerX, centerY);

    if (elementsAtPoint.length === 0) return false; // Shouldn't happen if in viewport

    const topElement = elementsAtPoint[0];
    if (!topElement) return false;

    // Check if element is actually clickable (not covered by modal/overlay)
    const isClickable = el.contains(topElement) || topElement.contains(el);
    if (!isClickable) return false;
  }

  // Element passed all checks (or is outside viewport but otherwise visible)
  return true;
}

// Map the old function name to the new robust one
const isElementVisible = isTrulyVisible;

/**
 * Extract label text and error message for a form element
 * Uses recursive parent chain traversal to find sibling labels
 * Supports modern UI frameworks (Material-UI, Gem, etc.)
 */
function extractLabelAndError(
  element: HTMLElement,
  maxDepth = 4
): { labelText: string; errorText: string } {
  let labelText = '';
  let errorText = '';

  // 1. Check direct associations first (fastest)
  // SKIP for radio buttons - their direct label is usually just "Yes"/"No"
  // We want to find the actual question text in parent siblings
  const isRadio = element instanceof HTMLInputElement && element.type === 'radio';

  if (element.id && !isRadio) {
    const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    if (label) {
      let rawText = label.textContent?.trim() || '';
      // Deduplicate: some frameworks (e.g. LinkedIn) render TWO identical spans inside a label
      // (one aria-hidden, one visually-hidden), causing textContent to repeat the question twice.
      // Detect the exact-half-repeat pattern and use only the first half.
      if (rawText.length > 0 && rawText.length % 2 === 0) {
        const half = rawText.length / 2;
        if (rawText.substring(0, half) === rawText.substring(half)) {
          rawText = rawText.substring(0, half);
        }
      }
      labelText = rawText;
    }
  }

  // 2. Check aria-label
  if (!labelText) {
    labelText = element.getAttribute('aria-label') || '';
  }

  // 3. Check placeholder (lower priority)
  if (
    !labelText &&
    (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)
  ) {
    const placeholder = element.placeholder || '';
    // Only use placeholder if it looks like a question (not just a hint)
    if (placeholder.length > 10 || placeholder.includes('?')) {
      labelText = placeholder;
    }
  }

  // 4. Traverse parent chain looking for sibling labels and error messages
  let current: HTMLElement | null = element;
  let depth = 0;

  while (current && depth < maxDepth) {
    if (current.parentElement) {
      const siblings = Array.from(current.parentElement.children) as HTMLElement[];

      for (const sibling of siblings) {
        if (sibling === current) continue;

        const tag = sibling.tagName.toLowerCase();

        // Check for label/legend siblings
        // SKIP for radio buttons - their sibling labels are usually just "Yes"/"No"
        if (!labelText && (tag === 'label' || tag === 'legend') && !isRadio) {
          const text = sibling.textContent?.trim() || '';
          if (text && text.length < 300) {
            labelText = text;
          }
        }

        // Check for span/div/p/h* siblings with question text (common in modern frameworks)
        if (!labelText && ['span', 'div', 'p', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
          const text = sibling.textContent?.trim() || '';

          // Skip if this looks like an error message
          const classList = Array.from(sibling.classList);
          const isErrorElement = classList.some(
            (c) =>
              c.includes('error') ||
              c.includes('help') ||
              c.includes('invalid') ||
              c.includes('warning')
          );

          // Skip common error message patterns
          const lowerText = text.toLowerCase();
          const isErrorMessage =
            lowerText.startsWith('please ') ||
            lowerText.includes('required') ||
            lowerText.includes('must ') ||
            lowerText.includes('invalid') ||
            lowerText.includes('error');

          // Must have text, not too long, not an error, and look like a label
          if (text && text.length > 3 && text.length < 300 && !isErrorElement && !isErrorMessage) {
            // Prefer text with question marks, colons, or asterisks (required indicator)
            if (text.includes('?') || text.endsWith(':') || text.includes('*')) {
              labelText = text;
            }
            // Otherwise, save as fallback if we don't find anything better
            else if (!labelText && text.length < 100) {
              // Check if it looks like a label (not a paragraph of text)
              const wordCount = text.split(/\s+/).length;
              if (wordCount < 20) {
                // Reasonable label length
                labelText = text;
              }
            }
          }
        }

        // Check for error/help text siblings
        if (!errorText) {
          const classList = Array.from(sibling.classList);
          const hasErrorClass = classList.some(
            (c) =>
              c.includes('error') ||
              c.includes('help') ||
              c.includes('invalid') ||
              c.includes('warning')
          );

          if (hasErrorClass) {
            const text = sibling.textContent?.trim() || '';
            if (text && text.length < 200) {
              errorText = text;
            }
          }
        }

        // If we found both, we can stop
        if (labelText && errorText) break;
      }
    }

    // If we found both, no need to go deeper
    if (labelText && errorText) break;

    current = current.parentElement;
    depth++;
  }

  // 5. Special handling for radio groups
  if (!labelText && element instanceof HTMLInputElement && element.type === 'radio') {
    // First try fieldset/legend (traditional approach)
    const fieldset = element.closest('fieldset');
    if (fieldset) {
      const legend = fieldset.querySelector('legend');
      if (legend) {
        labelText = legend.textContent?.trim() || '';
      }
    }

    // If no fieldset, look for question text in parent siblings
    // Skip the direct label (which is usually just "Yes"/"No")
    if (!labelText) {
      let parent = element.parentElement;
      console.log('[Radio Label] Starting parent traversal for radio button');
      for (let depth = 0; depth < 5 && parent && !labelText; depth++) {
        console.log(`[Radio Label] Depth ${depth}, parent:`, parent.className || parent.tagName);
        if (parent.parentElement) {
          const siblings = Array.from(parent.parentElement.children) as HTMLElement[];
          console.log(`[Radio Label] Found ${siblings.length} siblings at depth ${depth}`);

          // CRITICAL FIX: Check PRECEDING siblings first (where question text usually is)
          // In Gem UI, the question text appears in a sibling BEFORE the radio buttons container
          const parentIndex = siblings.indexOf(parent);
          const precedingSiblings = siblings.slice(0, parentIndex).reverse(); // Reverse to check closest first
          const followingSiblings = siblings.slice(parentIndex + 1);

          // Check preceding siblings first (most likely to contain question)
          for (const sibling of precedingSiblings) {
            // Check the sibling itself AND its descendants for question text
            const elementsToCheck = [
              sibling,
              ...Array.from(sibling.querySelectorAll('span, div, p, h3, h4, h5, h6')),
            ];

            for (const elem of elementsToCheck) {
              const tag = elem.tagName.toLowerCase();
              if (['span', 'div', 'p', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
                const text = elem.textContent?.trim() || '';

                // Skip error messages
                const classList = Array.from(elem.classList);
                const isError = classList.some((c) => c.includes('error') || c.includes('help'));

                console.log(
                  `[Radio Label] Checking preceding <${tag}>: "${text.substring(0, 50)}...", isError: ${isError}`
                );

                // Must be a question (has ? or * or :) and not an error
                if (text && text.length > 10 && !isError) {
                  if (text.includes('?') || text.includes('*') || text.endsWith(':')) {
                    console.log(
                      `[Radio Label] ✓ Found question text in preceding sibling: "${text}"`
                    );
                    labelText = text;
                    break;
                  }
                }
              }
            }

            if (labelText) break;
          }

          // If not found in preceding siblings, check following siblings
          if (!labelText) {
            for (const sibling of followingSiblings) {
              const elementsToCheck = [
                sibling,
                ...Array.from(sibling.querySelectorAll('span, div, p, h3, h4, h5, h6')),
              ];

              for (const elem of elementsToCheck) {
                const tag = elem.tagName.toLowerCase();
                if (['span', 'div', 'p', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
                  const text = elem.textContent?.trim() || '';

                  const classList = Array.from(elem.classList);
                  const isError = classList.some((c) => c.includes('error') || c.includes('help'));

                  console.log(
                    `[Radio Label] Checking following <${tag}>: "${text.substring(0, 50)}...", isError: ${isError}`
                  );

                  if (text && text.length > 10 && !isError) {
                    if (text.includes('?') || text.includes('*') || text.endsWith(':')) {
                      console.log(
                        `[Radio Label] ✓ Found question text in following sibling: "${text}"`
                      );
                      labelText = text;
                      break;
                    }
                  }
                }
              }

              if (labelText) break;
            }
          }
        }
        parent = parent.parentElement;
      }
    }

    // Add options to the label text
    if (labelText) {
      // Find all radio buttons in the same group
      const radioName = element.name;
      let radios: NodeListOf<HTMLInputElement> | undefined;

      if (radioName) {
        // Group by name
        radios = document.querySelectorAll(`input[type="radio"][name="${CSS.escape(radioName)}"]`);
      } else {
        // Group by parent container
        let parent = element.parentElement;
        for (let i = 0; i < 4 && parent; i++) {
          const radiosInParent = parent.querySelectorAll('input[type="radio"]');
          if (radiosInParent.length > 1) {
            radios = radiosInParent as NodeListOf<HTMLInputElement>;
            break;
          }
          parent = parent.parentElement;
        }
      }

      // Extract option labels
      if (radios && radios.length > 0) {
        const options: string[] = [];
        radios.forEach((r) => {
          const id = r.id;
          if (id) {
            const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
            if (lbl?.textContent) {
              const optionText = lbl.textContent.trim();
              // Only add if it's a short option (not the full question)
              if (optionText.length < 50 && !options.includes(optionText)) {
                options.push(optionText);
              }
            }
          }
        });

        if (options.length > 0) {
          labelText = `${labelText} [Options: ${options.join(', ')}]`;
        }
      }
    }
  }

  // 6. For radio buttons without fieldset, check if label contains the question
  // This is now handled above, so we can simplify this section
  if (!labelText && element instanceof HTMLInputElement && element.type === 'radio' && element.id) {
    const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    if (label) {
      const labelText = label.textContent?.trim() || '';
      // Only use if it looks like a full question (not just "Yes"/"No")
      if (labelText.length > 10 || labelText.includes('?')) {
        return { labelText, errorText };
      }
    }
  }

  return {
    labelText: labelText.trim(),
    errorText: errorText.trim(),
  };
}

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

  // Select all candidate elements (including ARIA combobox for custom dropdowns)
  const candidates = container.querySelectorAll(
    'input, select, textarea, button, a, [role="combobox"]'
  );

  candidates.forEach((node) => {
    const element = node as HTMLElement;
    const tagName = element.tagName.toLowerCase();
    const type = (element as HTMLInputElement).type;

    // Special handling for Radio Buttons (often hidden for custom styling)
    if (tagName === 'input' && type === 'radio') {
      // Check if this radio group has already been processed
      // Try grouping by name first, then by parent container
      const name = (element as HTMLInputElement).name;

      // Method 1: Group by name attribute (if present)
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

      // Method 2: Group by shared parent container (for radios without name)
      // Find the closest parent that contains multiple radio buttons
      if (!name) {
        let parent = element.parentElement;
        for (let i = 0; i < 4 && parent; i++) {
          const radiosInParent = parent.querySelectorAll('input[type="radio"]');
          if (radiosInParent.length > 1) {
            // Check if we already processed a radio from this parent
            const alreadyProcessed = fields.some(
              (f) =>
                f.element instanceof HTMLInputElement &&
                f.element.type === 'radio' &&
                parent?.contains(f.element)
            );
            if (alreadyProcessed) {
              return; // Already processed this group
            }
            break; // Found the grouping parent, continue processing
          }
          parent = parent.parentElement;
        }
      }

      // Allow hidden radio buttons IF they have a visible label or container
      if (!isElementVisible(element)) {
        const label = element.id
          ? container.querySelector(`label[for="${CSS.escape(element.id)}"]`)
          : null;
        if (!label || !isElementVisible(label as HTMLElement)) {
          // If both input and label are hidden, skip it
          return;
        }
      }
    }
    // Special handling for File Inputs (often hidden with custom upload UI)
    else if (tagName === 'input' && type === 'file') {
      // Allow hidden file inputs IF they have a visible parent container
      // Modern UIs hide the native file input and show custom "Click to upload" UI
      if (!isElementVisible(element)) {
        // Check if parent container is visible (within 3 levels)
        let parent = element.parentElement;
        let foundVisibleParent = false;
        for (let i = 0; i < 3 && parent; i++) {
          if (isElementVisible(parent)) {
            foundVisibleParent = true;
            break;
          }
          parent = parent.parentElement;
        }
        if (!foundVisibleParent) {
          return; // Both input and parent container are hidden
        }
      }
    } else {
      // For non-radio, non-file elements, enforce strict visibility
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

      // Extract label and error for ALL fields (not just unknown)
      // This ensures fields detected by purpose (e.g., linkedin, email) also get labelText
      const { labelText, errorText } = extractLabelAndError(element);

      fields.push({
        type: elementType,
        purpose: inference.purpose,
        element,
        confidence: inference.confidence, // Dynamic confidence based on match quality
        selectors: ['inference-traversal'],
        labelText,
        errorText,
      });
    } else {
      // It's unknown. If it's an input/select/textarea OR ARIA combobox, we should still capture it
      // so the LLM can try to answer it based on labelText (which we can try to extract)
      const isFormControl =
        ['input', 'select', 'textarea'].includes(tagName) ||
        element.getAttribute('role') === 'combobox';

      if (isFormControl) {
        // Exclude buttons/links from 'unknown' catch-all
        // Exclude submit/hidden inputs (but NOT radio buttons)
        if (tagName === 'input') {
          if (['submit', 'button', 'image', 'hidden'].includes(type)) return;

          // RADIO BUTTON GROUPING: Skip duplicate radios from same group
          if (type === 'radio') {
            const name = (element as HTMLInputElement).name;

            // Method 1: Check by name
            if (
              name &&
              fields.some(
                (f) =>
                  f.element instanceof HTMLInputElement &&
                  f.element.type === 'radio' &&
                  f.element.name === name
              )
            ) {
              return; // Already processed this radio group
            }

            // Method 2: Check by parent container (for radios without name)
            if (!name) {
              let parent = element.parentElement;
              for (let i = 0; i < 4 && parent; i++) {
                const radiosInParent = parent.querySelectorAll('input[type="radio"]');
                if (radiosInParent.length > 1) {
                  const alreadyProcessed = fields.some(
                    (f) =>
                      f.element instanceof HTMLInputElement &&
                      f.element.type === 'radio' &&
                      parent?.contains(f.element)
                  );
                  if (alreadyProcessed) {
                    return; // Already processed this radio group
                  }
                  break;
                }
                parent = parent.parentElement;
              }
            }
          }
        }

        // Extract label text and error message using comprehensive traversal
        const { labelText, errorText } = extractLabelAndError(element);

        fields.push({
          type: getElementType(element),
          purpose: 'unknown',
          element,
          confidence: 0.5,
          selectors: ['catch-all'],
          labelText,
          errorText,
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

  // ARIA combobox (custom dropdowns)
  if (element.getAttribute('role') === 'combobox') return 'select';

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
  // NOTE: We intentionally do NOT have a generic "upload → resume" fallback here.
  // A bare "Optional Upload" label could be a cover letter, portfolio, or other doc.
  // Classifying it as 'resume' causes the resume PDF to be uploaded in the wrong field.
  // Instead, let it fall through to 'unknown' so it can be handled case-by-case.

  // 2. Contact Info
  // STRICTER PHONE CHECK: Prevent "Mobile Development" from matching "mobile"
  // Must match "phone", "cell", or "mobile" AND likely be contacting related

  // Phone Country Code detection
  if (
    hasAnyWord(['country code', 'phone country', 'dialing code']) ||
    (hasWord('country') && hasAnyWord(['code', 'prefix']))
  )
    return { purpose: 'phoneCountryCode', confidence: 0.9 };

  if (
    hasAnyWord(['phone', 'cell', 'telephone']) ||
    lowerText === 'mobile' ||
    lowerText === 'phone number' ||
    lowerText === 'telephone number' ||
    // Standalone 'number' only when it's a short isolated label (e.g. Liberty Mutual "Number")
    lowerText === 'number'
  )
    return { purpose: 'phone', confidence: 0.9 };
  if (hasWord('email')) return { purpose: 'email', confidence: 0.95 };

  // Middle name — must come BEFORE first/last checks to avoid substring conflicts
  if (lowerText.includes('middle name') || lowerText.includes('middle initial'))
    return { purpose: 'middleName', confidence: 0.95 };

  if (lowerText.includes('first name') || lowerText.includes('given name'))
    return { purpose: 'firstName', confidence: 0.95 };
  // IMPORTANT: Check 'full name' and 'legal name' BEFORE 'last name'.
  // Labels like "Full Legal Name (First & Last Name)" contain "last name" as a substring
  // in the parenthetical, which would misclassify them as lastName if checked first.
  if (lowerText.includes('full name') || lowerText.includes('legal name'))
    return { purpose: 'fullName', confidence: 0.95 };
  if (
    lowerText.includes('last name') ||
    lowerText.includes('family name') ||
    lowerText.includes('surname')
  )
    return { purpose: 'lastName', confidence: 0.95 };
  if (lowerText.includes('linkedin') || lowerText.includes('linked in'))
    return { purpose: 'linkedin', confidence: 0.9 };
  if (hasAnyWord(['website', 'portfolio', 'url'])) return { purpose: 'website', confidence: 0.85 };

  // 3. Address components
  if (
    lowerText.includes('street address') ||
    lowerText === 'address line 1' ||
    lowerText.includes('address line1') ||
    lowerText.includes('mailing address') ||
    lowerText === 'address 1' ||
    lowerText === 'addr1'
  )
    return { purpose: 'streetAddress', confidence: 0.95 };

  if (
    lowerText === 'city' ||
    lowerText === 'city *' ||
    lowerText.startsWith('city,') ||
    lowerText.endsWith(' city')
  )
    return { purpose: 'city', confidence: 0.9 };

  if (
    lowerText.includes('zip code') ||
    lowerText.includes('postal code') ||
    lowerText === 'zip' ||
    lowerText === 'postal'
  )
    return { purpose: 'zipCode', confidence: 0.95 };

  // State — placed before work_auth/exportControls which run after this block
  if (
    lowerText === 'state' ||
    lowerText === 'state *' ||
    lowerText.includes('state/province') ||
    lowerText.includes('province/state') ||
    lowerText === 'province'
  )
    return { purpose: 'state', confidence: 0.9 };

  // 4. Work & Education — Employer / Job Title
  if (hasAnyWord(['employer', 'current company', 'organization']) && lowerText.length <= 60)
    return { purpose: 'employer', confidence: 0.85 };

  if (
    (lowerText.includes('job title') ||
      lowerText.includes('current title') ||
      lowerText.includes('current position') ||
      lowerText === 'title' ||
      lowerText === 'position' ||
      lowerText === 'occupation') &&
    lowerText.length <= 60
  )
    return { purpose: 'jobTitle', confidence: 0.85 };

  // 5. Work & Education
  // Only classify as 'experience' if the text is short (e.g. "Years of experience", dropdown labels).
  // Long essay-style questions that mention "experience" (e.g. "Please describe your experience with React")
  // should stay as 'unknown' so the LLM can answer them properly.
  if (hasAnyWord(['experience', 'years']) && lowerText.length <= 60)
    return { purpose: 'experience', confidence: 0.85 };
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

    // Check for "Apply" button variations (common on job application forms)
    // These should be classified as 'submit' since they submit the application
    if (
      lowerText.includes('apply and save') ||
      lowerText.includes('apply without saving') ||
      lowerText.includes('apply now') ||
      (lowerText.startsWith('apply ') && lowerText.length < 30) // "Apply for this job", etc.
    ) {
      return { purpose: 'submit', confidence: 0.95 };
    }

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

  // IMPORTANT: textarea elements should NEVER be classified as short identity fields.
  // A textarea is designed for long-form text input (essay questions, descriptions, etc.).
  // firstName/lastName/fullName are always short single-line inputs.
  // If a textarea picks up a nearby "First Name" label from a sibling field's DOM context,
  // we must not misclassify it.
  const isTextarea = targetTag === 'textarea';
  const IDENTITY_PURPOSES = new Set(['firstName', 'lastName', 'fullName']);
  // File-type purposes must ONLY be assigned from direct element attributes (type=file, name*=resume).
  // Never assign them via sibling label traversal — otherwise text inputs next to a "Resume Upload"
  // field entry get classified as 'resume' and filled with the filename.
  const FILE_PURPOSES = new Set(['resume', 'coverLetter']);

  // First check if there is an explicit label[for] linked to this element
  // This is the strongest signal and should be checked globally first
  //
  // CRITICAL: If a label[for] IS found (even if purpose resolves to 'unknown'),
  // it means this element already has a semantically-scoped label. We set
  // hasExplicitLabel = true so the sibling traversal loop SKIPS scanning siblings at
  // depth > 0. Without this guard, the traversal climbs to the form root and picks up
  // NEIGHBORING fields' label text (e.g. "Email"), misclassifying unrelated inputs.
  let hasExplicitLabel = false;
  if (element.id) {
    const root = element.ownerDocument || document;
    // Escape ID for selector
    const escapedId = CSS.escape(element.id);
    const label = root.querySelector(`label[for="${escapedId}"]`);
    if (label && label.textContent?.trim()) {
      hasExplicitLabel = true; // Mark: this element's scope is already defined by label[for]
      const match = matchTextToPurpose(label.textContent, isTargetActionable);
      if (match.purpose !== 'unknown') {
        // Textareas cannot be identity fields - keep as unknown for LLM to handle
        if (isTextarea && IDENTITY_PURPOSES.has(match.purpose)) {
          return { purpose: 'unknown', confidence: 0.5 };
        }
        // Label match gets high confidence (0.9)
        return { purpose: match.purpose, confidence: Math.min(0.9, match.confidence) };
      }
      // Purpose is 'unknown' from label text (e.g. "Gender Pronouns", "Preferred Name").
      // Don't return yet — still check element's own attributes at depth 0 below.
      // But sibling traversal at depth > 0 will be blocked by hasExplicitLabel.
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
        // Textareas cannot be identity fields - skip if this match is an identity purpose
        if (isTextarea && IDENTITY_PURPOSES.has(match.purpose)) continue;

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
    //
    // KEY GUARD: If this element has an explicit label[for] association, skip sibling
    // scanning at depth > 0. The label[for] already scopes this field semantically.
    // Scanning siblings at higher depths finds OTHER fields' labels (cross-field contamination).
    // At depth 0 (element's immediate parent) we still scan — useful for inputs wrapped
    // directly beside their label without a label[for] (e.g. some older form patterns).
    if (current.parentElement && !(hasExplicitLabel && depth > 0)) {
      const siblings = Array.from(current.parentElement.children) as HTMLElement[];
      for (const sibling of siblings) {
        if (sibling === current) continue; // Skip self

        // Check if sibling is a label or legend or has text
        const siblingTag = sibling.tagName.toLowerCase();
        if (siblingTag === 'label' || siblingTag === 'legend') {
          const text = sibling.textContent || '';
          const match = matchTextToPurpose(text, isTargetActionable);
          // SAFETY: Never assign identity field purposes or file purposes from sibling text traversal.
          // Identity fields (firstName, lastName, fullName) must match via direct element
          // attributes or explicit label[for] only, to prevent cross-field contamination.
          // File purposes (resume, coverLetter) must match via element type/attributes only,
          // otherwise text inputs next to a Resume Upload section get misclassified.
          if (
            match.purpose !== 'unknown' &&
            !IDENTITY_PURPOSES.has(match.purpose) &&
            !FILE_PURPOSES.has(match.purpose)
          ) {
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
          if (
            match.purpose !== 'unknown' &&
            !IDENTITY_PURPOSES.has(match.purpose) &&
            !FILE_PURPOSES.has(match.purpose)
          ) {
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
            if (
              match.purpose !== 'unknown' &&
              !IDENTITY_PURPOSES.has(match.purpose) &&
              !FILE_PURPOSES.has(match.purpose)
            ) {
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
