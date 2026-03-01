/**
 * llm/vision-defaults.ts
 * Applies deterministic defaults to vision-discovered fields.
 *
 * When Claude Vision returns a field with an empty answer, this module
 * pattern-matches the question label and fills in a sensible default
 * WITHOUT any additional LLM call.
 *
 * Rules:
 * 1. Work authorization questions → "Yes"
 * 2. Sponsorship questions        → "No"
 * 3. EEO/diversity questions      → "I prefer not to answer" (or equivalent)
 * 4. Everything else              → left as-is
 */
import type { VisionField } from '../extractor/types.js';
import type { AgentProfile } from '../types.js';

// ── Pattern tables ────────────────────────────────────────────────────────────

const WORK_AUTH_PATTERNS = [
    /legally authorized to work/i,
    /authorized to work/i,
    /eligible to work/i,
    /right to work/i,
];

const SPONSORSHIP_PATTERNS = [
    /sponsor.*immigration/i,
    /require.*sponsorship/i,
    /need.*sponsorship/i,
    /sponsorship.*visa/i,
    /work authorization.*sponsor/i,
];

/** EEO fields that should default to "prefer not to answer" */
const EEO_PATTERNS = [
    /gender identity/i,
    /identify as transgender/i,
    /sexual orientation/i,
    /ethnic|racial category/i,
    /disability/i,
    /veteran/i,
    /communities.*belong/i,
    /how do you identify/i,
    /race.*ethnic/i,
];

const AGE_PATTERNS = [
    /your current age/i,
    /what is your age/i,
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Find the best "prefer not to answer" option from a choices list, case-insensitive. */
function findPreferNotToAnswer(choices: string[] | null): string {
    if (!choices || choices.length === 0) return '';
    return (
        choices.find(c => /prefer not|not to answer|decline/i.test(c)) ??
        choices.find(c => /none/i.test(c)) ??
        ''
    );
}

function matchesAny(label: string, patterns: RegExp[]): boolean {
    return patterns.some(p => p.test(label));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Applies profile-aware and EEO-safe defaults to vision-discovered fields.
 * Returns a new array — never mutates input.
 */
export function applyVisionDefaults(
    fields: VisionField[],
    _profile: AgentProfile,          // reserved for future per-profile customization
): VisionField[] {
    return fields.map(field => {
        const { label, choices, answer } = field;

        // Skip if already has a non-empty answer
        const hasAnswer = Array.isArray(answer)
            ? answer.length > 0
            : answer !== '' && answer != null;

        if (hasAnswer) return field;

        // ── Work authorization → Yes ──────────────────────────────────────
        if (matchesAny(label, WORK_AUTH_PATTERNS)) {
            const yesOption = choices?.find(c => /^yes$/i.test(c.trim())) ?? 'Yes';
            return { ...field, answer: yesOption };
        }

        // ── Sponsorship needed → No ───────────────────────────────────────
        if (matchesAny(label, SPONSORSHIP_PATTERNS)) {
            const noOption = choices?.find(c => /^no$/i.test(c.trim())) ?? 'No';
            return { ...field, answer: noOption };
        }

        // ── EEO/diversity → prefer not to answer ─────────────────────────
        if (matchesAny(label, EEO_PATTERNS)) {
            const pnta = findPreferNotToAnswer(choices);
            return { ...field, answer: pnta };
        }

        // ── Age → prefer not to answer ────────────────────────────────────
        if (matchesAny(label, AGE_PATTERNS)) {
            const pnta = findPreferNotToAnswer(choices);
            return { ...field, answer: pnta };
        }

        return field;
    });
}
