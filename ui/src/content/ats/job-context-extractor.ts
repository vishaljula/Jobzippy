/**
 * Job Context Extractor
 * Extracts job title, company, and description from the current page
 * Uses multiple strategies: URL patterns, metadata, DOM search, and fallback
 */

import { logger } from '../../lib/logger';

export interface JobContext {
  jobTitle?: string;
  company?: string;
  jobDescription?: string;
}

/**
 * Extract job context from the current page
 * Tries multiple strategies in order of reliability
 */
export function extractJobContext(
  doc: Document = document,
  url: string = window.location.href
): JobContext {
  logger.log('JobContextExtractor', 'Starting job context extraction', { url });

  const context: JobContext = {};

  // Strategy 1: Extract from URL patterns (most reliable for known platforms)
  const urlContext = extractFromURL(url);
  Object.assign(context, urlContext);

  // Strategy 2: Extract from page metadata (JSON-LD, meta tags, title)
  const metadataContext = extractFromMetadata(doc);
  // Only use metadata if we don't already have it from URL
  if (!context.jobTitle && metadataContext.jobTitle) context.jobTitle = metadataContext.jobTitle;
  if (!context.company && metadataContext.company) context.company = metadataContext.company;
  if (!context.jobDescription && metadataContext.jobDescription)
    context.jobDescription = metadataContext.jobDescription;

  // Strategy 3: Extract from DOM text patterns (less reliable but works for generic forms)
  const domContext = extractFromDOM(doc);
  if (!context.jobTitle && domContext.jobTitle) context.jobTitle = domContext.jobTitle;
  if (!context.company && domContext.company) context.company = domContext.company;
  if (!context.jobDescription && domContext.jobDescription)
    context.jobDescription = domContext.jobDescription;

  // Strategy 4: Fallback - use generic placeholder
  if (!context.jobTitle) {
    context.jobTitle = 'this position';
    logger.log('JobContextExtractor', 'Using fallback job title: "this position"');
  }
  if (!context.company) {
    context.company = 'the company';
    logger.log('JobContextExtractor', 'Using fallback company: "the company"');
  }

  logger.log('JobContextExtractor', 'Extraction complete', context);
  console.log('[JobContextExtractor] Extracted context:', context);

  return context;
}

/**
 * Extract job context from URL patterns
 */
function extractFromURL(url: string): Partial<JobContext> {
  const context: Partial<JobContext> = {};

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const pathname = urlObj.pathname;

    // LinkedIn: /jobs/view/{id} or /jobs/collections/...
    if (hostname.includes('linkedin.com') && pathname.includes('/jobs/')) {
      logger.log('JobContextExtractor', 'Detected LinkedIn job page');
      // LinkedIn job context is best extracted from page metadata
      return context;
    }

    // Greenhouse: boards.greenhouse.io/{company}/jobs/{id}
    if (hostname.includes('greenhouse.io')) {
      const match = pathname.match(/\/([^/]+)\/jobs/);
      if (match && match[1]) {
        context.company = match[1].replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
        logger.log(
          'JobContextExtractor',
          `Extracted company from Greenhouse URL: ${context.company}`
        );
      }
      return context;
    }

    // Lever: jobs.lever.co/{company}/{slug}
    if (hostname.includes('lever.co')) {
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length >= 1 && parts[0]) {
        context.company = parts[0].replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
        logger.log('JobContextExtractor', `Extracted company from Lever URL: ${context.company}`);
      }
      return context;
    }

    // Workday: {company}.wd{N}.myworkdayjobs.com
    if (hostname.includes('myworkdayjobs.com')) {
      const match = hostname.match(/^([^.]+)\./);
      if (match && match[1]) {
        context.company = match[1].replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
        logger.log('JobContextExtractor', `Extracted company from Workday URL: ${context.company}`);
      }
      return context;
    }

    // Generic: Try to extract company from subdomain
    const subdomainMatch = hostname.match(/^([^.]+)\./);
    if (
      subdomainMatch &&
      subdomainMatch[1] &&
      !['www', 'jobs', 'careers', 'apply'].includes(subdomainMatch[1])
    ) {
      context.company = subdomainMatch[1]
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase());
      logger.log('JobContextExtractor', `Extracted company from subdomain: ${context.company}`);
    }
  } catch (error) {
    logger.error('JobContextExtractor', 'Error extracting from URL', error);
  }

  return context;
}

/**
 * Extract job context from page metadata (JSON-LD, meta tags, title)
 */
