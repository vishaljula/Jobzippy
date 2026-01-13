/**
 * Form Filler - Automatically fills job application forms
 * Uses the dynamic classifier's field detection and vault data
 *
 * Humanization: Uses jitter and proper event sequences for anti-detection
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
}

export class FormFiller {
  private config: FormFillerConfig;

  constructor(config: FormFillerConfig) {
    this.config = config;
  }

  /**
   * Fill all detected fields in the classification
   */
  async fillForm(classification: PageClassification): Promise<void> {
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

    for (const field of classification.fields) {
      try {
        logger.log('FormFiller', `Filling field: ${field.purpose}`, {
          type: field.type,
          selectors: field.selectors,
        });
        const filled = await this.fillField(field);
        if (filled) {
          filledCount++;
          // Add jitter between fields for human-like behavior
          if (humanizeConfig.enabled) {
            await jitter(300, 800); // Shorter jitter between fields
          }
        } else {
          skippedCount++;
        }
      } catch (error) {
        errorCount++;
        logger.error('FormFiller', `Error filling field: ${field.purpose}`, error);
        console.error('[FormFiller] Error filling field:', field.purpose, error);
      }
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
   * Fill a single field based on its purpose
   */
  async fillField(field: DetectedField): Promise<boolean> {
    const element = field.element as HTMLElement;

    if (!element) {
      logger.log('FormFiller', `Field element not found: ${field.purpose}`);
      return false;
    }

    // For file inputs, check if they're required - if so, we MUST fill them even if hidden
    const isFileInput = element instanceof HTMLInputElement && element.type === 'file';
    const isRequired =
      element.hasAttribute('required') ||
      (element as HTMLInputElement | HTMLSelectElement).required;

    if (!this.isVisible(element) && !(isFileInput && isRequired)) {
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

    // For file inputs (resume), handle them specially - don't use getValueForField
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

    const value = this.getValueForField(field.purpose);
    if (value === null || value === undefined) {
      logger.log('FormFiller', `No value for field: ${field.purpose}`);
      console.log('[FormFiller] No value for field:', field.purpose);
      return false;
    }

    logger.log('FormFiller', `Filling field: ${field.purpose}`, {
      value: String(value).substring(0, 20) + '...',
      elementType: element.tagName,
    });
    console.log('[FormFiller] Filling field:', field.purpose, 'with:', value);

    try {
      if (element instanceof HTMLInputElement) {
        await this.fillInput(element, value);
      } else if (element instanceof HTMLTextAreaElement) {
        await this.fillTextarea(element, value);
      } else if (element instanceof HTMLSelectElement) {
        await this.fillSelect(element, value);
      }

      // Restore original display style if we temporarily made it visible
      if (wasHidden) {
        (element as HTMLElement).style.display = originalDisplay;
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
      firstName: this.config.firstName,
      lastName: this.config.lastName,
      fullName: `${this.config.firstName} ${this.config.lastName}`,
      email: this.config.email,
      phone: this.config.phone,
      address: this.config.address,
      workAuth:
        this.config.workAuth === 'yes' ? 'yes' : this.config.workAuth === 'no' ? 'no' : 'yes', // Default to 'yes' if not set
      sponsorship: this.config.sponsorshipRequired ? 'yes' : 'no',
      clearance: 'no', // Default to 'no' for clearance questions
      exportControls: 'us_citizen', // Default to US Citizen for export controls
      country: 'us', // Default to United States for country
      previousApplication: 'no', // Default to 'no' for previous application
      previousEmployment: 'no', // Default to 'no' for previous employment
      conflictOfInterest: 'no', // Default to 'no' for conflict of interest
      linkedin: this.config.linkedin,
      website: this.config.website,
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
   */
  private async fillSelect(
    select: HTMLSelectElement,
    value: string | number | boolean | null | undefined
  ): Promise<void> {
    if (value === null || value === undefined) {
      logger.log('FormFiller', `No value provided for select field`);
      console.log('[FormFiller] No value provided for select field');
      return;
    }

    const stringValue = String(value).toLowerCase();
    logger.log('FormFiller', `Filling select with value: ${stringValue}`, {
      options: Array.from(select.options).map((o) => ({
        value: o.value,
        text: o.textContent?.substring(0, 50),
      })),
    });

    // Try multiple matching strategies
    for (const option of Array.from(select.options)) {
      const optionValue = option.value.toLowerCase();
      const optionText = (option.textContent?.toLowerCase() || '').trim();

      // Exact value match
      if (optionValue === stringValue) {
        await humanSelect(select, option.value);
        logger.log('FormFiller', `Selected option by exact value match: ${option.value}`);
        return;
      }

      // Text contains value
      if (optionText.includes(stringValue)) {
        await humanSelect(select, option.value);
        logger.log(
          'FormFiller',
          `Selected option by text match: ${option.value} (${optionText.substring(0, 50)})`
        );
        return;
      }

      // Value contains text (for cases like "yes" matching "yes_active")
      if (optionValue.includes(stringValue) && stringValue.length >= 2) {
        await humanSelect(select, option.value);
        logger.log('FormFiller', `Selected option by partial value match: ${option.value}`);
        return;
      }

      // Special handling for common patterns
      if (stringValue === 'yes' && (optionText.includes('yes') || optionValue.includes('yes'))) {
        // Prefer "Yes" over "Yes, I currently hold..." etc.
        if (!optionText.includes('currently') && !optionText.includes('eligible')) {
          await humanSelect(select, option.value);
          logger.log('FormFiller', `Selected option by 'yes' pattern: ${option.value}`);
          return;
        }
      }
    }

    // If no match found, try to select first non-empty option as fallback
    const firstNonEmpty = Array.from(select.options).find((opt) => opt.value && opt.value !== '');
    if (firstNonEmpty && select.required) {
      logger.log(
        'FormFiller',
        `No match found, selecting first non-empty option as fallback: ${firstNonEmpty.value}`
      );
      await humanSelect(select, firstNonEmpty.value);
    } else {
      logger.log('FormFiller', `No matching option found for: ${stringValue}`, {
        availableOptions: Array.from(select.options).map((o) => ({
          value: o.value,
          text: o.textContent?.substring(0, 50),
        })),
      });
      console.warn('[FormFiller] No matching option found for:', stringValue);
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
   * Check if an element is visible
   */
  private isVisible(element: HTMLElement): boolean {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    // Check if parent is visible
    const parent = element.parentElement;
    if (parent && parent !== document.body) {
      return this.isVisible(parent);
    }

    return true;
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

    // Create config from vault data
    const config: FormFillerConfig = {
      firstName: profile.identity.first_name,
      lastName: profile.identity.last_name,
      email: profile.identity.email,
      phone: profile.identity.phone,
      address: profile.identity.address,
      workAuth: profile.work_auth.visa_type === 'Citizen' ? 'yes' : 'no',
      sponsorshipRequired: profile.work_auth.sponsorship_required,
      resumeFile,
    };

    logger.log('FormFiller', 'Created from vault data', config);
    return new FormFiller(config);
  } catch (error) {
    logger.error('FormFiller', 'Error creating from vault', error);
    console.error('[FormFiller] Error creating from vault:', error);
    return null;
  }
}
