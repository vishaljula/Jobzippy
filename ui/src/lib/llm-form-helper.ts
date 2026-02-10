/**
 * LLM Form Helper
 *
 * Uses AI to answer form questions and generate cover letters.
 * All responses are crafted to sound natural and human-like.
 *
 * API calls are routed through the background script to avoid CORS issues.
 */

import { API_CONFIG } from '@/lib/config';

// Check if we're in a content script context (need to use background for API calls)
const isContentScript =
  typeof chrome !== 'undefined' && chrome.runtime && !chrome.runtime.getBackgroundPage;

// ============================================================================
// Types
// ============================================================================

export interface FormQuestion {
  fieldId: string;
  questionText: string;
  inputType: 'text' | 'number' | 'select' | 'textarea' | 'radio' | 'checkbox';
  options?: string[]; // For select/radio
  maxLength?: number;
  isRequired: boolean;
  validationError?: string; // Error message from previous attempt
  previousAnswer?: string; // What was answered before that caused the error
}

export interface ResumeData {
  summary: string;
  totalYearsExperience: number;
  skills: string[];
  education: { degree: string; field: string; school: string }[];
  recentJobTitle: string;
  recentCompany: string;
  // Employment history with duties for skill-year calculation
  employment?: {
    company: string;
    title: string;
    start: string;
    end: string;
    duties: string;
  }[];
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
// API Calls
// ============================================================================

/**
 * Batch answer multiple form questions with one LLM call
 * Returns answers keyed by fieldId
 */
export async function answerQuestionBatch(
  request: FormAnswerRequest
): Promise<Record<string, string>> {
  if (request.questions.length === 0) {
    return {};
  }

  // Route through background script to avoid CORS issues in content scripts
  if (isContentScript) {
    try {
      console.log('[LLM Form Helper] Routing answer request through background script...');
      const response = await chrome.runtime.sendMessage({
        type: 'LLM_ANSWER_QUESTIONS',
        data: request,
      });

      if (response?.status === 'success' && response.answers) {
        console.log(
          '[LLM Form Helper] Got answers for',
          Object.keys(response.answers).length,
          'questions'
        );
        return response.answers;
      } else {
        console.error('[LLM Form Helper] Background returned error:', response?.error);
        return {};
      }
    } catch (error) {
      console.error('[LLM Form Helper] Failed to get answers via background:', error);
      return {};
    }
  }

  // Direct API call (for background script or sidepanel context)
  try {
    const response = await fetch(`${API_CONFIG.baseUrl}/form-helper/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[LLM Form Helper] API error:', error);
      return {};
    }

    const result = (await response.json()) as FormAnswerResponse;
    console.log(
      '[LLM Form Helper] Got answers for',
      Object.keys(result.answers).length,
      'questions'
    );
    return result.answers;
  } catch (error) {
    console.error('[LLM Form Helper] Failed to get answers:', error);
    return {};
  }
}

/**
 * Generate a cover letter tailored to the job
 */
export async function generateCoverLetter(request: CoverLetterRequest): Promise<string | null> {
  // Route through background script to avoid CORS issues in content scripts
  if (isContentScript) {
    try {
      console.log('[LLM Form Helper] Routing cover letter request through background script...');
      const response = await chrome.runtime.sendMessage({
        type: 'LLM_GENERATE_COVER_LETTER',
        data: request,
      });

      if (response?.status === 'success' && response.coverLetter) {
        console.log(
          '[LLM Form Helper] Generated cover letter, length:',
          response.coverLetter.length
        );
        return response.coverLetter;
      } else {
        console.error('[LLM Form Helper] Background returned error:', response?.error);
        return null;
      }
    } catch (error) {
      console.error('[LLM Form Helper] Failed to generate cover letter via background:', error);
      return null;
    }
  }

  // Direct API call (for background script or sidepanel context)
  try {
    const response = await fetch(`${API_CONFIG.baseUrl}/form-helper/cover-letter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[LLM Form Helper] Cover letter API error:', error);
      return null;
    }

    const result = (await response.json()) as CoverLetterResponse;
    console.log('[LLM Form Helper] Generated cover letter, length:', result.coverLetter.length);
    return result.coverLetter;
  } catch (error) {
    console.error('[LLM Form Helper] Failed to generate cover letter:', error);
    return null;
  }
}

// ============================================================================
// Local Helpers (for extracting resume data from vault)
// ============================================================================

/**
 * Extract ResumeData from vault profile and history
 */
export function extractResumeData(
  profile: {
    identity?: { first_name?: string; last_name?: string };
    preferences?: { target_roles?: string[] };
  } | null,
  history: {
    employment?: Array<{
      title?: string;
      company?: string;
      start?: string;
      end?: string;
      duties?: string;
    }>;
    education?: Array<{
      degree?: string;
      field?: string;
      school?: string;
    }>;
  } | null,
  skills?: string[]
): ResumeData {
  const employment = history?.employment || [];
  const education = history?.education || [];

  // Calculate total years of experience
  let totalYears = 0;
  const currentYear = new Date().getFullYear();

  for (const job of employment) {
    const startYear = job.start
      ? parseInt(job.start.split('-')[0] || String(currentYear))
      : currentYear;
    const endYear =
      job.end === 'present' || !job.end
        ? currentYear
        : parseInt(job.end.split('-')[0] || String(currentYear));
    totalYears += Math.max(0, endYear - startYear);
  }

  // Build summary from employment
  const summaryParts: string[] = [];
  if (profile?.identity?.first_name) {
    summaryParts.push(`${profile.identity.first_name} ${profile.identity.last_name || ''}`);
  }
  if (employment.length > 0) {
    const recentJobs = employment.slice(0, 3);
    const jobList = recentJobs.map((j) => `${j.title} at ${j.company}`).join(', ');
    summaryParts.push(`Experience: ${jobList}`);
  }
  if (totalYears > 0) {
    summaryParts.push(`${totalYears} years total experience`);
  }

  return {
    summary: summaryParts.join('. '),
    totalYearsExperience: totalYears,
    skills: skills || [],
    education: education.map((e) => ({
      degree: e.degree || '',
      field: e.field || '',
      school: e.school || '',
    })),
    recentJobTitle: employment[0]?.title || profile?.preferences?.target_roles?.[0] || '',
    recentCompany: employment[0]?.company || '',
  };
}

// ============================================================================
// Question Classification (local, no LLM needed)
// ============================================================================

/**
 * Classify a question to see if it can be answered without LLM
 */
export function classifyQuestion(questionText: string): {
  type: 'years_experience' | 'yes_no' | 'work_auth' | 'salary' | 'simple_pattern' | 'unknown';
  pattern?: RegExp;
} {
  const text = questionText.toLowerCase();

  // Years of experience patterns
  if (text.includes('years') && (text.includes('experience') || text.includes('exp'))) {
    return { type: 'years_experience' };
  }

  // Salary/compensation questions
  if (
    text.includes('salary') ||
    text.includes('compensation') ||
    text.includes('pay') ||
    text.includes('rate') ||
    text.includes('expectation') ||
    text.includes('desired')
  ) {
    return { type: 'salary' };
  }

  // Work authorization - CHECK BEFORE yes_no since work auth questions often contain
  // "are you" or "will you" but need specific handling
  if (
    text.includes('authorized') ||
    text.includes('visa') ||
    text.includes('sponsorship') ||
    text.includes('work permit') ||
    text.includes('eligib')
  ) {
    return { type: 'work_auth' };
  }

  // Yes/No questions (generic - checked after more specific patterns)
  // Include "is this" and "is it" for questions like "Is this acceptable to you?"
  if (
    text.includes('are you') ||
    text.includes('do you') ||
    text.includes('have you') ||
    text.includes('can you') ||
    text.includes('will you') ||
    text.includes('willing to') ||
    text.includes('is this') ||
    text.includes('is it')
  ) {
    return { type: 'yes_no' };
  }

  return { type: 'unknown' };
}

/**
 * Try to answer a question locally without LLM
 */
export function tryAnswerLocally(
  question: FormQuestion,
  resumeData: ResumeData,
  workAuth?: { sponsorship_required?: boolean; visa_type?: string }
): string | null {
  const classification = classifyQuestion(question.questionText);
  const text = question.questionText.toLowerCase();

  switch (classification.type) {
    case 'years_experience': {
      // Extract the keyword being asked about (e.g., "Angular", "management", "retail")
      // Pattern: "X experience" or "experience with/in X" or "experience as X"
      const patterns = [
        /(?:years?\s+(?:of\s+)?)?(\w+(?:\s+\w+)?)\s+experience/i, // "Angular experience", "management experience"
        /experience\s+(?:with|in|using|as)\s+(\w+(?:\s+\w+)?)/i, // "experience with Angular", "experience as Developer"
      ];

      let keyword: string | null = null;
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          keyword = match[1].toLowerCase().trim();
          // Skip generic words like "your", "total", "work", "of", "in"
          if (
            ![
              'your',
              'total',
              'overall',
              'professional',
              'relevant',
              'work',
              'of',
              'in',
              'as',
              'any',
            ].includes(keyword)
          ) {
            break;
          }
          keyword = null;
        }
      }

      const totalYears = resumeData.totalYearsExperience;

      // If a specific keyword was found, search employment history
      if (keyword && resumeData.employment && resumeData.employment.length > 0) {
        const kw = keyword; // const for TypeScript narrowing inside callbacks
        const currentYear = new Date().getFullYear();
        let earliestYear: number | null = null;

        for (const job of resumeData.employment) {
          // Search in duties and title
          const searchText = `${job.duties || ''} ${job.title || ''}`.toLowerCase();

          if (searchText.includes(kw) && job.start) {
            const yearMatch = job.start.match(/(\d{4})/);
            if (yearMatch && yearMatch[1]) {
              const startYear = parseInt(yearMatch[1], 10);
              if (earliestYear === null || startYear < earliestYear) {
                earliestYear = startYear;
              }
            }
          }
        }

        if (earliestYear !== null) {
          const years = currentYear - earliestYear;
          console.log(`[tryAnswerLocally] Found "${kw}" from ${earliestYear} = ${years} years`);
          return String(Math.max(1, years));
        }

        // Also check skills array
        // REMOVED: Don't estimate experience based solely on presence in skills list.
        // If it's in skills but not in employment history with dates, we can't accurately guess years.
        // Better to send to LLM.
        /*
        const hasInSkills = resumeData.skills.some(s => s.toLowerCase().includes(kw));
        if (hasInSkills) {
          const estimate = Math.max(2, Math.floor(totalYears * 0.5));
          console.log(`[tryAnswerLocally] "${kw}" in skills, estimating ${estimate} years`);
          return String(estimate);
        }
        */

        // Keyword not found anywhere
        // Defer to LLM!
        // If the skill is specific (e.g. "AI", "React") and we can't find it, we shouldn't guess.
        // The LLM can infer from context (e.g. "Machine Learning" ~ "AI") or answer "0" intelligently.
        console.log(`[tryAnswerLocally] "${kw}" not found in resume, sending to LLM`);
        return null;
      }

      // Generic years of experience (no specific keyword)
      return String(totalYears);
    }