function extractFromMetadata(doc: Document): Partial<JobContext> {
  const context: Partial<JobContext> = {};

  try {
    // 1. Check for JSON-LD structured data (most reliable)
    const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const script of Array.from(jsonLdScripts)) {
      try {
        const data = JSON.parse(script.textContent || '');

        // Handle single object or array of objects
        const items = Array.isArray(data) ? data : [data];

        for (const item of items) {
          if (item['@type'] === 'JobPosting') {
            if (item.title) {
              context.jobTitle = item.title;
              logger.log(
                'JobContextExtractor',
                `Extracted job title from JSON-LD: ${context.jobTitle}`
              );
            }
            if (item.hiringOrganization?.name) {
              context.company = item.hiringOrganization.name;
              logger.log(
                'JobContextExtractor',
                `Extracted company from JSON-LD: ${context.company}`
              );
            }
            if (item.description) {
              context.jobDescription = item.description;
              logger.log('JobContextExtractor', 'Extracted job description from JSON-LD');
            }
            break;
          }
        }
      } catch (error) {
        // Invalid JSON, skip
        continue;
      }
    }

    // 2. Check Open Graph meta tags
    if (!context.jobTitle) {
      const ogTitle = doc.querySelector('meta[property="og:title"]');
      if (ogTitle) {
        const title = ogTitle.getAttribute('content');
        if (title) {
          context.jobTitle = title;
          logger.log(
            'JobContextExtractor',
            `Extracted job title from og:title: ${context.jobTitle}`
          );
        }
      }
    }

    if (!context.jobDescription) {
      const ogDescription = doc.querySelector('meta[property="og:description"]');
      if (ogDescription) {
        const description = ogDescription.getAttribute('content');
        if (description) {
          context.jobDescription = description;
          logger.log('JobContextExtractor', 'Extracted job description from og:description');
        }
      }
    }

    // 3. Check standard meta description
    if (!context.jobDescription) {
      const metaDescription = doc.querySelector('meta[name="description"]');
      if (metaDescription) {
        const description = metaDescription.getAttribute('content');
        if (description) {
          context.jobDescription = description;
          logger.log('JobContextExtractor', 'Extracted job description from meta description');
        }
      }
    }

    // 4. Parse page title (format: "Job Title - Company" or "Job Title | Company")
    if (!context.jobTitle || !context.company) {
      const title = doc.title;
      if (title) {
        // Try splitting by common separators
        const separators = [' - ', ' | ', ' at ', ' – '];
        for (const sep of separators) {
          if (title.includes(sep)) {
            const parts = title.split(sep);
            if (parts.length >= 2 && parts[0] && parts[1]) {
              if (!context.jobTitle) {
                context.jobTitle = parts[0].trim();
                logger.log(
                  'JobContextExtractor',
                  `Extracted job title from page title: ${context.jobTitle}`
                );
              }
              if (!context.company) {
                context.company = parts[1].trim();
                logger.log(
                  'JobContextExtractor',
                  `Extracted company from page title: ${context.company}`
                );
              }
              break;
            }
          }
        }
      }
    }
  } catch (error) {
    logger.error('JobContextExtractor', 'Error extracting from metadata', error);
  }

  return context;
}

/**
 * Extract job context from DOM text patterns
 */
function extractFromDOM(doc: Document): Partial<JobContext> {
  const context: Partial<JobContext> = {};

  try {
    // 1. Look for job title in headings (h1, h2)
    if (!context.jobTitle) {
      const headings = doc.querySelectorAll('h1, h2');
      for (const heading of Array.from(headings)) {
        const text = heading.textContent?.trim();
        if (text && text.length > 5 && text.length < 100) {
          // Check if it looks like a job title (not generic text)
          const lowerText = text.toLowerCase();
          if (
            !lowerText.includes('sign in') &&
            !lowerText.includes('log in') &&
            !lowerText.includes('welcome') &&
            !lowerText.includes('apply') &&
            !lowerText.includes('application')
          ) {
            context.jobTitle = text;
            logger.log(
              'JobContextExtractor',
              `Extracted job title from heading: ${context.jobTitle}`
            );
            break;
          }
        }
      }
    }

    // 2. Look for elements with job-related classes/attributes
    if (!context.jobTitle) {
      const selectors = [
        '[class*="job-title"]',
        '[class*="position-title"]',
        '[class*="role-title"]',
        '[data-job-title]',
        '[data-position]',
      ];

      for (const selector of selectors) {
        const element = doc.querySelector(selector);
        if (element) {
          const text =
            element.textContent?.trim() ||
            element.getAttribute('data-job-title') ||
            element.getAttribute('data-position');
          if (text && text.length > 5 && text.length < 100) {
            context.jobTitle = text;
            logger.log(
              'JobContextExtractor',
              `Extracted job title from element: ${context.jobTitle}`
            );
            break;
          }
        }
      }
    }

    // 3. Look for company name
    if (!context.company) {
      const selectors = ['[class*="company-name"]', '[class*="employer"]', '[data-company]'];

      for (const selector of selectors) {
        const element = doc.querySelector(selector);
        if (element) {
          const text = element.textContent?.trim() || element.getAttribute('data-company');
          if (text && text.length > 2 && text.length < 100) {
            context.company = text;
            logger.log('JobContextExtractor', `Extracted company from element: ${context.company}`);
            break;
          }
        }
      }
    }

    // 4. Look for job description in common containers
    if (!context.jobDescription) {
      const selectors = [
        '[class*="job-description"]',
        '[class*="description"]',
        '[id*="job-description"]',
        '[id*="description"]',
      ];

      for (const selector of selectors) {
        const element = doc.querySelector(selector);
        if (element) {
          const text = element.textContent?.trim();
          if (text && text.length > 100) {
            // Only use if it's substantial text
            context.jobDescription = text;
            logger.log('JobContextExtractor', 'Extracted job description from element');
            break;
          }
        }
      }
    }
  } catch (error) {
    logger.error('JobContextExtractor', 'Error extracting from DOM', error);
  }

  return context;
}
