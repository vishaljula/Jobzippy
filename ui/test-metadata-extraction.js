/**
 * Standalone Metadata Extraction Test Script (UPDATED)
 * 
 * This script includes the IMPROVED extraction logic with:
 * - Text-based location search (finds "New York" even without semantic markup)
 * - Placeholder filtering (skips "City, state, or zip code")
 * - Enhanced company extraction from page titles
 * 
 * Usage:
 * 1. Navigate to any job posting page
 * 2. Open browser console (F12 or Cmd+Option+J)
 * 3. Paste this entire script and press Enter
 */

(function testMetadataExtraction() {
    console.clear();
    console.log('%c=== Metadata Extraction Test (UPDATED) ===', 'color: #4CAF50; font-size: 16px; font-weight: bold');
    console.log('URL:', window.location.href);
    console.log('');

    // Inline extraction code
    function safeExtract(obj, paths) {
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
                    if (typeof value === 'object' && value.name) return value.name;
                    if (typeof value === 'string') return value.trim();
                    if (typeof value === 'number') return value.toString();
                }
            } catch (e) {
                continue;
            }
        }
        return null;
    }

    function extractFromURL(url = window.location.href) {
        const metadata = {};
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;
            const pathname = urlObj.pathname;
            const searchParams = urlObj.searchParams;

            if (hostname.includes('linkedin.com')) {
                metadata.platform = 'linkedin';
                const locationParam = searchParams.get('location') || searchParams.get('geoId');
                if (locationParam) metadata.location = locationParam;
            } else if (hostname.includes('greenhouse.io')) {
                metadata.platform = 'greenhouse';
                const match = pathname.match(/\/([^/]+)\/jobs/);
                if (match && match[1]) {
                    metadata.company = match[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                }
            } else if (hostname.includes('lever.co')) {
                metadata.platform = 'lever';
                const parts = pathname.split('/').filter(Boolean);
                if (parts.length >= 1 && parts[0]) {
                    metadata.company = parts[0].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                }
            } else if (hostname.includes('myworkdayjobs.com')) {
                metadata.platform = 'workday';
                const match = hostname.match(/^([^.]+)\./);
                if (match && match[1]) {
                    metadata.company = match[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                }
            } else if (hostname.includes('gem.com')) {
                metadata.platform = 'gem';
            } else if (hostname.includes('ziprecruiter.com')) {
                metadata.platform = 'ziprecruiter';
            } else {
                metadata.platform = 'generic';
                const subdomainMatch = hostname.match(/^([^.]+)\./);
                if (subdomainMatch && subdomainMatch[1] && !['www', 'jobs', 'careers', 'apply'].includes(subdomainMatch[1])) {
                    metadata.company = subdomainMatch[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                }
            }

            console.log('[MetadataExtractor] URL metadata:', metadata);
        } catch (e) {
            console.error('[MetadataExtractor] Error parsing URL:', e);
        }
        return metadata;
    }

    function extractFromJsonLd() {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of scripts) {
            try {
                const data = JSON.parse(script.textContent || '');
                const items = data['@graph'] ? data['@graph'] : [data];

                for (const item of items) {
                    const type = item['@type'];
                    if (!type || (typeof type === 'string' && !type.toLowerCase().includes('jobposting'))) continue;

                    const locality = safeExtract(item, ['jobLocation.address.addressLocality', 'jobLocation.addressLocality']);
                    const region = safeExtract(item, ['jobLocation.address.addressRegion', 'jobLocation.addressRegion']);
                    const country = safeExtract(item, ['jobLocation.address.addressCountry', 'jobLocation.addressCountry']);

                    const locationParts = [locality, region, country].filter(Boolean);
                    const location = locationParts.length > 0 ? locationParts.join(', ') : safeExtract(item, ['jobLocation.name', 'jobLocation']);

                    return {
                        title: safeExtract(item, ['title', 'name', 'headline']),
                        company: safeExtract(item, ['hiringOrganization.name', 'hiringOrganization', 'employer.name', 'employer']),
                        location,
                        description: safeExtract(item, ['description', 'summary']),
                        source: 'json-ld'
                    };
                }
            } catch (e) {
                continue;
            }
        }
        return null;
    }

    function findLocationCandidatesInDOM() {
        const candidates = [];
        const majorCities = ['new york', 'san francisco', 'los angeles', 'chicago', 'boston', 'seattle', 'austin', 'denver', 'atlanta', 'miami', 'dallas', 'houston', 'portland', 'philadelphia', 'phoenix', 'tampa', 'plano'];

        const selectors = [
            '[data-location]', '[class*="location" i]', '[class*="locale" i]',
            '[itemprop="jobLocation"]', '[itemprop="addressLocality"]',
            '[aria-label*="location" i]', 'svg[class*="location" i] + span',
            'svg[class*="pin" i] + span', 'svg[class*="map" i] + span',
            '[class*="office" i]', 'svg + span', 'svg + div'
        ];

        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                const text = (el.textContent?.trim() || el.getAttribute('data-location') || '').trim();
                if (!text || text.length < 2 || text.length > 100) continue;

                const lowerText = text.toLowerCase();
                if (lowerText.includes('apply') || lowerText.includes('submit')) continue;

                // CRITICAL: Filter out placeholder text
                if (lowerText.includes('city, state') || lowerText.includes('zip code') ||
                    lowerText === 'location' || lowerText === 'enter location') continue;

                let score = 50;
                if (el.hasAttribute('data-location')) score += 25;
                if (el.getAttribute('itemprop') === 'jobLocation') score += 30;
                if (el.className.toLowerCase().includes('location')) score += 15;
                if (/^[A-Z][a-z]+,\s*[A-Z]{2}$/.test(text)) score += 25;
                if (/\b(remote|hybrid)\b/i.test(text)) score += 15;
                if (majorCities.some(city => lowerText.includes(city))) score += 20;

                candidates.push({ value: text, score, source: 'dom-location' });
            }
        }

        // NEW: Text-based location search
        const allText = document.body.innerText;
        const lines = allText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        for (const line of lines) {
            if (line.length > 100 || line.length < 3) continue;

            const lowerLine = line.toLowerCase();
            const isCityState = /^[A-Z][a-z]+,\s*[A-Z]{2}$/.test(line);
            const isCityStateFull = /^[A-Z][a-z]+,\s*[A-Z][a-z]+$/.test(line);
            const hasRemote = /\b(remote|hybrid)\b/i.test(line);
            const hasMajorCity = majorCities.some(city => lowerLine === city || lowerLine.startsWith(city + ','));

            if (isCityState || isCityStateFull || (hasRemote && line.length < 30) || hasMajorCity) {
                const alreadyExists = candidates.some(c => c.value.toLowerCase() === lowerLine);
                if (!alreadyExists) {
                    let score = 40;
                    if (isCityState) score += 20;
                    if (isCityStateFull) score += 15;
                    if (hasMajorCity) score += 15;
                    if (hasRemote) score += 10;

                    candidates.push({ value: line, score, source: 'dom-text' });
                }
            }
        }

        return candidates;
    }

    function findTitleCandidatesInDOM() {
        const candidates = [];
        const headings = document.querySelectorAll('h1, h2, h3');
        for (const heading of headings) {
            const text = heading.textContent?.trim();
            if (!text || text.length < 5 || text.length > 150) continue;

            const lowerText = text.toLowerCase();
            if (lowerText.includes('sign in') || lowerText.includes('log in') || lowerText === 'apply') continue;

            let score = 40;
            if (heading.tagName === 'H1') score += 30;
            else if (heading.tagName === 'H2') score += 20;
            if (/\b(engineer|developer|manager|analyst|designer|specialist)\b/i.test(text)) score += 20;

            candidates.push({ value: text, score, source: 'dom-heading' });
        }
        return candidates;
    }

    function findCompanyCandidatesInDOM() {
        const candidates = [];
        const selectors = ['[data-company]', '[class*="company" i]', '[class*="employer" i]', '[itemprop="hiringOrganization"]', 'a[href*="company" i]'];

        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                const text = (el.textContent?.trim() || el.getAttribute('data-company') || '').trim();
                if (!text || text.length < 2 || text.length > 100) continue;

                const lowerText = text.toLowerCase();
                if (lowerText.includes('engineer') || lowerText.includes('developer') ||
                    lowerText.includes('manager') || lowerText === 'company') continue;

                let score = 50;
                if (el.hasAttribute('data-company')) score += 25;
                if (el.getAttribute('itemprop') === 'hiringOrganization') score += 30;
                if (/\b(inc|llc|corp|ltd|technologies|tech)\b/i.test(text)) score += 10;

                candidates.push({ value: text, score, source: 'dom-company' });
            }
        }

        // NEW: Extract from page title
        const pageTitle = document.title;
        const titleParts = pageTitle.split(/[-|–]/);

        for (const part of titleParts) {
            const text = part.trim();
            if (text.length < 2 || text.length > 100) continue;

            const lowerText = text.toLowerCase();
            if (lowerText.includes('engineer') || lowerText.includes('developer') ||
                lowerText.includes('manager') || lowerText.includes('job')) continue;

            const mightBeCompany = /^[A-Z]/.test(text) && !lowerText.includes('apply');
            if (mightBeCompany) {
                const alreadyExists = candidates.some(c => c.value.toLowerCase() === lowerText);
                if (!alreadyExists) {
                    candidates.push({ value: text, score: 45, source: 'page-title' });
                }
            }
        }

        return candidates;
    }

    // Run extraction
    console.log('%c▶ Running extraction...', 'color: #2196F3; font-weight: bold');
    console.log('');

    const urlData = extractFromURL();
    const jsonLdData = extractFromJsonLd();
    const locationCandidates = findLocationCandidatesInDOM().sort((a, b) => b.score - a.score);
    const titleCandidates = findTitleCandidatesInDOM().sort((a, b) => b.score - a.score);
    const companyCandidates = findCompanyCandidatesInDOM().sort((a, b) => b.score - a.score);

    console.log('[MetadataExtractor] Location candidates:', locationCandidates.slice(0, 5));
    console.log('[MetadataExtractor] Title candidates:', titleCandidates.slice(0, 3));
    console.log('[MetadataExtractor] Company candidates:', companyCandidates.slice(0, 3));

    const result = {
        title: jsonLdData?.title || titleCandidates[0]?.value || 'Unknown Job',
        company: jsonLdData?.company || urlData.company || companyCandidates[0]?.value || 'Unknown Company',
        location: jsonLdData?.location || urlData.location || locationCandidates[0]?.value || 'Unknown',
        description: jsonLdData?.description || null,
        source: jsonLdData ? 'json-ld' : (locationCandidates.length > 0 || titleCandidates.length > 0) ? 'dom' : urlData.company ? 'url' : 'none'
    };

    console.log('');
    console.log('%c✓ Extraction Complete!', 'color: #4CAF50; font-weight: bold');
    console.log('');
    console.log('%c📊 Extracted Metadata:', 'color: #FF9800; font-size: 14px; font-weight: bold');
    console.table({
        'Job Title': result.title,
        'Company': result.company,
        'Location': result.location,
        'Source': result.source
    });

    console.log('%c🔍 Full Result:', 'color: #9C27B0; font-size: 14px; font-weight: bold');
    console.log(result);

    console.log('');
    console.log('%c💡 Improvements in this version:', 'color: #607D8B; font-style: italic');
    console.log('  ✓ Text-based location search (finds "New York" without semantic markup)');
    console.log('  ✓ Placeholder filtering (skips "City, state, or zip code")');
    console.log('  ✓ Enhanced company extraction from page titles');

    return result;
})();
