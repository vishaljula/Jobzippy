import { createFormFillerFromVault } from './form-filler';
import { PageClassification } from './classifier';
import { logger } from '../../lib/logger';

export interface FieldFillingContext {
  resume?: { data: string; fileName?: string; mimeType?: string };
  profile?: any;
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

  // 1. Create Filler (Local + LLM Config)
  const filler = await createFormFillerFromVault(context.resume, context.profile);

  if (!filler) {
    logger.error('FieldFiller', 'Failed to create form filler instance');
    return { success: false, filled: 0, skipped: 0, errors: 1 };
  }

  // 2. Execute Fill
  // Note: filler.fillForm currently handles both local and certain LLM questions internally
  try {
    await filler.fillForm(classification);
    // TODO: Update FormFiller to return detailed stats. For now, assume if it throws no error, it worked.
    return { success: true, filled: 1, skipped: 0, errors: 0 };
  } catch (error) {
    logger.error('FieldFiller', 'Error during fill execution', error);
    return { success: false, filled: 0, skipped: 0, errors: 1 };
  }
}
