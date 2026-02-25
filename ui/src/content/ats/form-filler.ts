/**
 * Form Filler - Automatically fills job application forms
 * Uses the dynamic classifier's field detection and vault data
 *
 * Humanization: Uses jitter and proper event sequences for anti-detection
 * LLM Integration: Uses AI to answer unknown questions (batched for efficiency)
 */

import type { PageClassification, DetectedField } from './classifier';
import { logger } from '../../lib/logger';
import {
  jitter,
  humanType,
  setValue,
  humanSelect,
  humanToggle,
  attachFile,
  humanizeConfig,
} from '../../lib/humanize';
import {
  answerQuestionBatch,
  generateCoverLetter,
  tryAnswerLocally,
  type FormQuestion,
  type ResumeData,
} from '../../lib/llm-form-helper';
import { getLastValidationErrors } from './navigator';
import {
  isNarrativeField,
  makeFieldSignature,
  getFieldMemory,
  saveFieldMemory,
} from '../../lib/field-memory';

export interface FormFillerConfig {
  firstName: string;
  lastName: string;
  middleName?: string;
  email: string;
  phone: string;
  address?: string;
  streetAddress?: string;
  city?: string;
  zipCode?: string;
  state?: string;
  workAuth?: 'yes' | 'no';
  sponsorshipRequired?: boolean;
  linkedin?: string;
  website?: string;
  resumeFile?: File;
  // Employment context
  currentEmployer?: string;
  currentJobTitle?: string;
  // Job context for LLM
  jobTitle?: string;
  company?: string;
  jobDescription?: string;
  // Resume data for LLM
  resumeData?: ResumeData;
  // Control whether to skip pre-filled fields
  skipPreFilled?: boolean;
}

// Guard to prevent double-filling during the same session
let isCurrentlyFilling = false;

/**
 * Parse a flat address string into components.
 * Supports common US formats:
 *   "123 Main St, San Francisco, CA 94102"
 *   "123 Main St, San Francisco, CA"
 */
