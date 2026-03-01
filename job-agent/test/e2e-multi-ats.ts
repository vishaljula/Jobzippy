/**
 * test/e2e-multi-ats.ts
 *
 * Full pipeline E2E on 5 non-Greenhouse jobs across 4 ATS platforms.
 * Pipeline per job:
 *   navigate → DOM extract → filter → combobox expand
 *   → [parallel] LLM plan + Vision extraction
 *   → reconcile → merge → fill → screenshot
 *
 * Run: npx tsx test/e2e-multi-ats.ts
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { expandComboboxOptions } from '../extractor/combobox.js';
import { filterAtsWidgets } from '../extractor/field-filter.js';
import { extractVisionFields } from '../extractor/vision-extractor.js';
import { buildFillPlan } from '../llm/planner.js';
import { reconcilePlan, printReconciliationReport } from '../llm/plan-reconciler.js';
import { mergePlans } from '../llm/merge-planner.js';
import { executeAllFills, fillDynamicSelects } from '../filler/fill.js';
import type { ExtractedElement, FillAction } from '../extractor/types.js';
import type { AgentProfile, ScrapedJob } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const FIELD_EXTRACTOR = fs.readFileSync(path.join(ROOT, 'extractor', 'common-fields.js'), 'utf8');
const RESUME_PATH = path.join(ROOT, 'resume.pdf');
const PROFILE: AgentProfile = JSON.parse(fs.readFileSync(path.join(ROOT, 'profile.json'), 'utf8'));

const JOBS: Array<{ ats: string } & ScrapedJob> = [
    // {
    //     ats: 'Workday',
    //     title: 'Senior Staff Engineer - Web (Firefly Boards)',
    //     company: 'Adobe',
    //     url: 'https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/San-Francisco/Senior-Staff-Engineer---Web--Firefly-Boards_R165858/apply/applyManually?jr_id=699e49db81476f6176b739ba',
    //     location: 'San Francisco, CA',
    //     description: '',
    //     isEasyApply: false,
    // },

    // ── SCOPED TO ADOBE WORKDAY for this focused test run ──
    {
        ats: 'Workday',
        title: 'Senior Staff Engineer - Web (Firefly Boards)',
        company: 'Adobe',
        url: 'https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/San-Francisco/Senior-Staff-Engineer---Web--Firefly-Boards_R165858/apply/applyManually?jr_id=699e49db81476f6176b739ba',
        location: 'San Francisco, CA',
        description: '',
        isEasyApply: false,
    },
    {
        ats: 'Ashby',
        title: 'Senior Software Engineer',
        company: 'Kindred',
        url: 'https://jobs.ashbyhq.com/kindred/8d4c41f1-57bd-4347-832b-1e8844358508/application',
        location: 'Remote',
        description: '',
        isEasyApply: false,
    },
    {
        ats: 'Ashby',
        title: 'Senior Frontend Engineer',
        company: 'Rillet',
        url: 'https://jobs.ashbyhq.com/rillet/9cf56ee1-3a3a-42d6-af77-3621ea4d3cd5/application',
        location: 'Remote',
        description: '',
        isEasyApply: false,
    },
];



interface JobResult {
    job: typeof JOBS[0];
    elements: number;
    comboboxes: number;
    visionAdded: number;
    filled: number;
    skipped: number;
    errors: number;
    screenshotPath: string;
    error?: string;
}

/**
 * Returns true if the page's main form content appears to be inside a
 * cross-origin iframe (i.e. our content script can't reach it).
 */
async function hasFormInCrossOriginIframe(page: import('playwright').Page): Promise<boolean> {
    try {
        // If we can evaluate inside every frame, they're same-origin.
        // A simple heuristic: look for iframes on the main document that
        // contain form-like keywords in their src.
        const iframeCount = await page.evaluate(() => {
            const frames = Array.from(document.querySelectorAll('iframe'));
            return frames.filter(f => {
                const src = f.src || '';
                // Cross-origin job application iframes often have these hosts
                return src.includes('lever.co') ||
                    src.includes('greenhouse.io') ||
                    src.includes('workable.com') ||
                    src.includes('jobvite.com');
            }).length;
        });
        return iframeCount > 0;
    } catch {
        return false;
    }
}

