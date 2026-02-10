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

export interface FormFillerConfig {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address?: string;
  workAuth?: 'yes' | 'no';
  sponsorshipRequired?: boolean;
  linkedin?: string;
  website?: string;
  resumeFile?: File;
  // Job context for LLM
  jobTitle?: string;
  company?: string;
  jobDescription?: string;
  // Resume data for LLM
  resumeData?: ResumeData;
}

// Guard to prevent double-filling during the same session
let isCurrentlyFilling = false;

export class FormFiller {
  private config: FormFillerConfig;

  constructor(config: FormFillerConfig) {
    this.config = config;
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

    // Build questions list
    const questions: FormQuestion[] = [];
    const fieldMap = new Map<string, DetectedField>();
    let localFilledCount = 0;

    for (const field of fields) {
      const element = field.element as HTMLElement;
      if (!element) continue;

      // Get question text - prefer pre-computed labelText from classifier
      const questionText = field.labelText || this.findLabelText(element) || field.purpose || '';

      logger.log('FormFiller', `Processing unknown field: "${questionText.substring(0, 60)}..."`);

      // Try local answer first (faster, no API call)
      // Detect required from multiple sources (element, fieldset, labelText with *)
      const isRequired: boolean =
        (element as HTMLInputElement).required ||
        element.hasAttribute('required') ||
        element.getAttribute('aria-required') === 'true' ||
        element.closest('fieldset')?.hasAttribute('required') === true ||
        (field.labelText?.includes('*') ?? false);

      // Extract options - from select elements or from labelText for radio buttons
      // Radio labelText format: "Question? * [Options: Yes, No]"
      let localOptions: string[] | undefined;
      if (element instanceof HTMLSelectElement) {
        localOptions = Array.from(element.options)
          .map((o) => o.textContent?.trim() || '')
          .filter(Boolean);
      } else if (field.labelText?.includes('[Options:')) {
        const optionsMatch = field.labelText.match(/\[Options:\s*([^\]]+)\]/);
        if (optionsMatch && optionsMatch[1]) {
          localOptions = optionsMatch[1]
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean);
        }
      }

      const localAnswer = tryAnswerLocally(
        {
          fieldId:
            field.purpose && field.purpose !== 'unknown'
              ? field.purpose
              : `unknown_field_${questions.length}`,
          questionText,
          inputType: this.getInputTypeForLLM(element),
          options: localOptions,
          isRequired,
        },
        this.config.resumeData!,
        { sponsorship_required: this.config.sponsorshipRequired }
      );

      if (localAnswer !== null) {
        logger.log('FormFiller', `Local answer found: "${localAnswer}"`);
        // Fill locally - track if it was successful
        const fillSuccess = await this.fillFieldWithValue(element, field.type, localAnswer);
        if (fillSuccess) {
          localFilledCount++;
          logger.log('FormFiller', `Successfully filled field with local answer: "${localAnswer}"`);
          continue; // Successfully filled, move to next field
        } else {
          logger.log(
            'FormFiller',
            `Failed to fill field with local answer: "${localAnswer}", will try LLM`
          );
          // Fall through to add to LLM questions - don't continue!
        }
      }

      // Need LLM for this one - but only if we have job context
      if (!this.config.jobTitle) {
        logger.log(
          'FormFiller',
          `No job title for LLM, skipping field: "${questionText.substring(0, 40)}..."`
        );
        continue;
      }

      // Use unique ID for unknown fields to prevent collision in fieldMap
      const fieldId =
        field.purpose && field.purpose !== 'unknown'
          ? field.purpose
          : `unknown_field_${questions.length}`;

      // Extract options - from select elements or from labelText for radio buttons
      // Radio labelText format: "Question? * [Options: Yes, No]"
      let options: string[] | undefined;
      if (element instanceof HTMLSelectElement) {
        options = Array.from(element.options)
          .map((o) => o.textContent?.trim() || '')
          .filter(Boolean);
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
        inputType: this.getInputTypeForLLM(element),
        options,
        maxLength:
          (element as HTMLInputElement).maxLength > 0
            ? (element as HTMLInputElement).maxLength
            : undefined,
        isRequired,
        validationError, // Include error from previous attempt
        previousAnswer, // Include what was answered before
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
      if (element && this.config.jobDescription) {
        const coverLetter = await generateCoverLetter({
          jobTitle: this.config.jobTitle!,
          company: this.config.company || 'the company',
          jobDescription: this.config.jobDescription,
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
    const answers = await answerQuestionBatch({
      jobTitle: this.config.jobTitle!,
      company: this.config.company || 'the company',
      jobDescription: this.config.jobDescription,
      questions,
      resumeData: this.config.resumeData!,
    });

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

    return filled + localFilledCount;
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
    return 'text';
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
        // Find the radio with matching value and click it
        // Look in form first, then fieldset, then fall back to document
        const fieldset = element.closest('fieldset');
        const form = element.closest('form');
        const container = fieldset || form || document;
        const radios = container.querySelectorAll(`input[name="${element.name}"]`);
        const radioList = radios.length > 0 ? Array.from(radios) : [element];

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

    // =========================================================================
    // SKIP PRE-FILLED FIELDS (except resume which is handled above)
    // LinkedIn pre-fills many fields from the user's profile - don't overwrite
    // UNLESS the field has a validation error from a previous attempt
    // =========================================================================
    if (this.isFieldPreFilled(element)) {
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
      if (isRequired) {
        logger.log('FormFiller', `No value for required field, needs LLM: ${field.purpose}`);
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
      fullName: `${this.config.firstName} ${this.config.lastName}`,
      email: this.config.email,
      phone: this.config.phone,
      address: this.config.address,
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
  providedProfile?: any // Add profile parameter
): Promise<FormFiller | null> {
  try {
    logger.log('FormFiller', 'Loading user data from vault via background...');
    console.log('[FormFiller] createFormFillerFromVault called with providedResume:', {
      hasProvidedResume: !!providedResume,
      hasData: !!providedResume?.data,
      dataLength: providedResume?.data?.length || 0,
      fileName: providedResume?.fileName,
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
    const config: FormFillerConfig = {
      firstName: profile.identity.first_name,
      lastName: profile.identity.last_name,
      email: profile.identity.email,
      phone: profile.identity.phone,
      address: profile.identity.address,
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
    };

    logger.log('FormFiller', 'Created from vault data with LLM context', {
      hasResumeData: !!config.resumeData,
      hasJobTitle: !!config.jobTitle,
      hasCompany: !!config.company,
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
