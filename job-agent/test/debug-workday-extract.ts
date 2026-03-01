/**
 * Temporary debug script: runs the Workday extraction and dumps
 * full details for jz-1, jz-9, jz-10, plus all combobox elements.
 * Also dumps DOM structure around "How Did You Hear About Us" input.
 */
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();

const JOB_URL = 'https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/San-Francisco/Senior-Staff-Engineer---Web--Firefly-Boards_R165858/apply/applyManually?jr_id=699e49db81476f6176b739ba';
const EXTRACTOR_CODE = fs.readFileSync(path.join(process.cwd(), 'extractor/common-fields.js'), 'utf8');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('Navigating to Workday Adobe form...');
    await page.goto(JOB_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Wait for the first name field to confirm form loaded
    try {
        await page.waitForSelector('[data-automation-id="firstName"], input[name*="firstName"]', { timeout: 20000 });
    } catch {
        console.log('Waiting longer...');
        await page.waitForTimeout(5000);
    }
    await page.waitForTimeout(2000);

    // Run common-fields.js to get extracted elements
    const elements = await page.evaluate(EXTRACTOR_CODE) as any[];
    console.log(`\n=== EXTRACTED ${elements.length} elements ===`);
    elements.forEach(el => {
        console.log(`  ${el.id.padEnd(8)} ${el.action_type.padEnd(15)} label="${el.label.slice(0, 50)}" value="${(el.value || '').slice(0, 30)}" options=${el.options?.length || 0}`);
    });

    // Now dump the raw DOM around "How Did You Hear About Us"
    const hearAboutDom = await page.evaluate(() => {
        // Find label containing "How Did You Hear"
        const all = document.querySelectorAll('*');
        for (const el of Array.from(all)) {
            const txt = el.childNodes[0]?.textContent?.trim() ?? '';
            if (/how did you hear/i.test(txt) && el.tagName !== 'SCRIPT') {
                const parent = el.parentElement;
                const grandParent = parent?.parentElement;
                const container = grandParent?.parentElement;
                return {
                    labelEl: el.outerHTML?.slice(0, 200),
                    parentEl: parent?.outerHTML?.slice(0, 500),
                    containerEl: container?.outerHTML?.slice(0, 800),
                };
            }
        }
        return 'NOT FOUND';
    });
    console.log('\n=== HOW DID YOU HEAR DOM ===');
    console.log(JSON.stringify(hearAboutDom, null, 2));

    // Dump DOM around Phone/Country Phone Code
    const phoneCodeDom = await page.evaluate(() => {
        const all = document.querySelectorAll('*');
        for (const el of Array.from(all)) {
            const txt = (el.textContent ?? '').trim();
            if (/country phone code/i.test(txt) && el.children.length <= 3) {
                const parent = el.parentElement;
                return {
                    labelEl: el.outerHTML?.slice(0, 200),
                    parentEl: parent?.outerHTML?.slice(0, 600),
                };
            }
        }
        return 'NOT FOUND';
    });
    console.log('\n=== COUNTRY PHONE CODE DOM ===');
    console.log(JSON.stringify(phoneCodeDom, null, 2));

    // Check what buttons with aria-haspopup exist
    const buttons = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button[aria-haspopup], [aria-haspopup]')).map((el: any) => ({
            tag: el.tagName,
            ariaHaspopup: el.getAttribute('aria-haspopup'),
            ariaLabel: el.getAttribute('aria-label'),
            dataAutomationId: el.getAttribute('data-automation-id'),
            textContent: (el.textContent ?? '').trim().slice(0, 80),
            id: el.id,
        }));
    });
    console.log('\n=== ALL aria-haspopup ELEMENTS ===');
    buttons.forEach(b => console.log(' ', JSON.stringify(b)));

    await browser.close();
})();
