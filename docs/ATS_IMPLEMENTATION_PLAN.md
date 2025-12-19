# ATS Content Script Implementation Plan

## Question 1: Breakdown of Sub-Tasks

### Phase 1: Background Script - ATS Detection & Injection
**File:** `ui/src/background/index.ts`

1. **Add ATS pattern detection**
   - Create `ATS_PATTERNS` array with URL patterns for known ATS (Greenhouse, Lever, Workday, etc.)
   - Function: `detectATSFromUrl(url: string): string | null`

2. **Monitor new tabs for ATS sites**
   - Add `chrome.tabs.onCreated` listener
   - Check if new tab URL matches any ATS pattern
   - Store ATS type and tab ID in state

3. **Wait for page load and inject script**
   - Add `chrome.tabs.onUpdated` listener for ATS tabs
   - Wait for `status === 'complete'`
   - Use `chrome.scripting.executeScript` to inject `content-ats.js`
   - Track injected tabs to prevent duplicate injection

4. **Send job context to ATS script**
   - After injection, send `ATS_INIT` message with:
     - ATS type (Greenhouse, Lever, etc.)
     - Job context (title, company, description, URL)
     - Match score (from Story 6)
     - Profile Vault data (or reference to load it)

5. **Handle ATS responses**
   - Listen for `ATS_APPLIED`, `ATS_SKIP`, `ATS_ERROR` messages
   - Update application records
   - Log to Google Sheet
   - Update UI state

### Phase 2: Generic ATS Content Script
**File:** `ui/src/content/ats/index.ts` (new file)

1. **IIFE wrapper with guard**
   - Prevent duplicate injection
   - Similar to LinkedIn/Indeed scripts

2. **ATS type detection**
   - Function: `detectATSType(): string`
   - Check URL patterns, DOM markers, or meta tags
   - Fallback to generic handler if unknown

3. **Message listener setup**
   - Listen for `ATS_INIT` from background
   - Store job context and match score
   - Trigger application flow

4. **Match score check**
   - If match score < threshold (e.g., 70), skip immediately
   - Send `ATS_SKIP` message to background
   - Close tab or navigate away

5. **Load Profile Vault data**
   - Request Profile Vault from background script
   - Decrypt and parse user data
   - Store in local state for form filling

6. **ATS-specific field mappers**
   - Create `ATS_FIELD_MAPPERS` object
   - Each ATS has different selectors:
     ```typescript
     {
       Greenhouse: {
         firstName: 'input[name="first_name"]',
         lastName: 'input[name="last_name"]',
         email: 'input[name="email"]',
         // ...
       },
       Lever: {
         firstName: 'input[name="name"]', // Different!
         // ...
       }
     }
     ```

7. **Form field detection**
   - Function: `detectFormFields(atsType: string): FieldMap`
   - Query DOM using ATS-specific selectors
   - Map fields to Profile Vault data structure
   - Handle missing fields gracefully

8. **Fill form fields**
   - Function: `fillFormFields(fieldMap: FieldMap, profile: ProfileVault)`
   - Fill text inputs, selects, checkboxes
   - Handle EEO questions based on policies
   - Handle salary questions based on policies
   - Add small delays between fills (human-like)

9. **Resume upload**
   - Function: `uploadResume(fileInput: HTMLInputElement, resumeBlob: Blob)`
   - Create File object from Profile Vault resume
   - Trigger file input change event
   - Wait for upload to complete

10. **Multi-step form handling**
    - Function: `handleMultiStepForm(): Promise<boolean>`
    - Detect "Next" buttons
    - Click through steps (max 5-10 steps)
    - Detect "Back" buttons if needed
    - Return success/failure

11. **Submit application**
    - Function: `submitApplication(): Promise<boolean>`
    - Find submit button (various selectors)
    - Click submit
    - Wait for confirmation page

12. **Success confirmation**
    - Function: `confirmSubmission(): Promise<boolean>`
    - Check for success indicators (ATS-specific)
    - Return true if confirmed, false otherwise

13. **Error handling**
    - Catch errors at each step
    - Send `ATS_ERROR` message to background
    - Log error details for debugging

### Phase 3: Build Configuration
**File:** `ui/vite.config.ts`

1. **Add ATS content script to build**
   - Add `'content-ats': resolve(__dirname, 'src/content/ats/index.ts')` to rollupOptions.input
   - Ensure output goes to `content/content-ats.js`

### Phase 4: Type Definitions
**File:** `ui/src/lib/types.ts`

1. **Add ATS message types**
   - `ATS_INIT` - Background → ATS script
   - `ATS_APPLIED` - ATS script → Background
   - `ATS_SKIP` - ATS script → Background
   - `ATS_ERROR` - ATS script → Background

2. **Add ATS-specific interfaces**
   - `ATSJobContext` - Job details for ATS
   - `ATSFieldMap` - Field selectors per ATS
   - `ATSApplicationResult` - Result of application attempt

### Phase 5: Testing
**Files:** Mock ATS pages + tests