function parseAddressString(address: string): {
  streetAddress: string;
  city?: string;
  state?: string;
  zipCode?: string;
} {
  // Try: "<street>, <city>, <STATE> <zip>"
  const fullMatch = address.match(/^(.+?),\s*(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/);
  if (fullMatch) {
    return {
      streetAddress: fullMatch[1]!.trim(),
      city: fullMatch[2]!.trim(),
      state: fullMatch[3]!.trim(),
      zipCode: fullMatch[4]!.trim(),
    };
  }
  // Try: "<street>, <city>, <STATE>"
  const noZipMatch = address.match(/^(.+?),\s*(.+?),\s*([A-Z]{2})\s*$/);
  if (noZipMatch) {
    return {
      streetAddress: noZipMatch[1]!.trim(),
      city: noZipMatch[2]!.trim(),
      state: noZipMatch[3]!.trim(),
    };
  }
  // Fallback: treat whole address as street
  return { streetAddress: address };
}

/**
 * Attach a MutationObserver to a filled element to detect unexpected value resets.
 * Logs with stack trace so we can trace what caused the reset.
 */
function watchForValueReset(
  element: HTMLInputElement | HTMLTextAreaElement,
  context: string
): void {
  const expectedValue = element.value;
  if (!expectedValue) return;

  // Watch attribute changes (React may use defaultValue)
  const observer = new MutationObserver((mutations) => {
    for (const mut of mutations) {
      if (mut.type === 'attributes' && mut.attributeName === 'value') {
        const newAttrVal = (element as HTMLInputElement).getAttribute('value') || '';
        if (newAttrVal !== expectedValue) {
          console.warn(
            `[ValueWatch] 🔴 ATTRIBUTE value changed for "${context}": "${expectedValue}" → "${newAttrVal}"`,
            new Error('Stack trace').stack
          );
        }
      }
    }
  });
  observer.observe(element, { attributes: true, attributeFilter: ['value'] });

  // Also watch via input/change events to see if something programmatically clears it
  const inputHandler = (e: Event) => {
    if (element.value !== expectedValue && element.value === '') {
      console.warn(
        `[ValueWatch] 🔴 VALUE emptied via '${e.type}' for "${context}": was "${expectedValue}"`,
        new Error('Stack trace').stack
      );
    }
  };
  element.addEventListener('input', inputHandler, { capture: true });
  element.addEventListener('change', inputHandler, { capture: true });

  // Self-clean after 5s (form navigation should happen within that)
  setTimeout(() => {
    observer.disconnect();
    element.removeEventListener('input', inputHandler, { capture: true });
    element.removeEventListener('change', inputHandler, { capture: true });
  }, 5000);
}

// SnapshotEntry records what the LLM filled so we can diff on button click.
interface SnapshotEntry {
  originalValue: string; // what LLM filled
  signature: string; // field memory storage key
  questionText: string; // for narrative detection
  inputType: string; // for reading current value
}

export class FormFiller {
  private config: FormFillerConfig;
  private skipPreFilled: boolean;

  // Field memory: snapshot of LLM-filled elements for correction capture
  private llmFilledSnapshot = new Map<HTMLElement, SnapshotEntry>();
  private _captureListenerCleanup: (() => void) | null = null;

  constructor(config: FormFillerConfig) {
    this.config = config;
    // Default to true (skip pre-filled) for backward compatibility with orchestrator
    // Manual autofill should explicitly set this to false
    this.skipPreFilled = config.skipPreFilled ?? true;
  }

  /**
   * Fill all detected fields in the classification
   */
  async fillForm(classification: PageClassification): Promise<void> {
    // Prevent double-filling
    if (isCurrentlyFilling) {
      console.warn('[FormFiller] Already filling form, ignoring duplicate request');
      return;
    }
    isCurrentlyFilling = true;

    try {
      await this._doFillForm(classification);
    } finally {
      isCurrentlyFilling = false;
    }
  }

  private async _doFillForm(classification: PageClassification): Promise<void> {
    logger.log('FormFiller', `Starting form fill with ${classification.fields.length} fields`);
    console.log('[FormFiller] Starting form fill with', classification.fields.length, 'fields');
    logger.log('FormFiller', 'Page type', classification.type);
    logger.log('FormFiller', 'Page confidence', `${(classification.confidence * 100).toFixed(1)}%`);
    logger.log(
      'FormFiller',
      'Fields detected',
      classification.fields.map((f) => ({
        purpose: f.purpose,
        type: f.type,
        confidence: f.confidence,
        selector: f.selectors[0],
      }))
    );

    let filledCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const unknownFields: DetectedField[] = [];

    // PASS 1: Fill known fields and collect unknown ones
    for (const field of classification.fields) {
      try {
        logger.log('FormFiller', `Filling field: ${field.purpose}`, {
          type: field.type,
          selectors: field.selectors,
        });
        const fillResult = await this.fillField(field);
        if (fillResult === true) {
          filledCount++;
          // Add jitter between fields for human-like behavior
          if (humanizeConfig.enabled) {
            await jitter(300, 800); // Shorter jitter between fields
          }
        } else if (fillResult === 'unknown') {
          // Field needs LLM to answer
          unknownFields.push(field);
          skippedCount++;
        } else {
          skippedCount++;
        }
      } catch (error) {
        errorCount++;
        logger.error('FormFiller', `Error filling field: ${field.purpose}`, error);
        console.error('[FormFiller] Error filling field:', field.purpose, error);
      }
    }

    // PASS 2: Use LLM for unknown fields (batched for efficiency)
    if (unknownFields.length > 0 && this.config.resumeData) {
      logger.log('FormFiller', `Using LLM for ${unknownFields.length} unknown fields`);
      console.log('[FormFiller] Using LLM for', unknownFields.length, 'unknown fields');

      const llmFilled = await this.fillUnknownFieldsWithLLM(unknownFields, classification);
      filledCount += llmFilled;
      skippedCount -= llmFilled;
    }

    logger.log(
      'FormFiller',
      `Form fill complete: ${filledCount} filled, ${skippedCount} skipped, ${errorCount} errors`
    );
    console.log(
      `[FormFiller] Form fill complete: ${filledCount} filled, ${skippedCount} skipped, ${errorCount} errors`
    );
  }

  /**
   * Fill unknown fields using LLM (batched for efficiency)
   * Returns number of fields successfully filled
   */
  private async fillUnknownFieldsWithLLM(
    fields: DetectedField[],
    _classification: PageClassification
  ): Promise<number> {
    // Local answering only needs resumeData
    if (!this.config.resumeData) {
      logger.log('FormFiller', 'Skipping unknown fields - no resume data available');
      return 0;
    }

    // Extract job context from page if not provided in config
    // This enables LLM form filling in autofill mode
    let jobTitle = this.config.jobTitle;
    let company = this.config.company;
    let jobDescription = this.config.jobDescription;

    if (!jobTitle || !company) {
      const { extractJobContext } = await import('./job-context-extractor');
      const extractedContext = extractJobContext();

      // Config takes precedence over extracted context
      if (!jobTitle) jobTitle = extractedContext.jobTitle;
      if (!company) company = extractedContext.company;
      if (!jobDescription) jobDescription = extractedContext.jobDescription;

      logger.log('FormFiller', 'Using extracted job context', { jobTitle, company });
    }

    // Build questions list
    const questions: FormQuestion[] = [];
    const fieldMap = new Map<string, DetectedField>();
    let localFilledCount = 0;

    for (const field of fields) {
      const element = field.element as HTMLElement;
      if (!element) continue;

      // Get question text - prefer pre-computed labelText from classifier
      const questionText = field.labelText || this.findLabelText(element) || field.purpose || '';
      const inputType = this.getInputTypeForLLM(element);

      logger.log('FormFiller', `Processing unknown field: "${questionText.substring(0, 60)}..."`);
      console.log('[FormFiller] Unknown field:', {
        question: questionText.substring(0, 80),
        element: element.tagName,
        isSelect: element instanceof HTMLSelectElement,
        isCombobox: element.getAttribute('role') === 'combobox',
      });

      // Detect required from multiple sources (element, fieldset, labelText with *)
      const isRequired: boolean =
        (element as HTMLInputElement).required ||
        element.hasAttribute('required') ||
        element.getAttribute('aria-required') === 'true' ||
        element.closest('fieldset')?.hasAttribute('required') === true ||
        (field.labelText?.includes('*') ?? false);

      // ── FIELD MEMORY CHECK ────────────────────────────────────────────────
      // For non-narrative fields, check if the user previously corrected this
      // exact question. If so, use the stored answer and skip LLM entirely.
      if (!isNarrativeField(questionText, inputType)) {
        const signature = makeFieldSignature(questionText, inputType);
        const memorizedAnswer = await getFieldMemory(signature);
        if (memorizedAnswer !== null) {
          console.log(`[FieldMemory] Hit: "${signature}" → "${memorizedAnswer}"`);
          logger.log(
            'FormFiller',
            `Field memory hit: "${questionText.substring(0, 40)}" = "${memorizedAnswer}"`
          );
          const fillSuccess = await this.fillFieldWithValue(element, field.type, memorizedAnswer);
          if (fillSuccess) {
            localFilledCount++;
            continue;
          }
          // If fill failed, fall through to LLM
        }
      } else {
        console.log(`[FieldMemory] Skipping narrative field: "${questionText.substring(0, 60)}"`);
      }
      // ─────────────────────────────────────────────────────────────────────

      // Extract options - from select elements, ARIA comboboxes, or from labelText for radio buttons
      // Radio labelText format: "Question? * [Options: Yes, No]"
      let localOptions: string[] | undefined;
      if (element instanceof HTMLSelectElement) {
        localOptions = Array.from(element.options)
          .map((o) => o.textContent?.trim() || '')
          .filter(Boolean);
      } else if (element.getAttribute('role') === 'combobox') {
        // Open the ARIA combobox temporarily to read options from the DOM
        localOptions = await this.extractAriaComboboxOptions(element);
        logger.log(
          'FormFiller',
          `Extracted ${localOptions?.length ?? 0} options from ARIA combobox`
        );
      } else if (field.labelText?.includes('[Options:')) {
        const optionsMatch = field.labelText.match(/\[Options:\s*([^\]]+)\]/);
        if (optionsMatch && optionsMatch[1]) {
          localOptions = optionsMatch[1]
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean);
        }
      }

      // Try local answer first (rule-based classifiers, faster than LLM)
      const localAnswer = tryAnswerLocally(
        {
          fieldId:
            field.purpose && field.purpose !== 'unknown'
              ? field.purpose
              : `unknown_field_${questions.length}`,
          questionText,
          inputType,
          options: localOptions,
          isRequired,
        },
        this.config.resumeData!,
        { sponsorship_required: this.config.sponsorshipRequired }
      );

      if (localAnswer !== null) {
        logger.log('FormFiller', `Local answer found: "${localAnswer}"`);
        const fillSuccess = await this.fillFieldWithValue(element, field.type, localAnswer);
        if (fillSuccess) {
          localFilledCount++;
          logger.log('FormFiller', `Successfully filled field with local answer: "${localAnswer}"`);
          continue;
        } else {
          logger.log(
            'FormFiller',
            `Failed to fill field with local answer: "${localAnswer}", will try LLM`
          );
          // Fall through to LLM
        }
      }

      // Skip this unknown field if it already has a value (e.g. from a previous autofill run).
      // This prevents re-sending answered fields to the LLM, which could return a different answer.
      if (this.isFieldPreFilled(element)) {
        console.log(
          `[FormFiller] Skipping already-filled unknown field: "${questionText.substring(0, 60)}"`
        );
        localFilledCount++;
        continue;
      }

      // Use unique ID for unknown fields to prevent collision in fieldMap
      const fieldId =
        field.purpose && field.purpose !== 'unknown'
          ? field.purpose
          : `unknown_field_${questions.length}`;

      // Reuse localOptions for ARIA comboboxes (already opened above)
      let options: string[] | undefined;
      if (element instanceof HTMLSelectElement) {
        options = Array.from(element.options)
          .map((o) => o.textContent?.trim() || '')
          .filter(Boolean);
      } else if (element.getAttribute('role') === 'combobox') {
        options = localOptions;
      } else if (field.labelText?.includes('[Options:')) {
        const optionsMatch = field.labelText.match(/\[Options:\s*([^\]]+)\]/);
        if (optionsMatch && optionsMatch[1]) {
          options = optionsMatch[1]
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean);
        }
      }

      // Get validation error for this field if it exists
      const validationErrors = getLastValidationErrors();
      const validationError = validationErrors.get(element);
      const previousAnswer = validationError ? (element as HTMLInputElement).value : undefined;

      questions.push({
        fieldId,
        questionText,
        inputType,
        options,
        maxLength:
          (element as HTMLInputElement).maxLength > 0
            ? (element as HTMLInputElement).maxLength
            : undefined,
        isRequired,
        validationError,
        previousAnswer,
      });
      fieldMap.set(fieldId, field);
    }

    if (questions.length === 0) {
      return localFilledCount; // All answered locally (or skipped)
    }

    // Special handling for cover letter
    const coverLetterField = fields.find((f) => f.purpose === 'coverLetter');
    if (coverLetterField) {
      const element = coverLetterField.element as HTMLElement;
      if (element && jobDescription) {
        const coverLetter = await generateCoverLetter({
          jobTitle: jobTitle!,
          company: company || 'the company',
          jobDescription: jobDescription,
          resumeData: this.config.resumeData!,
        });
        if (coverLetter) {
          await this.fillFieldWithValue(element, coverLetterField.type, coverLetter);
          // Remove from questions
          const idx = questions.findIndex((q) => q.fieldId === 'coverLetter');
          if (idx >= 0) questions.splice(idx, 1);
        }
      }
    }

    if (questions.length === 0) {
      return fields.length; // All done
    }

    // Batch call to LLM for remaining questions
    console.log(
      '[FormFiller] Sending to LLM:',
      questions.map((q) => ({
        fieldId: q.fieldId,
        question: q.questionText.substring(0, 60),
        type: q.inputType,
        options: q.options,
      }))
    );
    const answers = await answerQuestionBatch({
      jobTitle: jobTitle!,
      company: company || 'the company',
      jobDescription: jobDescription,
      questions,
      resumeData: this.config.resumeData!,
    });

    console.log('[FormFiller] LLM answers:', answers);
    let filled = 0;
    for (const [fieldId, answer] of Object.entries(answers)) {
      const field = fieldMap.get(fieldId);
      if (!field) continue;

      const element = field.element as HTMLElement;
      if (!element) continue;

      try {
        const fillSuccess = await this.fillFieldWithValue(element, field.type, answer);
        if (fillSuccess) {
          filled++;
          logger.log('FormFiller', `Successfully filled LLM answer for: ${fieldId} = "${answer}"`);

          // ── SNAPSHOT for correction capture ──────────────────────────────
          // Find the original question for this field to check narrative later
          const matchedQuestion = questions.find((q) => q.fieldId === fieldId);
          if (
            matchedQuestion &&
            !isNarrativeField(matchedQuestion.questionText, matchedQuestion.inputType)
          ) {
            const signature = makeFieldSignature(
              matchedQuestion.questionText,
              matchedQuestion.inputType
            );
            this.llmFilledSnapshot.set(element, {
              originalValue: answer,
              signature,
              questionText: matchedQuestion.questionText,
              inputType: matchedQuestion.inputType,
            });
          }
          // ─────────────────────────────────────────────────────────────────
        } else {
          logger.log(
            'FormFiller',
            `Failed to fill LLM answer for: ${fieldId} = "${answer}" (no matching option)`
          );
        }
        if (humanizeConfig.enabled) {
          await jitter(300, 800);
        }
      } catch (error) {
        logger.error('FormFiller', `Error filling LLM answer for: ${fieldId}`, error);
      }
    }

    // ── ATTACH BUTTON-CLICK CAPTURE LISTENER ─────────────────────────────
    // After LLM fills are done, listen for ANY button click on the document.
    // This captures user corrections regardless of whether it's Next/Submit/Continue.
    if (this.llmFilledSnapshot.size > 0) {
      this.attachCaptureListener();
    }
    // ─────────────────────────────────────────────────────────────────────

    return filled + localFilledCount;
  }

  // ============================================================================
  // Field Memory — Correction Capture
  // ============================================================================

  /**
   * Attach a single document-level click listener (capture phase) that fires on
   * ANY button click after the LLM has filled fields.
   *
   * Gated on snapshot.size > 0 — so irrelevant clicks (before any LLM fill) are ignored.
   * The listener removes itself after the first capture to avoid accumulating handlers.
   * On multi-step forms each LLM-fill round reattaches it fresh.
   */
  private attachCaptureListener(): void {
    // Clean up any stale listener from a previous step
    if (this._captureListenerCleanup) {
      this._captureListenerCleanup();
      this._captureListenerCleanup = null;
    }

    const handler = (event: Event) => {
      const target = event.target as HTMLElement;
      // Only fire on button-like elements
      const isButton =
        target.tagName === 'BUTTON' ||
        target.closest('button') !== null ||
        (target instanceof HTMLInputElement &&
          (target.type === 'submit' || target.type === 'button')) ||
        target.getAttribute('role') === 'button';

      if (!isButton) return;
      if (this.llmFilledSnapshot.size === 0) return;

      console.log('[FieldMemory] Button click detected — capturing corrections...');
      // Run async without blocking the click
      void this.captureCorrections();
    };

    document.addEventListener('click', handler, { capture: true });

    this._captureListenerCleanup = () => {
      document.removeEventListener('click', handler, { capture: true });
    };

    console.log('[FieldMemory] Capture listener attached');
  }

  /**
   * Walk the LLM-filled snapshot, compare current field values to what we filled,
   * and save any meaningful corrections to field memory.
   * Clears the snapshot and removes the document listener after capture.
   */
  private async captureCorrections(): Promise<void> {
    // Remove listener first so re-entrant clicks don't re-trigger
    if (this._captureListenerCleanup) {
      this._captureListenerCleanup();
      this._captureListenerCleanup = null;
    }

    const snapshot = new Map(this.llmFilledSnapshot);
    this.llmFilledSnapshot.clear();

    for (const [element, entry] of snapshot) {
      try {
        const currentValue = this.readElementValue(element, entry.inputType);
        if (currentValue === null) continue;

        const originalTrimmed = entry.originalValue.trim().toLowerCase();
        const currentTrimmed = currentValue.trim().toLowerCase();

        // Skip if unchanged or only whitespace differs
        if (originalTrimmed === currentTrimmed) continue;
        // Skip if the field is now empty (user cleared it, not a correction)
        if (currentTrimmed.length === 0) continue;

        console.log(`[FieldMemory] Saving correction: "${entry.signature}" → "${currentValue}"`);
        await saveFieldMemory(entry.signature, currentValue);
      } catch (err) {
        console.error('[FieldMemory] Error capturing correction:', err);
      }
    }
  }

  /**
   * Read the current value of a field element in a uniform way across all types.
   */
  private readElementValue(element: HTMLElement, inputType: string): string | null {
    try {
      if (element instanceof HTMLInputElement) {
        if (inputType === 'checkbox') {
          return element.checked ? 'yes' : 'no';
        }
        if (inputType === 'radio') {
          // Find the checked radio in the same group
          const name = element.name;
          const form = element.closest('form') ?? document;
          const checked = name
            ? (form.querySelector(
                `input[type="radio"][name="${CSS.escape(name)}"]:checked`
              ) as HTMLInputElement | null)
            : null;
          if (checked) {
            // Prefer label text over raw value
            const label = checked.id
              ? document.querySelector(`label[for="${checked.id}"]`)
              : checked.closest('label');
            return label?.textContent?.trim() || checked.value || null;
          }
          return null;
        }
        return element.value;
      }

      if (element instanceof HTMLTextAreaElement) {
        return element.value;
      }

      if (element instanceof HTMLSelectElement) {
        const opt = element.options[element.selectedIndex];
        return opt ? opt.text.trim() || opt.value : element.value;
      }

      // ARIA combobox — read the displayed text from the combobox's input or textContent
      if (element.getAttribute('role') === 'combobox') {
        const input = element.querySelector('input') as HTMLInputElement | null;
        if (input) return input.value;
        return element.textContent?.trim() || null;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get input type for LLM question
   */
  private getInputTypeForLLM(element: HTMLElement): FormQuestion['inputType'] {
    if (element instanceof HTMLSelectElement) return 'select';
    if (element instanceof HTMLTextAreaElement) return 'textarea';
    if (element instanceof HTMLInputElement) {
      if (element.type === 'number') return 'number';
      if (element.type === 'radio') return 'radio';
      if (element.type === 'checkbox') return 'checkbox';
    }
    // ARIA combobox (custom dropdowns like LinkedIn's) should be treated as select
    if (element.getAttribute('role') === 'combobox') return 'select';
    return 'text';
  }

  /**
   * Extract options from an ARIA combobox by temporarily opening it.
   * Opens the dropdown, reads [role="option"] text, then closes it.
   * Returns undefined if no options are found.
   */
  private async extractAriaComboboxOptions(combobox: HTMLElement): Promise<string[] | undefined> {
    try {
      // Open the dropdown
      combobox.click();
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Find associated listbox
      const listboxId = combobox.getAttribute('aria-controls');
      let listbox: HTMLElement | null = null;
      if (listboxId) {
        listbox = document.getElementById(listboxId);
      }
      if (!listbox) {
        listbox =
          (combobox.parentElement?.querySelector('[role="listbox"]') as HTMLElement) ?? null;
      }
      if (!listbox) {
        // Also search in document root (some portals append listbox to body)
        listbox = (document.querySelector('[role="listbox"]') as HTMLElement) ?? null;
      }

      let options: string[] | undefined;
      if (listbox) {
        const optionEls = listbox.querySelectorAll('[role="option"]');
        const texts = Array.from(optionEls)
          .map((o) => (o.textContent || '').trim())
          .filter(Boolean);
        if (texts.length > 0) options = texts;
      }

      // Close the dropdown again
      combobox.click();
      await new Promise((resolve) => setTimeout(resolve, 50));

      return options;
    } catch {
      return undefined;
    }
  }

  /**
   * Find label text for an element
   */
  private findLabelText(element: HTMLElement): string | null {
    // Check for associated label
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) return label.textContent?.trim() || null;
    }

    // Check for parent label
    const parentLabel = element.closest('label');
    if (parentLabel) return parentLabel.textContent?.trim() || null;

    // Check for aria-label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    // Check for placeholder
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (element.placeholder) return element.placeholder;
    }

    // Check for preceding sibling
    const prev = element.previousElementSibling;
    if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN')) {
      return prev.textContent?.trim() || null;
    }

    return null;
  }

  /**
   * Fill a field with a specific value
   * Returns true if successfully filled, false if failed (e.g., no matching select option)
   */
  private async fillFieldWithValue(
    element: HTMLElement,
    _type: string,
    value: string
  ): Promise<boolean> {
    if (element instanceof HTMLInputElement) {
      if (element.type === 'checkbox') {
        const shouldCheck = value.toLowerCase() === 'yes' || value.toLowerCase() === 'true';
        if (element.checked !== shouldCheck) {
          await humanToggle(element, shouldCheck);
        }
        return true;
      } else if (element.type === 'radio') {
        // Find all radios in the same group
        // Use the same grouping logic as the page classifier
        const name = element.name;
        let radioList: HTMLInputElement[] = [];

        if (name) {
          // Method 1: Group by name attribute (standard approach)
          const fieldset = element.closest('fieldset');
          const form = element.closest('form');
          const container = fieldset || form || document;
          const radios = container.querySelectorAll(
            `input[type="radio"][name="${CSS.escape(name)}"]`
          );
          radioList = Array.from(radios) as HTMLInputElement[];
        } else {
          // Method 2: Group by parent container (for radios without name attribute)
          // This is common in custom UI frameworks like Gem
          let parent = element.parentElement;
          for (let i = 0; i < 4 && parent; i++) {
            const radiosInParent = parent.querySelectorAll('input[type="radio"]');
            if (radiosInParent.length > 1) {
              radioList = Array.from(radiosInParent) as HTMLInputElement[];
              break;
            }
            parent = parent.parentElement;
          }
        }

        // Fallback to just this element if we couldn't find a group
        if (radioList.length === 0) {
          radioList = [element];
        }

        logger.log(
          'FormFiller',
          `Looking for radio option "${value}" among ${radioList.length} radios`
        );

        for (const radio of radioList) {
          const radioEl = radio as HTMLInputElement;
          const valueLower = value.toLowerCase();

          // 1. Check radio value attribute
          if (radioEl.value.toLowerCase() === valueLower) {
            logger.log('FormFiller', `Matched radio by value: ${radioEl.value}`);
            await humanToggle(radioEl, true);
            return true;
          }

          // 2. Check associated label via for attribute (allow partial match for resume cards)
          if (radioEl.id) {
            const label = document.querySelector(`label[for="${radioEl.id}"]`);
            const labelText = label?.textContent?.toLowerCase().trim() || '';
            if (labelText === valueLower || labelText.includes(valueLower)) {
              logger.log(
                'FormFiller',
                `Matched radio by label[for]: ${label?.textContent?.substring(0, 30)}...`
              );
              await humanToggle(radioEl, true);
              return true;
            }
          }

          // 3. Check parent label (allow partial match)
          const parentLabel = radioEl.closest('label');
          if (parentLabel?.textContent?.toLowerCase().includes(valueLower)) {
            logger.log(
              'FormFiller',
              `Matched radio by parent label: ${parentLabel.textContent?.substring(0, 30)}...`
            );
            await humanToggle(radioEl, true);
            return true;
          }

          // 4. Check nextSibling text (common pattern)
          const nextSib = radioEl.nextSibling;
          if (nextSib?.textContent?.toLowerCase().trim() === valueLower) {
            logger.log('FormFiller', `Matched radio by nextSibling: ${nextSib.textContent}`);
            await humanToggle(radioEl, true);
            return true;
          }

          // 5. Check next element sibling (skip whitespace nodes)
          const nextElSib = radioEl.nextElementSibling;
          if (nextElSib?.textContent?.toLowerCase().trim() === valueLower) {
            logger.log(
              'FormFiller',
              `Matched radio by nextElementSibling: ${nextElSib.textContent}`
            );
            await humanToggle(radioEl, true);
            return true;
          }
        }

        logger.log('FormFiller', `No matching radio option found for "${value}"`);
        return false; // No matching radio option
      } else {
        await humanType(element, value);
        return true;
      }
    } else if (element instanceof HTMLTextAreaElement) {
      await humanType(element, value);
      return true;
    } else if (element instanceof HTMLSelectElement) {
      return await this.fillSelect(element, value);
    } else if (element.getAttribute('role') === 'combobox') {
      // Handle ARIA combobox (custom dropdowns)
      return await this.fillAriaCombobox(element, value);
    }
    return true;
  }

  /**
   * Fill a single field based on its purpose
   * Returns: true if filled, false if skipped (hidden/invalid), 'unknown' if needs LLM
   */
  async fillField(field: DetectedField): Promise<boolean | 'unknown'> {
    const element = field.element as HTMLElement;

    if (!element) {
      logger.log('FormFiller', `Field element not found: ${field.purpose}`);
      return false;
    }

    // For file inputs, check if they're required - if so, we MUST fill them even if hidden
    const isFileInput = element instanceof HTMLInputElement && element.type === 'file';

    // Check if field is required - multiple ways to detect:
    // 1. Element has required attribute
    // 2. Element.required property is true
    // 3. Parent fieldset has required (common for radio groups)
    // 4. Label text contains '*' (common UI pattern for required fields)
    const isRequired =
      element.hasAttribute('required') ||
      (element as HTMLInputElement | HTMLSelectElement).required ||
      element.getAttribute('aria-required') === 'true' ||
      element.closest('fieldset')?.hasAttribute('required') ||
      element.closest('fieldset')?.querySelector('[required]') !== null ||
      (field.labelText && field.labelText.includes('*'));

    // Visibility check
    let isEffectiveVisible = this.isVisible(element);

    // Special handling for Radio/Checkbox: often hidden for custom styling (e.g. LinkedIn)
    // If input is hidden, check if the associated label is visible
    if (
      !isEffectiveVisible &&
      element instanceof HTMLInputElement &&
      (element.type === 'radio' || element.type === 'checkbox')
    ) {
      if (element.id) {
        const label = document.querySelector(`label[for="${element.id}"]`);
        if (label && this.isVisible(label as HTMLElement)) {
          isEffectiveVisible = true;
          logger.log(
            'FormFiller',
            `Hidden radio/checkbox considered visible due to visible label: ${field.purpose}`
          );
        }
      }
    }

    if (!isEffectiveVisible && !(isFileInput && isRequired)) {
      logger.log('FormFiller', `Skipping hidden field: ${field.purpose} (not required file input)`);
      console.log('[FormFiller] Skipping hidden field:', field.purpose);
      return false;
    }

    // For required hidden file inputs, make them temporarily visible to fill
    let wasHidden = false;
    let originalDisplay = '';
    if (isFileInput && isRequired && !this.isVisible(element)) {
      logger.log(
        'FormFiller',
        `Required file input is hidden, making temporarily visible: ${field.purpose}`
      );
      console.log(
        '[FormFiller] Required file input is hidden, making temporarily visible:',
        field.purpose
      );
      wasHidden = true;
      originalDisplay = (element as HTMLElement).style.display;
      (element as HTMLElement).style.display = 'block';
      (element as HTMLElement).style.visibility = 'visible';
      (element as HTMLElement).style.opacity = '1';
      (element as HTMLElement).style.position = 'absolute';
      (element as HTMLElement).style.left = '-9999px'; // Hide visually but keep in DOM
    }

    // For file inputs (resume), ALWAYS fill - don't skip even if pre-filled
    if (isFileInput && field.purpose === 'resume') {
      try {
        await this.fillFileInput(element as HTMLInputElement);
        logger.log('FormFiller', `Successfully filled resume field`);
        return true;
      } catch (error) {
        logger.error('FormFiller', `Error filling resume field`, error);
        throw error;
      }
    }

    // For cover letter file inputs: generate via LLM and upload as PDF
    if (isFileInput && field.purpose === 'coverLetter') {
      try {
        await this.fillCoverLetterFileInput(element as HTMLInputElement);
        logger.log('FormFiller', `Successfully filled cover letter file field`);
        return true;
      } catch (error) {
        logger.error('FormFiller', `Error filling cover letter file field`, error);
        // Don't rethrow — cover letter upload is best-effort; resume is mandatory
        console.warn('[FormFiller] Cover letter upload failed, skipping:', error);
        return false;
      }
    }

    // =========================================================================
    // SKIP PRE-FILLED FIELDS (except resume which is handled above)
    // LinkedIn pre-fills many fields from the user's profile - don't overwrite
    // UNLESS:
    // 1. The field has a validation error from a previous attempt, OR
    // 2. We're in manual autofill mode (skipPreFilled = false)
    // =========================================================================
    if (this.skipPreFilled && this.isFieldPreFilled(element)) {
      // Check if this field has a validation error from previous attempt
      const validationErrors = getLastValidationErrors();
      const hasValidationError = validationErrors.has(element);

      if (hasValidationError) {
        logger.log(
          'FormFiller',
          `Field ${field.purpose} is pre-filled but has validation error - will refill`
        );
        console.log('[FormFiller] Refilling field with validation error:', field.purpose);
        // Don't skip - continue to refill with correct value
      } else {
        logger.log('FormFiller', `Skipping pre-filled field: ${field.purpose}`);
        console.log('[FormFiller] Skipping pre-filled field:', field.purpose);
        return true; // Return true since field is already filled correctly
      }
    }

    const value = this.getValueForField(field.purpose);
    if (value === null || value === undefined) {
      // Special case: Cover letter should always go to LLM for generation
      if (field.purpose === 'coverLetter' && this.config.jobDescription) {
        logger.log('FormFiller', 'Cover letter needs LLM generation');
        console.log('[FormFiller] Cover letter needs LLM generation');
        return 'unknown';
      }

      // No known value - mark for LLM if required, otherwise skip
      // Exception: unknown/experience fields should go to LLM even if optional
      const shouldUseLLM =
        isRequired || field.purpose === 'unknown' || field.purpose === 'experience';

      if (shouldUseLLM) {
        logger.log('FormFiller', `No value for field, needs LLM: ${field.purpose}`);
        console.log('[FormFiller] Field needs LLM:', field.purpose);
        return 'unknown';
      }
      logger.log('FormFiller', `No value for optional field: ${field.purpose}`);
      console.log('[FormFiller] No value for field:', field.purpose);
      return false;
    }

    // Skip if field already has the correct value (prevents duplicate typing)
    const stringValue = String(value);
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const currentValue = element.value.trim();
      const targetValue = stringValue.trim();
      if (currentValue === targetValue) {
        logger.log('FormFiller', `Field ${field.purpose} already has correct value, skipping`);
        console.log('[FormFiller] Skipping field (already filled):', field.purpose);
        return true; // Return true since field is correctly filled
      }
    }

    logger.log('FormFiller', `Filling field: ${field.purpose}`, {
      value: stringValue.substring(0, 20) + '...',
      elementType: element.tagName,
    });
    console.log('[FormFiller] Filling field:', field.purpose, 'with:', value);

    try {
      let success = true;

      if (element instanceof HTMLInputElement) {
        await this.fillInput(element, value);
      } else if (element instanceof HTMLTextAreaElement) {
        await this.fillTextarea(element, value);
      } else if (element instanceof HTMLSelectElement) {
        success = await this.fillSelect(element, value);
      } else if (element.getAttribute('role') === 'combobox') {
        // Handle ARIA combobox (custom dropdowns)
        success = await this.fillAriaCombobox(element, value);
      }

      // Restore original display style if we temporarily made it visible
      if (wasHidden) {
        (element as HTMLElement).style.display = originalDisplay;
      }

      // If select fill failed and field is required, send to LLM
      if (!success && isRequired) {
        logger.log(
          'FormFiller',
          `Select fill failed for required field, needs LLM: ${field.purpose}`
        );
        console.log('[FormFiller] Select fill failed, sending to LLM:', field.purpose);
        return 'unknown';
      }

      logger.log('FormFiller', `Successfully filled field: ${field.purpose}`);
      return true;
    } catch (error) {
      // Restore original display style on error
      if (wasHidden) {
        (element as HTMLElement).style.display = originalDisplay;
      }
      logger.error('FormFiller', `Error filling ${field.purpose}`, error);
      throw error;
    }
  }

  /**
   * Get the appropriate value for a field purpose
   */
  private getValueForField(purpose: string): string | number | boolean | null | undefined {
    const mapping: Record<string, string | number | boolean | null | undefined> = {
      // Identity fields (from resume/onboarding)
      firstName: this.config.firstName,
      lastName: this.config.lastName,
      middleName: this.config.middleName || '',
      fullName: `${this.config.firstName} ${this.config.lastName}`,
      email: this.config.email,
      phone: this.config.phone,
      // Address — full string for generic "address" fields
      address: this.config.address,
      // Address components — parsed from the flat address string
      streetAddress: this.config.streetAddress || this.config.address,
      city: this.config.city,
      zipCode: this.config.zipCode,
      state: this.config.state,
      // Professional context
      employer: this.config.currentEmployer,
      jobTitle: this.config.currentJobTitle,
      linkedin: this.config.linkedin,
      website: this.config.website,
      resume: this.config.resumeFile?.name, // Return filename for radio-based selection

      // Work authorization (from onboarding or defaults)
      workAuth:
        this.config.workAuth === 'yes' ? 'yes' : this.config.workAuth === 'no' ? 'no' : 'yes', // Default to 'yes' if not set
      sponsorship: this.config.sponsorshipRequired ? 'yes' : 'no',

      // Safe defaults for common form questions
      clearance: 'none', // "I have never held a U.S. security clearance"
      exportControls: 'us_citizen', // Default for US jobs
      country: this.inferCountryFromAddress(), // Infer from profile address
      phoneCountryCode: this.inferCountryFromAddress(), // Same as country
      phone_country_code: this.inferCountryFromAddress(), // Legacy support
      previousApplication: 'no', // Safe default
      previousEmployment: 'no', // Safe default
      conflictOfInterest: 'no', // Safe default

      // Additional common fields with safe defaults
      veteranStatus: 'prefer_not_to_say', // EEO compliance
      disabilityStatus: 'prefer_not_to_say', // EEO compliance
      gender: 'prefer_not_to_say', // EEO compliance
      ethnicity: 'prefer_not_to_say', // EEO compliance
      race: 'prefer_not_to_say', // EEO compliance
      degreeLevel: 'bachelors', // Common default
      willingToRelocate: 'yes', // Assume flexibility
      startDate: 'immediately', // Most job seekers available
      salaryExpectation: '', // Skip if possible, or leave blank
      yearsOfExperience: '3', // Generic mid-level default
      legallyAuthorized: 'yes', // Match workAuth default
      requireSponsorship: this.config.sponsorshipRequired ? 'yes' : 'no',
      ageVerification: 'yes', // Assume 18+
      backgroundCheck: 'yes', // Consent to background check
      drugTest: 'yes', // Consent to drug test
      referralSource: 'online_search', // Generic source
      howDidYouHear: 'job_board', // Generic source
    };

    return mapping[purpose];
  }

  /**
   * Fill an input element
   * Uses humanized typing for text inputs to avoid detection
   */
  private async fillInput(
    input: HTMLInputElement,
    value: string | number | boolean | null | undefined
  ): Promise<void> {
    if (input.type === 'file') {
      await this.fillFileInput(input);
      return;
    }

    if (input.type === 'radio') {
      await this.fillRadio(input, value);
      return;
    }

    if (input.type === 'checkbox') {
      await humanToggle(input, Boolean(value));
      return;
    }

    // Text, email, tel, etc. - use human typing for realistic behavior
    const stringValue = String(value);
    if (humanizeConfig.useHumanTyping && stringValue.length <= 100) {
      // Use character-by-character typing for shorter values
      await humanType(input, stringValue, { clearFirst: true, blurAfter: true });
    } else {
      // For very long text (like cover letters), use direct set to save time
      await setValue(input, stringValue);
    }

    // 🔍 DIAGNOSTIC: Watch for unexpected value resets after filling
    watchForValueReset(input, input.name || input.id || input.placeholder || 'unknown');
  }

  /**
   * Fill a textarea element
   * Uses direct setValue since textareas often contain longer text
   */
  private async fillTextarea(
    textarea: HTMLTextAreaElement,
    value: string | number | boolean | null | undefined
  ): Promise<void> {
    // Textareas typically have longer content, use direct set with proper events
    await setValue(textarea, String(value));
  }

  /**
   * Fill a select element
   * Uses humanSelect for proper focus/blur event sequence
   * Returns true if successfully filled, false if no matching option found
   */
  private async fillSelect(
    select: HTMLSelectElement,
    value: string | number | boolean | null | undefined
  ): Promise<boolean> {
    if (value === null || value === undefined) {
      logger.log('FormFiller', `No value provided for select field`);
      console.log('[FormFiller] No value provided for select field');
      return false;
    }

    const stringValue = String(value).toLowerCase();
    const options = Array.from(select.options);

    logger.log('FormFiller', `Filling select with value: ${stringValue}`, {
      options: options.map((o) => ({
        value: o.value,
        text: o.textContent?.substring(0, 50),
      })),
    });

    // Get the field label to detect phone country code fields
    const labelEl =
      select.closest('[data-test-form-element]')?.querySelector('label') ||
      document.querySelector(`label[for="${select.id}"]`);
    const labelText = (labelEl?.textContent?.toLowerCase() || '').trim();
    const isPhoneCountry =
      labelText.includes('country code') || labelText.includes('phone country');
    const isCountryField = labelText.includes('country') && !isPhoneCountry;

    // =========================================================================
    // STRATEGY 1: Exact value match (highest priority)
    // =========================================================================
    for (const option of options) {
      if (option.value.toLowerCase() === stringValue) {
        await humanSelect(select, option.value);
        logger.log('FormFiller', `Selected option by exact value match: ${option.value}`);
        return true;
      }
    }

    // =========================================================================
    // STRATEGY 2: Special handling for country/phone country code fields
    // These need precise matching to avoid "us" matching "Australia"
    // =========================================================================
    if (isPhoneCountry || isCountryField) {
      // Map common country codes to full names for precise matching
      const countryMappings: Record<string, string[]> = {
        us: ['united states', 'usa', 'u.s.', '+1'],
        usa: ['united states', 'usa', 'u.s.', '+1'],
        'united states': ['united states', 'usa', 'u.s.', '+1'],
        '+1': ['united states', 'usa', 'u.s.', '+1'],
        uk: ['united kingdom', 'uk', 'britain', '+44'],
        gb: ['united kingdom', 'uk', 'britain', '+44'],
        'united kingdom': ['united kingdom', 'uk', 'britain', '+44'],
        '+44': ['united kingdom', 'uk', 'britain', '+44'],
        ca: ['canada', '+1'],
        canada: ['canada', '+1'],
        au: ['australia', '+61'],
        australia: ['australia', '+61'],
        in: ['india', '+91'],
        india: ['india', '+91'],
        de: ['germany', '+49'],
        germany: ['germany', '+49'],
        fr: ['france', '+33'],
        france: ['france', '+33'],
      };

      const searchTerms = countryMappings[stringValue] || [stringValue];

      for (const option of options) {
        const optionText = (option.textContent?.toLowerCase() || '').trim();

        // For phone country, look for exact country name at START of option text
        // "United States (+1)" should match, but "Australia (+61)" should NOT match "us"
        for (const term of searchTerms) {
          if (optionText.startsWith(term) || optionText.includes(`(${term})`)) {
            await humanSelect(select, option.value);
            logger.log('FormFiller', `Selected country option: ${option.value} (matched: ${term})`);
            return true;
          }
        }
      }

      // Don't fall through to generic matching for country fields
      logger.log('FormFiller', `No country match found for: ${stringValue}, skipping field`);
      console.warn('[FormFiller] No country match found for:', stringValue);
      return false;
    }

    // =========================================================================
    // STRATEGY 3: Text starts with value (more precise than includes)
    // =========================================================================
    for (const option of options) {
      const optionText = (option.textContent?.toLowerCase() || '').trim();
      if (optionText.startsWith(stringValue) || optionText === stringValue) {
        await humanSelect(select, option.value);
        logger.log('FormFiller', `Selected option by text starts-with: ${option.value}`);
        return true;
      }
    }

    // =========================================================================
    // STRATEGY 4: Word boundary match (e.g., "yes" matches "Yes" but not "eyes")
    // =========================================================================
    const wordBoundaryRegex = new RegExp(`\\b${stringValue}\\b`, 'i');
    for (const option of options) {
      const optionText = option.textContent || '';
      if (wordBoundaryRegex.test(optionText)) {
        await humanSelect(select, option.value);
        logger.log('FormFiller', `Selected option by word boundary match: ${option.value}`);
        return true;
      }
    }

    // =========================================================================
    // STRATEGY 5: Special handling for yes/no patterns
    // =========================================================================
    if (stringValue === 'yes' || stringValue === 'no') {
      for (const option of options) {
        const optionText = (option.textContent?.toLowerCase() || '').trim();
        if (
          optionText === stringValue ||
          optionText.startsWith(stringValue + ' ') ||
          optionText.startsWith(stringValue + ',')
        ) {
          await humanSelect(select, option.value);
          logger.log('FormFiller', `Selected option by yes/no pattern: ${option.value}`);
          return true;
        }
      }
    }

    // =========================================================================
    // NO MATCH FOUND - Return false so caller can send to LLM
    // =========================================================================
    logger.log('FormFiller', `No matching option found for: ${stringValue}`, {
      availableOptions: options.map((o) => ({
        value: o.value,
        text: o.textContent?.substring(0, 50),
      })),
    });
    console.warn('[FormFiller] No matching option found for:', stringValue, '- needs LLM');
    return false;
  }

  /**
   * Fill an ARIA combobox (custom dropdown)
   * These are DIV elements with role="combobox" that need to be clicked to open
   */
  private async fillAriaCombobox(
    combobox: HTMLElement,
    value: string | number | boolean | null | undefined
  ): Promise<boolean> {
    if (value === null || value === undefined) {
      logger.log('FormFiller', `No value provided for ARIA combobox`);
      return false;
    }

    const stringValue = String(value).toLowerCase();

    logger.log('FormFiller', `Filling ARIA combobox with value: ${stringValue}`);
    console.log('[FormFiller] Filling ARIA combobox:', stringValue);

    try {
      // Click the combobox to open the dropdown
      combobox.click();
      await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for dropdown to open

      // Find the associated listbox
      const listboxId = combobox.getAttribute('aria-controls');
      let listbox: HTMLElement | null = null;

      if (listboxId) {
        listbox = document.getElementById(listboxId);
      } else {
        // Fallback: find listbox by role near the combobox
        listbox = combobox.parentElement?.querySelector('[role="listbox"]') as HTMLElement;
      }

      if (!listbox) {
        logger.warn('FormFiller', 'Could not find listbox for ARIA combobox');
        console.warn('[FormFiller] No listbox found for combobox');
        return false;
      }

      // Find all options in the listbox
      const options = listbox.querySelectorAll('[role="option"]');

      logger.log('FormFiller', `Found ${options.length} options in listbox`);

      // Try to find matching option
      for (const option of Array.from(options)) {
        const optionText = (option.textContent || '').toLowerCase().trim();

        // Exact match or contains match
        if (
          optionText === stringValue ||
          optionText.includes(stringValue) ||
          stringValue.includes(optionText)
        ) {
          logger.log('FormFiller', `Clicking option: ${optionText}`);
          console.log('[FormFiller] Selecting option:', optionText);
          (option as HTMLElement).click();
          await new Promise((resolve) => setTimeout(resolve, 50));
          return true;
        }
      }

      logger.warn('FormFiller', `No matching option found for: ${stringValue}`);
      console.warn('[FormFiller] No match found in combobox for:', stringValue);

      // Close the dropdown by clicking the combobox again
      combobox.click();

      return false;
    } catch (error) {
      logger.error('FormFiller', 'Error filling ARIA combobox:', error);
      console.error('[FormFiller] ARIA combobox error:', error);
      return false;
    }
  }

  /**
   * Fill a radio button
   * Uses humanToggle for realistic click behavior
   */
  private async fillRadio(
    radio: HTMLInputElement,
    value: string | number | boolean | null | undefined
  ): Promise<void> {
    const stringValue = String(value).toLowerCase();
    const radioGroup = document.querySelectorAll(`input[name="${radio.name}"]`);

    for (const r of Array.from(radioGroup)) {
      const radioInput = r as HTMLInputElement;
      if (radioInput.value.toLowerCase() === stringValue) {
        await humanToggle(radioInput, true);
        return;
      }
    }
  }

  /**
   * Fill a file input (resume)
   * Uses attachFile from humanize for proper event handling
   */
  private async fillFileInput(input: HTMLInputElement): Promise<void> {
    console.log('[FormFiller] fillFileInput called, resumeFile status:', {
      hasResumeFile: !!this.config.resumeFile,
      fileName: this.config.resumeFile?.name,
      fileSize: this.config.resumeFile?.size,
    });

    if (!this.config.resumeFile) {
      logger.log('FormFiller', 'No resume file available - this is a required field!');
      console.error('[FormFiller] No resume file available - this is a required field!');
      return;
    }

    try {
      // Make sure input is accessible (even if hidden)
      const wasHidden = !this.isVisible(input);
      let originalStyles: {
        display: string;
        visibility: string;
        opacity: string;
        position: string;
        left: string;
      } | null = null;

      if (wasHidden) {
        logger.log('FormFiller', 'File input is hidden, making temporarily accessible');
        originalStyles = {
          display: input.style.display,
          visibility: input.style.visibility,
          opacity: input.style.opacity,
          position: input.style.position,
          left: input.style.left,
        };
        input.style.display = 'block';
        input.style.visibility = 'visible';
        input.style.opacity = '1';
        input.style.position = 'absolute';
        input.style.left = '-9999px';
      }

      // Use humanized attachFile for proper event sequence
      await attachFile(input, this.config.resumeFile);
      input.setAttribute('data-selected-file', input.files?.[0]?.name || '');

      // Restore original styles if we modified them
      if (wasHidden && originalStyles) {
        input.style.display = originalStyles.display;
        input.style.visibility = originalStyles.visibility;
        input.style.opacity = originalStyles.opacity;
        input.style.position = originalStyles.position;
        input.style.left = originalStyles.left;
      }

      logger.log('FormFiller', `Resume file attached: ${this.config.resumeFile.name}`);
      console.log('[FormFiller] Resume file attached:', this.config.resumeFile.name);
    } catch (error) {
      logger.error('FormFiller', 'Error attaching resume file', error);
      console.error('[FormFiller] Error attaching resume:', error);
      throw error;
    }
  }

  /**
   * Fill a cover letter file input:
   * 1. Generate cover letter text via LLM
   * 2. Convert to a minimal PDF Blob
   * 3. Attach to the file input via attachFile
   */
  private async fillCoverLetterFileInput(input: HTMLInputElement): Promise<void> {
    if (!this.config.jobDescription) {
      console.warn('[FormFiller] No job description — cannot generate cover letter PDF, skipping');
      return;
    }

    console.log('[FormFiller] Generating cover letter PDF for file input...');

    // Build resumeData from config (same as what fillUnknownFieldsWithLLM uses)
    const resumeData: ResumeData = {
      summary: [
        this.config.firstName && this.config.lastName
          ? `${this.config.firstName} ${this.config.lastName}`
          : '',
        this.config.jobTitle ?? '',
      ]
        .filter(Boolean)
        .join(', '),
      totalYearsExperience: 0,
      skills: [],
      education: [],
      recentJobTitle: this.config.jobTitle ?? '',
      recentCompany: '',
      email: this.config.email,
      employment: [],
    };

    const coverLetterText = await generateCoverLetter({
      jobTitle: this.config.jobTitle ?? 'this position',
      company: this.config.company ?? '',
      jobDescription: this.config.jobDescription,
      resumeData,
    });

    if (!coverLetterText) {
      console.warn('[FormFiller] LLM returned no cover letter text — skipping file upload');
      return;
    }

    console.log('[FormFiller] Cover letter generated, length:', coverLetterText.length);

    // Convert plain text → minimal valid PDF Blob (no external library needed)
    const pdfBlob = this.generateCoverLetterPdfBlob(coverLetterText);
    const pdfFile = new File([pdfBlob], 'cover_letter.pdf', { type: 'application/pdf' });

    // Make input accessible if hidden
    const wasHidden = !this.isVisible(input);
    let originalStyles: Record<string, string> | null = null;
    if (wasHidden) {
      originalStyles = {
        display: input.style.display,
        visibility: input.style.visibility,
        opacity: input.style.opacity,
        position: input.style.position,
        left: input.style.left,
      };
      input.style.display = 'block';
      input.style.visibility = 'visible';
      input.style.opacity = '1';
      input.style.position = 'absolute';
      input.style.left = '-9999px';
    }

    await attachFile(input, pdfFile);
    console.log('[FormFiller] Cover letter PDF attached:', pdfFile.name);

    if (wasHidden && originalStyles) {
      input.style.display = originalStyles['display'] ?? '';
      input.style.visibility = originalStyles['visibility'] ?? '';
      input.style.opacity = originalStyles['opacity'] ?? '';
      input.style.position = originalStyles['position'] ?? '';
      input.style.left = originalStyles['left'] ?? '';
    }
  }

  /**
   * Create a minimal but valid PDF Blob from plain text.
   * No external library needed — uses only PDF spec primitives.
   * ATS parsers read the text stream content, so this is fully compatible.
   */
  private generateCoverLetterPdfBlob(text: string): Blob {
    // PDF requires ISO-8859-1 safe characters in streams without font embedding.
    // We encode the text as PDF string literals, replacing special chars.
    const safeText = text
      .replace(/\\/g, '\\\\') // backslash first
      .replace(/\(/g, '\\(') // open paren
      .replace(/\)/g, '\\)') // close paren
      .replace(/\r\n/g, '\n') // normalize CRLF
      .substring(0, 32000); // PDF stream size guard

    // Split into lines of ≤90 chars for readability in the PDF stream
    const LINE_WIDTH = 90;
    const words = safeText.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    for (const word of words) {
      // Handle explicit newlines in the text
      const parts = word.split('\n');
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!;
        if (currentLine.length + part.length + 1 <= LINE_WIDTH) {
          currentLine = currentLine ? currentLine + ' ' + part : part;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = part;
        }
        // Explicit newline between parts
        if (i < parts.length - 1) {
          lines.push(currentLine);
          currentLine = '';
        }
      }
    }
    if (currentLine) lines.push(currentLine);

    // Build PDF text stream: each line positioned with Td operator
    const leading = 14; // line height in points
    const margin = 50;
    const pageHeight = 792; // US Letter
    const startY = pageHeight - margin;

    // BT = Begin Text, Tf = set font, Td = move cursor, Tj = show string, ET = End Text
    const streamLines: string[] = [
      'BT',
      `/F1 11 Tf`,
      `${margin} ${startY} Td`,
      `${leading} TL`, // Text leading
    ];
    for (const line of lines) {
      streamLines.push(`(${line}) Tj T*`);
    }
    streamLines.push('ET');
    const streamContent = streamLines.join('\n');
    const streamBytes = new TextEncoder().encode(streamContent);
    const streamLength = streamBytes.length;

    // Minimal PDF structure
    const pdf = [
      '%PDF-1.4',
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R',
      '  /MediaBox [0 0 612 792]',
      '  /Contents 4 0 R',
      '  /Resources << /Font << /F1 5 0 R >> >>',
      '>> endobj',
      `4 0 obj << /Length ${streamLength} >>`,
      'stream',
      streamContent,
      'endstream endobj',
      '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
      'xref',
      '0 6',
      '0000000000 65535 f ',
      // Object offsets will be approximate — most readers handle this gracefully
      '0000000009 00000 n ',
      '0000000058 00000 n ',
      '0000000115 00000 n ',
      '0000000274 00000 n ',
      '0000000350 00000 n ',
      'trailer << /Size 6 /Root 1 0 R >>',
      'startxref',
      '450',
      '%%EOF',
    ].join('\n');

    return new Blob([pdf], { type: 'application/pdf' });
  }

  /**
   * Check if an element is visible
   * Recursively checks parent visibility for multi-step forms
   */
  private isVisible(element: HTMLElement): boolean {
    if (!element) return false;

    // Check inline style first (faster, catches dynamic visibility toggling in multi-step forms)
    const inlineDisplay = element.style.display;
    if (inlineDisplay === 'none') return false;

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    // Recursively check parent visibility (critical for multi-step forms)
    const parent = element.parentElement;
    if (parent && parent !== document.body && parent.tagName !== 'HTML') {
      return this.isVisible(parent);
    }

    return true;
  }

  /**
   * Infer country code from the user's address in the profile
   * Returns a standardized country code like "us", "uk", "ca", etc.
   */
  private inferCountryFromAddress(): string {
    const address = this.config.address?.toLowerCase() || '';

    // US states and keywords
    const usPatterns = [
      /\b(usa|united states|u\.s\.a?)\b/i,
      /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\b/i,
      /\b(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)\s*,?\s*\d{5}/i,
    ];

    for (const pattern of usPatterns) {
      if (pattern.test(address)) {
        return 'united states';
      }
    }

    // UK patterns
    if (/\b(united kingdom|uk|england|scotland|wales|northern ireland)\b/i.test(address)) {
      return 'united kingdom';
    }

    // Canada
    if (
      /\b(canada|ontario|quebec|british columbia|alberta|manitoba|saskatchewan)\b/i.test(address) ||
      /\b[a-z]\d[a-z]\s*\d[a-z]\d\b/i.test(address)
    ) {
      // Canadian postal code
      return 'canada';
    }

    // Australia
    if (/\b(australia|new south wales|queensland|victoria|western australia)\b/i.test(address)) {
      return 'australia';
    }

    // India
    if (
      /\b(india|maharashtra|karnataka|tamil nadu|delhi|mumbai|bangalore|hyderabad)\b/i.test(address)
    ) {
      return 'india';
    }

    // Default to US for LinkedIn jobs (most common)
    return 'united states';
  }

  /**
   * Check if a field already has a value (pre-filled by LinkedIn or similar)
   * We should not overwrite pre-filled fields (except resume)
   */
  private isFieldPreFilled(element: HTMLElement): boolean {
    // SELECT elements: check if a non-placeholder option is selected
    if (element instanceof HTMLSelectElement) {
      const selectedOption = element.options[element.selectedIndex];
      if (!selectedOption) return false;

      const value = selectedOption.value?.toLowerCase() || '';
      const text = selectedOption.textContent?.toLowerCase() || '';

      // Placeholder patterns to ignore
      const placeholderPatterns = ['select', 'choose', 'please', '--', 'option'];
      const isPlaceholder = placeholderPatterns.some((p) => value.includes(p) || text.includes(p));

      // If it's not a placeholder and has a value, it's pre-filled
      return !isPlaceholder && value.length > 0 && value !== '';
    }

    // INPUT elements (text, email, tel, etc.)
    if (element instanceof HTMLInputElement) {
      // Skip checkboxes and radios - they have different semantics
      if (element.type === 'checkbox' || element.type === 'radio') {
        return element.checked;
      }
      // Skip file inputs - handled separately
      if (element.type === 'file') {
        return false;
      }
      // For text inputs, check if they have content
      return element.value.trim().length > 0;
    }

    // TEXTAREA elements
    if (element instanceof HTMLTextAreaElement) {
      return element.value.trim().length > 0;
    }

    return false;
  }
}

