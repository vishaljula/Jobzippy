/**
 * Form Helper Agent
 * 
 * Uses LLM to answer form questions and generate cover letters.
 * Key principle: All responses must sound natural and human-like.
 */

import Anthropic from '@anthropic-ai/sdk';
import { OPENAI_MODEL, openaiClient } from './openai-client.js';

const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? 'claude-3-haiku-20240307';

// ============================================================================
// Types
// ============================================================================

export interface FormQuestion {
  fieldId: string;
  questionText: string;
  inputType: 'text' | 'number' | 'select' | 'textarea' | 'radio' | 'checkbox';
  options?: string[];
  maxLength?: number;
  isRequired: boolean;
  validationError?: string; // Error message from previous attempt
  previousAnswer?: string;  // What was answered before that caused the error
}

export interface ResumeData {
  summary: string;
  totalYearsExperience: number;
  skills: string[];
  education: { degree: string; field: string; school: string }[];
  recentJobTitle: string;
  recentCompany: string;
}

export interface FormAnswerRequest {
  jobTitle: string;
  company: string;
  jobDescription?: string;
  questions: FormQuestion[];
  resumeData: ResumeData;
}

export interface FormAnswerResponse {
  answers: Record<string, string>;
  confidence: number;
}

export interface CoverLetterRequest {
  jobTitle: string;
  company: string;
  jobDescription: string;
  resumeData: ResumeData;
}

export interface CoverLetterResponse {
  coverLetter: string;
}

// ============================================================================
// Prompts
// ============================================================================

function buildFormAnswerPrompt(request: FormAnswerRequest): string {
  const { jobTitle, company, jobDescription, questions, resumeData } = request;

  const questionsText = questions.map((q, i) => {
    let qText = `${i + 1}. [${q.fieldId}] "${q.questionText}"`;
    if (q.inputType === 'number') qText += ' (answer with a whole number only)';
    if (q.options && q.options.length > 0) {
      qText += `\n   Options: ${q.options.join(' | ')}`;
    }
    if (q.maxLength) qText += ` (max ${q.maxLength} characters)`;

    // Add validation error context if this question failed before
    if (q.validationError) {
      qText += `\n   ⚠️ PREVIOUS ATTEMPT FAILED:`;
      qText += `\n   Your previous answer: "${q.previousAnswer}"`;
      qText += `\n   Validation error: "${q.validationError}"`;
      qText += `\n   Please provide a CORRECTED answer that satisfies the validation requirement.`;
    }

    return qText;
  }).join('\n');

  return `You are helping a job applicant fill out an application form. Answer EXACTLY like a real human would - natural, conversational, and genuine.

JOB: ${jobTitle} at ${company}
${jobDescription ? `\nJOB DESCRIPTION (excerpt):\n${jobDescription.substring(0, 800)}` : ''}

APPLICANT BACKGROUND:
${resumeData.summary}
- Total Experience: ${resumeData.totalYearsExperience} years
- Skills: ${resumeData.skills.slice(0, 15).join(', ')}
- Recent Role: ${resumeData.recentJobTitle} at ${resumeData.recentCompany}
- Education: ${resumeData.education.map(e => `${e.degree}${e.field ? ` in ${e.field}` : ''}`).join(', ')}

INSTRUCTIONS FOR HUMAN-LIKE ANSWERS:
- For "years of experience" with a specific skill:
  - If the skill is EXPLICITLY in work history, use that duration.
  - If the skill is NOT in help history but is RELATED to their background (e.g. specialized framework for a language they know), estimate 1-2 years (do not say 0).
  - DO NOT default to Total Experience (e.g. 10 years) unless the question is about "Total/Overall Experience".
  - If the skill is completely unknown/unrelated, answer "0".
- For Citizenship/Visa questions:
  - Check "APPLICANT BACKGROUND" carefully.
  - If it says "Visa Status: H1B" (or similar sponsorship needed), answer "No" to "Are you a U.S. Citizen or Green Card holder?".
  - Only answer "Yes" if background explicitly lists "US Citizen" or "Green Card".
- For yes/no questions: just answer "Yes" or "No"
- For open-ended questions: write 1-3 sentences max, be genuine not generic
- For select/radio: choose the BEST matching option from the list provided
- Never start with "I" - vary sentence structure
- No corporate buzzwords like "leverage", "synergize", "passionate about"
- Sound like a real person, not a template
- **CRITICAL**: If a question has a validation error, READ IT CAREFULLY and fix your answer to satisfy the requirement.

QUESTIONS TO ANSWER:
${questionsText}

Return ONLY valid JSON with this exact format (no markdown, no explanation):
{
  "${questions[0]?.fieldId || 'field1'}": "answer1",
  "${questions[1]?.fieldId || 'field2'}": "answer2"
}`;
}

