/**
 * extractor/utils/combobox-option-filter.ts
 *
 * Utility for matching a wanted value against a large list of real dropdown options.
 * Addresses the problem where comboboxes may have 200+ entries (e.g. country lists)
 * and the LLM may return a value that doesn't exactly match any option string.
 *
 * Used by:
 *   - filler/fill.ts         → at fill time, to resolve LLM value → exact option text
 *   - llm/plan-reconciler.ts → to validate and correct plan actions before filling
 */

/** Prepare a string for comparison only — the original strings are never modified */
function toComparableForm(str: string): string {
    return str
        .toLowerCase()
        .replace(/\s*\+\d{1,3}\b/g, '')       // strip phone codes: "+1", "+44"
        .replace(/\busa\b/g, 'united states')
        .replace(/\bus\b/g, 'united states')
        .replace(/\buk\b/g, 'united kingdom')
        .replace(/\bca\b/g, 'canada')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function sharedWordCount(a: string, b: string): number {
    const wordsA = new Set(a.split(' '));
    return b.split(' ').filter(w => wordsA.has(w)).length;
}

/**
 * Find which option in the list best matches the wanted value.
 * Returns the original, unmodified option string, or null if no reasonable match.
 * The options[] array is never modified.
 */
export function findBestMatch(wanted: string, options: string[]): string | null {
    if (!options || options.length === 0) return null;

    const cmpWanted = toComparableForm(wanted);

    for (const opt of options) {
        if (toComparableForm(opt) === cmpWanted) return opt;
    }
    for (const opt of options) {
        const c = toComparableForm(opt);
        if (c.includes(cmpWanted) || cmpWanted.includes(c)) return opt;
    }

    let bestOpt: string | null = null;
    let bestScore = 0;
    for (const opt of options) {
        const score = sharedWordCount(cmpWanted, toComparableForm(opt));
        if (score > bestScore) { bestScore = score; bestOpt = opt; }
    }
    const wantedWords = cmpWanted.split(' ').length;
    if (bestOpt && bestScore >= Math.ceil(wantedWords / 2)) return bestOpt;

    return null;
}
