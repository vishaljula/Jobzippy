/**
 * test/compare-extractors.ts
 *
 * Extraction comparison test across 5 ATS jobs.
 * Runs 3 extraction strategies per job and saves results side-by-side:
 *
 *   Strategy 1: skyvern-domUtils.js  (full 2972-line Skyvern tree extractor)
 *   Strategy 2: common-fields.js     (our current 200-line form-field extractor)
 *   Strategy 3: AX Tree              (browser DOM walk including buttons)
 *   Strategy 4: Screenshot           (compressed full-page PNG for visual reference)
 *
 * Output per job:
 *   extractions/audit/extractor-compare/<slug>/
 *     skyvern.json     ← domUtils.js interactable elements
 *     dom.json         ← common-fields.js output
 *     ax.json          ← AX-equivalent interactive nodes
 *     screenshot.png   ← full-page screenshot
 *     summary.json     ← coverage comparison table
 *
 * Run: npx tsx test/compare-extractors.ts
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import type { ExtractedElement } from '../extractor/types.js';
import { filterAtsWidgets } from '../extractor/field-filter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const FIELD_EXTRACTOR = fs.readFileSync(path.join(ROOT, 'extractor', 'common-fields.js'), 'utf8');

// Skyvern's full domUtils.js — defines buildTreeFromBody() in global scope.
// We append a call to it so page.evaluate can await the async function.
const SKYVERN_DOM_UTILS = fs.readFileSync(path.join(ROOT, 'vendor', 'skyvern-domUtils.js'), 'utf8');
// Wrapper: inject the script, call buildTreeFromBody(), return interactable elements.
const SKYVERN_EXTRACTOR = SKYVERN_DOM_UTILS + `
;(async () => {
  const [elements] = await buildTreeFromBody();
  // Return only interactable elements with useful fields
  return elements
    .filter(e => e.interactable)
    .map(e => ({
      id: e.id,
      tagName: e.tagName,
      role: e.attributes?.role ?? '',
      text: e.text ?? '',
      ariaLabel: e.attributes?.['aria-label'] ?? '',
      inputType: e.attributes?.type ?? '',
      isSelectable: e.isSelectable ?? false,
      options: e.options ?? [],
    }));
})();
`;

// ── Job list (same 5 as multi-ats test) ────────────────────────────────────
const JOBS = [
    { slug: 'workday_adobe', ats: 'Workday', company: 'Adobe', url: 'https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/San-Francisco/Senior-Staff-Engineer---Web--Firefly-Boards_R165858/apply/applyManually?jr_id=699e49db81476f6176b739ba' },
    { slug: 'ashby_kindred', ats: 'Ashby', company: 'Kindred', url: 'https://jobs.ashbyhq.com/kindred/8d4c41f1-57bd-4347-832b-1e8844358508/application' },
    { slug: 'lever_highlevel', ats: 'Lever', company: 'HighLevel', url: 'https://jobs.lever.co/gohighlevel/702536d5-7918-4b5a-8272-6dd0f7cfa04c/apply' },
    { slug: 'smartrecruiters', ats: 'SmartRecruiters', company: 'SmartRecruiters', url: 'https://jobs.smartrecruiters.com/oneclick-ui/company/smartrecruiters/publication/fea7bb18-983f-40f2-b7e9-3793d1bd1e9d?dcr_ci=smartrecruiters' },
    { slug: 'ashby_rillet', ats: 'Ashby', company: 'Rillet', url: 'https://jobs.ashbyhq.com/rillet/9cf56ee1-3a3a-42d6-af77-3621ea4d3cd5/application' },
];

// ── AX-equivalent extractor (works in Playwright 1.46+) ─────────────────────
// page.accessibility was removed in Playwright 1.46. We replicate it by walking
// the DOM and collecting ALL interactable elements — including plain <button>
// elements that common-fields.js intentionally excludes.
//
// We capture: role (computed), name (from aria-label / text content / label),
// and the nearest ancestor that looks like a question label (parentLabel).

interface AxNode {
    role: string;
    name: string;
    value?: string;
    checked?: boolean;
    parentLabel?: string;
}

const AX_EXTRACTOR = `
(function extractInteractiveElements() {
    const ROLES = {
        input: { text: 'textbox', checkbox: 'checkbox', radio: 'radio', file: 'upload', submit: null, button: null, hidden: null },
        select: 'combobox', textarea: 'textbox', button: 'button',
    };
    const ROLE_ATTRS = ['combobox','listbox','textbox','checkbox','radio','button','switch','option','menuitem','spinbutton','slider'];

    function getRole(el) {
        const ar = el.getAttribute('role');
        if (ar && ROLE_ATTRS.includes(ar)) return ar;
        const tag = el.tagName.toLowerCase();
        if (tag === 'input') return ROLES.input[el.type] ?? 'textbox';
        return ROLES[tag] ?? null;
    }

    function getName(el) {
        const al = el.getAttribute('aria-label');
        if (al && al.trim()) return al.trim();
        const lby = el.getAttribute('aria-labelledby');
        if (lby) {
            const t = lby.split(' ').map(id => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(' ');
            if (t) return t;
        }
        if (el.id) {
            const lbl = document.querySelector('label[for="' + el.id + '"]');
            if (lbl) return lbl.textContent.trim();
        }
        const t = el.textContent?.trim();
        if (t && t.length < 120) return t;
        const p = el.getAttribute('placeholder');
        if (p) return p.trim();
        return '';
    }

    function getParentLabel(el) {
        let node = el.parentElement;
        for (let i = 0; i < 6 && node; i++, node = node.parentElement) {
            // Look for a <label>, <legend>, or element with text that looks like a question
            const lbl = node.querySelector('label, legend, [class*="label"], [class*="question"], p, h1, h2, h3, h4');
            if (lbl && lbl !== el && !lbl.contains(el)) {
                const t = lbl.textContent?.trim();
                if (t && t.length > 5 && t.length < 200) return t;
            }
        }
        return '';
    }

    function isVisible(el) {
        const r = el.getBoundingClientRect();
        const s = window.getComputedStyle(el);
        return (r.width > 0 || r.height > 0) && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0' && !el.disabled;
    }

    const SELECTOR = 'input:not([type=hidden]):not([type=submit]):not([type=reset]):not([type=image]), select, textarea, button:not([type=submit]), [role="combobox"], [role="listbox"], [role="textbox"], [role="checkbox"], [role="radio"], [role="button"], [role="switch"]';
    const results = [];
    for (const el of document.querySelectorAll(SELECTOR)) {
        if (!isVisible(el)) continue;
        const role = getRole(el);
        if (!role) continue;
        const name = getName(el);
        if (!name) continue;
        results.push({
            role,
            name,
            value: el.value ?? undefined,
            checked: el.checked ?? undefined,
            parentLabel: getParentLabel(el) || undefined,
        });
    }
    return results;
})()
`;

// ── Per-job runner ─────────────────────────────────────────────────────────
async function compareJob(page: import('playwright').Page, job: typeof JOBS[0]) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`🌐 ${job.company} [${job.ats}]`);
    console.log(`   ${job.url}`);

    const outDir = path.join(ROOT, 'extractions', 'audit', 'extractor-compare', job.slug);
    fs.mkdirSync(outDir, { recursive: true });

    try {
        await page.goto(job.url, { waitUntil: 'networkidle', timeout: 40_000 });
        await page.waitForTimeout(3000);

        // ── Strategy 1: Skyvern domUtils.js ───────────────────────────────
        let skyvernElements: Record<string, unknown>[] = [];
        try {
            skyvernElements = await page.evaluate(SKYVERN_EXTRACTOR) as Record<string, unknown>[];
        } catch (e) {
            console.log(`   ⚠️  domUtils error: ${(e as Error).message?.slice(0, 80)}`);
        }
        fs.writeFileSync(path.join(outDir, 'skyvern.json'), JSON.stringify(skyvernElements, null, 2));
        console.log(`   🟣 Skyvern domUtils:     ${skyvernElements.length} interactable elements`);

        // ── Strategy 2: common-fields.js ──────────────────────────────────
        const rawElements = await page.evaluate(FIELD_EXTRACTOR) as ExtractedElement[];
        const domElements = filterAtsWidgets(rawElements, false);
        fs.writeFileSync(path.join(outDir, 'dom.json'), JSON.stringify(domElements, null, 2));
        console.log(`   📋 DOM (common-fields):  ${domElements.length} elements`);

        // ── Strategy 3: AX-equivalent extraction ──────────────────────────
        const axNodes = await page.evaluate(AX_EXTRACTOR) as AxNode[];
        fs.writeFileSync(path.join(outDir, 'ax.json'), JSON.stringify(axNodes, null, 2));
        console.log(`   ♿ AX tree:               ${axNodes.length} interactive nodes`);

        // ── Strategy 3: Screenshot ────────────────────────────────────────
        const ssPath = path.join(outDir, 'screenshot.png');
        await page.screenshot({ path: ssPath, fullPage: true });
        const ssBytes = fs.statSync(ssPath).size;
        console.log(`   📸 Screenshot:           ${(ssBytes / 1024).toFixed(0)} KB → ${ssPath}`);

        // ── Coverage summary ──────────────────────────────────────────────
        // Identify AX nodes that appear to be form fields NOT in dom output
        const domLabels = new Set(domElements.map(e => e.label.toLowerCase().trim()));
        const axOnly = axNodes.filter(n => {
            const lc = n.name.toLowerCase();
            return !domLabels.has(lc) && lc.length > 2 && lc.length < 120;
        });
        // Filter to likely form-relevant roles (exclude generic buttons like nav)
        const axOnlyForm = axOnly.filter(n =>
            ['textbox', 'combobox', 'radio', 'checkbox', 'button', 'switch'].includes(n.role)
        );

        const summary = {
            job: { slug: job.slug, ats: job.ats, company: job.company },
            skyvern_count: skyvernElements.length,
            dom_count: domElements.length,
            ax_count: axNodes.length,
            ax_only_likely_form: axOnlyForm.map((n: AxNode) => ({
                role: n.role,
                name: n.name,
                parentLabel: n.parentLabel,
            })),
            // Elements Skyvern sees but common-fields misses
            skyvern_only: skyvernElements
                .filter((e) => {
                    const text = ((e.text ?? '') as string).toLowerCase().trim();
                    const label = ((e.ariaLabel ?? '') as string).toLowerCase().trim();
                    const domLabelsArr = domElements.map(d => d.label.toLowerCase().trim());
                    return text.length > 2 && text.length < 120 &&
                        !domLabelsArr.some(l => l.includes(text) || text.includes(l)) &&
                        !domLabelsArr.some(l => l.includes(label) || label.includes(l));
                })
                .map((e) => ({ tagName: e.tagName, text: e.text, role: e.role })),
        };
        fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

        const skyvernOnly = (summary as { skyvern_only?: Array<{ tagName: unknown; text: unknown; role: unknown }> }).skyvern_only ?? [];
        if (skyvernOnly.length > 0) {
            console.log(`   🟣 Skyvern-only (missed by DOM): ${skyvernOnly.length} elements`);
            for (const e of skyvernOnly.slice(0, 6)) {
                console.log(`      [${e.tagName}/${e.role || '—'}] "${String(e.text).slice(0, 60)}"`);
            }
        }
        if (axOnlyForm.length > 0) {
            console.log(`   ⚠️  AX-only (missed by DOM): ${axOnlyForm.length} likely form nodes`);
            for (const n of axOnlyForm) {
                const ctx = n.parentLabel ? ` ← "${n.parentLabel.slice(0, 50)}"` : '';
                console.log(`      [${n.role}] "${n.name}"${ctx}`);
            }
        } else {
            console.log(`   ✅ No AX-only form nodes — DOM covers everything visible`);
        }

        return summary;

    } catch (err) {
        console.error(`   💥 ${(err as Error).message?.slice(0, 120)}`);
        return { job: { slug: job.slug, ats: job.ats, company: job.company }, dom_count: 0, ax_count: 0, ax_only_likely_form: [], error: (err as Error).message };
    }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n🔬 Extractor Comparison Test — 3 Strategies × 5 Jobs');
    console.log('   Strategies: DOM (common-fields.js) · AX Tree · Screenshot');
    console.log('   Output: extractions/audit/extractor-compare/<slug>/\n');

    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const summaries: ReturnType<typeof compareJob> extends Promise<infer T> ? T[] : never[] = [] as never[];

    for (const job of JOBS) {
        const summary = await compareJob(page, job);
        summaries.push(summary as never);
        await page.waitForTimeout(1500);
    }

    await browser.close();

    // ── Final coverage table ─────────────────────────────────────────────
    console.log(`\n${'═'.repeat(70)}`);
    console.log('  EXTRACTION COVERAGE SUMMARY');
    console.log('═'.repeat(70));
    console.log(`  ${'Company'.padEnd(18)} ${'ATS'.padEnd(16)} ${'Skyvern'.padStart(8)} ${'DOM'.padStart(4)} ${'AX'.padStart(4)} ${'S-gap'.padStart(6)} ${'AX-gap'.padStart(7)}`);
    console.log(`  ${'─'.repeat(70)}`);
    for (const s of summaries as Array<{ job: { company: string; ats: string }; skyvern_count?: number; dom_count: number; ax_count: number; ax_only_likely_form: Array<{ name: string }>; skyvern_only?: Array<{ text: unknown }>; error?: string }>) {
        const axGap = s.ax_only_likely_form?.length ?? 0;
        const skvGap = s.skyvern_only?.length ?? 0;
        const err = s.error ? ' ❌' : '';
        console.log(`  ${s.job.company.padEnd(18)} ${s.job.ats.padEnd(16)} ${String(s.skyvern_count ?? 0).padStart(8)} ${String(s.dom_count).padStart(4)} ${String(s.ax_count).padStart(4)} ${(skvGap > 0 ? '+' + skvGap : '  0').padStart(6)} ${(axGap > 0 ? '+' + axGap : '  0').padStart(7)}${err}`);
    }
    console.log('═'.repeat(70));
    console.log('\n  Results saved to: extractions/audit/extractor-compare/');
    console.log('  Open screenshot.png per job to visually cross-reference.\n');
}

main().catch(err => { console.error('💥', err); process.exit(1); });
