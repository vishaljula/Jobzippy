/**
 * test/vision-fill-plan.ts
 *
 * Tests the vision-augmented fill plan approach using 100% cached data.
 * NO browser navigation — reads saved dom.json + screenshot.png from disk.
 *
 * For each job:
 *   1. Read saved dom.json → existing DOM-stamped fields
 *   2. Read saved screenshot.png → send to Claude Vision with updated prompt
 *   3. Vision returns ALL visible fields with: label, visual_type, choices, answer
 *   4. Merge: DOM fields get their existing jz-id plan, vision-only fields become
 *      proximity-click actions (question + answer, no jz-id needed)
 *   5. Print consolidated fill plan
 *
 * Run: npx tsx test/vision-fill-plan.ts
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { buildFillPlan } from '../llm/planner.js';
import { reconcilePlan } from '../llm/plan-reconciler.js';
import type { ExtractedElement, FillAction } from '../extractor/types.js';
import type { AgentProfile, ScrapedJob } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PROFILE: AgentProfile = JSON.parse(fs.readFileSync(path.join(ROOT, 'profile.json'), 'utf8'));
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Job metadata ─────────────────────────────────────────────────────────────
const JOBS: Array<{ slug: string; ats: string } & ScrapedJob> = [
    {
        slug: 'workday_adobe', ats: 'Workday',
        title: 'Senior Staff Engineer - Web', company: 'Adobe',
        url: 'https://adobe.wd5.myworkdayjobs.com/...', location: 'San Francisco, CA',
        description: '', isEasyApply: false,
    },
    {
        slug: 'ashby_kindred', ats: 'Ashby',
        title: 'Senior Software Engineer', company: 'Kindred',
        url: 'https://jobs.ashbyhq.com/kindred/...', location: 'Remote',
        description: '', isEasyApply: false,
    },
    {
        slug: 'lever_highlevel', ats: 'Lever',
        title: 'Lead Frontend Engineer', company: 'HighLevel',
        url: 'https://jobs.lever.co/gohighlevel/...', location: 'Remote',
        description: '', isEasyApply: false,
    },
    {
        slug: 'smartrecruiters', ats: 'SmartRecruiters',
        title: 'Senior Frontend Software Engineer', company: 'SmartRecruiters',
        url: 'https://jobs.smartrecruiters.com/...', location: 'Remote',
        description: '', isEasyApply: false,
    },
    {
        slug: 'ashby_rillet', ats: 'Ashby',
        title: 'Senior Frontend Engineer', company: 'Rillet',
        url: 'https://jobs.ashbyhq.com/rillet/...', location: 'Remote',
        description: '', isEasyApply: false,
    },
];

// ── Vision field type ─────────────────────────────────────────────────────────
interface VisionField {
    label: string;
    visual_type: 'text_input' | 'textarea' | 'dropdown' | 'button_choice' | 'checkbox' | 'radio_group' | 'file_upload';
    choices?: string[];   // for button_choice / radio_group / dropdown
    answer: string;       // what to fill/select/click
    required: boolean;
    already_filled: boolean;
}

interface VisionPlanResult {
    fields: VisionField[];
    total_visible: number;
    notes: string;
}

// ── Vision prompt ─────────────────────────────────────────────────────────────
function buildVisionPrompt(profile: AgentProfile, job: ScrapedJob): string {
    const profileSummary = `
Applicant profile:
- Name: ${profile.fullName}
- Email: ${profile.email}
- Phone: ${profile.phone}
- Location: ${profile.location ?? 'Not specified'}
- LinkedIn: ${profile.linkedin ?? 'Not provided'}
- Website/Portfolio: ${profile.website ?? 'Not provided'}
- Current company: ${profile.experience?.[0]?.company ?? 'Not specified'}
- Years experience: ${profile.yearsOfExperience ?? 'Not specified'}
Job: ${job.title} at ${job.company}
`.trim();

    return `You are analyzing a job application form screenshot.

${profileSummary}

Look at the screenshot carefully and identify ALL visible form fields that need to be filled by the applicant.

For each field, return a JSON object. Use visual appearance to determine type:
- "text_input" = single-line text box
- "textarea" = multi-line text area  
- "dropdown" = select/combobox with arrow indicator
- "button_choice" = side-by-side buttons (e.g. Yes/No, Male/Female/Non-binary)
- "radio_group" = circular radio buttons
- "checkbox" = square checkboxes (each is its own field)
- "file_upload" = file upload area or button

Rules:
- SKIP: submit buttons, back buttons, navigation, already-filled fields showing a value
- INCLUDE: all empty or pre-populated form fields the applicant should review/fill
- For "answer": use the applicant profile to determine the correct answer
- For work authorization: answer "Yes" unless profile says otherwise
- For sponsorship needed: answer "No" (assuming citizen/permanent resident)
- For optional social fields (Twitter, GitHub, Portfolio): answer "" if NOT in profile
- already_filled: true if the field already shows a value on screen

Respond ONLY with valid JSON matching this schema:
{
  "total_visible": <number of fillable fields you see>,
  "notes": "<brief observation>",
  "fields": [
    {
      "label": "<question or field label text>",
      "visual_type": "<text_input|textarea|dropdown|button_choice|radio_group|checkbox|file_upload>",
      "choices": ["<option1>", "<option2>"] or null,
      "answer": "<what to fill/select/click>",
      "required": <true|false>,
      "already_filled": <true|false>
    }
  ]
}`;
}

// ── Call vision model ─────────────────────────────────────────────────────────
async function getVisionPlan(screenshotPath: string, profile: AgentProfile, job: ScrapedJob): Promise<VisionPlanResult> {
    const imageData = fs.readFileSync(screenshotPath);
    const base64 = imageData.toString('base64');

    const response = await claude.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 2000,
        messages: [{
            role: 'user',
            content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } },
                { type: 'text', text: buildVisionPrompt(profile, job) },
            ],
        }],
    });

    const text = (response.content[0] as { text: string }).text.trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Vision returned non-JSON: ${text.slice(0, 200)}`);
    return JSON.parse(match[0]) as VisionPlanResult;
}

// ── Merge DOM plan + vision-only fields ───────────────────────────────────────
interface MergedAction {
    source: 'dom' | 'vision';
    id?: string;                // dom: jz-id
    label: string;
    visual_type?: string;       // vision-only
    choices?: string[];         // vision-only: button_choice options
    action_type: string;        // input_text | combobox | click_button | upload_file | skip | checkbox
    value: string;              // what to fill
    already_filled?: boolean;
}

function mergePlans(
    domPlan: FillAction[],
    domElements: ExtractedElement[],
    visionResult: VisionPlanResult,
): MergedAction[] {
    const merged: MergedAction[] = [];

    // DOM-stamped actions first
    for (const action of domPlan) {
        const el = domElements.find(e => e.id === action.id);
        merged.push({
            source: 'dom',
            id: action.id,
            label: el?.label ?? action.id,
            action_type: action.action_type,
            value: String(action.value ?? ''),
        });
    }

    // Vision-only fields: those NOT already covered by a DOM label
    const domLabels = new Set(domElements.map(e => e.label.toLowerCase().trim()));

    for (const vf of visionResult.fields) {
        if (vf.already_filled) continue;
        const lc = vf.label.toLowerCase().trim();

        // Skip if DOM already covers this (fuzzy match)
        const coveredByDom = [...domLabels].some(dl =>
            dl.includes(lc.slice(0, 20)) || lc.includes(dl.slice(0, 20))
        );
        if (coveredByDom) continue;

        // Map visual_type → action_type
        let action_type: string;
        switch (vf.visual_type) {
            case 'button_choice':
            case 'radio_group': action_type = 'click_button'; break;
            case 'checkbox': action_type = 'checkbox'; break;
            case 'dropdown': action_type = 'combobox'; break;
            case 'file_upload': action_type = 'upload_file'; break;
            default: action_type = 'input_text';
        }

        merged.push({
            source: 'vision',
            label: vf.label,
            visual_type: vf.visual_type,
            choices: vf.choices ?? undefined,
            action_type,
            value: vf.answer,
        });
    }

    return merged;
}

// ── Per-job runner ────────────────────────────────────────────────────────────
async function analyzeJob(job: typeof JOBS[0]) {
    const compareDir = path.join(ROOT, 'extractions', 'audit', 'extractor-compare', job.slug);
    const coverageDir = path.join(ROOT, 'extractions', 'audit', 'coverage', job.slug);
    const outDir = path.join(ROOT, 'extractions', 'audit', 'vision-plan', job.slug);
    fs.mkdirSync(outDir, { recursive: true });

    console.log(`\n${'─'.repeat(72)}`);
    console.log(`🌐 ${job.title} @ ${job.company} [${job.ats}]`);

    // ── Load cached DOM extraction ──────────────────────────────────────────
    const domJsonPath = path.join(compareDir, 'dom.json');
    if (!fs.existsSync(domJsonPath)) {
        console.log('   ⏭️  No cached dom.json — skipping (job was unreachable)');
        return null;
    }
    const domElements: ExtractedElement[] = JSON.parse(fs.readFileSync(domJsonPath, 'utf8'));
    console.log(`   📋 DOM elements (cached): ${domElements.length}`);

    // ── Load or build DOM fill plan ─────────────────────────────────────────
    let domPlan: FillAction[];
    const cachedPlanPath = path.join(coverageDir, 'plan.json');
    if (fs.existsSync(cachedPlanPath)) {
        domPlan = JSON.parse(fs.readFileSync(cachedPlanPath, 'utf8'));
        console.log(`   📝 DOM plan (cached): ${domPlan.length} actions`);
    } else if (domElements.length > 0) {
        console.log('   🧠 Building DOM fill plan (not cached)...');
        const rawPlan = await buildFillPlan(domElements, PROFILE, job);
        const { plan } = reconcilePlan(rawPlan, domElements);
        domPlan = plan;
        console.log(`   📝 DOM plan: ${domPlan.length} actions`);
    } else {
        domPlan = [];
    }

    // ── Vision pass ─────────────────────────────────────────────────────────
    const ssPath = path.join(compareDir, 'screenshot.png');
    if (!fs.existsSync(ssPath)) {
        console.log('   ⏭️  No cached screenshot — skipping vision');
        return null;
    }

    console.log('   👁  Running vision pass on cached screenshot...');
    let visionResult: VisionPlanResult;
    try {
        visionResult = await getVisionPlan(ssPath, PROFILE, job);
        console.log(`   👁  Vision found: ${visionResult.total_visible} total fields`);
        if (visionResult.notes) console.log(`      Note: ${visionResult.notes}`);
    } catch (e) {
        console.error(`   💥 Vision error: ${(e as Error).message?.slice(0, 100)}`);
        return null;
    }

    // ── Merge ───────────────────────────────────────────────────────────────
    const mergedPlan = mergePlans(domPlan, domElements, visionResult);
    const fillActions = mergedPlan.filter(a => a.action_type !== 'skip');
    const visionOnlyCount = mergedPlan.filter(a => a.source === 'vision').length;

    console.log(`\n   📊 MERGED PLAN: ${fillActions.length} actions (${visionOnlyCount} vision-only additions)`);
    console.log(`\n   ${'SRC'.padEnd(6)} ${'ID'.padEnd(7)} ${'TYPE'.padEnd(15)} ${'LABEL'.padEnd(35)} VALUE`);
    console.log(`   ${'─'.repeat(90)}`);

    for (const a of mergedPlan) {
        const src = a.source === 'vision' ? '👁 vis' : '🗂 dom';
        const id = (a.id ?? '—').padEnd(7);
        const typ = a.action_type.padEnd(15);
        const lbl = a.label.slice(0, 34).padEnd(35);
        const val = a.action_type === 'skip' ? '(skip)' : `"${String(a.value).slice(0, 40)}"`;
        const extra = a.choices ? ` [${a.choices.join('/')}]` : '';
        console.log(`   ${src} ${id} ${typ} ${lbl} ${val}${extra}`);
    }

    const output = {
        job: { slug: job.slug, company: job.company, ats: job.ats },
        dom_elements: domElements.length,
        dom_plan_count: domPlan.length,
        vision_total_visible: visionResult.total_visible,
        vision_fields: visionResult.fields,
        merged_plan: mergedPlan,
        fill_count: fillActions.length,
        vision_only_added: visionOnlyCount,
        coverage_pct: Math.round((fillActions.length / visionResult.total_visible) * 100),
    };
    fs.writeFileSync(path.join(outDir, 'vision-plan.json'), JSON.stringify(output, null, 2));

    return { slug: job.slug, company: job.company, ats: job.ats, ...output };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n🔭 Vision-Enhanced Fill Plan Test — Offline (no browser)');
    console.log('   Reads: dom.json + screenshot.png from extractor-compare cache\n');

    const results = [];
    for (const job of JOBS) {
        const r = await analyzeJob(job);
        if (r) results.push(r);
    }

    console.log(`\n${'═'.repeat(80)}`);
    console.log('  VISION-ENHANCED COVERAGE SUMMARY');
    console.log('═'.repeat(80));
    console.log(`  ${'Company'.padEnd(18)} ${'ATS'.padEnd(16)} ${'DOM'.padStart(4)} ${'Plan'.padStart(5)} ${'Vision+'.padStart(8)} ${'Total'.padStart(6)} ${'Cover%'.padStart(7)}`);
    console.log(`  ${'─'.repeat(75)}`);
    for (const r of results) {
        const icon = r.coverage_pct >= 90 ? '✅' : r.coverage_pct >= 70 ? '⚠️ ' : '❌';
        console.log(`  ${r.company.padEnd(18)} ${r.ats.padEnd(16)} ${String(r.dom_elements).padStart(4)} ${String(r.dom_plan_count).padStart(5)} ${('+' + r.vision_only_added).padStart(8)} ${String(r.fill_count).padStart(6)} ${(r.coverage_pct + '%').padStart(6)} ${icon}`);
    }
    console.log('═'.repeat(80));
    console.log('\n  Full plans: extractions/audit/vision-plan/<slug>/vision-plan.json\n');
}

main().catch(err => { console.error('💥', err); process.exit(1); });
