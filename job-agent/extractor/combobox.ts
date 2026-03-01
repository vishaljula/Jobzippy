/**
 * extractor/combobox.ts
 *
 * Playwright-side combobox option expander.
 * Runs AFTER dom-elements.js has stamped data-jz-id on every element.
 *
 * For each element where action_type === 'combobox':
 *   1. Read current displayed value — if already filled (pill/text visible),
 *      record the value but DO NOT open the dropdown (avoids disturbing pre-filled state).
 *   2. Otherwise click to open, read all visible [role="option"] texts, then close
 *      by pressing Escape AND clicking body (Workday multiselects need both).
 *   3. Attach option texts back onto the element object.
 *
 * The enriched elements[] (with real options[]) is what gets sent to the LLM.
 */

import type { Page } from 'playwright';
import type { ExtractedElement } from './types.js';

const PLACEHOLDER_RE = /^(select one|select a|choose|--|please select|none|$)/i;

/**
 * Reads the "current displayed value" of a combobox without opening it.
 * Handles both native <select> patterns and Workday-style pill comboboxes.
 */
async function readCurrentValue(page: Page, jzId: string): Promise<string> {
    return page.evaluate((id) => {
        const el = document.querySelector(`[data-jz-id="${id}"]`) as HTMLElement | null;
        if (!el) return '';

        // Native select
        if (el instanceof HTMLSelectElement) {
            const txt = el.options[el.selectedIndex]?.text?.trim() ?? '';
            return /^(select one|select a|choose|--)/i.test(txt) ? '' : txt;
        }

        // Workday selectinput: if THIS element is the inner search <input>
        // (data-uxi-element-id starts with "selectinput", or parent has data-automation-hiddensearch),
        // look at the grandparent container for existing pill elements (× selected items).
        const uxiId = el.getAttribute('data-uxi-element-id') ?? '';
        const parentHasHiddensearch = el.parentElement?.hasAttribute('data-automation-hiddensearch');
        if (uxiId.startsWith('selectinput') || parentHasHiddensearch) {
            // Walk up to find the container holding the pills (up to 5 levels)
            let container: HTMLElement | null = el.parentElement;
            for (let i = 0; i < 5 && container; i++) {
                // Look for pill-like elements — Workday uses spans with × dismiss buttons
                // or elements containing an × symbol as a sibling to the pill text
                const pillTexts: string[] = [];
                for (const child of Array.from(container.querySelectorAll('[class*="pill"], [class*="chip"], [class*="tag"]'))) {
                    const t = (child.textContent ?? '').replace(/[×✕]/g, '').trim();
                    if (t && t.length > 1) pillTexts.push(t);
                }
                if (pillTexts.length > 0) return pillTexts.join(', ');

                // Also check: any sibling element with ×/✕ + text pattern (Workday's pill style)
                for (const sib of Array.from(container.children)) {
                    const txt = (sib.textContent ?? '').trim();
                    // Has a dismiss (×) button = it's a selected pill
                    if (sib.querySelector('[aria-label*="dismiss"], [aria-label*="remove"], button') && txt.length > 2) {
                        const cleanTxt = txt.replace(/[×✕]/g, '').trim();
                        if (cleanTxt) return cleanTxt;
                    }
                }
                container = container.parentElement;
            }
            return ''; // No pills found = not pre-filled
        }

        // Workday "items selected" aria-label pattern — the combobox BUTTON itself
        const ariaLabel = el.getAttribute('aria-label') ?? '';
        if (/items selected|select one/i.test(ariaLabel)) {
            const childTexts: string[] = [];
            for (const child of Array.from(el.children)) {
                const t = (child.textContent ?? '').trim();
                if (t && !/^(items selected|\s*[≡×✕]?\s*)$/i.test(t)) {
                    childTexts.push(t);
                }
            }
            if (childTexts.length > 0) return childTexts.join(', ');

            const spans = el.querySelectorAll('span, div');
            for (const span of Array.from(spans)) {
                const t = (span.textContent ?? '').trim();
                if (t && t.length > 2 && !/^(items selected|select one|\s*[≡×✕]?\s*)$/i.test(t)) {
                    return t;
                }
            }
            return '';
        }

        // Generic: look for pill/chip elements within nearest ARIA/data wrapper
        const wrapper = el.closest('[data-automation-id], [class*="multiselect"], [class*="combobox"]') ?? el.parentElement;
        if (wrapper) {
            const pills = wrapper.querySelectorAll('[class*="pill"], [class*="chip"]');
            if (pills.length > 0) {
                return Array.from(pills).map(p => (p.textContent ?? '').trim()).filter(Boolean).join(', ');
            }
        }

        // Fallback
        const text = el.textContent?.trim() ?? '';
        return /^(select one|select a|choose|--|please select|none|items selected)$/i.test(text) ? '' : text;
    }, jzId);
}

