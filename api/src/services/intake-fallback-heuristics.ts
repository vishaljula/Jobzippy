import type { IntakeLLMResponse, ResumeExtractionResult } from '../types/intake.js';

const SALARY_CURRENCY_FALLBACK = 'USD';

const ISO_CURRENCY_CODES = [
  'USD',
  'CAD',
  'MXN',
  'EUR',
  'GBP',
  'CHF',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
  'CZK',
  'HUF',
  'RON',
  'BGN',
  'HRK',
  'ISK',
  'AUD',
  'NZD',
  'SGD',
  'HKD',
  'JPY',
  'CNY',
  'KRW',
  'TWD',
  'THB',
  'VND',
  'IDR',
  'MYR',
  'PHP',
  'INR',
  'PKR',
  'BDT',
  'LKR',
  'AED',
  'SAR',
  'QAR',
  'KWD',
  'BHD',
  'OMR',
  'ZAR',
  'NGN',
  'GHS',
  'KES',
  'EGP',
  'MAD',
  'DZD',
  'RUB',
  'TRY',
  'ILS',
  'ARS',
  'CLP',
  'COP',
  'PEN',
  'UYU',
  'BRL',
] as const;

const ISO_CURRENCY_SET = new Set<string>(ISO_CURRENCY_CODES);

const CURRENCY_SYMBOL_HINTS: Array<{ symbol: string; code: string }> = [
  { symbol: '€', code: 'EUR' },
  { symbol: '£', code: 'GBP' },
  { symbol: '₹', code: 'INR' },
  { symbol: '₱', code: 'PHP' },
  { symbol: '₩', code: 'KRW' },
  { symbol: '₪', code: 'ILS' },
  { symbol: '₺', code: 'TRY' },
  { symbol: '₫', code: 'VND' },
  { symbol: '฿', code: 'THB' },
  { symbol: '₦', code: 'NGN' },
  { symbol: '₴', code: 'UAH' },
  { symbol: '₲', code: 'PYG' },
  { symbol: '₡', code: 'CRC' },
  { symbol: '₭', code: 'LAK' },
  { symbol: '₮', code: 'MNT' },
];

const DOLLAR_VARIANT_HINTS: Array<{ token: string; code: string }> = [
  { token: 'A$', code: 'AUD' },
  { token: 'AU$', code: 'AUD' },
  { token: 'C$', code: 'CAD' },
  { token: 'CA$', code: 'CAD' },
  { token: 'S$', code: 'SGD' },
  { token: 'SG$', code: 'SGD' },
  { token: 'HK$', code: 'HKD' },
  { token: 'NZ$', code: 'NZD' },
];

const ISO_CODE_REGEX = /\b([A-Z]{3})\b/g;

function collectCurrencyHints(text?: string | null): Set<string> {
  const hints = new Set<string>();
  if (!text) {
    return hints;
  }
  CURRENCY_SYMBOL_HINTS.forEach(({ symbol, code }) => {
    if (text.includes(symbol)) {
      hints.add(code);
    }
  });
  const upper = text.toUpperCase();
  DOLLAR_VARIANT_HINTS.forEach(({ token, code }) => {
    if (upper.includes(token)) {
      hints.add(code);
    }
  });
  const matches = upper.match(ISO_CODE_REGEX);
  if (matches) {
    matches.forEach((candidate) => {
      if (ISO_CURRENCY_SET.has(candidate)) {
        hints.add(candidate);
      }
    });
  }
  return hints;
}

function mergeCurrencyHints(target: Set<string>, source: Set<string>) {
  source.forEach((code) => target.add(code));
}

function pickCurrencyFromHints(hints: Set<string>): string {
  if (hints.size === 0) {
    return SALARY_CURRENCY_FALLBACK;
  }
  if (hints.size === 1) {
    const [only] = hints;
    return only ?? SALARY_CURRENCY_FALLBACK;
  }
  return SALARY_CURRENCY_FALLBACK;
}

function extractEmail(text: string): string {
  const match = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return match?.[0] ?? '';
}

function extractPhone(text: string): string {
  const match = text.match(
    /(\+\d{1,2}\s?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?:\s?(?:x|ext\.?)\s?\d{2,5})?/i,
  );
  return match?.[0] ?? '';
}

function extractName(lines: string[]): string {
  const [firstLine = ''] = lines;
  if (!firstLine) return '';
  if (firstLine.toLowerCase().includes('resume') && lines.length > 1) {
    return lines[1] ?? '';
  }
  return firstLine;
}

function extractSkills(text: string): string[] {
  const sectionRegex = /(skills|technologies|toolbox)\s*[:-]?\s*/i;
  const lines = text.split(/\r?\n/);
  const skills: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (sectionRegex.test(line)) {
      const rest = line.replace(sectionRegex, '').trim();
      if (rest) {
        rest.split(/[,•]/).forEach((item) => {
          const trimmed = item.trim();
          if (trimmed) skills.push(trimmed);
        });
      }
      let j = i + 1;
      while (j < lines.length) {
        const bulletLine = lines[j];
        if (!bulletLine?.startsWith('•')) break;
        const bullet = bulletLine.replace(/^•\s*/, '');
        bullet.split(/[,;]/).forEach((item) => {
          const trimmed = item.trim();
          if (trimmed) skills.push(trimmed);
        });
        j += 1;
      }
      break;
    }
  }

  return Array.from(new Set(skills)).slice(0, 24);
}