function buildCoverLetterPrompt(request: CoverLetterRequest): string {
  const { jobTitle, company, jobDescription, resumeData } = request;

  // Include education info if available
  const educationInfo = resumeData.education.length > 0
    ? `- Education: ${resumeData.education.map(e => `${e.degree}${e.field ? ` in ${e.field}` : ''} from ${e.school}`).join('; ')}`
    : '';

  return `Write a cover letter for this job application. Make it sound GENUINELY HUMAN - like a real person wrote it, not AI.

JOB: ${jobTitle} at ${company}

JOB DESCRIPTION:
${jobDescription.substring(0, 1000)}

APPLICANT'S ACTUAL BACKGROUND (use ONLY this information):
${resumeData.summary}
- ${resumeData.totalYearsExperience} years total experience
- Most recent role: ${resumeData.recentJobTitle} at ${resumeData.recentCompany}
- Verified skills: ${resumeData.skills.slice(0, 10).join(', ')}
${educationInfo}

CRITICAL RULES - FOLLOW EXACTLY:
1. DO NOT start with "I am writing to apply" or "Dear Hiring Manager" - start with something engaging
2. Keep it 150-200 words MAX
3. **ONLY reference experience/skills EXPLICITLY listed above** - DO NOT fabricate or invent projects, companies, or achievements
4. If the job requires skills the applicant doesn't have listed, express genuine interest in learning them - DON'T claim false experience
5. Connect the applicant's ACTUAL recent role (${resumeData.recentJobTitle} at ${resumeData.recentCompany}) to this opportunity
6. Sound enthusiastic but honest - it's OK to acknowledge you're still developing some skills
7. NO corporate clichés: "passionate", "leverage", "synergize", "excited about the opportunity"
8. Write like you're emailing a friend who works there (professional but warm)
9. End with a simple sign-off using the applicant's ACTUAL first name (extracted from the summary above)
10. DO NOT use placeholders like "[Name]" or "[Applicant's Name]" - use the real name from the summary

IMPORTANT: The applicant's integrity is paramount. Never claim experience they don't have.

Output ONLY the cover letter text, nothing else.`;
}

// ============================================================================
// LLM Calls
// ============================================================================

async function callClaudeForAnswers(prompt: string): Promise<string | null> {
  try {
    const anthropic = new Anthropic();
    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = message.content.find(block => block.type === 'text');
    return textBlock?.type === 'text' ? textBlock.text : null;
  } catch (error) {
    console.error('[FormHelperAgent] Claude error:', error);
    return null;
  }
}

async function callOpenAIForAnswers(prompt: string): Promise<string | null> {
  if (!openaiClient) {
    console.error('[FormHelperAgent] OpenAI client not configured');
    return null;
  }

  try {
    const completion = await openaiClient.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000,
      temperature: 0.7, // Slightly higher for more human-like variation
    });

    return completion.choices[0]?.message?.content || null;
  } catch (error) {
    console.error('[FormHelperAgent] OpenAI error:', error);
    return null;
  }
}

// ============================================================================
// Public API
// ============================================================================

export async function answerFormQuestions(
  request: FormAnswerRequest
): Promise<FormAnswerResponse> {
  if (request.questions.length === 0) {
    return { answers: {}, confidence: 1.0 };
  }

  const prompt = buildFormAnswerPrompt(request);
  console.log('[FormHelperAgent] Answering', request.questions.length, 'questions for', request.jobTitle, 'at', request.company);

  // Try Claude first, fallback to OpenAI
  let response = await callClaudeForAnswers(prompt);
  if (!response) {
    console.log('[FormHelperAgent] Claude failed, trying OpenAI...');
    response = await callOpenAIForAnswers(prompt);
  }

  if (!response) {
    console.error('[FormHelperAgent] All LLM providers failed');
    return { answers: {}, confidence: 0 };
  }

  // Parse JSON response
  try {
    // Extract JSON from potential markdown code blocks
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[FormHelperAgent] No JSON found in response:', response.substring(0, 200));
      return { answers: {}, confidence: 0 };
    }

    const answers = JSON.parse(jsonMatch[0]) as Record<string, string>;
    console.log('[FormHelperAgent] Parsed', Object.keys(answers).length, 'answers');

    return {
      answers,
      confidence: 0.9,
    };
  } catch (error) {
    console.error('[FormHelperAgent] Failed to parse JSON:', error, response.substring(0, 200));
    return { answers: {}, confidence: 0 };
  }
}

export async function generateCoverLetter(
  request: CoverLetterRequest
): Promise<CoverLetterResponse> {
  const prompt = buildCoverLetterPrompt(request);
  console.log('[FormHelperAgent] Generating cover letter for', request.jobTitle, 'at', request.company);

  // Try Claude first (better at creative writing), fallback to OpenAI
  let response = await callClaudeForAnswers(prompt);
  if (!response) {
    console.log('[FormHelperAgent] Claude failed for cover letter, trying OpenAI...');
    response = await callOpenAIForAnswers(prompt);
  }

  if (!response) {
    console.error('[FormHelperAgent] All LLM providers failed for cover letter');
    return {
      coverLetter: `I'm excited to apply for the ${request.jobTitle} position at ${request.company}. With ${request.resumeData.totalYearsExperience} years of experience and a background in ${request.resumeData.skills.slice(0, 3).join(', ')}, I believe I'd be a great fit for your team.`
    };
  }

  // Clean up response (remove any accidental markdown formatting)
  const cleanedResponse = response
    .replace(/^```[\w]*\n?/gm, '')
    .replace(/```$/gm, '')
    .trim();

  console.log('[FormHelperAgent] Cover letter generated, length:', cleanedResponse.length);
  return { coverLetter: cleanedResponse };
}

