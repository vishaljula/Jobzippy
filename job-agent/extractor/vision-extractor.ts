/**
 * extractor/vision-extractor.ts
 * Layer 2b — Vision Extraction (SoM-aware)
 *
 * Pipeline:
 *   1. Annotate all interactable elements with unique color borders
 *   2. Take full-page screenshot with annotations visible
 *   3. Remove annotations (restore page)
 *   4. Send annotated screenshot to Claude with SoM-aware prompt
 *   5. Claude returns actions keyed by jz_id or coords — no text-proximity guessing
 *
 * Design principles:
 * - Single API call per apply session
 * - Graceful degradation: if Vision fails, returns [] and pipeline continues
 * - Never modifies DOM permanently (annotations are removed after screenshot)
 * - Answer selection from profile happens inside the prompt — no second LLM call
 */
import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import type { Page } from 'playwright';
import type {
    ExtractedElement, VisionField, VisionAction, VisualType,
    ColorAnnotation,
} from './types.js';
import { annotateInteractableElements, removeAnnotations, findAnnotationByCoords } from './color-annotator.js';
import { applyVisionDefaults } from '../llm/vision-defaults.js';
import type { AgentProfile, ScrapedJob } from '../types.js';

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Prompt ───────────────────────────────────────────────────────────────────

function buildPrompt(profile: AgentProfile, job: ScrapedJob, annotations: ColorAnnotation[]): string {
    const { identity, employment, work_auth, eeo } = profile as any;
    const profileLines = [
        `Name: ${identity.first_name} ${identity.last_name}`,
        `Email: ${identity.email}`,
        `Phone: ${identity.phone}`,
        identity.address ? `Address: ${identity.address}` : null,
        employment?.[0] ? `Current employer: ${employment[0].company}, title: ${employment[0].title}` : null,
        work_auth ? `Sponsorship required: ${work_auth.sponsorship_required}` : null,
        eeo ? `Gender identity: ${eeo.gender_identity || 'not specified'}` : null,
        eeo ? `Pronouns: ${eeo.pronouns || 'not specified'}` : null,
        eeo ? `Race/ethnicity: ${(eeo.race_ethnicity || []).join(', ') || 'not specified'}` : null,
        eeo ? `Veteran status: ${eeo.veteran_status || 'not specified'}` : null,
        eeo ? `Disability: ${eeo.disability_status || 'not specified'}` : null,
    ].filter(Boolean).join('\n');

    // Build annotation reference table — ALL annotated elements, using their badge ID
    const annotationTable = annotations.length > 0
        ? '\nANNOTATED ELEMENTS (each has a colored circle + badge ID in the screenshot):\n' +
        annotations
            .map(a => {
                const type = a.role ? `${a.tag}[role=${a.role}]` : a.tag;
                const known = a.jz_id ? ' ★' : '';
                return `  ${a.element_id}${known} [${type}] — ${a.label}`;
            })
            .join('\n')
        : '';

    return `You are analyzing an annotated job application form screenshot.
Every interactable element has a colored circle badge with an ID (like jz-7, e32, e33).
Elements marked with ★ are also in our DOM extraction. Use ALL badge IDs to target elements.

APPLICANT PROFILE:
${profileLines}
Applying for: ${job.title} at ${job.company}
${annotationTable}

TASK: For every visible form field that needs to be filled:
1. Look at the colored circle badge ID on the element in the screenshot (e.g. "e32", "jz-7")
2. Use that EXACT badge ID as element_id in your response
3. NEVER use coords — always use the element_id from the visible badge circle
4. Skip: submit/nav buttons, already-filled fields, section headers
5. Only skip elements that are ICON-ONLY UI controls (chevrons, expand triggers, close buttons with no text). Do NOT skip Yes/No, radio, or checkbox options just because their label is short — those are real form fields.

ANSWER RULES:
- Work authorization / legally authorized to work → "Yes"
- Sponsorship needed → use profile: sponsorship_required=${work_auth?.sponsorship_required ?? false}
- "Have you been employed by / worked at [company] before?" type questions → "No" (default unless profile shows otherwise)
- Phone Device Type / phone type dropdowns → "Mobile" (safest universal default)
- EEO/diversity fields → use profile eeo section if available, otherwise "I prefer not to answer"
- Optional social URLs not in profile → skip (value: "")
- For button_choice/radio: value = exact text of the option to click (e.g. "Yes", "Man", "30-39")
- For checkbox groups: value = array of option texts to check

Respond ONLY with valid JSON:
{
  "actions": [
    {
      "element_id": "e32" or "jz-7",
      "action": "click" | "input" | "select" | "check",
      "value": "<string or array>",
      "label": "<question text>",
      "visual_type": "button_choice|radio_group|checkbox|text_input|textarea|dropdown|file_upload",
      "confidence": "high|medium|low",
      "note": "<optional>"
    }
  ],
  "unresolved": [
    { "label": "<question>", "visual_type": "<type>", "why": "<reason could not be addressed>" }
  ]
}`;
}

