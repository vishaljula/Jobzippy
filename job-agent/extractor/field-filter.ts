/**
 * extractor/field-filter.ts
 *
 * Post-extraction filter that strips ATS-native UI widgets from the element list
 * before it reaches the LLM planner or combobox expander.
 *
 * Why this exists instead of modifying common-fields.js:
 *   common-fields.js is Skyvern's vendor code — we treat it as read-only.
 *   This filter runs in Node.js *after* page.evaluate(FIELD_EXTRACTOR) returns,
 *   so common-fields.js stays untouched.
 *
 * What it filters:
 *   · ATS autofill-resume widgets (Ashby, Workday) — file upload inputs that
 *     trigger the ATS's own autofill flow, re-rendering the DOM and wiping all
 *     our data-jz-id stamps. Only the real "Resume" field should be filled.
 *
 * Pipeline position:
 *   page.evaluate(common-fields.js) → raw elements[]
 *          ↓
 *   filterAtsWidgets(elements)      → clean elements[]   ← HERE
 *          ↓
 *   expandComboboxOptions → buildFillPlan → reconcilePlan → executeAllFills
 */

import type { ExtractedElement } from './types.js';

// Keywords that identify ATS-native autofill upload widgets (not real form fields).
// Checked against the element's resolved label text.
const AUTOFILL_WIDGET_PATTERNS: RegExp[] = [
    /autofill.{0,20}resume/i,    // "Autofill from resume"
    /resume.{0,20}autofill/i,    // "Resume autofill"
    /get.{0,20}autofilled/i,     // "get autofilled"
    /upload.{0,30}autofill/i,    // "upload to autofill"
    /autofill key/i,             // "autofill key application fields"
];

/**
 * Returns true if this element is an ATS autofill-resume widget that should
 * be excluded from the pipeline.
 */
function isAtsWidget(el: ExtractedElement): boolean {
    if (el.action_type !== 'upload_file') return false;
    return AUTOFILL_WIDGET_PATTERNS.some(p => p.test(el.label));
}

/**
 * Filter extracted elements, removing ATS-native UI widgets that should not
 * be filled. Logs any removed elements for observability.
 *
 * @param elements  Raw elements returned by page.evaluate(common-fields.js)
 * @param verbose   If true, logs removed elements to console
 * @returns         Cleaned element list safe to pass to the LLM planner
 */
export function filterAtsWidgets(
    elements: ExtractedElement[],
    verbose = true,
): ExtractedElement[] {
    const filtered: ExtractedElement[] = [];
    const removed: ExtractedElement[] = [];

    for (const el of elements) {
        if (isAtsWidget(el)) {
            removed.push(el);
        } else {
            filtered.push(el);
        }
    }

    if (verbose && removed.length > 0) {
        console.log(`   🚫 field-filter: removed ${removed.length} ATS autofill widget(s):`);
        for (const el of removed) {
            console.log(`      ${el.id}  ${el.action_type.padEnd(12)}  "${el.label.slice(0, 60)}"`);
        }
    }

    return filtered;
}
