/**
 * extractor/combobox.ts
 *
 * Playwright-side combobox option expander.
 * Runs AFTER dom-elements.js has stamped data-jz-id on every element.
 *
 * For each element where action_type === 'combobox':
 *   1. Click to open the dropdown (using data-jz-id)
 *   2. Read all visible [role="option"] texts from the associated listbox
 *      — scoped via aria-controls attribute if present, otherwise visible listbox
 *   3. Press Escape to close without selecting
 *   4. Attach the option texts back onto the element object
 *
 * The enriched elements[] (with real options[]) is what gets sent to the LLM,
 * so the LLM can pick an exact option text rather than guessing.
 */

import type { Page } from 'playwright';
import type { ExtractedElement } from './types.js';

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

            // Click to open the dropdown
            await locator.click({ force: true });
            await page.waitForTimeout(500);

            const options: string[] = [];

            // ── Strategy 1: scoped via aria-controls ───────────────
            // The combobox input has aria-controls="some-listbox-id"
            // This is the most reliable — it directly identifies the popup container
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

            // ── Strategy 2: any visible listbox on page ─────────────
            // Fallback if aria-controls wasn't present
            if (options.length === 0) {
                const listboxOptions = page.locator(
                    '[role="listbox"]:visible [role="option"]:visible, [role="listbox"]:visible li:visible'
                );
                const count = await listboxOptions.count();
                for (let i = 0; i < Math.min(count, 30); i++) {
                    const text = (await listboxOptions.nth(i).textContent())?.trim();
                    if (text) options.push(text);
                }
            }

            // ── Strategy 3: ul/ol dropdown (non-ARIA patterns) ──────
            if (options.length === 0) {
                const liOptions = page.locator(
                    'ul[class*="dropdown"]:visible li:visible, ul[class*="options"]:visible li:visible, ul[class*="menu"]:visible li:visible'
                );
                const count = await liOptions.count();
                for (let i = 0; i < Math.min(count, 30); i++) {
                    const text = (await liOptions.nth(i).textContent())?.trim();
                    if (text) options.push(text);
                }
            }

            // Close without selecting
            await page.keyboard.press('Escape');
            await page.waitForTimeout(200);

            // Dedupe and clean
            el.options = [...new Set(options.filter(o => o.length > 0))];

            const preview = el.options.slice(0, 4).join(' | ') + (el.options.length > 4 ? '…' : '');
            console.log(`     ${el.id.padEnd(7)} "${el.label.slice(0, 35).padEnd(35)}" → [${preview}]`);

        } catch (e) {
            console.warn(`     ⚠️  ${el.id} expand failed: ${(e as Error).message?.slice(0, 80)}`);
            // Make sure dropdown is closed even if we error
            await page.keyboard.press('Escape').catch(() => { /* ignore */ });
            await page.waitForTimeout(200);
        }
    }

    return elements;
}
