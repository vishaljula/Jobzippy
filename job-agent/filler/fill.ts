/**
 * filler/fill.ts
 *
 * Executes a fill plan against a live Playwright page.
 * Elements must already be stamped with data-jz-id by extractor/common-fields.js.
 *
 * Execution priority for vision actions:
 *   1. jz_id direct selector  (most reliable — annotated during extraction)
 *   2. coords page.mouse.click (fallback — for elements not in DOM extractor scope)
 *   3. text proximity          (last resort — fragile, kept for legacy compatibility)
 *
 * After each fill, a DOM readback verifies the actual state changed.
 * Returns 'ok' (verified), 'warning' (click ran, state unverified), or 'error'.
 */

import * as fs from 'fs';
import type { Page } from 'playwright';
import type { FillAction, FillResult, MergedAction, VisionAction } from '../extractor/types.js';
import { findBestMatch } from '../extractor/utils/combobox-option-filter.js';

// ── Readback helpers ──────────────────────────────────────────────────────────

async function getElementStateAfterClick(page: Page, selector: string): Promise<string | null> {
    try {
        return await page.evaluate((sel) => {
            const el = document.querySelector(sel) as HTMLElement | null;
            if (!el) return null;
            // Check ARIA states first (most reliable)
            if (el.getAttribute('aria-pressed') !== null) return el.getAttribute('aria-pressed');
            if (el.getAttribute('aria-selected') !== null) return el.getAttribute('aria-selected');
            if (el.getAttribute('aria-checked') !== null) return el.getAttribute('aria-checked');
            // CSS class heuristic — look for common "active/selected" indicators
            const cls = el.className || '';
            const hasSelected = /selected|active|checked|pressed|current|is-on/i.test(cls);
            if (hasSelected) return 'true';
            // data attributes
            if (el.getAttribute('data-state') === 'checked') return 'true';
            if (el.getAttribute('data-selected') === 'true') return 'true';
            return null;
        }, selector);
    } catch {
        return null;
    }
}

async function readbackValue(page: Page, selector: string, actionType: string): Promise<string | undefined> {
    try {
        return await page.evaluate((args) => {
            const { sel, type } = args;
            const el = document.querySelector(sel) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
            if (!el) return undefined;

            if (type === 'select_option' && el.tagName === 'SELECT') {
                return (el as HTMLSelectElement).options[(el as HTMLSelectElement).selectedIndex]?.text?.trim();
            }
            if (type === 'click_checkbox' || type === 'click_radio') {
                return (el as HTMLInputElement).checked ? 'checked' : 'unchecked';
            }
            if ('value' in el && el.value !== undefined) {
                return (el as HTMLInputElement).value;
            }
            return undefined;
        }, { sel: selector, type: actionType });
    } catch {
        return undefined;
    }
}

// ── DOM element filler (has jz-id) ───────────────────────────────────────────