async function runJob(page: import('playwright').Page, job: typeof JOBS[0]): Promise<JobResult> {
    const label = `${job.title} @ ${job.company} [${job.ats}]`;
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`🌐 ${label}`);
    console.log(`   ${job.url}`);

    const slug = `${job.ats.toLowerCase()}_${job.company.toLowerCase().replace(/\s+/g, '_')}`;

    // ── Output folder structure ─────────────────────────────────────────────
    //   extractions/runs/{slug}/
    //     fill-plans/
    //       dom-plan.json        ← LLM-generated fill plan
    //       vision-plan.json     ← vision-discovered actions
    //       merged-plan.json     ← final combined plan
    //     screenshots/
    //       before-fill.png      ← page state when sent to vision LLM
    //       after-fill.png       ← final post-fill screenshot
    //     audit-report.json      ← per-field ✅/⚠️/❌ verification results
    const runDir = path.join(ROOT, 'extractions', 'runs', slug);
    const plansDir = path.join(runDir, 'fill-plans');
    const ssDir = path.join(runDir, 'screenshots');
    fs.mkdirSync(plansDir, { recursive: true });
    fs.mkdirSync(ssDir, { recursive: true });

    const afterFillSsPath = path.join(ssDir, 'after-fill.png');

    try {
        await page.goto(job.url, { waitUntil: 'networkidle', timeout: 40_000 });
        await page.waitForTimeout(3000);

        // Some ATS platforms have an intermediate "click to apply" button
        const applyBtn = page.locator([
            'a:has-text("Apply")', 'button:has-text("Apply")',
            'a:has-text("Apply Now")', 'button:has-text("Apply Now")',
            'a:has-text("Submit Application")',
        ].join(', ')).first();
        if (await applyBtn.count() > 0) {
            console.log('   → Clicking Apply button...');
            await applyBtn.click();
            await page.waitForTimeout(2500);
        }

        // ── 1. Extract ──────────────────────────────────────────────
        const elements = await page.evaluate(FIELD_EXTRACTOR) as ExtractedElement[];
        console.log(`   📌 ${elements.length} elements (${elements.filter(e => e.action_type === 'combobox').length} comboboxes)`);

        const crossOriginIframe = await hasFormInCrossOriginIframe(page);
        if (elements.length === 0 || crossOriginIframe) {
            const reason = crossOriginIframe
                ? 'Cross-origin iframe detected — form inaccessible'
                : 'No elements extracted — form may require login or is in iframe';
            console.log(`   ⏭️  ${reason}`);
            await page.screenshot({ path: afterFillSsPath, fullPage: true });
            return { job, elements: 0, comboboxes: 0, visionAdded: 0, filled: 0, skipped: 0, errors: 0, screenshotPath: afterFillSsPath, error: reason };
        }

        // ── 1b. Filter ATS native widgets ───────────────────────────
        const cleanElements = filterAtsWidgets(elements);

        // ── 2. Expand comboboxes ────────────────────────────────────
        await expandComboboxOptions(page, cleanElements);

        // ── 4. DOM LLM plan (first) then Vision (with plan for dedup) ───────────
        // Vision is intentionally run AFTER the fill plan so we can pass the
        // plan to extractVisionFields for correct dedup (skip vs active fill).
        console.log('   🧠 Building DOM fill plan...');
        const fillPlan = await buildFillPlan(cleanElements, PROFILE, job);
        console.log(`   📝 DOM plan: ${fillPlan.length} actions`);

        console.log('   👁  Running vision pass (with fill plan for dedup)...');
        const visionResult = await extractVisionFields(page, cleanElements, PROFILE, job, ssDir, fillPlan);
        console.log(`   👁  Vision: ${visionResult.actions.length} additional actions, ${(visionResult.unresolved ?? []).length} unresolved`);

        // ── 4b. Reconcile DOM plan ────────────────────────────────────────
        const { plan: reconciledPlan, corrections } = reconcilePlan(fillPlan, cleanElements);
        if (corrections.length > 0) {
            console.log(`   🔧 Reconciler made ${corrections.length} correction(s):`);
            printReconciliationReport(corrections);
        } else {
            console.log('   ✅ Reconciler: all values matched options');
        }

        // Enrich reconciled plan with real dropdown options for filler
        const domPlanWithOptions: FillAction[] = reconciledPlan.map((action: FillAction) => {
            const el = cleanElements.find((e: ExtractedElement) => e.id === action.id);
            return el?.options?.length ? { ...action, options: el.options } : action;
        });

        // ── Save DOM fill plan ────────────────────────────────────────────
        fs.writeFileSync(
            path.join(plansDir, 'dom-plan.json'),
            JSON.stringify(domPlanWithOptions, null, 2),
        );

        // ── 4c. Log vision additions ───────────────────────────────────────
        const { fields: visionFields, actions: visionActions, unresolved, totalVisibleOnPage } = visionResult;
        if (visionActions.length > 0) {
            console.log(`   👁  Vision added ${visionActions.length} action(s) DOM missed:`);
            for (const va of visionActions) {
                const target = va.jz_id ? `→ ${va.jz_id}` : va.coords ? `→ coords(${va.coords.x},${va.coords.y})` : '→ text-proximity';
                console.log(`      [${va.visual_type}] "${va.label.slice(0, 45)}" ${target} = "${String(va.value).slice(0, 25)}"`);
            }
        } else {
            console.log(`   👁  Vision: no additional fields (DOM covers all ${totalVisibleOnPage} visible)`);
        }
        if (unresolved?.length > 0) {
            console.log(`   👁  Vision unresolved (${unresolved.length}):`);
            for (const u of unresolved) console.log(`      ⚠️  [${u.visual_type}] "${u.label.slice(0, 55)}" — ${u.why}`);
        }

        // ── Save vision plan ──────────────────────────────────────────────
        fs.writeFileSync(
            path.join(plansDir, 'vision-plan.json'),
            JSON.stringify({ actions: visionActions, unresolved: unresolved ?? [] }, null, 2),
        );

        // ── 4d. Merge DOM plan + vision actions (Layer 3b) ───────────────
        const { actions: mergedPlan, stats } = mergePlans(domPlanWithOptions, cleanElements, visionFields, visionActions);
        if (stats.vision_added > 0) {
            console.log(`   🔀 Merged: ${stats.dom_count} DOM + ${stats.vision_added} vision actions`);
        }

        // ── Save merged plan ──────────────────────────────────────────────
        fs.writeFileSync(
            path.join(plansDir, 'merged-plan.json'),
            JSON.stringify(mergedPlan, null, 2),
        );

        // ── 5. Fill ──────────────────────────────────────────────────
        const fillResults = await executeAllFills(page, mergedPlan, RESUME_PATH, 400, FIELD_EXTRACTOR);

        // ── 5b. Post-fill: dynamic selects (e.g. State after Country) ─────
        await fillDynamicSelects(page, PROFILE as any);

        const ok = fillResults.filter(r => r.status === 'ok').length;
        const warnings = fillResults.filter(r => r.status === 'warning').length;
        const skipped = fillResults.filter(r => r.status === 'skip').length;
        const errors = fillResults.filter(r => r.status === 'error').length;

        // ── FILL AUDIT REPORT ─────────────────────────────────────────
        console.log(`\n   📋 FILL AUDIT — ${job.company} (${job.ats})`);
        console.log('   ' + '─'.repeat(78));
        console.log(`   ${'ID'.padEnd(8)} ${'Type'.padEnd(15)} ${'Intended'.padEnd(26)} ${'Status'.padEnd(14)} DOM value`);
        console.log('   ' + '─'.repeat(78));
        for (const r of fillResults) {
            if (r.status === 'skip') continue;
            const icon =
                r.status === 'ok' ? '✅' :
                    r.status === 'warning' ? '⚠️ ' :
                        r.status === 'error' ? '❌' : '❓';
            const verifiedTag = r.verified === true ? 'verified' : r.verified === false ? 'UNVERIFIED' : 'unreadable';
            const domVal = r.dom_value ? `"${r.dom_value.slice(0, 22)}"` : (r.error ? r.error.slice(0, 25) : '-');
            console.log(
                `   ${r.id.padEnd(8)} ${r.action_type.padEnd(15)} "${String(r.value).slice(0, 24).padEnd(26)}" ${icon} ${verifiedTag.padEnd(12)} ${domVal}`,
            );
        }
        console.log('   ' + '─'.repeat(78));
        console.log(`   ✅ ${ok} verified  ⚠️  ${warnings} warning  ❌ ${errors} error  ⏭️  ${skipped} skipped`);
        if (unresolved?.length > 0) {
            console.log(`   👁  Claude saw but could NOT address (${unresolved.length}):`);
            for (const u of unresolved) console.log(`      [${u.visual_type}] "${u.label.slice(0, 65)}"`);
        }

        // ── Save audit report JSON ────────────────────────────────────────
        const auditReport = {
            job: { title: job.title, company: job.company, ats: job.ats, url: job.url },
            summary: { ok, warnings, skipped, errors },
            fields: fillResults.map(r => ({
                id: r.id,
                action_type: r.action_type,
                intended_value: r.value,
                status: r.status,
                verified: r.verified,
                dom_value: r.dom_value,
                error: r.error,
            })),
            unresolved: unresolved ?? [],
        };
        fs.writeFileSync(
            path.join(runDir, 'audit-report.json'),
            JSON.stringify(auditReport, null, 2),
        );

        await page.waitForTimeout(1500);
        // Close any open dropdowns/combobox panels before screenshotting
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(300);
        await page.screenshot({ path: afterFillSsPath, fullPage: true });

        console.log(`   📁 Saved to: extractions/runs/${slug}/`);
        console.log(`      ├── fill-plans/dom-plan.json`);
        console.log(`      ├── fill-plans/vision-plan.json`);
        console.log(`      ├── fill-plans/merged-plan.json`);
        console.log(`      ├── screenshots/before-fill.png`);
        console.log(`      ├── screenshots/after-fill.png`);
        console.log(`      └── audit-report.json`);

        return { job, elements: cleanElements.length, comboboxes: cleanElements.filter((e: ExtractedElement) => e.action_type === 'combobox').length, visionAdded: visionActions.length, filled: ok, skipped, errors, screenshotPath: afterFillSsPath };


    } catch (err) {
        console.error(`   💥 ${(err as Error).message?.slice(0, 120)}`);
        try { await page.screenshot({ path: afterFillSsPath, fullPage: true }); } catch { }
        return { job, elements: 0, comboboxes: 0, visionAdded: 0, filled: 0, skipped: 0, errors: 1, screenshotPath: afterFillSsPath, error: (err as Error).message?.slice(0, 200) };
    }
}

