/**
 * extractor/color-annotator.ts
 *
 * Set-of-Mark (SoM) annotation layer.
 *
 * After DOM extraction stamps jz-ids on known elements, this module:
 *   1. Runs a broader scan for ALL interactable elements on the page
 *      (including custom components domUtils may have missed)
 *   2. Assigns each a unique, visually distinct color border via CSS injection
 *   3. Returns a ColorMap that maps color → element reference (jz_id or coords)
 *
 * The annotated screenshot is then sent to the vision LLM, which can
 * reference elements by their approximate position/coords rather than
 * needing to name exact colors. Colors just help Claude spatially
 * distinguish neighboring elements.
 */

import type { Page } from 'playwright';
import type { ColorAnnotation } from './types.js';

// ── Color palette — 24 perceptually distinct, JPEG-safe colors ──────────────
// Chosen for max visual separation, high saturation, distinct hue angles.
// Avoids red (form errors), black (text), white (backgrounds).
const PALETTE = [
    '#00C8FF', '#FF6B00', '#00E676', '#D500F9', '#FFD600',
    '#FF1744', '#00B0FF', '#76FF03', '#FF6D00', '#651FFF',
    '#F50057', '#1DE9B6', '#FF9100', '#40C4FF', '#69F0AE',
    '#EA80FC', '#FFFF00', '#FF80AB', '#B2FF59', '#84FFFF',
    '#A7FFEB', '#CCFF90', '#FFD180', '#FF9E80',
];

// ── Selector that catches everything interactable — broader than domUtils ────
const INTERACTABLE_SELECTOR = [
    'input:not([type=hidden]):not([type=submit]):not([type=reset]):not([type=image])',
    'select',
    'textarea',
    '[role="combobox"]',
    '[role="listbox"]',
    '[role="textbox"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    'button:not([type="submit"]):not([type="reset"])',
    '[role="button"]:not([type="submit"])',
].join(', ');

// ── Public API ────────────────────────────────────────────────────────────────

export interface ColorMap {
    annotations: ColorAnnotation[];
    /** CSS string to inject into the page to add colored borders */
    cssToInject: string;
}

/**
 * Scans the page for all interactable elements, assigns unique border colors,
 * and returns the color map for LLM cross-referencing.
 *
 * Call this BEFORE taking the screenshot for the vision LLM.
 * Call removeAnnotations() AFTER the screenshot to restore the page.
 */