/**
 * Create a FormFiller instance from vault data
 */
export async function createFormFillerFromVault(
  providedResume?: { data: string; fileName?: string; mimeType?: string },
  providedProfile?: any, // Add profile parameter
  skipPreFilled?: boolean // Add skipPreFilled parameter (default: true for orchestrator, false for autofill)
): Promise<FormFiller | null> {
  try {
    logger.log('FormFiller', 'Loading user data from vault via background...');
    console.log('[FormFiller] createFormFillerFromVault called with providedResume:', {
      hasProvidedResume: !!providedResume,
      hasData: !!providedResume?.data,
      dataLength: providedResume?.data?.length || 0,
      fileName: providedResume?.fileName,
      skipPreFilled,
    });

    // Use provided profile if available, otherwise fetch from background
    let profile = providedProfile;

    if (!profile) {
      // Request profile from background script (which has access to IndexedDB)
      const response = await chrome.runtime.sendMessage({ type: 'GET_PROFILE' });
      logger.log('FormFiller', 'Background response', response);
      profile = response?.profile;
    }

    if (!profile) {
      logger.log('FormFiller', 'No profile returned from background, using mock data');
      console.warn('[FormFiller] No profile data, using mock data');

      // Use mock data for testing
      const { MOCK_VAULT_DATA } = await import('./mock-vault-data');
      profile = MOCK_VAULT_DATA;
    }

    // Load resume file - use provided resume if available, otherwise load from vault
    let resumeFile: File | undefined = undefined;

    if (providedResume?.data) {
      // Use provided resume data
      console.log(
        '[FormFiller] Creating file from provided resume data, length:',
        providedResume.data.length
      );
      if (!providedResume.data || providedResume.data.length === 0) {
        console.error('[FormFiller] Provided resume data is empty!');
      } else {
        try {
          const binary = atob(providedResume.data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          const arrayBuffer = bytes.buffer;
          const fileName = providedResume.fileName || 'resume.pdf';
          const mimeType = providedResume.mimeType || 'application/pdf';
          const blob = new Blob([arrayBuffer], { type: mimeType });
          resumeFile = new File([blob], fileName, { type: mimeType });
          console.log(
            '[FormFiller] Successfully created resume file:',
            fileName,
            'size:',
            resumeFile.size,
            'bytes'
          );
        } catch (error) {
          console.error('[FormFiller] Error creating file from provided resume:', error);
          console.error('[FormFiller] Error details:', {
            message: error instanceof Error ? error.message : String(error),
            dataLength: providedResume.data.length,
            dataPreview: providedResume.data.substring(0, 50),
          });
        }
      }
    } else {
      console.log('[FormFiller] No providedResume.data, falling back to vault');
      // Load from vault (existing code)
      try {
        logger.log('FormFiller', 'Requesting resume file from vault...');
        const resumeResponse = await chrome.runtime.sendMessage({ type: 'GET_RESUME' });

        if (resumeResponse?.status === 'success' && resumeResponse?.resume?.data) {
          // Convert base64 back to ArrayBuffer
          const binary = atob(resumeResponse.resume.data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          const arrayBuffer = bytes.buffer;

          // Get file name from profile if available, otherwise use default
          const fileName = profile.resume?.file_name || 'resume.pdf';
          const mimeType = profile.resume?.mime_type || 'application/pdf';

          // Convert ArrayBuffer to File
          const blob = new Blob([arrayBuffer], { type: mimeType });
          resumeFile = new File([blob], fileName, { type: mimeType });

          logger.log(
            'FormFiller',
            `Resume file loaded from vault: ${fileName} (${resumeResponse.resume.size} bytes)`
          );
          console.log('[FormFiller] Resume file loaded from vault:', fileName);
        } else {
          logger.log('FormFiller', 'No resume file found in vault');
          console.warn(
            '[FormFiller] No resume file found in vault - user needs to upload resume during onboarding'
          );
        }
      } catch (error) {
        logger.error('FormFiller', 'Error loading resume from vault', error);
        console.error('[FormFiller] Error loading resume from vault:', error);
      }
    }

    // Log resumeFile status before creating config
    console.log('[FormFiller] Resume file status before config creation:', {
      hasResumeFile: !!resumeFile,
      fileName: resumeFile?.name,
      fileSize: resumeFile?.size,
    });

    // Build resumeData for LLM from profile history
    const resumeData: ResumeData = buildResumeDataFromProfile(profile);
    console.log('[FormFiller] Built resumeData for LLM:', {
      hasSkills: resumeData.skills.length > 0,
      hasEducation: resumeData.education.length > 0,
      totalYearsExperience: resumeData.totalYearsExperience,
      recentJobTitle: resumeData.recentJobTitle,
    });

    // Extract job context from page (works for both ATS pages and LinkedIn modals)
    // Always try to extract - the function handles different page types
    const jobContext = getJobContextFromPage();

    // Create config from vault data
    const parsedAddress = parseAddressString(profile.identity.address || '');
    const mostRecentJob = profile.history?.employment?.[0];

    console.log('[FormFiller] Parsed address:', parsedAddress);
    console.log('[FormFiller] Most recent job:', mostRecentJob?.company, '/', mostRecentJob?.title);

    const config: FormFillerConfig = {
      firstName: profile.identity.first_name,
      lastName: profile.identity.last_name,
      middleName: profile.identity.middle_name,
      email: profile.identity.email,
      phone: profile.identity.phone,
      address: profile.identity.address,
      // Parsed address components
      streetAddress: parsedAddress.streetAddress,
      city: parsedAddress.city,
      state: parsedAddress.state,
      zipCode: parsedAddress.zipCode,
      // Employment context from most recent history entry
      currentEmployer: mostRecentJob?.company,
      currentJobTitle: mostRecentJob?.title,
      // Work auth: If sponsorship_required is false, they ARE authorized
      // Also check visa_type for explicit authorization
      workAuth:
        !profile.work_auth.sponsorship_required ||
        profile.work_auth.visa_type === 'Citizen' ||
        profile.work_auth.visa_type?.toLowerCase().includes('citizen') ||
        profile.work_auth.visa_type?.toLowerCase().includes('green')
          ? 'yes'
          : 'no',
      sponsorshipRequired: profile.work_auth.sponsorship_required,
      resumeFile,
      // LLM context
      resumeData,
      jobTitle: jobContext.jobTitle,
      company: jobContext.company,
      jobDescription: jobContext.jobDescription,
      // Pass skipPreFilled parameter
      skipPreFilled,
    };

    logger.log('FormFiller', 'Created from vault data with LLM context', {
      hasResumeData: !!config.resumeData,
      hasJobTitle: !!config.jobTitle,
      hasCompany: !!config.company,
      skipPreFilled: config.skipPreFilled,
    });
    return new FormFiller(config);
  } catch (error) {
    logger.error('FormFiller', 'Error creating from vault', error);
    console.error('[FormFiller] Error creating from vault:', error);
    return null;
  }
}

/**
 * Build ResumeData structure from profile for LLM
 */
function buildResumeDataFromProfile(profile: any): ResumeData {
  const employment = profile.history?.employment || [];
  const education = profile.history?.education || [];

  // Debug: Log what we're working with
  console.log('[FormFiller] buildResumeDataFromProfile - input:', {
    hasHistory: !!profile.history,
    employmentCount: employment.length,
    educationCount: education.length,
    firstJob: employment[0] ? { title: employment[0].title, company: employment[0].company } : null,
  });

  // Calculate total years of experience from employment history
  // Use employment dates if available, otherwise estimate conservatively
  let totalYears = 0;
  for (const job of employment) {
    if (job.start && job.end) {
      // Parse dates if available
      const start = new Date(job.start);
      const end = job.end === 'Present' ? new Date() : new Date(job.end);
      const years = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365);
      totalYears += Math.max(0, years);
    } else {
      // Conservative estimate: 2 years per job if no dates
      totalYears += 2;
    }
  }
  // Ensure reasonable bounds - minimum based on job count
  const minYears = Math.max(1, employment.length * 1.5); // At least 1.5 years per job
  totalYears = Math.max(minYears, Math.min(Math.round(totalYears), 30));

  // Get most recent job
  const recentJob = employment[0] || {};

  // Get skills from profile.history.skills (extracted during resume parsing)
  const skills: string[] = profile.history?.skills || [];

  // Get applicant's full name
  const firstName = profile.identity?.first_name || '';
  const lastName = profile.identity?.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim();

  // Build employment history string for context
  const employmentHistory = employment
    .slice(0, 3)
    .map((job: any) => `${job.title || 'Role'} at ${job.company || 'Company'}`)
    .join('; ');

  // WORK AUTH INFO (ADDED)
  let workAuthText = '';
  if (profile.work_authorization) {
    const wa = profile.work_authorization;
    workAuthText = `Visa Status: ${wa.visa_type || 'Unknown'}. Sponsorship Required: ${wa.sponsorship_required ? 'Yes' : 'No'}.`;
  }

  const resumeData = {
    summary: `${fullName} - ${recentJob.title || 'experienced professional'} with ${totalYears}+ years of experience. ${workAuthText} ${skills.length > 0 ? `Skills includes: ${skills.slice(0, 10).join(', ')}` : ''}. Recent experience: ${employmentHistory || 'various roles'}`,
    totalYearsExperience: totalYears,
    skills,
    education: education.map((edu: any) => ({
      degree: edu.degree || '',
      field: edu.field || '',
      school: edu.school || '',
    })),
    recentJobTitle: recentJob.title || '',
    recentCompany: recentJob.company || '',
    email: profile.identity?.email || undefined, // NEW: Include email for local answering
    // Include employment history with duties for skill-year calculation
    employment: employment.map((job: any) => ({
      company: job.company || '',
      title: job.title || '',
      start: job.start || '',
      end: job.end || '',
      duties: job.duties || '',
    })),
  };

  return resumeData;
}

/**
 * Extract job context from the current page
 * Works for both external ATS pages and LinkedIn Easy Apply modals
 */
function getJobContextFromPage(): { jobTitle?: string; company?: string; jobDescription?: string } {
  let jobTitle: string | undefined;
  let company: string | undefined;

  // ============================================================================
  // LINKEDIN EASY APPLY MODAL
  // Modal header: "Apply to [Company]", job title in background
  // ============================================================================

  // Check for LinkedIn modal header (e.g., "Apply to Skyrocket Ventures")
  const modalHeader = document.querySelector(
    '.jobs-easy-apply-modal h2, [data-test-modal-title], .modal-header h2, .artdeco-modal__header h2'
  );
  if (modalHeader?.textContent?.trim()) {
    const headerText = modalHeader.textContent.trim();
    // Extract company from "Apply to [Company]"
    const applyMatch = headerText.match(/Apply to (.+)/i);
    if (applyMatch && applyMatch[1]) {
      company = applyMatch[1].trim();
    }
  }

  // For LinkedIn, job title is usually in the job details panel behind the modal
  const linkedInJobTitleSelectors = [
    '.jobs-unified-top-card__job-title',
    '.job-details-jobs-unified-top-card__job-title',
    '.jobs-details__main-content h1',
    '.t-24.job-details-jobs-unified-top-card__job-title',
  ];

  for (const selector of linkedInJobTitleSelectors) {
    const el = document.querySelector(selector);
    if (el?.textContent?.trim()) {
      jobTitle = el.textContent.trim();
      break;
    }
  }

  // LinkedIn company name (if not from modal header)
  if (!company) {
    const linkedInCompanySelectors = [
      '.jobs-unified-top-card__company-name',
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-details__main-content .company-name',
    ];

    for (const selector of linkedInCompanySelectors) {
      const el = document.querySelector(selector);
      if (el?.textContent?.trim()) {
        company = el.textContent.trim();
        break;
      }
    }
  }

  // ============================================================================
  // EXTERNAL ATS PAGES (Greenhouse, Lever, Workday, etc.)
  // ============================================================================

  // Try to find job title from page header (if not already found)
  if (!jobTitle) {
    const titleSelectors = [
      'h1',
      '.job-title',
      '[class*="job-title"]',
      '.header h2',
      '.job-info h1',
    ];

    for (const selector of titleSelectors) {
      const el = document.querySelector(selector);
      if (el?.textContent?.trim()) {
        jobTitle = el.textContent.trim();
        break;
      }
    }
  }

  // Try to find company name from job-meta (e.g., "Anduril Industries • Lexington, MA • Full-time")
  if (!company) {
    const jobMeta = document.querySelector('.job-meta');
    if (jobMeta?.textContent?.trim()) {
      const metaText = jobMeta.textContent.trim();
      const parts = metaText.split('•');
      if (parts[0]) {
        company = parts[0].trim();
      }
    }
  }

  // Fallback to other company selectors if job-meta didn't work
  if (!company || company.length < 2) {
    const companySelectors = [
      '.company-name',
      '[class*="company-name"]',
      '.employer-name',
      '.header .subtitle',
    ];

    for (const selector of companySelectors) {
      const el = document.querySelector(selector);
      const text = el?.textContent?.trim();
      if (text && text.length > 1) {
        company = text;
        break;
      }
    }
  }

  // Try to find job description
  const descSelectors = ['.job-description', '[class*="description"]', '.job-details', 'main p'];

  let jobDescription: string | undefined;
  for (const selector of descSelectors) {
    const el = document.querySelector(selector);
    const descText = el?.textContent?.trim();
    if (descText && descText.length > 100) {
      jobDescription = descText.substring(0, 2000); // Limit length
      break;
    }
  }

  console.log('[FormFiller] Extracted job context from page:', {
    jobTitle,
    company,
    hasDescription: !!jobDescription,
    descriptionLength: jobDescription?.length,
  });

  return { jobTitle, company, jobDescription };
}
