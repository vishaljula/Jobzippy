# Consolidated Job Board Content Script Architecture

## Current Problem

**Current approach:** Separate script per job board
- `content-linkedin.js` (~536 lines)
- `content-indeed.js` (~544 lines)
- Future: `content-glassdoor.js`, `content-dice.js`, `content-ziprecruiter.js`...

**Issues:**
- **Code duplication**: ~90% of code is identical
- **Maintenance burden**: Fix bug in one, need to fix in all
- **Not scalable**: Adding 5+ job boards = 5+ separate files
- **Inconsistent behavior**: Easy to have bugs in one but not others

## Analysis: What's Actually Different?

Looking at LinkedIn vs Indeed scripts:

### ✅ **Identical (90% of code):**
1. Message handlers (AUTH_PROBE, START_AUTO_APPLY, STOP_AUTO_APPLY, SCRAPE_JOBS, NAVIGATE_NEXT_PAGE)
2. Auth detection pattern (`detectLoggedIn`, `setupAuthObservers`)
3. User interaction detection (`setupUserInteractionDetection`)
4. Function structure (scrapeJobCards, getNextPageUrl, navigateToNextPage)
5. Error handling
6. IIFE guards

### ⚠️ **Different (10% of code):**
1. **Selectors** (could be config)
   ```typescript
   // LinkedIn
   jobCardSelector: 'li.jobs-search-results__list-item'
   titleSelector: 'a.job-card-list__title-link'
   
   // Indeed
   jobCardSelector: 'div[data-jk]'
   titleSelector: 'h2.jobTitle a'
   ```

2. **URL patterns** (could be config)
   ```typescript
   // LinkedIn
   jobsUrlPattern: /linkedin\.com\/jobs/
   pageParam: 'start'
   pageSize: 25
   
   // Indeed
   jobsUrlPattern: /indeed\.com.*jobs/
   pageParam: 'start'
   pageSize: 15
   ```

3. **ID extraction** (slightly different logic, but could be abstracted)
   ```typescript
   // LinkedIn: /jobs/view/12345
   // Indeed: jk=abc123
   ```

4. **Pagination element type** (button vs link, but same logic)
   ```typescript
   // LinkedIn: button[aria-label*="Next"]
   // Indeed: a[aria-label="Next Page"]
   ```

## Proposed Solution: Single Generic Script

### Architecture

```
content-jobboard.js (single file)
├── Platform Detection (from URL)
├── Platform Configs (selectors, patterns)
├── Shared Logic (auth, user interaction, messaging)
└── Generic Scraping Functions (use config)
```

### Platform Config Structure

```typescript
interface JobBoardConfig {
  name: string;
  urlPattern: RegExp;
  mockUrlPattern?: RegExp; // for dev mode
  jobsUrlPattern: RegExp;
  
  // Selectors
  selectors: {
    jobCard: string[];
    title: string[];
    company: string[];
    location: string[];
    url: string[];
    description?: string[];
    salary?: string[];
    postedDate?: string[];
    easyApplyButton?: string[];
    externalApplyButton?: string[];
    nextPageButton: string[];
    nextPageLink?: string[];
    currentPage?: string[];
  };
  
  // Pagination
  pagination: {
    pageSize: number;
    pageParam: string;
    type: 'button' | 'link' | 'url';
  };
  
  // Job ID extraction
  jobIdExtraction: {
    attribute?: string; // e.g., 'data-job-id', 'data-jk'
    urlPattern?: RegExp; // e.g., /\/jobs\/view\/(\d+)/, /jk=([^&]+)/
    fallback: (card: Element, index: number) => string;
  };
  
  // Auth detection
  auth: {
    loggedInIndicators: string[]; // Selectors that appear when logged in
    loggedOutIndicators: string[]; // Selectors that appear when logged out
  };
}

const PLATFORM_CONFIGS: Record<string, JobBoardConfig> = {
  LinkedIn: {
    name: 'LinkedIn',
    urlPattern: /linkedin\.com/,
    mockUrlPattern: /localhost.*linkedin-jobs\.html/,
    jobsUrlPattern: /linkedin\.com\/jobs/,
    selectors: {
      jobCard: [
        'li.jobs-search-results__list-item',
        'div[data-job-id]',
        'div.job-card-container',
      ],
      title: [
        'a.job-card-list__title-link',
        'a[data-control-name="job_card_title_link"]',
        'h3.base-search-card__title',
      ],
      company: [
        'h4.base-search-card__subtitle',
        'a.job-card-container__company-name',
        'span.job-card-container__company-name',
      ],
      // ... more selectors
      nextPageButton: [
        'button[aria-label*="Next"]',
        'button[aria-label*="next"]',
        'button[data-test-pagination-page-btn-next]',
      ],
    },
    pagination: {
      pageSize: 25,
      pageParam: 'start',
      type: 'button',
    },
    jobIdExtraction: {
      attribute: 'data-job-id',
      urlPattern: /\/jobs\/view\/(\d+)/,
      fallback: (card, index) => `linkedin-${index}-${Date.now()}`,
    },
    auth: {
      loggedInIndicators: ['nav__button-secondary'], // User avatar
      loggedOutIndicators: ['nav__button-secondary'], // Sign in button
    },
  },
  
  Indeed: {
    name: 'Indeed',
    urlPattern: /indeed\.com/,
    mockUrlPattern: /localhost.*indeed-jobs\.html/,
    jobsUrlPattern: /indeed\.com.*jobs/,
    selectors: {
      jobCard: [
        'div[data-jk]',
        'div.job_seen_beacon',
        'div.jobsearch-SerpJobCard',
      ],
      title: [
        'h2.jobTitle a',
        'span[id*="jobTitle"] a',
        'a.jobTitle',
      ],
      company: [
        'span[data-testid="company-name"]',
        'span.companyName',
        'a[data-testid="company-name"]',
      ],
      // ... more selectors
      nextPageLink: [
        'a[aria-label="Next Page"]',
        'a[data-testid="pagination-page-next"]',
      ],
    },
    pagination: {
      pageSize: 15,
      pageParam: 'start',
      type: 'link',
    },
    jobIdExtraction: {
      attribute: 'data-jk',
      urlPattern: /jk=([^&]+)/,
      fallback: (card, index) => `indeed-${index}-${Date.now()}`,
    },
    auth: {
      loggedInIndicators: ['gnav-account-menu'],
      loggedOutIndicators: ['a[href*="/account/login"]'],
    },
  },
  
  // Future: Glassdoor, Dice, ZipRecruiter...
  Glassdoor: { /* ... */ },
  Dice: { /* ... */ },
};
```

