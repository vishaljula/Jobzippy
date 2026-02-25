import { createFormFillerFromVault } from './form-filler';
import { PageClassification } from './classifier';
import { logger } from '../../lib/logger';
import { humanizeConfig } from '../../lib/humanize';

export interface FieldFillingContext {
  resume?: { data: string; fileName?: string; mimeType?: string };
  profile?: any;
  mode?: 'autonomous' | 'autofill'; // Add mode to context
}

export type FillingResult = {
  success: boolean;
  filled: number;
  skipped: number;
  errors: number;
};

/**
 * Consolidate Logic: Fill all fields on the current page
 *
 * Strategy:
 * 1. Vault Fill: Use local data (FormFiller)
 * 2. LLM Fill: (Future) Handled internally by FormFiller for now, but can be extracted here
 */
export async function fillAllFields(
  classification: PageClassification,
  context: FieldFillingContext
): Promise<FillingResult> {
  logger.log('FieldFiller', 'Initializing form filler logic...');

  // Set autofill mode in humanize config if in autofill mode
  // This disables all humanization (delays, typing animations) for instant filling
  const previousAutofillMode = humanizeConfig.autofillMode;
  if (context.mode === 'autofill') {
    humanizeConfig.autofillMode = true;
    logger.log('FieldFiller', 'Autofill mode enabled - humanization disabled for instant filling');
    console.log('[FieldFiller] Autofill mode: humanization disabled');
  }

  try {
    // 1. Create Filler (Local + LLM Config)
    // Always skip pre-filled fields — re-filling already-correct fields causes corruption
    // on repeated autofill runs and overwrites user edits. The only exception is when
    // a field has a validation error (handled inside FormFiller.fillField).
    const skipPreFilled = true;
    const filler = await createFormFillerFromVault(context.resume, context.profile, skipPreFilled);

    if (!filler) {
      logger.error('FieldFiller', 'Failed to create form filler instance');
      return { success: false, filled: 0, skipped: 0, errors: 1 };
    }

    // 2. Execute Fill
    // Note: filler.fillForm currently handles both local and certain LLM questions internally
    await filler.fillForm(classification);
    // TODO: Update FormFiller to return detailed stats. For now, assume if it throws no error, it worked.
    return { success: true, filled: 1, skipped: 0, errors: 0 };
  } catch (error) {
    logger.error('FieldFiller', 'Error during fill execution', error);
    return { success: false, filled: 0, skipped: 0, errors: 1 };
  } finally {
    // Always restore previous autofill mode state
    humanizeConfig.autofillMode = previousAutofillMode;
    if (context.mode === 'autofill') {
      logger.log('FieldFiller', 'Autofill mode disabled - humanization restored');
      console.log('[FieldFiller] Humanization restored to normal mode');
    }
  }
}
