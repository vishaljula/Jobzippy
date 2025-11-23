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

    for (const field of classification.fields) {
      try {
        await this.fillField(field);
      } catch (error) {
        logger.error('FormFiller', `Error filling field: ${field.purpose}`, error);
        console.error('[FormFiller] Error filling field:', field.purpose, error);
      }
    }

    logger.log('FormFiller', 'Form fill complete');
    console.log('[FormFiller] Form fill complete');
  }

  /**
   * Fill a single field based on its purpose
   */
  async fillField(field: DetectedField): Promise<void> {
    const element = field.element as HTMLElement;

    if (!element || !this.isVisible(element)) {
      console.log('[FormFiller] Skipping hidden field:', field.purpose);
      return;
    }

    const value = this.getValueForField(field.purpose);
    if (value === null || value === undefined) {
      console.log('[FormFiller] No value for field:', field.purpose);
      return;
    }

    console.log('[FormFiller] Filling field:', field.purpose, 'with:', value);

    if (element instanceof HTMLInputElement) {
      await this.fillInput(element, value);
    } else if (element instanceof HTMLTextAreaElement) {
      await this.fillTextarea(element, value);
    } else if (element instanceof HTMLSelectElement) {
      await this.fillSelect(element, value);
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
      workAuth: this.config.workAuth,
      sponsorship: this.config.sponsorshipRequired ? 'yes' : 'no',
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
    const stringValue = String(value).toLowerCase();

    // Try to find matching option
    for (const option of Array.from(select.options)) {
      const optionValue = option.value.toLowerCase();
      const optionText = option.textContent?.toLowerCase() || '';

      if (optionValue === stringValue || optionText.includes(stringValue)) {
        select.value = option.value;
        this.triggerEvents(select);
        return;
      }
    }

    console.warn('[FormFiller] No matching option found for:', value);
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
      console.log('[FormFiller] No resume file available');
      return;
    }

    try {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(this.config.resumeFile);
      input.files = dataTransfer.files;
      this.triggerEvents(input);
      console.log('[FormFiller] Resume file attached');
    } catch (error) {
      console.error('[FormFiller] Error attaching resume:', error);
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

    // TODO: Load resume via background as well if needed, for now skipping resume file loading
    // or implementing a separate GET_RESUME message
    const resumeFile: File | undefined = undefined;

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
