/**
 * llm/merge-planner.ts
 * Layer 3b — Plan Merge
 *
 * Combines the DOM-sourced LLM fill plan (FillAction[], jz-id stamped)
 * with vision-discovered fields (VisionField[]) into a single MergedAction[]
 * that fill.ts can execute end-to-end.
 *
 * Merge rules:
 * - DOM actions are always preferred — added first, used as-is
 * - Vision fields are deduplicated against DOM labels (DOM wins on any overlap)
 * - Vision fields with empty answers are dropped (vision-defaults should have populated them)
 * - Visual type → action_type mapping is deterministic
 */
import type {
    ExtractedElement,
    FillAction,
    VisionField,
    VisualType,
    DomAction,
    VisionAction,
    MergedAction,
} from '../extractor/types.js';

// ── Visual type → action type mapping ────────────────────────────────────────

function visualTypeToActionType(vt: VisualType): VisionAction['action_type'] {
    switch (vt) {
        case 'button_choice':
        case 'radio_group': return 'click_button';
        case 'checkbox': return 'checkbox';
        case 'dropdown': return 'combobox';
        case 'file_upload': return 'upload_file';
        case 'text_input':
        case 'textarea':
        default: return 'input_text';
    }
}

// ── Label dedup ───────────────────────────────────────────────────────────────

function buildDomLabelSet(domElements: ExtractedElement[]): Set<string> {
    return new Set(
        domElements.map(e => e.label.toLowerCase().trim()),
    );
}

function isCoveredByDom(vf: VisionField, domLabels: Set<string>): boolean {
    const lc = vf.label.toLowerCase().trim();
    return [...domLabels].some(dl =>
        // Substring match in either direction, capped at 20 chars to handle
        // truncated Workday labels like "items selected" vs "Country Phone Code"
        (dl.length > 3 && lc.includes(dl.slice(0, 20))) ||
        (lc.length > 3 && dl.includes(lc.slice(0, 20))),
    );
}

// ── Vision field validity ─────────────────────────────────────────────────────

function hasUsableAnswer(vf: VisionField): boolean {
    if (Array.isArray(vf.answer)) return vf.answer.length > 0;
    return vf.answer !== '' && vf.answer != null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface MergedPlan {
    actions: MergedAction[];
    stats: {
        dom_count: number;
        vision_added: number;
        vision_skipped_covered: number;
        vision_skipped_empty: number;
    };
}

/**
 * Merges a reconciled DOM fill plan with vision-discovered supplemental fields.
 *
 * @param domPlan              Reconciled FillAction[] from plan-reconciler (jz-id stamped)
 * @param domElements          Original ExtractedElement[] for label lookup
 * @param visionFields         Vision-only VisionField[] (legacy path — for unlabelled fields)
 * @param visionActionsDirect  SoM-targeted VisionAction[] from new vision-extractor (preferred)
 */
export function mergePlans(
    domPlan: FillAction[],
    domElements: ExtractedElement[],
    visionFields: VisionField[],
    visionActionsDirect: VisionAction[] = [],
): MergedPlan {
    const domLabels = buildDomLabelSet(domElements);
    const domJzIds = new Set(domPlan.map(a => a.id));

    // ── 1. DOM actions → DomAction ─────────────────────────────────────────
    const domActions: DomAction[] = domPlan.map(action => {
        const el = domElements.find(e => e.id === action.id);
        return {
            ...action,
            source: 'dom' as const,
            label: el?.label ?? action.id,
        };
    });

    // ── 2. Direct SoM vision actions (preferred — have jz_id or coords) ───
    // Only suppress a SoM action if the DOM plan is ACTIVELY filling that element.
    // A DOM 'skip' entry must NOT block vision from handling it.
    const dedupedDirect = visionActionsDirect.filter(va => {
        if (!va.jz_id) return true;
        const domAction = domPlan.find(a => a.id === va.jz_id);
        return !domAction || domAction.action_type === 'skip';
    });

    // ── 3. Legacy vision fields → VisionAction (with dedup + validity filter) ─
    let skippedCovered = 0;
    let skippedEmpty = 0;
    const legacyVisionActions: VisionAction[] = [];

    // Build a label set from direct actions too (to avoid double-adding)
    const directLabels = new Set(dedupedDirect.map(va => va.label.toLowerCase().trim().slice(0, 20)));

    for (const vf of visionFields) {
        if (vf.already_filled) continue;

        if (isCoveredByDom(vf, domLabels)) {
            skippedCovered++;
            continue;
        }

        // Skip if already handled by a direct SoM action for the same question
        const lc = vf.label.toLowerCase().trim().slice(0, 20);
        if ([...directLabels].some(dl => dl.includes(lc) || lc.includes(dl))) {
            skippedCovered++;
            continue;
        }

        if (!hasUsableAnswer(vf)) {
            skippedEmpty++;
            console.log(`[merge] Skipping vision field with no answer: "${vf.label.slice(0, 60)}"`);
            continue;
        }

        legacyVisionActions.push({
            source: 'vision',
            label: vf.label,
            visual_type: vf.visual_type,
            choices: vf.choices ?? undefined,
            action_type: visualTypeToActionType(vf.visual_type),
            value: vf.answer,
        });
    }

    const allVisionActions = [...dedupedDirect, ...legacyVisionActions];

    return {
        actions: [...domActions, ...allVisionActions],
        stats: {
            dom_count: domActions.length,
            vision_added: allVisionActions.length,
            vision_skipped_covered: skippedCovered,
            vision_skipped_empty: skippedEmpty,
        },
    };
}

