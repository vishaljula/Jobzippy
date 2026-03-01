import { chromium } from 'playwright';

const URL = 'https://workday.wd1.myworkdayjobs.com/en-US/Adobecareers/job/Senior-Staff-Engineer---Web--Firefly-Boards_R153027/apply/applyManually';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for a known form element to confirm React rendered
    await page.waitForSelector('[data-automation-id="firstName"]', { timeout: 30000 });
    await page.waitForTimeout(2000);

    // 1. Dump all combobox-ish elements
    const comboboxEls = await page.evaluate(() => {
        const sel = '[role="combobox"], button[aria-haspopup], input[aria-haspopup]';
        return Array.from(document.querySelectorAll(sel)).map((el: any) => ({
            tag: el.tagName,
            id: el.id,
            ariaLabel: el.getAttribute('aria-label'),
            ariaHaspopup: el.getAttribute('aria-haspopup'),
            ariaControls: el.getAttribute('aria-controls'),
            dataAutomationId: el.getAttribute('data-automation-id'),
            value: el.value ?? '',
            textContent: (el.textContent ?? '').trim().slice(0, 100),
        }));
    });
    console.log('\n=== COMBOBOX/HASPOPUP ELEMENTS ===');
    comboboxEls.forEach((el, i) => console.log(`[${i}]`, JSON.stringify(el)));

    // 2. All native <select>
    const selects = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('select')).map((el: any) => {
            const opts = Array.from(el.options).map((o: any) => o.text);
            let labelText = '';
            let p: Element | null = el;
            for (let d = 0; d < 6 && p; d++, p = p.parentElement) {
                const lbl = p.querySelector('label');
                if (lbl && (lbl as HTMLElement) !== el) { labelText = (lbl.textContent ?? '').trim(); break; }
            }
            return { id: el.id, label: labelText, currentValue: el.value, numOptions: opts.length, options: opts.slice(0, 10) };
        });
    });
    console.log('\n=== NATIVE SELECTS ===');
    selects.forEach((s, i) => console.log(`[${i}]`, JSON.stringify(s)));

    // 3. All radio-like elements
    const radios = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('[role="radio"], input[type="radio"]')).map((el: any) => ({
            tag: el.tagName, id: el.id, role: el.getAttribute('role'),
            ariaChecked: el.getAttribute('aria-checked'),
            ariaLabelledby: el.getAttribute('aria-labelledby'),
            value: el.value,
            textContent: (el.textContent ?? '').trim().slice(0, 60),
            parentText: (el.parentElement?.textContent ?? '').trim().slice(0, 60),
        }));
    });
    console.log('\n=== RADIO ELEMENTS ===');
    radios.forEach((r, i) => console.log(`[${i}]`, JSON.stringify(r)));

    // 4. Country Phone Code inspection — look for its wrapper by various selectors
    const phoneCodeInfo = await page.evaluate(() => {
        // By data-automation-id
        const byAutomation = document.querySelector('[data-automation-id*="phone"][data-automation-id*="country"], [data-automation-id*="countryPhone"], [data-automation-id*="phonecountry"]');
        // By label text
        let byLabel: Element | null = null;
        for (const el of Array.from(document.querySelectorAll('label, [data-automation-id]'))) {
            if (/country phone code/i.test(el.textContent ?? '')) {
                byLabel = el.parentElement;
                break;
            }
        }
        return {
            byAutomation: byAutomation?.outerHTML?.slice(0, 400) ?? 'not found',
            byLabel: byLabel?.outerHTML?.slice(0, 500) ?? 'not found',
        };
    });
    console.log('\n=== COUNTRY PHONE CODE ===');
    console.log(JSON.stringify(phoneCodeInfo, null, 2));

    // 5. "How did you hear" widget
    const hearAboutInfo = await page.evaluate(() => {
        let found: Element | null = null;
        for (const el of Array.from(document.querySelectorAll('[data-automation-id], label'))) {
            if (/hear about us|how did you/i.test(el.textContent ?? '')) {
                found = el.parentElement;
                break;
            }
        }
        return found?.outerHTML?.slice(0, 600) ?? 'not found';
    });
    console.log('\n=== HOW DID YOU HEAR ===');
    console.log(hearAboutInfo);

    await browser.close();
})();