    case 'work_auth': {
      // Work authorization questions
      if (text.includes('sponsorship')) {
        return workAuth?.sponsorship_required ? 'Yes' : 'No';
      }
      if (text.includes('authorized')) {
        // If sponsorship_required is explicitly false, they are authorized
        return workAuth?.sponsorship_required === false ? 'Yes' : 'Yes'; // Default to yes for work authorization
      }
      break;
    }

    case 'salary': {
      // Don't estimate salary - varies wildly by industry/role/location
      // Let the LLM handle this or user can fill manually
      return null;
    }

    case 'yes_no': {
      // Common yes/no patterns with safe defaults
      if (text.includes('willing to relocate')) return 'Yes';
      if (text.includes('background check')) return 'Yes';
      if (text.includes('drug test')) return 'Yes';
      if (text.includes('18 years') || text.includes('age')) return 'Yes';
      if (text.includes('currently employed')) return 'Yes';
      if (text.includes('notice period')) return 'Yes';
      if (text.includes('travel')) return 'Yes'; // Travel questions (up to 25%, 50%, etc.)
      if (text.includes('acceptable')) return 'Yes'; // "Is this acceptable to you?" type questions
      if (text.includes('shift') || text.includes('overtime')) return 'Yes'; // Flexibility questions
      if (text.includes('remote') || text.includes('hybrid')) return 'Yes'; // Work arrangement
      if (text.includes('commute') || text.includes('on-site') || text.includes('onsite'))
        return 'Yes';

      // Education level questions - check user's actual education
      if (
        text.includes('education') ||
        text.includes('degree') ||
        text.includes('bachelor') ||
        text.includes('master') ||
        text.includes('phd') ||
        text.includes('diploma')
      ) {
        const hasDegree = resumeData.education.some((e) => {
          const degree = e.degree?.toLowerCase() || '';
          // Check for bachelor's
          if (
            text.includes('bachelor') &&
            (degree.includes('bachelor') ||
              degree.includes('b.s.') ||
              degree.includes('b.a.') ||
              degree.includes('bs') ||
              degree.includes('ba'))
          ) {
            return true;
          }
          // Check for master's
          if (
            text.includes('master') &&
            (degree.includes('master') ||
              degree.includes('m.s.') ||
              degree.includes('m.a.') ||
              degree.includes('mba') ||
              degree.includes('ms') ||
              degree.includes('ma'))
          ) {
            return true;
          }
          // Generic "completed degree" - any degree counts
          if (
            !text.includes('bachelor') &&
            !text.includes('master') &&
            (degree.includes('degree') ||
              degree.includes('bachelor') ||
              degree.includes('master') ||
              degree.includes('b.s.') ||
              degree.includes('m.s.') ||
              degree.includes('phd'))
          ) {
            return true;
          }
          return false;
        });
        return hasDegree ? 'Yes' : 'No';
      }
      break;
    }
  }

  // For select/radio with options, try pattern matching
  if (question.inputType === 'select' || question.inputType === 'radio') {
    if (question.options && question.options.length > 0) {
      // Years of experience with options like "1-3", "3-5", "5+"
      if (text.includes('years') && text.includes('experience')) {
        const years = resumeData.totalYearsExperience;
        for (const opt of question.options) {
          const rangeMatch = opt.match(/(\d+)\s*[-–]\s*(\d+)/);
          const plusMatch = opt.match(/(\d+)\+/);

          if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
            const min = parseInt(rangeMatch[1], 10);
            const max = parseInt(rangeMatch[2], 10);
            if (years >= min && years <= max) {
              return opt;
            }
          } else if (plusMatch && plusMatch[1]) {
            if (years >= parseInt(plusMatch[1], 10)) {
              return opt;
            }
          }
        }
      }
    }
  }

  return null;
}