/** Closes any open dropdown: Escape first, then click document body, then wait for listbox to disappear. */
async function closeDropdown(page: Page): Promise<void> {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    // Click body to dismiss any remaining overlay (Workday multiselect needs this)
    await page.evaluate(() => {
        const body = document.body;
        body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // Wait for any visible listbox to disappear (ensures isolation between consecutive expansions)
    try {
        await page.waitForSelector('[role="listbox"]:visible', { state: 'hidden', timeout: 2000 });
    } catch {
        // Listbox may already be gone or not exist — that's fine
    }
    await page.waitForTimeout(200);
}

export async function expandComboboxOptions(
    page: Page,
    elements: ExtractedElement[],
): Promise<ExtractedElement[]> {
    const comboboxes = elements.filter(el => el.action_type === 'combobox');
    console.log(`\n  🔽 Expanding ${comboboxes.length} combobox(es) to read options...`);

    for (const el of comboboxes) {
        try {
            const locator = page.locator(`[data-jz-id="${el.id}"]`);
            if (await locator.count() === 0) {
                console.warn(`     ⚠️  ${el.id}: element not found in DOM`);
                continue;
            }

            // Ensure no lingering dropdown from previous iteration is open
            await closeDropdown(page).catch(() => { /* ignore */ });

            // ── Step 1: Read current value WITHOUT opening ──────────────
            const currentValue = await readCurrentValue(page, el.id);
            const isPreFilled = currentValue.length > 0 && !PLACEHOLDER_RE.test(currentValue);

            if (isPreFilled) {
                // Store the current value so the LLM/planner knows it's already filled
                el.value = currentValue;
                console.log(`     ${el.id.padEnd(7)} "${el.label.slice(0, 35).padEnd(35)}" → ALREADY FILLED: "${currentValue.slice(0, 40)}"`);
                continue;
            }

            // ── Step 2: Open dropdown and read options ──────────────────
            await locator.click({ force: true });
            await page.waitForTimeout(600);

            const options: string[] = [];

            // Strategy 1: scoped via aria-controls (most reliable)
            if (el.ariaControls) {
                const listboxOptions = page.locator(
                    `#${el.ariaControls} [role="option"]:visible, #${el.ariaControls} li:visible`
                );
                const count = await listboxOptions.count();
                for (let i = 0; i < count; i++) {
                    const text = (await listboxOptions.nth(i).textContent())?.trim();
                    if (text) options.push(text);
                }
            }

            // Strategy 2: any visible listbox on page
            if (options.length === 0) {
                const listboxOptions = page.locator(
                    '[role="listbox"]:visible [role="option"]:visible, [role="listbox"]:visible li:visible'
                );
                const count = await listboxOptions.count();
                for (let i = 0; i < Math.min(count, 50); i++) {
                    const text = (await listboxOptions.nth(i).textContent())?.trim();
                    if (text) options.push(text);
                }
            }

            // Strategy 3: ul/ol dropdown (non-ARIA patterns)
            if (options.length === 0) {
                const liOptions = page.locator(
                    'ul[class*="dropdown"]:visible li:visible, ul[class*="options"]:visible li:visible, ul[class*="menu"]:visible li:visible'
                );
                const count = await liOptions.count();
                for (let i = 0; i < Math.min(count, 50); i++) {
                    const text = (await liOptions.nth(i).textContent())?.trim();
                    if (text) options.push(text);
                }
            }

            // ── Step 3: Close dropdown (Escape + body click) ────────────
            await closeDropdown(page);

            // Dedupe and clean
            el.options = [...new Set(options.filter(o => o.length > 0))];

            const preview = el.options.slice(0, 4).join(' | ') + (el.options.length > 4 ? '…' : '');
            console.log(`     ${el.id.padEnd(7)} "${el.label.slice(0, 35).padEnd(35)}" → [${preview}]`);

        } catch (e) {
            console.warn(`     ⚠️  ${el.id} expand failed: ${(e as Error).message?.slice(0, 80)}`);
            // Ensure dropdown is closed even on error
            await closeDropdown(page).catch(() => { /* ignore */ });
        }
    }

    return elements;
}
