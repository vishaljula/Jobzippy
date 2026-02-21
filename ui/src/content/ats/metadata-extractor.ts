/**
 * Simplified Job Metadata Extraction Module (MVP 1)
 *
 * Simple extraction strategy:
 * 1. URL parsing - Extract hints from URL structure
 * 2. JSON-LD (Schema.org JobPosting) - Structured data
 *
 * Returns null for missing fields - user will edit in dashboard
 */

export interface JobMetadata {
  title: string | null;
  company: string | null;
  location: string | null;
  description: string | null;
  employmentType: string | null;
  salary: string | null;
  datePosted: string | null;
  source: string;
  needsConfirmation: boolean; // True if any required field is missing
}

interface URLMetadata {
  company?: string;
  location?: string;
  title?: string;
}

// ============================================================================
// UTILITY: Safe Property Extraction
// ============================================================================

/**
 * Safely extract value from nested object paths with multiple fallbacks
 */
function safeExtract(obj: any, paths: string | string[]): string | null {
  if (!obj) return null;
  if (typeof paths === 'string') paths = [paths];

  for (const path of paths) {
    try {
      const parts = path.split('.');
      let value = obj;

      for (const part of parts) {
        if (value === null || value === undefined) break;
        value = value[part];
      }

      if (value !== null && value !== undefined && value !== '') {
        // If it's an object with a name property, extract the name
        if (typeof value === 'object' && value.name) {
          return value.name;
        }
        // If it's a string, return it
        if (typeof value === 'string') {
          return value.trim();
        }
        // If it's a number, convert to string
        if (typeof value === 'number') {
          return value.toString();
        }
      }
    } catch (e) {
      continue;
    }
  }

  return null;
}

// ============================================================================
// LAYER 0: URL-Based Extraction
// ============================================================================

/**
 * Parse job metadata hints from URL structure
 * Generic extraction - tries to find company name in URL without platform-specific logic
 */
function extractFromURL(url: string = window.location.href): URLMetadata {
  const metadata: URLMetadata = {};

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const pathname = urlObj.pathname;
    const searchParams = urlObj.searchParams;

    // Try to extract company from common URL patterns
    // Pattern 1: subdomain.domain.com -> subdomain might be company
    const subdomainMatch = hostname.match(/^([^.]+)\./);
    if (subdomainMatch && subdomainMatch[1]) {
      const subdomain = subdomainMatch[1];
      // Skip common non-company subdomains
      if (!['www', 'jobs', 'careers', 'apply', 'boards', 'app'].includes(subdomain)) {
        metadata.company = subdomain.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
      }
    }

    // Pattern 2: /company-name/jobs/ or /jobs/company-name/
    const pathMatch = pathname.match(/\/([^/]+)\/jobs/) || pathname.match(/\/jobs\/([^/]+)/);
    if (pathMatch && pathMatch[1] && !metadata.company) {
      metadata.company = pathMatch[1].replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
    }

    // Try to extract location from query params (common across platforms)
    const locationParam =
      searchParams.get('location') || searchParams.get('geoId') || searchParams.get('loc');
    if (locationParam) {
      metadata.location = locationParam;
    }

    console.log('[MetadataExtractor] URL metadata:', metadata);
  } catch (e) {
    console.error('[MetadataExtractor] Error parsing URL:', e);
  }

  return metadata;
}

// ============================================================================
// LAYER 1: JSON-LD Extraction
// ============================================================================

function extractFromJsonLd(): Partial<JobMetadata> | null {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');

  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent || '');

      // Handle @graph array or single object
      const items = data['@graph'] ? data['@graph'] : [data];

      for (const item of items) {
        // Check if this is a JobPosting
        const type = item['@type'];
        if (!type || (typeof type === 'string' && !type.toLowerCase().includes('jobposting'))) {
          continue;
        }

        // Extract location with multiple fallback paths
        const locality = safeExtract(item, [
          'jobLocation.address.addressLocality',
          'jobLocation.addressLocality',
        ]);
        const region = safeExtract(item, [
          'jobLocation.address.addressRegion',
          'jobLocation.addressRegion',
        ]);
        const country = safeExtract(item, [
          'jobLocation.address.addressCountry',
          'jobLocation.addressCountry',
        ]);

        // Build location string from parts
        const locationParts = [locality, region, country].filter(Boolean);
        const location =
          locationParts.length > 0
            ? locationParts.join(', ')
            : safeExtract(item, ['jobLocation.name', 'jobLocation']);

        // Extract salary
        const salaryValue = safeExtract(item, [
          'baseSalary.value.value',
          'baseSalary.value',
          'baseSalary',
        ]);
        const currency =
          safeExtract(item, ['baseSalary.currency', 'baseSalary.value.currency']) || '$';
        const minValue = safeExtract(item, ['baseSalary.value.minValue', 'baseSalary.minValue']);
        const maxValue = safeExtract(item, ['baseSalary.value.maxValue', 'baseSalary.maxValue']);

        let salary = null;
        if (minValue && maxValue) {
          salary = `${currency}${minValue} - ${currency}${maxValue}`;
        } else if (salaryValue) {
          salary = `${currency}${salaryValue}`;
        }

        return {
          title: safeExtract(item, ['title', 'name', 'headline']),
          company: safeExtract(item, [
            'hiringOrganization.name',
            'hiringOrganization',
            'employer.name',
            'employer',
          ]),
          location,
          description: safeExtract(item, ['description', 'summary']),
          employmentType: safeExtract(item, ['employmentType', 'workHours']),
          salary,
          datePosted: safeExtract(item, ['datePosted', 'datePublished']),
          source: 'json-ld',
        };
      }
    } catch (e) {
      console.error('[MetadataExtractor] Error parsing JSON-LD:', e);
      continue;
    }
  }

  return null;
}

// ============================================================================
// MAIN EXTRACTION FUNCTION
// ============================================================================

/**
 * Extract job metadata using simplified strategy
 * Priority: JSON-LD > URL hints
 * Returns null for missing fields - user will confirm/edit in dashboard
 */
export function extractJobMetadata(): JobMetadata {
  console.log('[MetadataExtractor] Starting simplified extraction...');

  // Layer 0: URL-based hints
  const urlData = extractFromURL();

  // Layer 1: JSON-LD structured data
  const jsonLdData = extractFromJsonLd();

  // Consolidate results with simple priority
  const title = jsonLdData?.title || null;
  const company = jsonLdData?.company || urlData.company || null;
  const location = jsonLdData?.location || urlData.location || null;

  // Determine if user confirmation is needed
  // Required fields: title, company
  const needsConfirmation = !title || !company;

  const result: JobMetadata = {
    title,
    company,
    location,
    description: jsonLdData?.description || null,
    employmentType: jsonLdData?.employmentType || null,
    salary: jsonLdData?.salary || null,
    datePosted: jsonLdData?.datePosted || null,
    source: jsonLdData ? 'json-ld' : urlData.company || urlData.location ? 'url' : 'none',
    needsConfirmation,
  };

  console.log('[MetadataExtractor] Simplified extraction complete:', result);

  return result;
}
