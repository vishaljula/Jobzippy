// Simple Metadata Extraction Test (No Imports)
// Just copy/paste this entire script into the console

console.log('%c=== Simplified Metadata Test ===', 'color: #00f0ff; font-size: 16px; font-weight: bold');

// 1. Test URL Extraction
console.log('\n%c1. URL Extraction', 'color: #00ff9d; font-weight: bold');
console.log('Current URL:', window.location.href);

const urlObj = new URL(window.location.href);
const hostname = urlObj.hostname;
const pathname = urlObj.pathname;
const searchParams = urlObj.searchParams;

// Try subdomain
const subdomainMatch = hostname.match(/^([^.]+)\./);
let companyFromUrl = null;
if (subdomainMatch && subdomainMatch[1]) {
    const subdomain = subdomainMatch[1];
    if (!['www', 'jobs', 'careers', 'apply', 'boards', 'app'].includes(subdomain)) {
        companyFromUrl = subdomain.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        console.log('✓ Company from subdomain:', companyFromUrl);
    }
}

// Try path pattern
const pathMatch = pathname.match(/\/([^/]+)\/jobs/) || pathname.match(/\/jobs\/([^/]+)/);
if (pathMatch && pathMatch[1] && !companyFromUrl) {
    companyFromUrl = pathMatch[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    console.log('✓ Company from path:', companyFromUrl);
}

// Try location from query params
const locationParam = searchParams.get('location') || searchParams.get('geoId') || searchParams.get('loc');
if (locationParam) {
    console.log('✓ Location from URL:', locationParam);
}

if (!companyFromUrl && !locationParam) {
    console.log('ℹ️ No metadata found in URL');
}

// 2. Test JSON-LD
console.log('\n%c2. JSON-LD Extraction', 'color: #00ff9d; font-weight: bold');
const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
console.log(`Found ${jsonLdScripts.length} JSON-LD script(s)`);

let jsonLdData = null;
jsonLdScripts.forEach((script, index) => {
    try {
        const data = JSON.parse(script.textContent || '');
        const items = data['@graph'] ? data['@graph'] : [data];

        items.forEach(item => {
            const type = item['@type'];
            if (type && typeof type === 'string' && type.toLowerCase().includes('jobposting')) {
                jsonLdData = item;
                console.log(`✓ JobPosting found in JSON-LD #${index + 1}`);
                console.log('  Title:', item.title || item.name || '(not found)');
                console.log('  Company:', item.hiringOrganization?.name || item.hiringOrganization || '(not found)');

                // Location
                const locality = item.jobLocation?.address?.addressLocality || item.jobLocation?.addressLocality;
                const region = item.jobLocation?.address?.addressRegion || item.jobLocation?.addressRegion;
                if (locality || region) {
                    console.log('  Location:', [locality, region].filter(Boolean).join(', '));
                }
            }
        });
    } catch (e) {
        console.log(`❌ JSON-LD #${index + 1}: Parse error`);
    }
});

if (!jsonLdData && jsonLdScripts.length > 0) {
    console.log('⚠️ No JobPosting found in JSON-LD');
}

// 3. Summary
console.log('\n%c3. Summary', 'color: #00ff9d; font-weight: bold');
const title = jsonLdData?.title || jsonLdData?.name || null;
const company = jsonLdData?.hiringOrganization?.name || jsonLdData?.hiringOrganization || companyFromUrl || null;
const needsConfirmation = !title || !company;

console.table({
    'Title': title || '(null)',
    'Company': company || '(null)',
    'Source': jsonLdData ? 'json-ld' : companyFromUrl ? 'url' : 'none',
    'Needs Confirmation': needsConfirmation ? '⚠️ YES' : '✓ NO'
});

if (needsConfirmation) {
    console.log('%c⚠️ User will need to edit this in the dashboard', 'color: #ff9d00; font-weight: bold');
} else {
    console.log('%c✓ All required fields found!', 'color: #00ff9d; font-weight: bold');
}
