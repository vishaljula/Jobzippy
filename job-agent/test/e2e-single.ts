/**
 * e2e-single.ts — Full end-to-end on one job: extract → plan → fill
 * Run: npx tsx e2e-single.ts
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { expandComboboxOptions } from '../extractor/combobox.js';
import { buildFillPlan } from '../llm/planner.js';
import { reconcilePlan, printReconciliationReport } from '../llm/plan-reconciler.js';
import { executeAllFills } from '../filler/fill.js';
import type { ExtractedElement, FillAction } from '../extractor/types.js';
import type { AgentProfile, ScrapedJob } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const FIELD_EXTRACTOR = fs.readFileSync(path.join(ROOT, 'extractor', 'common-fields.js'), 'utf8');
const RESUME_PATH = path.join(ROOT, 'resume.pdf');
const PROFILE: AgentProfile = JSON.parse(fs.readFileSync(path.join(ROOT, 'profile.json'), 'utf8'));

const JOB: ScrapedJob = {
    title: 'Staff Web Engineer',
    company: 'Robinhood',
    url: 'https://boards.greenhouse.io/robinhood/jobs/7086141',
    location: 'Menlo Park, CA',
    description: '',
    isEasyApply: false,
};

async function main() {
    console.log(`\n🚀 E2E Single Job Test: ${JOB.title} @ ${JOB.company}`);
    console.log('   Pipeline: extract → combobox expand → LLM plan → reconcile → fill\n');

    const browser = await chromium.launch({ headless: false, slowMo: 150 });
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

    await page.goto(JOB.url, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(2000);

    const applyBtn = page.locator('a:has-text("Apply"), button:has-text("Apply")').first();
    if (await applyBtn.count() > 0) { await applyBtn.click(); await page.waitForTimeout(2000); }

    // ── 1. Extract ────────────────────────────────────────────────
    console.log('── Step 1: Extraction');
    const elements = await page.evaluate(FIELD_EXTRACTOR) as ExtractedElement[];
    console.log(`   ${elements.length} elements stamped (${elements.filter(e => e.action_type === 'combobox').length} comboboxes)\n`);

    // ── 2. Expand comboboxes ──────────────────────────────────────
    console.log('── Step 2: Combobox expansion');
    await expandComboboxOptions(page, elements);
    console.log();

    // ── 3. LLM fill plan ─────────────────────────────────────────
    console.log('── Step 3: LLM fill plan (Claude Haiku)');
    const fillPlan = await buildFillPlan(elements, PROFILE, JOB);
    console.log(`   ${fillPlan.length} actions generated`);

    // Print the plan with options info
    for (const a of fillPlan) {
        const el = elements.find(e => e.id === a.id);
        const label = `"${(el?.label ?? '?').slice(0, 35)}"`;
        const opts = el?.options?.length ? ` [opts: ${el.options.slice(0, 3).join(' | ')}${el.options.length > 3 ? '…' : ''}]` : '';
        const icon = a.action_type === 'skip' ? '⏭️ ' : '✏️ ';
        console.log(`   ${icon} ${a.id.padEnd(7)} ${a.action_type.padEnd(16)} "${String(a.value).slice(0, 35).padEnd(37)}" ← ${label}${opts}`);
    }

    // ── 3b. Reconcile plan ────────────────────────────────────────
    console.log('\n── Step 3b: Plan Reconciler');
    const { plan: reconciledPlan, corrections } = reconcilePlan(fillPlan, elements);
    printReconciliationReport(corrections);

    // Save the original LLM plan (preserves intent for audit)
    const planPath = path.join(ROOT, 'extractions', 'fill-plans', 'robinhood_staff_web_engineer.json');
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, JSON.stringify(fillPlan, null, 4));
    console.log(`   💾 Saved LLM plan → extractions/fill-plans/robinhood_staff_web_engineer.json\n`);

    // Merge options into reconciled plan so findBestMatch has options at fill time
    const enrichedPlan: FillAction[] = reconciledPlan.map(action => {
        const el = elements.find(e => e.id === action.id);
        return el?.options?.length ? { ...action, options: el.options } : action;
    });

    // ── 4. Fill ───────────────────────────────────────────────────
    console.log('── Step 4: Execute fills');
    const results = await executeAllFills(page, enrichedPlan, RESUME_PATH, 400);

    console.log('\n' + '─'.repeat(70));
    for (const r of results) {
        const icon = r.status === 'ok' ? '✅' : r.status === 'skip' ? '⏭️ ' : '❌';
        const err = r.error ? `  ← ⚠️  ${r.error}` : '';
        console.log(`  ${icon} ${r.id.padEnd(7)} ${r.action_type.padEnd(16)} "${String(r.value).slice(0, 40)}"${err}`);
    }
    console.log('─'.repeat(70));

    const ok = results.filter(r => r.status === 'ok').length;
    const skipped = results.filter(r => r.status === 'skip').length;
    const errors = results.filter(r => r.status === 'error').length;
    console.log(`\n  ✅ ${ok} filled   ⏭️  ${skipped} skipped   ❌ ${errors} errors`);

    // Screenshot
    await page.waitForTimeout(1500);
    const ssPath = path.join(ROOT, 'extractions', 'audit', 'e2e_single_result.png');
    fs.mkdirSync(path.dirname(ssPath), { recursive: true });
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log(`\n  📸 ${ssPath}`);

    console.log('\n  Browser open 30s — inspect the form...');
    await page.waitForTimeout(30_000);
    await browser.close();
}

main().catch(err => { console.error('💥', err); process.exit(1); });
