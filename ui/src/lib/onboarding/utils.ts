import { ProfileVault } from '@/lib/types';
import { IntakeProcessResult } from '@/lib/intake/types';

export function mergeExtractedData(
  currentDraft: ProfileVault | null,
  extracted: IntakeProcessResult
): ProfileVault {
  const llm = extracted.llm;

  // If no current draft, use the extracted data as the base,
  // ensuring we have the correct structure.
  // Note: We assume the LLM response matches the ProfileVault structure
  // as defined in the types.
  if (!currentDraft) {
    return {
      profile: llm.profile,
      compliance: llm.compliance,
      history: llm.history,
      policies: llm.policies,
    };
  }

  // Helper to deep merge objects, preferring non-empty values from source
  const merge = (target: any, source: any): any => {
    if (source === undefined || source === null) return target;
    if (target === undefined || target === null) return source;

    if (Array.isArray(source)) {
      // For arrays, we generally prefer the source if it has items,
      // or maybe append? For now, let's replace if source has items.
      return source.length > 0 ? source : target;
    }

    if (typeof source === 'object' && typeof target === 'object') {
      const result = { ...target };
      for (const key in source) {
        const sourceValue = source[key];
        const targetValue = target[key];

        // If source has a value
        if (sourceValue !== undefined && sourceValue !== null && sourceValue !== '') {
          // If it's an object, recurse
          if (typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
            result[key] = merge(targetValue, sourceValue);
          } else {
            // Otherwise replace
            result[key] = sourceValue;
          }
        }
      }
      return result;
    }

    return source !== undefined && source !== null && source !== '' ? source : target;
  };

  return {
    profile: merge(currentDraft.profile, llm.profile),
    compliance: merge(currentDraft.compliance, llm.compliance),
    history: merge(currentDraft.history, llm.history),
    policies: merge(currentDraft.policies, llm.policies),
  };
}
