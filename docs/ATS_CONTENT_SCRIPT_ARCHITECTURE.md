# ATS Content Script Architecture

## Problem Statement

When a user clicks "Apply on company site" from LinkedIn/Indeed, it opens a new tab to an ATS (Applicant Tracking System) like Greenhouse, Lever, Workday, etc. We need to:

1. **Detect** when an ATS page opens
2. **Inject** a content script dynamically (can't pre-declare all ATS domains)
3. **Fill forms** with Profile Vault data
4. **Make apply/skip decisions** based on match score
5. **Handle multiple ATS types** without conflicts

## Solution: Dynamic Content Script Injection

### Architecture Overview

```
┌─────────────────┐
│  LinkedIn Tab   │  → Clicks "Apply on company site"
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  New Tab Opens  │  → greenhouse.io/apply/...
│  (ATS Site)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Background      │  → Detects ATS from URL/DOM
│ Script          │  → Injects content-ats.js dynamically
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ content-ats.js  │  → Detects ATS type (Greenhouse, Lever, etc.)
│ (Generic)       │  → Fills forms from Profile Vault
└─────────────────┘  → Makes apply/skip decision
```

## Implementation Plan

### 1. Background Script: Tab Monitoring

**Location:** `ui/src/background/index.ts`

**What it does:**
- Listens for new tabs opening (`chrome.tabs.onCreated`)
- Detects if URL matches known ATS patterns
- Dynamically injects `content-ats.js` using `chrome.scripting.executeScript`
- Passes job context (title, company, match score) to the content script

**Code structure:**
```typescript
// Known ATS patterns
const ATS_PATTERNS = [
  { name: 'Greenhouse', pattern: /greenhouse\.io|boards\.greenhouse\.io/ },
  { name: 'Lever', pattern: /jobs\.lever\.co|lever\.co/ },
  { name: 'Workday', pattern: /myworkdayjobs\.com|workday\.com/ },
  { name: 'SmartRecruiters', pattern: /smartrecruiters\.com/ },
  { name: 'Workable', pattern: /apply\.workable\.com/ },
  { name: 'Ashby', pattern: /jobs\.ashbyhq\.com/ },
  { name: 'BambooHR', pattern: /bamboohr\.com/ },
];

// Listen for new tabs
chrome.tabs.onCreated.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;
  
  // Check if it's an ATS site
  const atsMatch = ATS_PATTERNS.find(ats => ats.pattern.test(tab.url!));
  if (!atsMatch) return;
  
  // Wait for page to load
  chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
    if (tabId !== tab.id || changeInfo.status !== 'complete') return;
    chrome.tabs.onUpdated.removeListener(listener);
    
    // Inject ATS content script
    chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      files: ['content/content-ats.js'],
    }).then(() => {
      // Send job context to content script
      chrome.tabs.sendMessage(tab.id!, {
        type: 'ATS_INIT',
        data: {
          atsType: atsMatch.name,
          jobContext: currentJobContext, // From Story 5
          matchScore: currentMatchScore, // From Story 6
        }
      });
    });
  });
});
```

### 2. Generic ATS Content Script

**Location:** `ui/src/content/ats/index.ts`

**What it does:**
- Detects specific ATS type from DOM/URL
- Loads ATS-specific field mappers (Greenhouse vs Lever have different form structures)
- Fills forms from Profile Vault data
- Makes apply/skip decision based on match score
- Handles multi-step forms
- Submits application

**Code structure:**
```typescript
// ATS-specific field mappers
const ATS_MAPPERS = {
  Greenhouse: {
    firstName: 'input[name="first_name"]',
    lastName: 'input[name="last_name"]',
    email: 'input[name="email"]',
    phone: 'input[name="phone"]',
    resume: 'input[type="file"][name="resume"]',
    // ... more fields
  },
  Lever: {
    firstName: 'input[name="name"]', // Different structure
    // ...
  },
  // ... other ATS types
};

// Main ATS handler
async function handleATSApplication(atsType: string, jobContext: any, matchScore: number) {
  // 1. Detect ATS type (if not provided)
  const detectedType = detectATSType();
  
  // 2. Check match score - skip if too low
  if (matchScore < 70) {
    console.log('[Jobzippy] Match score too low, skipping:', matchScore);
    chrome.runtime.sendMessage({
      type: 'ATS_SKIP',
      data: { reason: 'Low match score', score: matchScore }
    });
    return;
  }
  
  // 3. Load Profile Vault data
  const profile = await loadProfileVault();
  
  // 4. Fill form fields
  const mapper = ATS_MAPPERS[detectedType];
  fillFormFields(mapper, profile);
  
  // 5. Upload resume
  await uploadResume(profile.resume);
  
  // 6. Handle multi-step forms
  await handleMultiStepForm();
  
  // 7. Submit
  await submitApplication();
  
  // 8. Confirm success
  const success = await confirmSubmission();
  
  // 9. Report back to background
  chrome.runtime.sendMessage({
    type: 'ATS_APPLIED',
    data: { success, jobContext }
  });
}
```

### 3. Build Configuration

**Update:** `ui/vite.config.ts`

Add ATS content script to build:

```typescript
rollupOptions: {
  input: {
    // ... existing entries
    'content-ats': resolve(__dirname, 'src/content/ats/index.ts'),
  },
  // ... rest of config
}
```

### 4. Message Types

**Update:** `ui/src/lib/types.ts`

Add new message types:

```typescript
export type MessageType =
  // ... existing types
  | 'ATS_INIT'           // Background → ATS content script
  | 'ATS_APPLIED'        // ATS content script → Background
  | 'ATS_SKIP'           // ATS content script → Background
  | 'ATS_ERROR';         // ATS content script → Background
```

## Benefits of This Architecture

1. **No Manifest Bloat**: Don't need to declare every ATS domain upfront
2. **Single Content Script**: One generic script handles all ATS types
3. **Dynamic Detection**: Can add new ATS types without updating manifest
4. **Clean Separation**: ATS logic isolated from LinkedIn/Indeed scraping
5. **Easy Testing**: Can test ATS script independently

## Handling Multiple Content Scripts

**Concern:** What if multiple content scripts run on the same page?

**Solution:**
1. **IIFE Guards**: Wrap ATS content script in IIFE with guard (like we did for LinkedIn/Indeed)
2. **Single Injection**: Background script only injects once per tab
3. **State Management**: Use `chrome.storage` to track which tabs have ATS script injected

```typescript
// In ATS content script
(function() {
  if ((window as any).__jobzippy_ats_loaded) {
    console.log('[Jobzippy] ATS content script already loaded, skipping');
    return;
  }
  (window as any).__jobzippy_ats_loaded = true;
  
  // ... rest of script
})();
```

## Next Steps

1. **Story 5**: Read job details (get full description, detect apply button type)
2. **Story 6**: Decide apply/skip (calculate match score)
3. **Story 7-14**: Implement ATS content script (detect, fill, submit)

## Testing Strategy

1. **Mock ATS Pages**: Create mock Greenhouse/Lever pages (like we did for LinkedIn/Indeed)
2. **Unit Tests**: Test field mappers for each ATS type
3. **E2E Tests**: Test full flow: click apply → ATS opens → form fills → submits

