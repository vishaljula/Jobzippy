/**
 * Form Filler - Automatically fills job application forms
 * Uses the dynamic classifier's field detection and vault data
 */

import type { PageClassification, DetectedField } from './classifier';
import { logger } from '../../lib/logger';

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
    logger.log('FormFiller', 'Fields detected', classification.fields.map(f => ({
      purpose: f.purpose,
      type: f.type,
      confidence: f.confidence,
      selector: f.selectors[0]
    })));

    let filledCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const field of classification.fields) {
      try {
        logger.log('FormFiller', `Filling field: ${field.purpose}`, { type: field.type, selectors: field.selectors });
        const filled = await this.fillField(field);
        if (filled) {
          filledCount++;
        } else {
          skippedCount++;
        }
      } catch (error) {
        errorCount++;
        logger.error('FormFiller', `Error filling field: ${field.purpose}`, error);
        console.error('[FormFiller] Error filling field:', field.purpose, error);
      }
    }

    logger.log('FormFiller', `Form fill complete: ${filledCount} filled, ${skippedCount} skipped, ${errorCount} errors`);
    console.log(`[FormFiller] Form fill complete: ${filledCount} filled, ${skippedCount} skipped, ${errorCount} errors`);
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
    const isRequired = element.hasAttribute('required') || (element as HTMLInputElement | HTMLSelectElement).required;
    
    if (!this.isVisible(element) && !(isFileInput && isRequired)) {
      logger.log('FormFiller', `Skipping hidden field: ${field.purpose} (not required file input)`);
      console.log('[FormFiller] Skipping hidden field:', field.purpose);
      return false;
    }
    
    // For required hidden file inputs, make them temporarily visible to fill
    let wasHidden = false;
    let originalDisplay = '';
    if (isFileInput && isRequired && !this.isVisible(element)) {
      logger.log('FormFiller', `Required file input is hidden, making temporarily visible: ${field.purpose}`);
      console.log('[FormFiller] Required file input is hidden, making temporarily visible:', field.purpose);
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

    logger.log('FormFiller', `Filling field: ${field.purpose}`, { value: String(value).substring(0, 20) + '...', elementType: element.tagName });
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
      workAuth: this.config.workAuth === 'yes' ? 'yes' : (this.config.workAuth === 'no' ? 'no' : 'yes'), // Default to 'yes' if not set
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
      input.checked = Boolean(value);
      this.triggerEvents(input);
      return;
    }

    // Text, email, tel, etc.
    input.value = String(value);
    this.triggerEvents(input);
  }

  /**
   * Fill a textarea element
   */
  private async fillTextarea(
    textarea: HTMLTextAreaElement,
    value: string | number | boolean | null | undefined
  ): Promise<void> {
    textarea.value = String(value);
    this.triggerEvents(textarea);
  }

  /**
   * Fill a select element
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
      options: Array.from(select.options).map(o => ({ value: o.value, text: o.textContent?.substring(0, 50) }))
    });

    // Try multiple matching strategies
    for (const option of Array.from(select.options)) {
      const optionValue = option.value.toLowerCase();
      const optionText = (option.textContent?.toLowerCase() || '').trim();

      // Exact value match
      if (optionValue === stringValue) {
        select.value = option.value;
        this.triggerEvents(select);
        logger.log('FormFiller', `Selected option by exact value match: ${option.value}`);
        return;
      }

      // Text contains value
      if (optionText.includes(stringValue)) {
        select.value = option.value;
        this.triggerEvents(select);
        logger.log('FormFiller', `Selected option by text match: ${option.value} (${optionText.substring(0, 50)})`);
        return;
      }

      // Value contains text (for cases like "yes" matching "yes_active")
      if (optionValue.includes(stringValue) && stringValue.length >= 2) {
        select.value = option.value;
        this.triggerEvents(select);
        logger.log('FormFiller', `Selected option by partial value match: ${option.value}`);
        return;
      }

      // Special handling for common patterns
      if (stringValue === 'yes' && (optionText.includes('yes') || optionValue.includes('yes'))) {
        // Prefer "Yes" over "Yes, I currently hold..." etc.
        if (!optionText.includes('currently') && !optionText.includes('eligible')) {
          select.value = option.value;
          this.triggerEvents(select);
          logger.log('FormFiller', `Selected option by 'yes' pattern: ${option.value}`);
          return;
        }
      }
    }

    // If no match found, try to select first non-empty option as fallback
    const firstNonEmpty = Array.from(select.options).find(opt => opt.value && opt.value !== '');
    if (firstNonEmpty && select.required) {
      logger.log('FormFiller', `No match found, selecting first non-empty option as fallback: ${firstNonEmpty.value}`);
      select.value = firstNonEmpty.value;
      this.triggerEvents(select);
    } else {
      logger.log('FormFiller', `No matching option found for: ${stringValue}`, {
        availableOptions: Array.from(select.options).map(o => ({ value: o.value, text: o.textContent?.substring(0, 50) }))
      });
      console.warn('[FormFiller] No matching option found for:', stringValue);
    }
  }

  /**
   * Fill a radio button
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
        radioInput.checked = true;
        this.triggerEvents(radioInput);
        return;
      }
    }
  }

  /**
   * Fill a file input (resume)
   */
  private async fillFileInput(input: HTMLInputElement): Promise<void> {
    if (!this.config.resumeFile) {
      logger.log('FormFiller', 'No resume file available - this is a required field!');
      console.error('[FormFiller] No resume file available - this is a required field!');
      // Don't skip - this will cause validation to fail, which is correct
      // The user needs to upload a resume during onboarding
      return;
    }

    try {
      // Make sure input is accessible (even if hidden)
      const wasHidden = !this.isVisible(input);
      if (wasHidden) {
        logger.log('FormFiller', 'File input is hidden, making temporarily accessible');
        const originalDisplay = input.style.display;
        input.style.display = 'block';
        input.style.visibility = 'visible';
        input.style.opacity = '1';
        input.style.position = 'absolute';
        input.style.left = '-9999px';
        
        // Use DataTransfer API to set files
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(this.config.resumeFile!);
        input.files = dataTransfer.files;
        this.triggerEvents(input);
        
        // Restore original display
        input.style.display = originalDisplay;
        logger.log('FormFiller', `Resume file attached: ${this.config.resumeFile.name}`);
        console.log('[FormFiller] Resume file attached:', this.config.resumeFile.name);
      } else {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(this.config.resumeFile);
      input.files = dataTransfer.files;
      this.triggerEvents(input);
        logger.log('FormFiller', `Resume file attached: ${this.config.resumeFile.name}`);
        console.log('[FormFiller] Resume file attached:', this.config.resumeFile.name);
      }
    } catch (error) {
      logger.error('FormFiller', 'Error attaching resume file', error);
      console.error('[FormFiller] Error attaching resume:', error);
      throw error;
    }
  }

  /**
   * Trigger necessary events for form libraries to detect changes
   */
  private triggerEvents(element: HTMLElement): void {
    // Trigger input event
    element.dispatchEvent(new Event('input', { bubbles: true }));

    // Trigger change event
    element.dispatchEvent(new Event('change', { bubbles: true }));

    // Trigger blur event (some forms validate on blur)
    element.dispatchEvent(new Event('blur', { bubbles: true }));
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
export async function createFormFillerFromVault(): Promise<FormFiller | null> {
  try {
    logger.log('FormFiller', 'Loading user data from vault via background...');

    // Request profile from background script (which has access to IndexedDB)
    const response = await chrome.runtime.sendMessage({ type: 'GET_PROFILE' });
    logger.log('FormFiller', 'Background response', response);

    let profile = response?.profile;

    if (!profile) {
      logger.log('FormFiller', 'No profile returned from background, using mock data');
      console.warn('[FormFiller] No profile data, using mock data');

      // Use mock data for testing
      const { MOCK_VAULT_DATA } = await import('./mock-vault-data');
      profile = MOCK_VAULT_DATA;
    }

    // Load resume file from vault
    let resumeFile: File | undefined = undefined;
    
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
        
        logger.log('FormFiller', `Resume file loaded from vault: ${fileName} (${resumeResponse.resume.size} bytes)`);
        console.log('[FormFiller] Resume file loaded from vault:', fileName);
      } else {
        logger.log('FormFiller', 'No resume file found in vault');
        console.warn('[FormFiller] No resume file found in vault - user needs to upload resume during onboarding');
      }
    } catch (error) {
      logger.error('FormFiller', 'Error loading resume from vault', error);
      console.error('[FormFiller] Error loading resume from vault:', error);
    }

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