function normalizeDate(value: string): string {
  const monthMap: Record<string, string> = {
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    may: '05',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dec: '12',
  };

  const monthMatch = value.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
  const yearMatch = value.match(/\d{4}/);

  if (!yearMatch) {
    return value.toLowerCase().includes('present') ? 'present' : '';
  }

  const month = monthMatch ? (monthMap[monthMatch[0].toLowerCase()] ?? '01') : '01';
  return `${yearMatch[0]}-${month}`;
}

interface ExperienceEntry {
  company: string;
  title: string;
  start: string;
  end: string;
  duties: string;
  city: string;
  state: string;
}

function extractExperience(text: string): ExperienceEntry[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const experiences: ExperienceEntry[] = [];
  const regex =
    /^(?<title>[-A-Za-z0-9&.,'/ ]+)\s+[-–]\s+(?<company>[-A-Za-z0-9&.,'/ ]+)\s+\((?<start>[^)]+?)\s*[-–]\s*(?<end>[^)]+)\)/;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const match = line.match(regex);
    if (match?.groups) {
      const duties: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const dutyLine = lines[j];
        if (!dutyLine || (!dutyLine.startsWith('•') && !dutyLine.startsWith('-'))) {
          break;
        }
        duties.push(dutyLine.replace(/^[•\s-]+/, ''));
        j += 1;
      }
      experiences.push({
        company: match.groups.company?.trim() ?? '',
        title: match.groups.title?.trim() ?? '',
        start: normalizeDate(match.groups.start ?? ''),
        end: normalizeDate(match.groups.end ?? ''),
        duties: duties.join(' '),
        city: '',
        state: '',
      });
      i = j - 1;
    }
  }

  return experiences.slice(0, 5);
}

function extractEducation(text: string) {
  const education: Array<{
    school: string;
    degree: string;
    field: string;
    start: string;
    end: string;
  }> = [];

  const regex =
    /^(?<school>.+?),\s*(?<degree>[^,]+?)(?:\s+in\s+(?<field>[^,]+))?\s+\((?<start>\d{4})\s*[-–]\s*(?<end>\d{4}|Present)\)/i;

  text.split(/\r?\n/).forEach((line) => {
    const match = line.match(regex);
    if (match?.groups) {
      education.push({
        school: match.groups.school?.trim() ?? '',
        degree: match.groups.degree?.trim() ?? '',
        field: match.groups.field?.trim() ?? '',
        start: match.groups.start ?? '',
        end: match.groups.end ?? '',
      });
    }
  });

  return education.slice(0, 3);
}

export async function runHeuristicIntakeLLM(
  extraction: ResumeExtractionResult,
): Promise<IntakeLLMResponse> {
  const lines = extraction.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const name = extractName(lines);
  const email = extractEmail(extraction.text);
  const phone = extractPhone(extraction.text);
  const skills = extractSkills(extraction.text);
  const employment = extractExperience(extraction.text);
  const education = extractEducation(extraction.text);

  const currencyHints = collectCurrencyHints(extraction.text);
  mergeCurrencyHints(currencyHints, collectCurrencyHints(extraction.metadata?.fileName));
  mergeCurrencyHints(currencyHints, collectCurrencyHints(extraction.metadata?.language));
  const salaryCurrency = pickCurrencyFromHints(currencyHints);

  const confidenceSeed =
    (email ? 0.2 : 0) +
    (phone ? 0.15 : 0) +
    (employment.length ? 0.25 : 0) +
    (skills.length ? 0.2 : 0);
  const confidence = Math.min(0.95, 0.5 + confidenceSeed);

  return {
    profile: {
      identity: {
        first_name: name.split(' ')[0] ?? '',
        last_name: name.split(' ').slice(1).join(' ') || '',
        phone,
        email,
        address: '',
      },
      work_auth: {
        visa_type: '',
        sponsorship_required: false,
      },
      preferences: {
        remote: true,
        locations: [],
        salary_min: 0,
        salary_currency: salaryCurrency,
        start_date: '',
      },
    },
    compliance: {
      veteran_status: 'prefer_not',
      disability_status: 'prefer_not',
      criminal_history_policy: 'ask_if_required',
    },
    history: {
      employment,
      education,
    },
    policies: {
      eeo: 'ask_if_required',
      salary: 'ask_if_required',
      relocation: 'ask_if_required',
      work_shift: 'ask_if_required',
    },
    previewSections: [
      {
        id: 'contact',
        title: 'Contact',
        confidence,
        fields: [
          { id: 'name', label: 'Name', value: name },
          { id: 'email', label: 'Email', value: email },
          { id: 'phone', label: 'Phone', value: phone },
        ],
      },
      {
        id: 'experience',
        title: 'Experience Highlights',
        confidence: Math.min(0.9, confidence - 0.05),
        fields: employment.map((job, index) => ({
          id: `job-${index}`,
          label: `${job.title} · ${job.company}`,
          value: `${job.start} → ${job.end}`,
        })),
      },
      {
        id: 'skills',
        title: 'Skills Detected',
        confidence: Math.min(0.85, confidence - 0.1),
        fields: [
          {
            id: 'skills-list',
            label: 'Stack',
            value: skills,
            highlight: true,
          },
        ],
      },
    ],
    summary: [
      skills.length
        ? `Captured ${skills.length} key skills including ${skills.slice(0, 4).join(', ')}.`
        : 'Resume parsed successfully.',
      employment.length
        ? `Mapped ${employment.length} recent roles.`
        : 'Add a role manually to improve application quality.',
    ].join(' '),
    confidence,
    followUpPrompt: 'Review the data above. Click "Apply updates" to save to your vault, or "Edit manually" to modify first.',
    warnings: [],
  };
}


