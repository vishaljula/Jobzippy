/**
 * filler/fill.ts
 *
 * Executes a fill plan against a live Playwright page.
 * Elements must already be stamped with data-jz-id by extractor/common-fields.js.
 *
 * Combobox strategy:
 *   1. Click the combobox input to open dropdown
 *   2. Use findBestMatch() to resolve the wanted value against stored options
 *      (handles "United States" → "United States +1", "No" → "No", etc.)
 *   3. pressSequentially() char-by-char — fires keydown/keyup, keeps dropdown open
 *   4. page.getByRole('option', { name }) — ARIA-role selector with built-in
 *      visibility waiting, no force:true, proper mousedown event sequence
 */

import * as fs from 'fs';
import type { Page } from 'playwright';
import type { FillAction, FillResult } from '../extractor/types.js';
import { findBestMatch } from '../extractor/utils/combobox-option-filter.js';

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

        switch (action_type) {

            // ── Plain text input ──────────────────────────────────
            case 'input_text': {
                await el.click({ force: true });
                await el.fill(value);
                break;
            }

            // ── Native <select> ───────────────────────────────────
            case 'select_option': {
                try {
                    await el.selectOption({ label: value });
                } catch {
                    await el.selectOption(value); // try by value attr as fallback
                }
                break;
            }

            // ── ARIA combobox ─────────────────────────────────────
            case 'combobox': {
                // Step 1: resolve the wanted value against stored options using fuzzy match
                // e.g. "United States" → "United States +1", "No" → "No"
                // action.options holds the options we read during extraction
                const storedOptions: string[] = (action as any).options ?? [];
                const resolvedValue = findBestMatch(value, storedOptions) ?? value;

                // Step 2: open the dropdown
                await el.click({ force: true });
                await page.waitForTimeout(300);

                // Step 3: type char-by-char using pressSequentially
                // Unlike fill(), pressSequentially fires keydown/keyup per char
                // and does NOT dispatch a bulk input/change event that resets the dropdown
                await el.pressSequentially(resolvedValue, { delay: 60 });
                await page.waitForTimeout(500);

                // Step 4: find and click the matching option
                // page.getByRole('option') has built-in visibility waiting
                // No force:true — proper ARIA event dispatch (mousedown→mouseup→click)
                let clicked = false;

                // Strategy A: exact name match via ARIA role
                try {
                    const opt = page.getByRole('option', { name: resolvedValue, exact: true }).first();
                    await opt.waitFor({ state: 'visible', timeout: 2000 });
                    await opt.click();
                    clicked = true;
                } catch { /* not found exactly, try partial */ }

                // Strategy B: partial / contains match via ARIA role
                if (!clicked) {
                    try {
                        const opt = page.getByRole('option', { name: resolvedValue, exact: false }).first();
                        await opt.waitFor({ state: 'visible', timeout: 2000 });
                        await opt.click();
                        clicked = true;
                    } catch { /* still not found, try scoped fallback */ }
                }

                // Strategy C: scoped listbox search (handles non-standard ARIA markup)
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
                    // Typing narrowed the list to 1 — just take it
                    if (!clicked && count === 1) {
                        await opts.first().click();
                        clicked = true;
                    }
                }

                // Last resort: Enter commits whatever is filtered/highlighted
                if (!clicked) await el.press('Enter');

                await page.waitForTimeout(300);
                break;
            }

            // ── Checkbox ──────────────────────────────────────────
            case 'click_checkbox': {
                const checked = await el.isChecked();
                const shouldCheck = ['yes', 'true', '1', 'check'].includes(value.toLowerCase());
                if (shouldCheck !== checked) {
                    await el.click({ force: true });
                }
                break;
            }

            // ── Radio button ──────────────────────────────────────
            case 'click_radio': {
                // Find the radio whose label text matches the value
                const radios = page.locator('input[type="radio"]');
                const count = await radios.count();
                let matched = false;

                for (let i = 0; i < count; i++) {
                    const radio = radios.nth(i);
                    const radioId = await radio.getAttribute('id');
                    if (radioId) {
                        const labelText = (await page.locator(`label[for="${radioId}"]`).textContent()) ?? '';
                        if (labelText.toLowerCase().includes(value.toLowerCase())) {
                            await radio.click({ force: true });
                            matched = true;
                            break;
                        }
                    }
                    const radioValue = (await radio.getAttribute('value')) ?? '';
                    if (radioValue.toLowerCase().includes(value.toLowerCase())) {
                        await radio.click({ force: true });
                        matched = true;
                        break;
                    }
                }

                if (!matched) {
                    return { id, action_type, value, status: 'error', error: `radio option "${value}" not found` };
                }
                break;
            }

            // ── File upload ───────────────────────────────────────
            case 'upload_file': {
                const filePath = value === '__RESUME_PATH__' ? resumePath : value;
                if (!fs.existsSync(filePath)) {
                    return { id, action_type, value, status: 'error', error: `file not found: ${filePath}` };
                }
                await el.setInputFiles(filePath);
                break;
            }

            default:
                return { id, action_type, value, status: 'error', error: `unknown action_type: ${action_type}` };
        }

        return { id, action_type, value, status: 'ok' };

    } catch (e) {
        return { id, action_type, value, status: 'error', error: (e as Error).message?.slice(0, 120) };
    }
}

export async function executeAllFills(
    page: Page,
    fillPlan: FillAction[],
    resumePath: string,
    delayMs = 300,
): Promise<FillResult[]> {
    const results: FillResult[] = [];

    for (const action of fillPlan) {
        await page.waitForTimeout(delayMs);
        const result = await executeFill(page, action, resumePath);
        results.push(result);
    }

    return results;
}