### Generic Scraping Functions

```typescript
function scrapeJobCards(config: JobBoardConfig) {
  // Use config.selectors.jobCard
  // Use config.selectors.title
  // Use config.jobIdExtraction
  // Same logic for all platforms!
}

function getNextPageUrl(config: JobBoardConfig) {
  // Use config.selectors.nextPageButton or nextPageLink
  // Use config.pagination
  // Same logic for all platforms!
}

function navigateToNextPage(config: JobBoardConfig) {
  // Use config.pagination.type
  // Same logic for all platforms!
}
```

## Benefits

1. **Single file to maintain** (~600 lines vs 5×500 = 2500 lines)
2. **Easy to add new platforms** - Just add config entry
3. **Consistent behavior** - Bug fix applies to all platforms
4. **Type safety** - Config is typed, validated
5. **Easier testing** - Test generic functions with different configs
6. **Less code duplication** - Shared logic in one place

## Migration Plan

### Step 1: Create Generic Script
- Create `content-jobboard.ts` with platform detection
- Move shared logic (auth, user interaction, messaging)
- Create generic scraping functions that use config

### Step 2: Extract Configs
- Extract LinkedIn selectors → config
- Extract Indeed selectors → config
- Test with both platforms

### Step 3: Update Manifest
- Replace `content-linkedin.js` and `content-indeed.js` with `content-jobboard.js`
- Update matches to include all job board URLs

### Step 4: Clean Up
- Remove old `content/linkedin/` and `content/indeed/` folders
- Update build config

## Code Size Comparison

**Current:**
- LinkedIn: ~536 lines
- Indeed: ~544 lines
- **Total: ~1080 lines**

**Consolidated:**
- Generic script: ~400 lines (shared logic)
- Configs: ~200 lines (LinkedIn + Indeed)
- **Total: ~600 lines** (44% reduction)

**With 5 platforms:**
- Current: 5 × 500 = **2500 lines**
- Consolidated: 400 + (5 × 40) = **600 lines** (76% reduction!)

## Answer to Your Question

**Q: "What if I later add more and more sites - we build one content script for each?"**

**A: No!** We should consolidate into a single generic script with platform configs.

**Q: "They are too different and we will have lot more conditions in a single js vs having 1 separate each. is this what you are saying?"**

**A: Actually, they're NOT that different!** 
- 90% of code is identical
- Only 10% is different (selectors, which can be config)
- Having conditions in one file is better than duplicating 90% of code across multiple files
- Config-driven approach scales much better

## Recommendation

**Refactor to single generic job board script** before adding more platforms. This will:
- Make adding Glassdoor/Dice/ZipRecruiter trivial (just add config)
- Reduce maintenance burden
- Ensure consistent behavior
- Reduce bundle size