async function main() {
    console.log('\n🚀 Multi-ATS E2E Test — 5 Jobs, 4 ATS Platforms');
    console.log(`   Jobs: ${JOBS.map(j => `${j.company}(${j.ats})`).join(' · ')}\n`);

    const browser = await chromium.launch({ headless: false, slowMo: 150 });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

    // ── Jobzippy overlay ─────────────────────────────────────────────────────
    // Re-injected on every navigation (including SPA route changes) via the
    // framenavigated event so it survives full-page replacements.
    const OVERLAY_CSS = [
        'position:fixed', 'bottom:24px', 'left:50%', 'transform:translateX(-50%)',
        'z-index:2147483647', 'display:flex', 'align-items:center', 'gap:10px',
        'padding:10px 20px', 'border-radius:999px',
        'background:rgba(2,6,23,0.85)', 'backdrop-filter:blur(12px)',
        'border:1.5px solid #00ff9d',
        'box-shadow:0 0 18px rgba(0,255,157,0.35), 0 0 40px rgba(0,255,157,0.12)',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        'font-size:13px', 'font-weight:600', 'color:#00ff9d',
        'letter-spacing:0.02em', 'pointer-events:none', 'user-select:none',
    ].join(';');

    let currentOverlayStatus = '⚡ Jobzippy at work';

    async function injectOverlay(p: import('playwright').Page, statusText?: string): Promise<void> {
        if (statusText) currentOverlayStatus = statusText;
        try {
            await p.evaluate((args: { css: string; text: string }) => {
                document.getElementById('__jz_overlay')?.remove();
                const overlay = document.createElement('div');
                overlay.id = '__jz_overlay';
                overlay.style.cssText = args.css;
                const style = document.createElement('style');
                style.textContent = `@keyframes __jzPulse {
                    0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(0,255,157,0.5)}
                    50%{opacity:0.5;box-shadow:0 0 0 5px rgba(0,255,157,0)}
                }`;
                const dot = document.createElement('span');
                dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#00ff9d;flex-shrink:0;animation:__jzPulse 1.4s ease-in-out infinite';
                const label = document.createElement('span');
                label.id = '__jz_label';
                label.textContent = args.text;
                overlay.appendChild(dot);
                overlay.appendChild(label);
                document.head?.appendChild(style);
                document.body?.appendChild(overlay);
            }, { css: OVERLAY_CSS, text: currentOverlayStatus });
        } catch { /* ignore — page may be mid-navigation */ }
    }

    const page = await context.newPage();

    // Re-inject overlay after every navigation
    page.on('framenavigated', async (frame) => {
        if (frame === page.mainFrame()) {
            await page.waitForTimeout(300);
            await injectOverlay(page);
        }
    });

    const results: JobResult[] = [];

    for (const job of JOBS) {
        await injectOverlay(page, `⚡ Jobzippy at work — ${job.company} (${job.ats})`);

        const result = await runJob(page, job);
        results.push(result);
        await page.waitForTimeout(2000);
    }

    await browser.close();

    // ── Summary ─────────────────────────────────────────────────
    console.log(`\n${'═'.repeat(70)}`);
    console.log('  MULTI-ATS RESULTS SUMMARY');
    console.log('═'.repeat(70));
    for (const r of results) {
        const visionTag = r.visionAdded > 0 ? ` +${r.visionAdded}👁` : '';
        const status = r.error ? `❌ ${r.error.slice(0, 55)}` : `✅ ${r.filled} filled${visionTag} · ${r.skipped} skipped · ${r.errors} errors`;
        console.log(`  [${r.job.ats.padEnd(15)}] ${r.job.company.padEnd(18)} ${status}`);
    }
    console.log('═'.repeat(70));
}

main().catch(err => { console.error('💥', err); process.exit(1); });