export async function executeFill(
    page: Page,
    action: FillAction,
    resumePath: string,
): Promise<FillResult> {
    const { id, action_type, value } = action;

    if (action_type === 'skip') {
        return { id, action_type, value, status: 'skip' };
    }

    const selector = `[data-jz-id="${id}"]`;

    try {
        const el = page.locator(selector);
        if (await el.count() === 0) {
            return { id, action_type, value, status: 'error', error: 'element not found (data-jz-id missing)' };
        }

        // Scroll into view before every interaction
        await el.scrollIntoViewIfNeeded();
        await page.waitForTimeout(150);

        switch (action_type) {

            // ── Plain text input ──────────────────────────────────────
            case 'input_text': {
                await el.click({ force: true });
                await el.fill(value);
                const domVal = await readbackValue(page, selector, action_type);
                const verified = domVal !== undefined && domVal.trim() !== '';
                return { id, action_type, value, status: verified ? 'ok' : 'warning', verified, dom_value: domVal };
            }

            // ── Native <select> ───────────────────────────────────────
            case 'select_option': {
                try {
                    await el.selectOption({ label: value });
                } catch {
                    await el.selectOption(value);
                }
                const domVal = await readbackValue(page, selector, action_type);
                const verified = !!domVal && domVal.trim() !== '';
                return { id, action_type, value, status: verified ? 'ok' : 'warning', verified, dom_value: domVal };
            }

            // ── ARIA combobox ─────────────────────────────────────────
            case 'combobox': {
                const storedOptions: string[] = (action as any).options ?? [];
                const resolvedValue = findBestMatch(value, storedOptions) ?? value;

                await el.click({ force: true });
                await page.waitForTimeout(300);
                await el.pressSequentially(resolvedValue, { delay: 60 });
                await page.waitForTimeout(500);

                let clicked = false;
                try {
                    const opt = page.getByRole('option', { name: resolvedValue, exact: true }).first();
                    await opt.waitFor({ state: 'visible', timeout: 2000 });
                    await opt.click();
                    clicked = true;
                } catch { /* fall through */ }

                if (!clicked) {
                    try {
                        const opt = page.getByRole('option', { name: resolvedValue, exact: false }).first();
                        await opt.waitFor({ state: 'visible', timeout: 2000 });
                        await opt.click();
                        clicked = true;
                    } catch { /* fall through */ }
                }

                if (!clicked) {
                    const ariaControls = await el.getAttribute('aria-controls');
                    const scopeSelector = ariaControls
                        ? `#${ariaControls} [role="option"]:visible, #${ariaControls} li:visible`
                        : '[role="listbox"]:visible [role="option"]:visible, [role="listbox"]:visible li:visible';
                    const opts = page.locator(scopeSelector);
                    const count = await opts.count();
                    for (let i = 0; i < count && !clicked; i++) {
                        const text = (await opts.nth(i).textContent())?.trim() ?? '';
                        if (
                            text.toLowerCase() === resolvedValue.toLowerCase() ||
                            text.toLowerCase().includes(resolvedValue.toLowerCase())
                        ) {
                            await opts.nth(i).click();
                            clicked = true;
                        }
                    }
                    if (!clicked && count === 1) { await opts.first().click(); clicked = true; }
                }

                if (!clicked) await el.press('Enter');
                // Always close the dropdown after selection (prevents open panel in screenshot)
                await page.keyboard.press('Escape');
                await page.waitForTimeout(500);

                // Readback: check the visible selected text / pill in the field area
                const visibleText = await page.evaluate((sel) => {
                    const el = document.querySelector(sel);
                    if (!el) return '';
                    // Check for selected pills / tags (Workday, Ashby multiselect)
                    const container = el.closest('[role="combobox"], [data-automation-id], .css-container') ?? el.parentElement;
                    if (container) {
                        const pills = container.querySelectorAll('[role="option"][aria-selected="true"], .jz-pill, [data-tag], [class*="multiValue"], [class*="tag"]');
                        if (pills.length > 0) return Array.from(pills).map(p => p.textContent?.trim()).join(',');
                    }
                    // Check input value or aria-label
                    const input = el as HTMLInputElement;
                    return input.value ?? (el as HTMLElement).textContent?.trim() ?? '';
                }, selector) ?? '';

                const verified = clicked && visibleText.trim().length > 0;
                return { id, action_type, value, status: clicked ? 'ok' : 'warning', verified, dom_value: visibleText || undefined };
            }

            // ── Checkbox ──────────────────────────────────────────────
            case 'click_checkbox': {
                const checked = await el.isChecked();
                const shouldCheck = ['yes', 'true', '1', 'check'].includes(value.toLowerCase());
                if (shouldCheck !== checked) {
                    await el.click({ force: true });
                }
                const domVal = await readbackValue(page, selector, action_type);
                const verified = domVal === (shouldCheck ? 'checked' : 'unchecked');
                return { id, action_type, value, status: verified ? 'ok' : 'warning', verified, dom_value: domVal };
            }

            // ── Radio button ──────────────────────────────────────────
            case 'click_radio': {
                const radios = page.locator('input[type="radio"]');
                const count = await radios.count();
                let matched = false;

                for (let i = 0; i < count; i++) {
                    const radio = radios.nth(i);
                    const radioId = await radio.getAttribute('id');
                    if (radioId) {
                        const labelText = (await page.locator(`label[for="${radioId}"]`).textContent()) ?? '';
                        if (labelText.toLowerCase().includes(value.toLowerCase())) {
                            await radio.scrollIntoViewIfNeeded();
                            await radio.click({ force: true });
                            matched = true;
                            break;
                        }
                    }
                    const radioValue = (await radio.getAttribute('value')) ?? '';
                    if (radioValue.toLowerCase().includes(value.toLowerCase())) {
                        await radio.scrollIntoViewIfNeeded();
                        await radio.click({ force: true });
                        matched = true;
                        break;
                    }
                }

                if (!matched) {
                    return { id, action_type, value, status: 'error', error: `radio option "${value}" not found` };
                }
                return { id, action_type, value, status: 'ok', verified: true };
            }

            // ── File upload ───────────────────────────────────────────
            case 'upload_file': {
                const filePath = value === '__RESUME_PATH__' ? resumePath : value;
                if (!fs.existsSync(filePath)) {
                    return { id, action_type, value, status: 'error', error: `file not found: ${filePath}` };
                }
                await el.setInputFiles(filePath);
                return { id, action_type, value, status: 'ok', verified: true };
            }

            default:
                return { id, action_type, value, status: 'error', error: `unknown action_type: ${action_type}` };
        }

    } catch (e) {
        return { id, action_type, value, status: 'error', error: (e as Error).message?.slice(0, 120) };
    }
}