export async function annotateInteractableElements(page: Page, knownJzIds?: Set<string>): Promise<ColorMap> {
    const annotations: ColorAnnotation[] = await page.evaluate((args) => {
        const { selector, palette } = args;
        const results: ColorAnnotation[] = [];
        let colorIdx = 0;

        const seen = new Set<Element>();
        for (const elRaw of document.querySelectorAll(selector)) {
            // ── For hidden radio/checkbox inputs, annotate the nearest visible wrapper ──
            // Ashby/Greenhouse hide native inputs (opacity:0) inside span/div wrappers.
            // Walk up until we find a visible, sized ancestor to put the border on.
            let el: Element = elRaw;
            const inputType = (elRaw as HTMLInputElement).type;
            if (inputType === 'radio' || inputType === 'checkbox') {
                const cs0 = window.getComputedStyle(elRaw as HTMLElement);
                if (cs0.opacity === '0' || parseFloat(cs0.width) < 4) {
                    let parent = elRaw.parentElement;
                    while (parent && parent !== document.body) {
                        const pRect = parent.getBoundingClientRect();
                        const pcs = window.getComputedStyle(parent);
                        if (pRect.width > 8 && pRect.height > 8 &&
                            pcs.opacity !== '0' && pcs.display !== 'none' && pcs.visibility !== 'hidden') {
                            el = parent;
                            break;
                        }
                        parent = parent.parentElement;
                    }
                }
            }

            if (seen.has(el)) continue;
            seen.add(el);

            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) continue;

            const cs = window.getComputedStyle(el as HTMLElement);
            if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;

            const color = palette[colorIdx % palette.length];
            colorIdx++;

            const jz_id = (el as HTMLElement).getAttribute('data-jz-id') || null;
            const cx = Math.round(rect.left + rect.width / 2);
            const cy = Math.round(rect.top + window.scrollY + rect.height / 2);

            // Inject border directly on element for screenshot
            (el as HTMLElement).setAttribute('data-jz-color', color);
            (el as HTMLElement).style.outline = `3px solid ${color}`;
            (el as HTMLElement).style.outlineOffset = '2px';

            // ── Fixed-position badge: jz-id label at top-left of element ──
            // Uses position:fixed so parent overflow:hidden can never hide it.
            const badge = document.createElement('div');
            badge.setAttribute('data-jz-badge', 'true');
            badge.style.cssText = [
                'position:fixed',
                `top:${rect.top + 2}px`,
                `left:${rect.left + 2}px`,
                `background:${color}`,
                'color:#000',
                'font-size:10px',
                'font-weight:700',
                'font-family:monospace',
                'padding:1px 5px',
                'border-radius:4px',
                'z-index:2147483646',
                'pointer-events:none',
                'line-height:16px',
                'white-space:nowrap',
                'box-shadow:0 1px 3px rgba(0,0,0,0.5)',
            ].join(';');
            const elementId = jz_id ?? `e${colorIdx}`;
            badge.textContent = elementId;
            document.body.appendChild(badge);

            // Tag element with its badge ID so executor can find it later
            (el as HTMLElement).setAttribute('data-jz-element-id', elementId);

            // Best label: aria-label > placeholder > textContent (for non-select) > data-jz-id > tag+role
            // NOTE: for native <select> we skip textContent — it would give "Select One" (the placeholder
            // option text) which makes Claude think the field is already handled. Better to leave it blank
            // so Claude reads the question from the visible screenshot instead.
            const isNativeSelect = el.tagName.toLowerCase() === 'select';
            const ownText = isNativeSelect ? '' : ((el as HTMLElement).textContent?.trim().slice(0, 60) || '');
            const label =
                (el as HTMLElement).getAttribute('aria-label') ||
                (el as HTMLElement).getAttribute('placeholder') ||
                (ownText && ownText.length < 50 ? ownText : null) ||
                jz_id ||
                `${el.tagName.toLowerCase()}[${el.getAttribute('role') || ''}]`;

            results.push({
                color,
                element_id: elementId,
                jz_id,
                cx, cy,
                label,
                tag: el.tagName.toLowerCase(),
                role: el.getAttribute('role') || '',
            });
        }
        return results;
    }, { selector: INTERACTABLE_SELECTOR, palette: PALETTE });

    // If a known set of jz-ids was provided, any annotation NOT in that set
    // should have its jz_id cleared. It still gets a visible colored border
    // (useful for screenshot review) but won't appear in the vision table.
    if (knownJzIds) {
        for (const a of annotations) {
            if (a.jz_id && !knownJzIds.has(a.jz_id)) {
                a.jz_id = null;
            }
        }
    }

    // Build the CSS string (kept for reference — actual injection done in evaluate above)
    const cssToInject = annotations
        .map(a => a.jz_id
            ? `[data-jz-id="${a.jz_id}"] { outline: 3px solid ${a.color} !important; outline-offset: 2px !important; }`
            : '')
        .filter(Boolean)
        .join('\n');

    return { annotations, cssToInject };
}

/**
 * Removes all color outlines added by annotateInteractableElements().
 * Call this after the screenshot is captured.
 */
export async function removeAnnotations(page: Page): Promise<void> {
    await page.evaluate(() => {
        for (const el of document.querySelectorAll('[data-jz-color]')) {
            (el as HTMLElement).style.outline = '';
            (el as HTMLElement).style.outlineOffset = '';
            (el as HTMLElement).removeAttribute('data-jz-color');
        }
        for (const badge of document.querySelectorAll('[data-jz-badge]')) {
            badge.remove();
        }
    });
}

/**
 * Given a color string returned by the vision LLM (approximate, e.g. "cyan")
 * or coordinates, find the closest annotation in the color map.
 *
 * Primary lookup: by coordinates (cx, cy proximity).
 * Fallback: by color name fuzzy match.
 */
export function findAnnotationByCoords(
    annotations: ColorAnnotation[],
    x: number,
    y: number,
    tolerancePx = 60,
): ColorAnnotation | null {
    let best: ColorAnnotation | null = null;
    let bestDist = Infinity;

    for (const ann of annotations) {
        const dist = Math.sqrt((ann.cx - x) ** 2 + (ann.cy - y) ** 2);
        if (dist < tolerancePx && dist < bestDist) {
            bestDist = dist;
            best = ann;
        }
    }

    return best;
}
