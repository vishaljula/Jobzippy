/**
 * job-agent.ts — Orchestrator (entry point)
 *
 * Responsibilities:
 *   1. Load profile.json + validate resume.pdf exists
 *   2. Fetch jobs via Greenhouse public API (no login needed)
 *   3. Initialize Stagehand browser (visible Chrome window)
 *   4. Call Applicator for each job
 *   5. Write results.json + print summary
 *
 * Run: npx tsx job-agent.ts
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { fileURLToPath } from 'url';
import { Stagehand } from '@browserbasehq/stagehand';
import { findJobs } from './finder.js';
import type { AgentProfile, ApplicationResult, ScrapedJob } from './types.js';

// TODO: wire in the new filler pipeline (extractor → combobox → planner → reconciler → filler)
// For now, stub so job-agent.ts compiles while finder.ts is being built
async function applyToJob(_stagehand: unknown, job: ScrapedJob, _profile: AgentProfile, _resumePath: string): Promise<ApplicationResult> {
    return { job, status: 'skipped', reason: 'Filler pipeline not yet wired into job-agent' };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────

const PROFILE_PATH = path.join(__dirname, 'profile.json');
const RESUME_PATH = path.join(__dirname, 'resume.pdf');
const RESULTS_PATH = path.join(__dirname, 'results.json');
const JOBS_TO_APPLY = 2;

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function loadProfile(): AgentProfile {
    if (!fs.existsSync(PROFILE_PATH)) {
        console.error(`\n❌ profile.json not found at: ${PROFILE_PATH}`);
        console.error('   Run the vault extraction script in the extension DevTools console first.');
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf-8')) as AgentProfile;
}

function checkResume(): void {
    if (!fs.existsSync(RESUME_PATH)) {
        console.error(`\n❌ resume.pdf not found at: ${RESUME_PATH}`);
        console.error('   Place your resume PDF at job-agent/resume.pdf');
        process.exit(1);
    }
}

function waitForEnter(message: string): Promise<void> {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(message, () => {
            rl.close();
            resolve();
        });
    });
}

function printSummary(results: ApplicationResult[]): void {
    console.log('\n' + '═'.repeat(60));
    console.log('  JOB AGENT RUN COMPLETE');
    console.log('═'.repeat(60));
    for (const r of results) {
        const icon = r.status === 'applied' ? '✅' : r.status === 'skipped' ? '⏭️ ' : '❌';
        console.log(`${icon}  ${r.job.title} @ ${r.job.company}`);
        console.log(`    Status: ${r.status}${r.reason ? ` (${r.reason})` : ''}`);
        if (r.screenshotPath) console.log(`    Screenshot: ${r.screenshotPath}`);
        if (r.appliedAt) console.log(`    Applied at: ${r.appliedAt}`);
        console.log();
    }
    const applied = results.filter((r) => r.status === 'applied').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const errors = results.filter((r) => r.status === 'error').length;
    console.log(`  Total: ${applied} applied, ${skipped} skipped, ${errors} errors`);
    console.log('═'.repeat(60) + '\n');
}

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────

async function main() {
    console.log('\n🤖 Jobzippy Autonomous Agent starting...\n');

    // Validate inputs
    const profile = loadProfile();
    checkResume();

    console.log(`  Profile loaded: ${profile.identity.first_name} ${profile.identity.last_name}`);
    console.log(`  Target role:    ${profile.preferences.target_roles?.[0] ?? '(not set)'}`);
    console.log(`  Location:       ${profile.preferences.locations?.[0] ?? '(not set)'}`);
    console.log(`  Resume:         ${RESUME_PATH}`);

    // Layer 2: Stagehand uses GPT-4o-mini for visual act() calls
    // Layer 1: Claude Haiku (in applicator.ts) handles fill planning
    const stagehand = new Stagehand({
        env: 'LOCAL',
        headless: false,
        modelName: 'gpt-4o-mini',
        modelClientOptions: { apiKey: process.env.OPENAI_API_KEY },
        verbose: 1,
    });

    await stagehand.init();

    const results: ApplicationResult[] = [];

    try {
        // ── Phase 1: Find jobs via Greenhouse API ───────────────
        console.log('\n📋 Phase 1: Finding jobs via Greenhouse API...');
        const jobs = await findJobs(null, profile, JOBS_TO_APPLY);

        if (jobs.length === 0) {
            console.log('\n❌ No jobs found. Try expanding GREENHOUSE_COMPANIES in finder.ts');
            await stagehand.close();
            return;
        }

        console.log(`\n📌 Selected ${jobs.length} job(s) to apply to:`);
        jobs.forEach((j, i) => console.log(`   ${i + 1}. ${j.title} @ ${j.company} [${j.location}]`));

        // ── Phase 2: Apply to each job ───────────────────────────
        console.log('\n📋 Phase 2: Applying...');
        for (const job of jobs) {
            const result = await applyToJob(stagehand, job, profile, RESUME_PATH);
            results.push(result);
            // Brief pause between applications to avoid rate limits
            if (jobs.indexOf(job) < jobs.length - 1) {
                console.log('\n  ⏳ Pausing 5 seconds before next application...');
                await new Promise((r) => setTimeout(r, 5000));
            }
        }
    } finally {
        // Always write results and close, even on error
        fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
        console.log(`\n💾 Results saved to: ${RESULTS_PATH}`);
        printSummary(results);
        await stagehand.close();
    }
}

main().catch((err) => {
    console.error('\n💥 Fatal error:', err);
    process.exit(1);
});
