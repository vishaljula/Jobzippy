/**
 * generate-fill-plans.ts
 *
 * Full pipeline for all 5 jobs:
 *   1. Navigate + click Apply
 *   2. extractor/common-fields.js → stamp data-jz-id, get element list
 *   3. extractor/combobox.ts      → expand comboboxes, read real option texts
 *   4. llm/planner.ts             → send enriched elements + profile → Claude → fill plan
 *   5. Save to extractions/fill-plans/<job>.json  (overwrites existing)
 *
 * Run: npx tsx test/helpers/generate-fill-plans.ts
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { expandComboboxOptions } from '../../extractor/combobox.js';
import { buildFillPlan } from '../../llm/planner.js';
import type { ExtractedElement } from '../../extractor/types.js';
import type { AgentProfile, ScrapedJob } from '../../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const FIELD_EXTRACTOR = fs.readFileSync(path.join(ROOT, 'extractor', 'common-fields.js'), 'utf8');
const FILL_PLANS_DIR = path.join(ROOT, 'extractions', 'fill-plans');
const PROFILE: AgentProfile = JSON.parse(fs.readFileSync(path.join(ROOT, 'profile.json'), 'utf8'));
fs.mkdirSync(FILL_PLANS_DIR, { recursive: true });

const JOBS: Array<{ filename: string } & ScrapedJob> = [
    { filename: 'robinhood_staff_web_engineer.json', title: 'Staff Web Engineer', company: 'Robinhood', url: 'https://boards.greenhouse.io/robinhood/jobs/7086141', location: 'Menlo Park, CA', description: '', isEasyApply: false },
    { filename: 'robinhood_web_engineer.json', title: 'Web Engineer', company: 'Robinhood', url: 'https://boards.greenhouse.io/robinhood/jobs/7543003', location: 'Menlo Park, CA', description: '', isEasyApply: false },
    { filename: 'gusto_senior_swe_react_sdk.json', title: 'Senior Software Engineer, React SDK', company: 'Gusto', url: 'https://job-boards.greenhouse.io/gusto/jobs/7507961', location: 'Remote', description: '', isEasyApply: false },
    { filename: 'intercom_frontend_platform_engineer.json', title: 'Frontend Platform Engineer', company: 'Intercom', url: 'https://job-boards.greenhouse.io/intercom/jobs/7522638', location: 'Chicago, IL', description: '', isEasyApply: false },
    { filename: 'amplitude_staff_frontend_engineer.json', title: 'Staff Frontend Engineer', company: 'Amplitude', url: 'https://job-boards.greenhouse.io/amplitude/jobs/8330434002', location: 'Remote', description: '', isEasyApply: false },
];

async function processJob(page: import('playwright').Page, job: typeof JOBS[0]) {
    const { filename, ...scrapedJob } = job;
    console.log(`\n${'─'.repeat(65)}`);
    console.log(`📋 ${job.title} @ ${job.company}`);
    console.log(`   ${job.url}`);

    // ── Navigate ─────────────────────────────────────────────────
    await page.goto(job.url, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(2000);

    const applyBtn = page.locator('a:has-text("Apply"), button:has-text("Apply")').first();
    if (await applyBtn.count() > 0) {
        console.log('   → Clicking Apply...');
        await applyBtn.click();
        await page.waitForTimeout(2000);
    }

    // ── Step 1: base extraction ───────────────────────────────────
    const elements = await page.evaluate(FIELD_EXTRACTOR) as ExtractedElement[];
    console.log(`   📌 ${elements.length} elements extracted (${elements.filter(e => e.action_type === 'combobox').length} comboboxes)`);

    // ── Step 2: expand comboboxes ─────────────────────────────────
    await expandComboboxOptions(page, elements);
    const withOptions = elements.filter(e => e.action_type === 'combobox' && e.options.length > 0).length;
    console.log(`   ✅ ${withOptions}/${elements.filter(e => e.action_type === 'combobox').length} comboboxes have options`);

    // ── Step 3: LLM fill plan ─────────────────────────────────────
    console.log('   🧠 Sending to Claude Haiku for fill plan...');
    const fillPlan = await buildFillPlan(elements, PROFILE, scrapedJob);
    console.log(`   📝 Fill plan: ${fillPlan.length} actions`);

    // Print the plan
    for (const action of fillPlan) {
        const el = elements.find(e => e.id === action.id);
        const label = el ? `"${el.label.slice(0, 35)}"` : '?';
        const icon = action.action_type === 'skip' ? '⏭️ ' : '✏️ ';
        console.log(`     ${icon} ${action.id.padEnd(7)} ${action.action_type.padEnd(16)} ${String(action.value).slice(0, 35).padEnd(37)} ← ${label}`);
    }

    // ── Step 4: save ──────────────────────────────────────────────
    const outPath = path.join(FILL_PLANS_DIR, filename);
    fs.writeFileSync(outPath, JSON.stringify(fillPlan, null, 4));
    console.log(`   💾 Saved: extractions/fill-plans/${filename}`);

    return { job: scrapedJob, elements, fillPlan };
}

async function main() {
    console.log('\n🚀 Generating fill plans for all 5 jobs');
    console.log('   Pipeline: common-fields.js → combobox.ts → Claude Haiku → fill-plans/\n');

    const browser = await chromium.launch({ headless: false, slowMo: 80 });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    const results: { job: ScrapedJob; elements: ExtractedElement[]; fillPlan: ReturnType<typeof Array.prototype.pop> }[] = [];

    for (const job of JOBS) {
        try {
            results.push(await processJob(page, job) as any);
            await page.waitForTimeout(1000);
        } catch (e) {
            console.error(`   ❌ Failed: ${(e as Error).message?.slice(0, 120)}`);
        }
    }

    await browser.close();

    // Summary
    console.log(`\n${'═'.repeat(65)}`);
    console.log('  FILL PLAN GENERATION SUMMARY');
    console.log('═'.repeat(65));
    for (const r of results) {
        if (!r) continue;
        const { elements, fillPlan } = r as any;
        const actions = fillPlan.filter((a: any) => a.action_type !== 'skip').length;
        const skips = fillPlan.filter((a: any) => a.action_type === 'skip').length;
        const combos = elements.filter((e: ExtractedElement) => e.action_type === 'combobox' && e.options.length > 0).length;
        console.log(`  ${r.job.company.padEnd(12)} "${r.job.title.slice(0, 30).padEnd(30)}" → ${fillPlan.length} actions (${actions} fill, ${skips} skip) | ${combos} comboboxes with options`);
    }
    console.log('═'.repeat(65));
    console.log(`\n  ✅ All fill plans saved to extractions/fill-plans/\n`);
}

main().catch(err => { console.error('💥', err); process.exit(1); });
