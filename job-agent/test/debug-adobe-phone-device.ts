import { chromium } from 'playwright';

const JOB_URL = 'https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/San-Francisco/Senior-Staff-Engineer---Web--Firefly-Boards_R165858/apply/applyManually?jr_id=699e49db81476f6176b739ba';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    console.log('Navigating to Adobe job form...');
    await page.goto(JOB_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    try {
        await page.waitForSelector('[data-automation-id="firstName"], input[name*="firstName"]', { timeout: 30000 });
        console.log('Form loaded. Waiting 3s to let UI settle...');
        await page.waitForTimeout(3000);
    } catch (e) {
        console.error('Failed to wait for form', e);
    }

    const deviceDOM = await page.evaluate(() => {
        let labelNodes = Array.from(document.querySelectorAll('label')).filter(l => l.textContent?.includes('Device'));
        if (labelNodes.length === 0) return { error: 'No label with "Device" found' };

        const label = labelNodes[0];
        let container = label.parentElement;
        for (let i = 0; i < 3 && container; i++) { container = container.parentElement; }

        // Find *any* focusable or button elements inside
        const interactables = Array.from(label.parentElement?.parentElement?.querySelectorAll('button, input, select, [role="combobox"], [aria-haspopup], [data-automation-id]') || []).map(el => {
            const style = window.getComputedStyle(el);
            let trace = [];
            let curr = el;
            while (curr && curr !== document.body) {
                const s = window.getComputedStyle(curr as Element);
                trace.push({
                    tag: curr.tagName,
                    display: s.display,
                    visibility: s.visibility,
                    classes: curr.className
                });
                curr = curr.parentElement;
            }
            return {
                tag: el.tagName,
                id: el.id,
                role: el.getAttribute('role'),
                disabled: (el as any).disabled,
                ariaDisabled: el.getAttribute('aria-disabled'),
                display: style.display,
                visibility: style.visibility,
                outerHTML: el.outerHTML,
                trace
            };
        });

        return {
            containerHTML: container?.outerHTML,
            interactables
        };
    });

    console.log('\n=== DEVICE DOM DUMP ===');
    console.dir(deviceDOM, { depth: null });

    await browser.close();
})();