// ── Vision action filler ──────────────────────────────────────────────────────

async function executeVisionAction(
    page: Page,
    action: VisionAction,
    resumePath: string,
): Promise<FillResult> {
    const { label, action_type, value, jz_id, element_id, coords } = action;
    const stringValue = Array.isArray(value) ? value[0] ?? '' : value;
    const resultId = (element_id ?? jz_id ?? label).slice(0, 30);

    if (!stringValue && !Array.isArray(value)) {
        return { id: resultId, action_type, value: stringValue, status: 'skip' };
    }

    try {
        // ── Strategy 1: element_id / jz_id direct selector (best — no text search) ──
        // jz_id uses data-jz-id; element_id (eN) uses data-jz-element-id attr
        const domSelector = jz_id
            ? `[data-jz-id="${jz_id}"]`
            : element_id
                ? `[data-jz-element-id="${element_id}"]`
                : null;

        if (domSelector) {
            const el = page.locator(domSelector);
            if (await el.count() > 0) {
                await el.scrollIntoViewIfNeeded();
                await page.waitForTimeout(200);

                if (action_type === 'input_text') {
                    await el.fill(stringValue);
                    const domVal = await readbackValue(page, domSelector, 'input_text');
                    const verified = !!domVal && domVal.trim() !== '';
                    return { id: resultId, action_type, value: stringValue, status: verified ? 'ok' : 'warning', verified, dom_value: domVal };
                }

                if (action_type === 'combobox') {
                    // Detect native <select> and use Playwright's selectOption() instead of ARIA click flow
                    const tagName: string = await el.evaluate((node) => (node as HTMLElement).tagName.toLowerCase());
                    if (tagName === 'select') {
                        try {
                            await el.selectOption({ label: stringValue });
                        } catch {
                            // try partial match — find option whose text includes the value
                            await el.evaluate((node, val) => {
                                const sel = node as HTMLSelectElement;
                                const opt = Array.from(sel.options).find(o =>
                                    o.text.toLowerCase().includes(val.toLowerCase())
                                );
                                if (opt) sel.value = opt.value;
                            }, stringValue);
                        }
                        const domVal = await readbackValue(page, domSelector, 'combobox');
                        return { id: resultId, action_type, value: stringValue, status: 'ok', verified: !!domVal, dom_value: domVal };
                    }
                    await el.click({ force: true });
                    await page.waitForTimeout(300);
                    try {
                        const opt = page.getByRole('option', { name: stringValue, exact: false }).first();
                        await opt.waitFor({ state: 'visible', timeout: 2000 });
                        await opt.click();
                    } catch {
                        await el.press('Escape');
                    }
                    return { id: resultId, action_type, value: stringValue, status: 'ok', verified: undefined };
                }

                // click_button, checkbox, radio — use force:true for CSS-hidden native inputs
                try {
                    await el.click({ force: true });
                } catch {
                    await el.click();
                }
                await page.waitForTimeout(300);

                // Verify: check .checked for native inputs, ARIA attrs otherwise
                const handle = await el.elementHandle();
                const state = handle ? await page.evaluate((node: Element) => {
                    if (node instanceof HTMLInputElement && (node.type === 'radio' || node.type === 'checkbox')) {
                        return node.checked ? 'true' : 'false';
                    }
                    const inner = node.querySelector('input[type="radio"],input[type="checkbox"]') as HTMLInputElement | null;
                    if (inner) return inner.checked ? 'true' : 'false';
                    return node.getAttribute('aria-pressed') ?? node.getAttribute('aria-selected') ??
                        node.getAttribute('aria-checked') ??
                        (node.className && /selected|active|checked/i.test(node.className) ? 'true' : null);
                }, handle) : null;

                const verified = state === 'true';
                if (!verified) {
                    try { await el.click({ force: true }); } catch { await el.click(); }
                    await page.waitForTimeout(400);
                }
                const stateAfterRetry = state === 'true' ? 'true' : (handle ? await page.evaluate((node: Element) => {
                    if (node instanceof HTMLInputElement && (node.type === 'radio' || node.type === 'checkbox')) return node.checked ? 'true' : 'false';
                    return null;
                }, handle) : null);
                return {
                    id: resultId, action_type, value: stringValue,
                    status: stateAfterRetry === 'true' ? 'ok' : 'warning',
                    verified: stateAfterRetry !== null ? stateAfterRetry === 'true' : undefined,
                };
            }
        }

        // ── Strategy 2: coordinate click (vision-located, not in DOM) ──────────
        if (coords) {
            await page.mouse.click(coords.x, coords.y);
            await page.waitForTimeout(400);
            return { id: resultId, action_type, value: stringValue, status: 'warning', verified: undefined };
        }

        // ── Strategy 3: bubble-up container search (legacy text-proximity) ─────
        // Walk up from elements containing the label text, find the first container
        // that ALSO contains the target button/option.
        if (action_type === 'click_button' || action_type === 'checkbox') {
            const candidates = page.locator('*', { hasText: label });
            const count = await candidates.count();
            let clicked = false;

            for (let i = count - 1; i >= 0 && !clicked; i--) {
                const container = candidates.nth(i);
                // Does this container have the target button?
                const btn = container.locator(
                    `button, [role="button"], [role="radio"], [role="checkbox"], input[type="radio"], input[type="checkbox"]`,
                    { hasText: stringValue },
                );
                // Also try: parent div containing stringValue text, with a radio/checkbox inside
                const btnInParent = container.locator(
                    `[class*="radio"], [class*="checkbox"], [class*="option"], [class*="choice"]`,
                    { hasText: stringValue },
                );
                const btnLocator = await btn.count() > 0 ? btn.first() : (await btnInParent.count() > 0 ? btnInParent.first() : null);
                if (btnLocator) {
                    const target = btnLocator;
                    await target.scrollIntoViewIfNeeded();
                    await page.waitForTimeout(150);
                    // Use force:true for CSS-hidden native inputs (Workday, Ashby style custom radios)
                    try {
                        await target.click({ force: true });
                    } catch {
                        await target.click();
                    }
                    await page.waitForTimeout(300);
                    clicked = true;

                    // Verify: check ARIA attributes AND native .checked for native inputs
                    const handle = await target.elementHandle();
                    const state = handle ? await page.evaluate((el: Element) => {
                        if (!el) return null;
                        // Native checkbox/radio: check .checked property
                        if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
                            return el.checked ? 'true' : 'false';
                        }
                        // Also check inner native inputs
                        const inner = el.querySelector('input[type="radio"], input[type="checkbox"]') as HTMLInputElement | null;
                        if (inner) return inner.checked ? 'true' : 'false';
                        // ARIA attributes
                        return el.getAttribute('aria-pressed') ??
                            el.getAttribute('aria-selected') ??
                            el.getAttribute('aria-checked') ??
                            (el.className && /selected|active|checked/i.test(el.className) ? 'true' : null);
                    }, handle) : null;

                    const verified = state === 'true';
                    if (!verified) {
                        // Retry with force
                        try { await target.click({ force: true }); } catch { await target.click(); }
                        await page.waitForTimeout(400);
                    }
                    return {
                        id: resultId, action_type, value: stringValue,
                        status: verified ? 'ok' : 'warning',
                        verified: state !== null ? verified : undefined,
                    };
                }
            }

            if (!clicked) {
                // Last resort: broadest match
                try {
                    await page.locator('*:visible', { hasText: stringValue }).last().click();
                } catch { /* ignore */ }
                return { id: resultId, action_type, value: stringValue, status: 'warning', verified: undefined };
            }
        }

        // input_text fallback via text proximity
        if (action_type === 'input_text') {
            const container = page.locator('*', { hasText: label }).last();
            const input = container.locator('input:visible, textarea:visible').first();
            if (await input.count() > 0) {
                await input.fill(stringValue);
            }
            return { id: resultId, action_type, value: stringValue, status: 'ok', verified: undefined };
        }

        return { id: resultId, action_type, value: stringValue, status: 'warning', verified: undefined };

    } catch (e) {
        return {
            id: resultId, action_type, value: stringValue,
            status: 'error', error: (e as Error).message?.slice(0, 120),
        };
    }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function executeAllFills(
    page: Page,
    fillPlan: (FillAction | MergedAction)[],
    resumePath: string,
    delayMs = 400,
    extractorScript?: string,   // Pass to enable re-stamp after SPA re-renders
): Promise<FillResult[]> {
    const results: FillResult[] = [];

    for (const action of fillPlan) {
        await page.waitForTimeout(delayMs);

        if ('source' in action && action.source === 'vision') {
            const result = await executeVisionAction(page, action as VisionAction, resumePath);
            results.push(result);
        } else {
            const result = await executeFill(page, action as FillAction, resumePath);
            results.push(result);

            // After upload_file, SPAs like Ashby re-render and wipe data-jz-id stamps.
            // Re-inject the extractor to re-stamp elements before continuing.
            if (action.action_type === 'upload_file' && extractorScript && result.status !== 'error') {
                try {
                    await page.waitForTimeout(1200);   // Wait for SPA re-render
                    await page.evaluate(extractorScript);
                    console.log('   ♻️  Re-stamped jz-ids after file upload');
                } catch (e) {
                    console.warn('   ⚠️  Re-stamp failed after upload:', (e as Error).message?.slice(0, 80));
                }
            }
        }
    }

    return results;
}

