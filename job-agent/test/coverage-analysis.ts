/**
 * test/coverage-analysis.ts
 *
 * Coverage analysis: for each of the 5 test jobs:
 *   1. Navigate + extract (common-fields.js)
 *   2. Build LLM fill plan (Claude Haiku)
 *   3. Take a screenshot
 *   4. Send screenshot to Claude claude-3-5-sonnet-20241022 Vision → count total visible form fields
 *   5. Compute coverage % = plan_fill_actions / vision_field_count
 *
 * Output: extractions/audit/coverage/<slug>/
 *   plan.json        ← LLM fill plan
 *   screenshot.png   ← full-page screenshot (reuses from compare test if exists)
 *   result.json      ← coverage summary
 *
 * Run: npx tsx test/coverage-analysis.ts
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import { filterAtsWidgets } from '../extractor/field-filter.js';
import { expandComboboxOptions } from '../extractor/combobox.js';
import { buildFillPlan } from '../llm/planner.js';
import { reconcilePlan } from '../llm/plan-reconciler.js';
import type { ExtractedElement, FillAction } from '../extractor/types.js';
import type { AgentProfile, ScrapedJob } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const FIELD_EXTRACTOR = fs.readFileSync(path.join(ROOT, 'extractor', 'common-fields.js'), 'utf8');
const PROFILE: AgentProfile = JSON.parse(fs.readFileSync(path.join(ROOT, 'profile.json'), 'utf8'));
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const JOBS: Array<{ slug: string; ats: string } & ScrapedJob> = [
    {
        slug: 'workday_adobe', ats: 'Workday',
        title: 'Senior Staff Engineer - Web', company: 'Adobe',
        url: 'https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/San-Francisco/Senior-Staff-Engineer---Web--Firefly-Boards_R165858/apply/applyManually?jr_id=699e49db81476f6176b739ba',
        location: 'San Francisco, CA', description: '', isEasyApply: false,
    },
    {
        slug: 'ashby_kindred', ats: 'Ashby',
        title: 'Senior Software Engineer', company: 'Kindred',
        url: 'https://jobs.ashbyhq.com/kindred/8d4c41f1-57bd-4347-832b-1e8844358508/application',
        location: 'Remote', description: '', isEasyApply: false,
    },
    {
        slug: 'lever_highlevel', ats: 'Lever',
        title: 'Lead Frontend Engineer', company: 'HighLevel',
        url: 'https://jobs.lever.co/gohighlevel/702536d5-7918-4b5a-8272-6dd0f7cfa04c/apply',
        location: 'Remote', description: '', isEasyApply: false,
    },
    {
        slug: 'smartrecruiters', ats: 'SmartRecruiters',
        title: 'Senior Frontend Software Engineer', company: 'SmartRecruiters',
        url: 'https://jobs.smartrecruiters.com/oneclick-ui/company/smartrecruiters/publication/fea7bb18-983f-40f2-b7e9-3793d1bd1e9d?dcr_ci=smartrecruiters',
        location: 'Remote', description: '', isEasyApply: false,
    },
    {
        slug: 'ashby_rillet', ats: 'Ashby',
        title: 'Senior Frontend Engineer', company: 'Rillet',
        url: 'https://jobs.ashbyhq.com/rillet/9cf56ee1-3a3a-42d6-af77-3621ea4d3cd5/application',
        location: 'Remote', description: '', isEasyApply: false,
    },
];

// ── Vision field counter ────────────────────────────────────────────────────
// Sends a screenshot to Claude claude-3-5-sonnet-20241022 and asks it to count
// all visible form fields (inputs, dropdowns, textareas, Yes/No buttons,
// file uploads, checkboxes) — returning a structured count.
async function countFieldsWithVision(screenshotPath: string): Promise<{
    total: number;
    breakdown: Record<string, number>;
    notes: string;
}> {
    const imageData = fs.readFileSync(screenshotPath);
    const base64 = imageData.toString('base64');

    const response = await claude.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        messages: [{
            role: 'user',
            content: [
                {
                    type: 'image',
                    source: { type: 'base64', media_type: 'image/png', data: base64 },
                },
                {
                    type: 'text',
                    text: `Look at this job application form screenshot. Count ALL visible form fields that an applicant needs to fill in.

Include: text inputs, email/phone fields, dropdowns/selects, textareas, file upload areas, Yes/No toggle buttons, checkboxes, radio buttons.
Exclude: submit buttons, navigation buttons, already-filled fields showing a value, decorative elements.

Respond ONLY with JSON in this exact format:
{
  "total": <number>,
  "breakdown": {
    "text_inputs": <number>,
    "dropdowns": <number>,
    "textareas": <number>,
    "file_uploads": <number>,
    "yes_no_questions": <number>,
    "checkboxes": <number>,
    "other": <number>
  },
  "notes": "<brief observation about the form>"
}`,
                },
            ],
        }],
    });

    const text = (response.content[0] as { text: string }).text.trim();
    try {
        // Extract JSON even if surrounded by markdown fences
        const match = text.match(/\{[\s\S]*\}/);
        return match ? JSON.parse(match[0]) : { total: 0, breakdown: {}, notes: text };
    } catch {
        return { total: 0, breakdown: {}, notes: text };
    }
}

// ── Per-job analysis ────────────────────────────────────────────────────────
async function analyzeJob(page: import('playwright').Page, job: typeof JOBS[0]) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`🌐 ${job.title} @ ${job.company} [${job.ats}]`);

    const outDir = path.join(ROOT, 'extractions', 'audit', 'coverage', job.slug);
    fs.mkdirSync(outDir, { recursive: true });

    // Reuse screenshot from compare test if available, otherwise take a new one
    const existingScreenshot = path.join(ROOT, 'extractions', 'audit', 'extractor-compare', job.slug, 'screenshot.png');
    const ssPath = path.join(outDir, 'screenshot.png');

    try {
        await page.goto(job.url, { waitUntil: 'networkidle', timeout: 40_000 });
        await page.waitForTimeout(3000);

        // ── 1. Extract ─────────────────────────────────────────────────────
        const rawElements = await page.evaluate(FIELD_EXTRACTOR) as ExtractedElement[];
        const elements = filterAtsWidgets(rawElements, false);
        console.log(`   📋 Extracted: ${elements.length} elements`);

        if (elements.length === 0) {
            await page.screenshot({ path: ssPath, fullPage: true });
            return { slug: job.slug, company: job.company, ats: job.ats, extracted: 0, planned: 0, vision_total: 0, coverage_pct: 0, error: 'No elements extracted' };
        }

        // ── 2. Combobox expand ─────────────────────────────────────────────
        await expandComboboxOptions(page, elements);

        // ── 3. LLM fill plan ───────────────────────────────────────────────
        console.log('   🧠 Building fill plan...');
        const fillPlan = await buildFillPlan(elements, PROFILE, job);
        const { plan: reconciledPlan } = reconcilePlan(fillPlan, elements);

        const fillActions = reconciledPlan.filter((a: FillAction) => a.action_type !== 'skip');
        const skipActions = reconciledPlan.filter((a: FillAction) => a.action_type === 'skip');

        console.log(`   📝 Plan: ${fillActions.length} fill / ${skipActions.length} skip`);
        fs.writeFileSync(path.join(outDir, 'plan.json'), JSON.stringify(reconciledPlan, null, 2));

        // Print plan detail
        for (const a of reconciledPlan) {
            const el = elements.find((e: ExtractedElement) => e.id === a.id);
            const icon = a.action_type === 'skip' ? '  ⏭️ ' : '  ✏️ ';
            console.log(`${icon} ${a.id.padEnd(7)} ${a.action_type.padEnd(15)} "${String(a.value).slice(0, 40)}" ← "${(el?.label ?? '?').slice(0, 35)}"`);
        }

        // ── 4. Screenshot ──────────────────────────────────────────────────
        if (fs.existsSync(existingScreenshot)) {
            fs.copyFileSync(existingScreenshot, ssPath);
            console.log('   📸 Reusing existing screenshot');
        } else {
            await page.screenshot({ path: ssPath, fullPage: true });
            console.log(`   📸 Screenshot saved`);
        }

        // ── 5. Vision field count ──────────────────────────────────────────
        console.log('   👁  Asking Claude Vision to count visible fields...');
        const visionResult = await countFieldsWithVision(ssPath);
        console.log(`   👁  Vision sees: ${visionResult.total} total fields`);
        console.log(`      ${JSON.stringify(visionResult.breakdown)}`);
        if (visionResult.notes) console.log(`      Note: ${visionResult.notes}`);

        const coveragePct = visionResult.total > 0
            ? Math.round((fillActions.length / visionResult.total) * 100)
            : 0;

        console.log(`\n   📊 COVERAGE: ${fillActions.length} planned / ${visionResult.total} visible = ${coveragePct}%`);

        const result = {
            slug: job.slug, company: job.company, ats: job.ats,
            extracted: elements.length,
            planned: fillActions.length,
            skipped: skipActions.length,
            vision_total: visionResult.total,
            vision_breakdown: visionResult.breakdown,
            vision_notes: visionResult.notes,
            coverage_pct: coveragePct,
        };
        fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2));
        return result;

    } catch (err) {
        console.error(`   💥 ${(err as Error).message?.slice(0, 120)}`);
        try { await page.screenshot({ path: ssPath, fullPage: true }); } catch { /* ignore */ }
        return { slug: job.slug, company: job.company, ats: job.ats, extracted: 0, planned: 0, vision_total: 0, coverage_pct: 0, error: (err as Error).message?.slice(0, 200) };
    }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n📊 LLM Fill Plan Coverage Analysis — 5 Jobs');
    console.log('   Extraction → Plan → Vision Count → Coverage %\n');

    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const results: Awaited<ReturnType<typeof analyzeJob>>[] = [];

    for (const job of JOBS) {
        const result = await analyzeJob(page, job);
        results.push(result);
        await page.waitForTimeout(1500);
    }

    await browser.close();

    // ── Summary table ────────────────────────────────────────────────────
    console.log(`\n${'═'.repeat(75)}`);
    console.log('  COVERAGE SUMMARY');
    console.log('═'.repeat(75));
    console.log(`  ${'Company'.padEnd(18)} ${'ATS'.padEnd(16)} ${'Extr'.padStart(5)} ${'Plan'.padStart(5)} ${'Skip'.padStart(5)} ${'Vision'.padStart(7)} ${'Cover%'.padStart(7)}`);
    console.log(`  ${'─'.repeat(70)}`);
    for (const r of results) {
        const cover = (r as { coverage_pct: number }).coverage_pct;
        const icon = cover >= 90 ? '✅' : cover >= 70 ? '⚠️ ' : '❌';
        const err = (r as { error?: string }).error ? ' ERROR' : '';
        console.log(`  ${r.company.padEnd(18)} ${r.ats.padEnd(16)} ${String((r as { extracted: number }).extracted).padStart(5)} ${String((r as { planned: number }).planned).padStart(5)} ${String((r as { skipped?: number }).skipped ?? 0).padStart(5)} ${String(r.vision_total).padStart(7)} ${(cover + '%').padStart(6)} ${icon}${err}`);
    }
    console.log('═'.repeat(75));
    console.log('\n  Results: extractions/audit/coverage/<slug>/result.json\n');
}

main().catch(err => { console.error('💥', err); process.exit(1); });