// ── Vision API call ───────────────────────────────────────────────────────────

interface VisionResponse {
    actions: Array<{
        element_id: string;                        // badge ID visible in screenshot (jz-N or eN)
        jz_id?: string | null;                     // legacy field — same as element_id if it starts with 'jz-'
        coords?: { x: number; y: number } | null;  // legacy fallback
        action: string;
        value: string | string[];
        label: string;
        visual_type: VisualType;
        confidence: 'high' | 'medium' | 'low';
        note?: string;
    }>;
    unresolved: Array<{ label: string; visual_type: VisualType; why: string }>;
}

async function callVisionModel(
    screenshotBase64: string,
    profile: AgentProfile,
    job: ScrapedJob,
    annotations: ColorAnnotation[],
): Promise<VisionResponse> {
    const response = await claude.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 3000,
        messages: [{
            role: 'user',
            content: [
                {
                    type: 'image',
                    source: { type: 'base64', media_type: 'image/jpeg', data: screenshotBase64 },
                },
                { type: 'text', text: buildPrompt(profile, job, annotations) },
            ],
        }],
    });

    const text = (response.content[0] as { text: string }).text.trim();
    // Strip markdown code fences (```json ... ```) that some models add
    const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

    // Extract the outermost JSON object
    const match = jsonText.match(/\{[\s\S]*\}/);
    if (!match) {
        console.warn(`[vision] Non-JSON response: ${text.slice(0, 300)}`);
        throw new Error(`Vision returned non-JSON: ${text.slice(0, 200)}`);
    }

    let parsed: VisionResponse;
    try {
        parsed = JSON.parse(match[0]) as VisionResponse;
    } catch (parseErr) {
        console.warn(`[vision] JSON parse failed: ${(parseErr as Error).message}`);
        console.warn(`[vision] Raw text snippet: ${text.slice(2300, 2500)}`);
        throw parseErr;
    }
    return { actions: parsed.actions ?? [], unresolved: parsed.unresolved ?? [] };
}

// ── Dedup: remove fields already covered by DOM extraction ──────────────────

function buildDomLabelSet(domElements: ExtractedElement[]): Set<string> {
    return new Set(
        domElements.flatMap(e => {
            const lc = e.label.toLowerCase().trim();
            return [lc, lc.slice(0, 20)].filter(s => s.length > 3);
        }),
    );
}

function isAlreadyCoveredByDom(label: string, domLabels: Set<string>): boolean {
    const lc = label.toLowerCase().trim();
    return [...domLabels].some(dl =>
        dl.includes(lc.slice(0, 20)) || lc.includes(dl.slice(0, 20)),
    );
}

// ── Map vision response → VisionAction[] ────────────────────────────────────