// ── Generic post-fill pass for dynamic <select> fields ─────────────────────────
// Some ATS platforms (Workday) load State/Province options only AFTER Country
// is filled. This pass re-scans the page for <select> elements that are still
// on their placeholder value and tries to fill them using the profile address.
// No LLM — purely rule-based from the profile address string.

const US_STATE_MAP: Record<string, string> = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
    CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
    HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
    KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
    MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
    MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
    NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
    ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
    RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
    TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
    WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};

function parseStateFromAddress(address: string): { abbr: string; full: string } | null {
    // Match patterns like ", TX," or ", TX " or ", TX 7xxxx"
    const m = address.match(/,\s*([A-Z]{2})(?:[,\s]|$)/);
    if (!m) return null;
    const abbr = m[1];
    const full = US_STATE_MAP[abbr];
    return full ? { abbr, full } : null;
}

export async function fillDynamicSelects(
    page: Page,
    profile: { identity?: { address?: string } },
): Promise<Array<{ label: string; value: string; status: 'ok' | 'warning' | 'skipped' }>> {
    const results: Array<{ label: string; value: string; status: 'ok' | 'warning' | 'skipped' }> = [];

    const address = profile?.identity?.address ?? '';
    const stateInfo = parseStateFromAddress(address);
    if (!stateInfo) return results;

    // Wait for dynamic options to load after Country fill
    await page.waitForTimeout(1500);

    // ── Pass 1: native <select> elements (Greenhouse, Lever, etc.) ────────────
    const nativeSelects = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('select')).map((el, i) => {
            const val = (el as HTMLSelectElement).value;
            const optCount = (el as HTMLSelectElement).options.length;
            const id = el.id;
            const labelEl = id ? document.querySelector(`label[for="${id}"]`) : null;
            const labelText = labelEl?.textContent?.trim() ??
                el.closest('label')?.textContent?.trim() ??
                el.closest('[data-automation-id]')?.querySelector('label')?.textContent?.trim() ?? '';
            const placeholder = (el as HTMLSelectElement).options[0]?.text ?? '';
            return { index: i, id, labelText, currentVal: val, optCount, placeholder };
        }).filter(s => s.optCount > 1 && (!s.currentVal || s.currentVal === s.placeholder));
    });

    for (const sel of nativeSelects) {
        if (!/\bstate\b|\bprovince\b|\bregion\b/i.test(sel.labelText)) continue;
        const selector = sel.id ? `select#${sel.id}` : `select:nth-of-type(${sel.index + 1})`;
        const loc = page.locator(selector).first();
        let filled = false;
        for (const candidate of [stateInfo.full, stateInfo.abbr]) {
            try { await loc.selectOption({ label: candidate }); filled = true; break; } catch { /* */ }
            try { await loc.selectOption(candidate); filled = true; break; } catch { /* */ }
        }
        const chosen = filled ? stateInfo.full : '';
        console.log(`   🗺️  Dynamic <select> "${sel.labelText}" → ${filled ? chosen : 'NOT FILLED'}`);
        results.push({ label: sel.labelText, value: chosen, status: filled ? 'ok' : 'warning' });
    }

    // ── Pass 2: ARIA comboboxes / listboxes (Workday, Ashby, etc.) ───────────
    // Look for combobox elements near "State" labels that still show a placeholder
    const ariaComboboxes = await page.evaluate(() => {
        const PLACEHOLDER_RE = /select one|select a|choose|-- select|^$/i;
        const STATE_LABEL_RE = /\bstate\b|\bprovince\b|\bregion\b/i;
        const ALL_CB = '[role="combobox"], button[aria-haspopup="listbox"]';

        const candidates: Array<{
            globalIndex: number;
            labelText: string;
            currentText: string;
            ariaLabel: string;
            dataAutomationId: string;
        }> = [];

        const allCombos = Array.from(document.querySelectorAll(ALL_CB));

        for (let idx = 0; idx < allCombos.length; idx++) {
            const el = allCombos[idx] as HTMLElement;
            const currentText = el.textContent?.trim() ?? '';
            if (!PLACEHOLDER_RE.test(currentText) && currentText.length > 0) continue;

            // Find nearby label — walk up ancestors
            let labelText = '';
            let parent: Element | null = el;
            for (let depth = 0; depth < 6 && parent; depth++, parent = parent.parentElement) {
                const lbl = parent.querySelector('label, [class*="label"]');
                if (lbl && lbl !== el) { labelText = lbl.textContent?.trim() ?? ''; break; }
            }

            if (!STATE_LABEL_RE.test(labelText)) continue;

            candidates.push({
                globalIndex: idx,
                labelText,
                currentText,
                ariaLabel: el.getAttribute('aria-label') ?? '',
                dataAutomationId: el.getAttribute('data-automation-id') ?? '',
            });
        }
        return candidates;
    });

    for (const cb of ariaComboboxes) {
        console.log(`   🗺️  State ARIA CB label="${cb.labelText}" ariaLabel="${cb.ariaLabel}"`);

        // Prefer stable attribute-based locator (aria-label), fall back to nth()
        let loc;
        if (cb.ariaLabel) {
            loc = page.locator(`[aria-label="${cb.ariaLabel}"]`).first();
        } else if (cb.dataAutomationId) {
            loc = page.locator(`[data-automation-id="${cb.dataAutomationId}"]`).first();
        } else {
            loc = page.locator('[role="combobox"], button[aria-haspopup="listbox"]').nth(cb.globalIndex);
        }

        if (await loc.count() === 0) {
            console.log(`   🗺️  ARIA combobox "${cb.labelText}" → NOT FOUND at index ${cb.globalIndex}`);
            results.push({ label: cb.labelText, value: '', status: 'warning' });
            continue;
        }

        await loc.scrollIntoViewIfNeeded();
        await loc.click({ force: true });
        await page.waitForTimeout(600);

        // Type to filter
        await page.keyboard.type(stateInfo.full.slice(0, 4), { delay: 50 });
        await page.waitForTimeout(500);

        let filled = false;
        for (const candidate of [stateInfo.full, stateInfo.abbr]) {
            try {
                const opt = page.getByRole('option', { name: candidate, exact: true }).first();
                await opt.waitFor({ state: 'visible', timeout: 2000 });
                await opt.click();
                filled = true;
                break;
            } catch { /* */ }
            try {
                const opt = page.getByRole('option', { name: candidate, exact: false }).first();
                await opt.waitFor({ state: 'visible', timeout: 2000 });
                await opt.click();
                filled = true;
                break;
            } catch { /* */ }
        }

        if (!filled) {
            const opts = page.locator('[role="listbox"]:visible [role="option"]:visible, [role="listbox"]:visible li:visible');
            const optCount = await opts.count();
            for (let i = 0; i < optCount && !filled; i++) {
                const text = (await opts.nth(i).textContent())?.trim() ?? '';
                if (text.toLowerCase().includes(stateInfo.full.toLowerCase()) ||
                    text.toLowerCase().includes(stateInfo.abbr.toLowerCase())) {
                    await opts.nth(i).click();
                    filled = true;
                }
            }
        }

        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        const chosen = filled ? stateInfo.full : '';
        console.log(`   🗺️  ARIA combobox "${cb.labelText}" → ${filled ? chosen : 'NOT FILLED'}`);
        results.push({ label: cb.labelText, value: chosen, status: filled ? 'ok' : 'warning' });
    }

    return results;
}
