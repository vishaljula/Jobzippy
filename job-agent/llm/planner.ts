/**
 * llm/planner.ts
 *
 * Sends extracted form elements + agent profile + job info to Claude Haiku.
 * Returns a structured fill plan: an array of FillAction objects, one per element.
 *
 * The LLM sees the real options[] for comboboxes (pre-expanded by extractor/combobox.ts)
 * so it can pick exact option texts rather than guessing.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ExtractedElement, FillAction } from '../extractor/types.js';
import type { AgentProfile, ScrapedJob } from '../types.js';

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert job application assistant. Your job is to produce a precise, 
structured fill plan for a job application form based on the applicant's profile and the extracted 
form fields. You must return a JSON array — nothing else, no markdown fences.`;

export async function buildFillPlan(
    elements: ExtractedElement[],
    profile: AgentProfile,
    job: ScrapedJob,
): Promise<FillAction[]> {

    // Build a concise representation of each field for the LLM
    const MAX_OPTIONS = 20; // cap to avoid blowing token budget (e.g. 200-country lists)
    const fieldDescriptions = elements.map(el => {
        let opts = el.options;
        const truncated = opts.length > MAX_OPTIONS;
        if (truncated) opts = opts.slice(0, MAX_OPTIONS);
        const optStr = opts.length > 0
            ? `\n     options: [${opts.map(o => `"${o}"`).join(', ')}${truncated ? `, …(${el.options.length - MAX_OPTIONS} more)` : ''}]`
            : '';
        const reqStr = el.required ? ' (required)' : '';
        const curVal = el.value ? ` [currently: "${el.value}"]` : '';
        const isPlaceholderLabel = /^(type here|start typing|search|enter|select|choose)[\.\.\s]*$/i.test(el.label.trim());
        const labelNote = isPlaceholderLabel ? ` [NOTE: label is a UI placeholder, infer field purpose from position in form]` : '';
        return `- id: "${el.id}", type: ${el.action_type}, label: "${el.label}"${reqStr}${curVal}${labelNote}${optStr}`;

    }).join('\n');

    const prompt = `Fill out this job application for the applicant below.

JOB: ${job.title} at ${job.company}
URL: ${job.url}

APPLICANT PROFILE:
${JSON.stringify(profile, null, 2)}

FORM FIELDS:
${fieldDescriptions}

INSTRUCTIONS:
- Return a JSON array where each item is: { "id": "<field id>", "action_type": "<type>", "value": "<value>", "note": "<brief reason>" }
- action_type must exactly match the field's type from above
- PRE-FILLED FIELDS: If a combobox or select_option field shows [currently: "..."] with a non-empty, non-placeholder value, use action_type "skip" — it is already correctly filled. Do NOT change pre-filled fields.
- COMBOBOX / SELECT_OPTION RULE (strict): Both "combobox" and "select_option" are dropdown fields. When options[] are listed, your value MUST be copied EXACTLY from that options list — character for character. Pick the closest matching option from the list. If nothing matches and the field is optional, use action_type "skip".
- When a combobox/select_option has NO options listed, make a reasonable guess from the profile.
- For upload_file fields that are resume/CV: use value "__RESUME_PATH__"
- For upload_file fields that are cover letters or optional: use action_type "skip" with value ""
- For input_text: use the applicant's real data (name, email, phone, etc.)
- For open-ended questions (textarea/input_text with essay-style labels): write a genuine 2-3 sentence answer
- For EEO/compliance dropdowns (gender, race, disability, veteran): pick the "prefer not to disclose" or equivalent option from the listed options
- Skip optional fields we have no data for (LinkedIn, Website, referral source) — use action_type "skip"
- Skip conditional fields where parent was answered "No" (e.g. "if you answered yes above...")
- Do NOT include submit/next/button fields

Return ONLY the JSON array. No markdown. No explanations outside the JSON.`;

    const response = await claude.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '[]';

    try {
        // Strip any accidental markdown fences
        const clean = text.replace(/^```[a-z]*\n?/m, '').replace(/```$/m, '').trim();
        return JSON.parse(clean) as FillAction[];
    } catch {
        console.error('⚠️  LLM returned unparseable JSON. Raw output:');
        console.error(text.slice(0, 400));
        return [];
    }
}
