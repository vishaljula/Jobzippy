/**
 * llm/plan-reconciler.ts
 *
 * Architectural layer that sits between the LLM fill plan and fill execution.
 *
 * The LLM is great at understanding intent but may output a value that isn't
 * an exact option string (e.g. "Dallas" when options are [Menlo Park, CA | New York, NY | ...]).
 * This reconciler corrects such mismatches deterministically before the filler runs.
 *
 * Pipeline position:
 *   extract → combobox expand → LLM plan → [RECONCILE] → fill
 *
 * Rules:
 *   1. If LLM value exactly matches an option (case-insensitive) → keep it as-is
 *   2. If value doesn't match → try findBestMatch() (fuzzy / word-overlap)
 *   3. If no fuzzy match → fall back to options[0] (first available)
 *   4. All corrections are logged clearly so you can audit LLM drift
 *
 * Non-combobox fields and fields with no options are passed through unchanged.
 */

import type { ExtractedElement, FillAction } from '../extractor/types.js';
import { findBestMatch } from '../extractor/utils/combobox-option-filter.js';

export interface ReconcileResult {
    plan: FillAction[];              // corrected plan — ready for fill execution
    corrections: CorrectionLog[];    // what was changed and why
}

export interface CorrectionLog {
    id: string;
    label: string;
    llmValue: string;   // what LLM said
    usedValue: string;  // what we actually used
    matchType: 'exact' | 'fuzzy' | 'fallback';
}

/**
 * Reconcile the LLM fill plan against the real extracted elements' options.
 * Returns a corrected plan and a log of every correction made.
 */
export function reconcilePlan(
    plan: FillAction[],
    elements: ExtractedElement[],
): ReconcileResult {
    const corrections: CorrectionLog[] = [];

    const correctedPlan: FillAction[] = plan.map(action => {
        if (action.action_type !== 'combobox') return action;

        const el = elements.find(e => e.id === action.id);
        const options = el?.options ?? [];
        if (options.length === 0) return action; // no options to check against

        const value = action.value;

        // Check 1: exact match (case-insensitive)
        const exactMatch = options.find(o => o.toLowerCase() === value.toLowerCase());
        if (exactMatch) {
            // Correct capitalisation if needed
            if (exactMatch !== value) {
                corrections.push({ id: action.id, label: el?.label ?? '', llmValue: value, usedValue: exactMatch, matchType: 'exact' });
                return { ...action, value: exactMatch };
            }
            return action; // already exact, no change
        }

        // Check 2: fuzzy match via option-matcher
        const fuzzyMatch = findBestMatch(value, options);
        if (fuzzyMatch) {
            corrections.push({ id: action.id, label: el?.label ?? '', llmValue: value, usedValue: fuzzyMatch, matchType: 'fuzzy' });
            return { ...action, value: fuzzyMatch };
        }

        // Check 3: fallback — take first available option
        const fallback = options[0];
        corrections.push({ id: action.id, label: el?.label ?? '', llmValue: value, usedValue: fallback, matchType: 'fallback' });
        return { ...action, value: fallback };
    });

    return { plan: correctedPlan, corrections };
}

/** Pretty-print the reconciliation report to console */
export function printReconciliationReport(corrections: CorrectionLog[]): void {
    if (corrections.length === 0) {
        console.log('   ✅ All LLM values matched available options — no corrections needed.\n');
        return;
    }
    for (const c of corrections) {
        const icon = c.matchType === 'exact' ? '🔤' : c.matchType === 'fuzzy' ? '🔍' : '⚠️ ';
        console.log(`   ${icon} [${c.matchType.padEnd(8)}] "${c.llmValue}" → "${c.usedValue}"   (${c.label.slice(0, 40)})`);
    }
    console.log();
}