function mapVisionActionType(
    action: string,
    visual_type: VisualType,
): VisionAction['action_type'] {
    if (action === 'input') return 'input_text';
    if (action === 'check') return 'checkbox';
    if (action === 'select') return 'combobox';
    // 'click' → determine from visual type
    if (visual_type === 'checkbox') return 'checkbox';
    if (visual_type === 'dropdown') return 'combobox';
    return 'click_button';
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface VisionExtractionResult {
    fields: VisionField[];          // legacy — kept for merge-planner compat
    actions: VisionAction[];        // new SoM-aware actions
    unresolved: Array<{ label: string; visual_type: VisualType; why: string }>;
    screenshotPath: string | null;
    totalVisibleOnPage: number;
}

export async function extractVisionFields(
    page: Page,
    domElements: ExtractedElement[],
    profile: AgentProfile,
    job: ScrapedJob,
    auditDir?: string,
    fillPlan?: Array<{ id: string; action_type: string }>,
): Promise<VisionExtractionResult> {
    // ── 1. Annotate elements with color borders ─────────────────────────────
    // Only annotate elements that are in cleanElements (domElements here).
    // This prevents filtered-out widgets (autofill banners, etc.) from appearing
    // in the annotation table and confusing the vision model.
    const knownJzIds = new Set(domElements.map(e => e.id));
    let colorMap: Awaited<ReturnType<typeof annotateInteractableElements>> | null = null;
    try {
        colorMap = await annotateInteractableElements(page, knownJzIds);
        console.log(`[vision] Annotated ${colorMap.annotations.length} interactable elements with color borders`);
    } catch (err) {
        console.warn(`[vision] Color annotation failed: ${(err as Error).message} — using unannotated screenshot`);
    }

    // ── 2. Screenshot (with colored borders visible) ────────────────────────
    let screenshotPath: string | null = null;
    let screenshotBase64: string;

    try {
        const pngBuffer = await page.screenshot({ fullPage: true });

        if (auditDir) {
            fs.mkdirSync(auditDir, { recursive: true });
            screenshotPath = path.join(auditDir, 'before-fill.png');
            fs.writeFileSync(screenshotPath, pngBuffer);
        }

        const jpegBuffer = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 80 });
        screenshotBase64 = jpegBuffer.toString('base64');
    } catch (err) {
        console.warn(`[vision] Screenshot failed: ${(err as Error).message}`);
        if (colorMap) await removeAnnotations(page).catch(() => { });
        return { fields: [], actions: [], unresolved: [], screenshotPath: null, totalVisibleOnPage: 0 };
    }

    // ── 3. Remove annotations (restore page before any filling) ────────────
    if (colorMap) {
        await removeAnnotations(page).catch(() => { });
    }

    // ── 4. Vision LLM call ──────────────────────────────────────────────────
    let visionResponse: VisionResponse;
    try {
        visionResponse = await callVisionModel(
            screenshotBase64, profile, job,
            colorMap?.annotations ?? [],
        );
        console.log(`[vision] Got ${visionResponse.actions.length} actions, ${visionResponse.unresolved.length} unresolved`);
    } catch (err) {
        console.warn(`[vision] LLM call failed: ${(err as Error).message}`);
        return { fields: [], actions: [], unresolved: [], screenshotPath, totalVisibleOnPage: 0 };
    }

    // ── 5. Map response actions → VisionAction[] ───────────────────────────
    const domLabels = buildDomLabelSet(domElements);
    const domJzIds = new Set(domElements.map(e => e.id));

    const visionActions: VisionAction[] = [];
    // Keep legacy VisionField[] for merge-planner compatibility
    const legacyFields: VisionField[] = [];

    for (const raw of visionResponse.actions) {
        const value = raw.value ?? '';
        const valueStr = Array.isArray(value) ? value[0] ?? '' : value;
        if (!valueStr && !Array.isArray(value)) continue; // skip empties

        // Resolve element_id (new) vs legacy jz_id/coords fields
        const elementId = raw.element_id ?? raw.jz_id ?? null;

        // Determine jz_id: starts with 'jz-' → it's a direct jz_id
        //                   starts with 'e'   → look up annotation by element_id
        let resolvedJzId: string | null = null;
        let resolvedElementId: string | null = elementId;

        if (elementId?.startsWith('jz-')) {
            resolvedJzId = elementId;
        } else if (elementId && colorMap) {
            // Find the annotation with this element_id — it may have a jz_id
            const ann = colorMap.annotations.find(a => a.element_id === elementId);
            if (ann?.jz_id) resolvedJzId = ann.jz_id;
            // resolvedElementId stays as 'e32' for executor to find via data-jz-element-id
        }

        // If the action references a jz_id the DOM plan is ACTIVELY filling, skip.
        if (resolvedJzId) {
            const domAction = fillPlan?.find((a: { id: string; action_type: string }) => a.id === resolvedJzId);
            if (domAction && domAction.action_type !== 'skip') continue;
        }

        // If label is already covered by DOM extraction, skip
        if (raw.label && isAlreadyCoveredByDom(raw.label, domLabels)) continue;

        // Legacy coords fallback (only if no element_id was provided)
        let resolvedCoords: { x: number; y: number } | null = null;
        if (!elementId && raw.coords) {
            resolvedCoords = raw.coords;
            // Try coord→jz_id lookup as last resort
            if (colorMap) {
                const nearest = findAnnotationByCoords(
                    colorMap.annotations, resolvedCoords.x, resolvedCoords.y,
                );
                if (nearest?.jz_id) resolvedJzId = nearest.jz_id;
            }
        }

        const actionType = mapVisionActionType(raw.action, raw.visual_type);

        visionActions.push({
            source: 'vision',
            label: raw.label,
            visual_type: raw.visual_type,
            action_type: actionType,
            value,
            jz_id: resolvedJzId,
            element_id: resolvedElementId,   // eN or jz-N — executor resolves via data-jz-element-id
            coords: resolvedCoords,
        });

        // Legacy field for merge-planner
        legacyFields.push({
            label: raw.label,
            visual_type: raw.visual_type,
            choices: null,
            answer: value,
            required: false,
            already_filled: false,
        });
    }

    // Apply defaults for EEO/work-auth on legacy fields
    const enrichedLegacy = applyVisionDefaults(legacyFields, profile);

    if (visionResponse.unresolved.length > 0) {
        console.log(`[vision] Unresolved fields (Claude saw but couldn't address):`);
        for (const u of visionResponse.unresolved) {
            console.log(`   ⚠️  [${u.visual_type}] "${u.label.slice(0, 60)}" — ${u.why}`);
        }
    }

    return {
        fields: enrichedLegacy,
        actions: visionActions,
        unresolved: visionResponse.unresolved,
        screenshotPath,
        totalVisibleOnPage: visionResponse.actions.length + visionResponse.unresolved.length,
    };
}