1. **Create mock ATS pages**
   - `ui/public/mocks/greenhouse-apply.html`
   - `ui/public/mocks/lever-apply.html`
   - Simple forms with typical field structures

2. **Unit tests**
   - Test ATS detection
   - Test field mapping
   - Test form filling logic

3. **E2E tests**
   - Test full flow: inject → detect → fill → submit

---

## Question 2: Why Separate Scripts for LinkedIn/Indeed but Single for ATS?

### Current Architecture: LinkedIn vs Indeed

**Why they're separate:**
1. **Fundamentally different DOM structures**
   - LinkedIn: `<div class="job-card-container">` with nested structure
   - Indeed: `<div class="job_seen_beacon">` with different nesting
   - Different class names, IDs, and selectors throughout

2. **Different pagination mechanisms**
   - LinkedIn: URL-based (`?start=25`, `?start=50`) + button click
   - Indeed: URL-based (`?start=15`, `?start=30`) + different button selector
   - Different page size (LinkedIn: 25, Indeed: 15)

3. **Different URL patterns**
   - LinkedIn: `linkedin.com/jobs/search/?keywords=...`
   - Indeed: `indeed.com/jobs?q=...&l=...`
   - Different query parameter names

4. **Different authentication detection**
   - LinkedIn: Check for `nav__button-secondary` (sign in button) vs user avatar
   - Indeed: Check for `gnav-account-menu` vs sign-in links
   - Completely different selectors

5. **Different job card structures**
   ```typescript
   // LinkedIn
   const title = card.querySelector('.job-card-list__title')?.textContent;
   const company = card.querySelector('.job-card-container__company-name')?.textContent;
   
   // Indeed
   const title = card.querySelector('h2.jobTitle a')?.textContent;
   const company = card.querySelector('.companyName')?.textContent;
   ```

6. **Different navigation logic**
   - LinkedIn: Click `button[aria-label*="Next"]`
   - Indeed: Click `a[aria-label="Next Page"]`
   - Different element types and attributes

### Could We Consolidate?

**Theoretical approach:**
```typescript
// Generic job board scraper
const PLATFORMS = {
  LinkedIn: {
    jobCardSelector: '.job-card-container',
    titleSelector: '.job-card-list__title',
    companySelector: '.job-card-container__company-name',
    nextButtonSelector: 'button[aria-label*="Next"]',
    // ... 50+ more selectors
  },
  Indeed: {
    jobCardSelector: '.job_seen_beacon',
    titleSelector: 'h2.jobTitle a',
    companySelector: '.companyName',
    nextButtonSelector: 'a[aria-label="Next Page"]',
    // ... 50+ more selectors
  }
};
```

**Problems with consolidation:**
1. **Massive configuration object** - 100+ selectors per platform
2. **Hard to maintain** - Changes to LinkedIn DOM break Indeed config
3. **No type safety** - Can't validate selectors at compile time
4. **Testing complexity** - Need to test all platforms together
5. **Code bloat** - Each platform's logic is different enough that abstraction doesn't help

**When consolidation makes sense:**
- Platforms have similar structures (like ATS forms)
- Shared logic outweighs differences
- Easy to abstract common patterns

### ATS Sites: Why Single Script Works

**Why ATS can be single script:**
1. **Similar structure** - All ATS sites are forms with:
   - Text inputs (name, email, phone)
   - File uploads (resume)
   - Selects/dropdowns
   - Submit buttons

2. **Only differences are selectors** - Not structure:
   ```typescript
   // Greenhouse
   <input name="first_name" />
   
   // Lever  
   <input name="name" /> // Just different name attribute
   ```

3. **Same workflow** - All follow same pattern:
   - Detect ATS type
   - Load field mapper
   - Fill fields
   - Upload resume
   - Submit

4. **Easy to extend** - Adding new ATS = adding new mapper entry

**Comparison:**

| Aspect | LinkedIn/Indeed | ATS Sites |
|--------|----------------|-----------|
| **Structure** | Completely different DOM | Similar form structure |
| **Selectors** | 100+ unique selectors each | ~20 field selectors per ATS |
| **Workflow** | Different pagination, auth, scraping | Same: detect → fill → submit |
| **Maintenance** | Changes to one don't affect other | Changes isolated to mapper |
| **Abstraction benefit** | Low (too different) | High (similar patterns) |

### Recommendation

**Keep LinkedIn/Indeed separate** because:
- They're fundamentally different job boards
- Consolidation would create more complexity than it solves
- Easier to maintain and test separately
- Each has unique quirks that need platform-specific handling

**Use single ATS script** because:
- All ATS sites follow similar form patterns
- Only differences are field selectors (easy to map)
- Same workflow across all ATS types
- Easy to add new ATS support (just add mapper)

**Future consideration:**
If we add more job boards (Glassdoor, Dice, ZipRecruiter), we should evaluate:
- If they're similar to LinkedIn/Indeed → separate scripts
- If they're similar to each other → consider consolidation
- But ATS will always be single script (they're all forms)

