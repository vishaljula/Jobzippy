# ATS Content Script Implementation - Context for Next Chat

**Date:** 2025-01-27  
**Status:** 🔴 **BROKEN** - Multiple issues preventing functionality

---

## 🎯 Goal

Implement automatic ATS (Applicant Tracking System) form filling when users click "Apply on company website" links from LinkedIn/Indeed job listings. The system should:
1. Detect when ATS tabs open (Greenhouse, Lever, Workday, etc.)
2. Fill application forms automatically
3. Process one tab at a time (queue system)
4. Close tabs after completion
5. Handle account creation/CAPTCHA by skipping

---

## 📁 Key Files Modified

### 1. `ui/src/background/index.ts`
**Purpose:** Background service worker that orchestrates everything

**Key Changes:**
- Added ATS pattern detection (`ATS_PATTERNS` array)
- Added ATS tab queue system (`atsTabQueue`, `currentATSTabId`)
- Added `handleATSTab()`, `processATSTab()`, `finishATSTab()` functions
- Added `pendingATSContexts` Map to store job context before tabs open
- Message handlers: `ATS_APPLIED`, `ATS_SKIP`, `ATS_ERROR`, `ATS_TAB_OPENING`, `GET_PROFILE_VAULT`

**Current Issues:**
- Queue system not working - multiple tabs still opening simultaneously
- Tab cleanup might not be working correctly

### 2. `ui/src/content/ats/index.ts`
**Purpose:** Generic ATS content script that fills forms on any ATS platform

**Key Changes:**
- ATS type detection (`detectATSType()`) - supports Greenhouse, Lever, Workday, etc.
- Field mappers (`ATS_FIELD_MAPPERS`) - platform-specific selectors
- Form filling logic (`fillFormFields()`) - fills firstName, lastName, email, phone
- Profile Vault loading (`loadProfileVault()`) - requests data from background
- Message listener for `ATS_INIT` from background script

**Current Issues:**
- Forms not being filled (fields not found?)
- Profile Vault returns placeholder data (not real data)
- No account creation/CAPTCHA detection yet

### 3. `ui/src/content/linkedin/index.ts`
**Purpose:** LinkedIn job board content script

**Key Changes:**
- Added `clickApply()` function - unified function to click ANY apply button
- Auto-clicks apply buttons when jobs are scraped (staggered 1.5s delays)
- Sends `ATS_TAB_OPENING` message with job context when external apply clicked
- Removed verbose logging

**Current Issues:**
- Multiple tabs still opening (queue not working)
- Indeed version might have issues

### 4. `ui/src/content/indeed/index.ts`
**Purpose:** Indeed job board content script

**Key Changes:**
- Added `clickApply()` function (same as LinkedIn)
- Auto-clicks apply buttons when jobs scraped
- Sends `ATS_TAB_OPENING` message
- Cleaned up logging

**Current Issues:**
- **NOT WORKING AT ALL** - no logs, script might not be loading
- Need to verify manifest.json matching

### 5. `ui/src/lib/types.ts`
**Purpose:** TypeScript type definitions

**Key Changes:**
- Added ATS message types: `ATS_INIT`, `ATS_APPLIED`, `ATS_SKIP`, `ATS_ERROR`, `ATS_TAB_OPENING`
- Added ATS interfaces: `ATSType`, `ATSJobContext`, `ATSFieldMap`, `ATSApplicationResult`

### 6. `ui/public/manifest.json`
**Purpose:** Chrome extension manifest

**Key Changes:**
- Content script matches:
  - LinkedIn: `["https://www.linkedin.com/*", "http://localhost:*/mocks/linkedin-jobs.html"]`
  - Indeed: `["https://www.indeed.com/*", "http://localhost:*/mocks/indeed-jobs.html"]`
- Added `"scripting"` permission for dynamic script injection
- Added `content/*` to `web_accessible_resources`

### 7. `ui/vite.config.ts`
**Purpose:** Build configuration

**Key Changes:**
- Added `'content-ats': resolve(__dirname, 'src/content/ats/index.ts')` entry point

### 8. Mock Pages
**Purpose:** Local testing pages

**Files:**
- `ui/public/mocks/linkedin-jobs.html` - Mock LinkedIn job listings with "Apply on company website" links
- `ui/public/mocks/indeed-jobs.html` - Mock Indeed job listings
- `ui/public/mocks/greenhouse-apply.html` - Mock Greenhouse application form
- `ui/public/mocks/lever-apply.html` - Mock Lever application form

**Mock Server:**
- `ui/scripts/dev-mock-server.js` - Serves mock pages on `http://localhost:3000`

---

## 🔄 Current Flow (Intended)

1. User clicks "Start Agent" in side panel
2. Background script opens LinkedIn/Indeed tabs
3. Content scripts scrape jobs from search results
4. For each job, automatically click apply button:
   - LinkedIn: `clickApply()` finds Easy Apply button OR external apply link
   - Indeed: `clickApply()` finds Apply button OR external apply link
5. External apply link opens new tab (ATS site)
6. Background script detects ATS tab via `chrome.tabs.onCreated` or `chrome.tabs.onUpdated`
7. Background script queues tab (if one already processing) or processes immediately
8. Background script injects `content-ats.js` into ATS tab
9. Background script sends `ATS_INIT` message with job context
10. ATS script detects ATS type, loads Profile Vault, fills form
11. ATS script sends `ATS_APPLIED` message
12. Background script closes tab and processes next in queue

---

## 🐛 Known Issues

### 1. Multiple Tabs Opening Simultaneously
**Symptom:** LinkedIn opens multiple Greenhouse tabs at once instead of queuing
**Expected:** One tab at a time, others queued
**Root Cause:** Queue check (`currentATSTabId !== null`) might be race condition
**Location:** `ui/src/background/index.ts` - `handleATSTab()` function

### 2. Forms Not Being Filled
**Symptom:** ATS tabs open but forms remain empty
**Expected:** Forms should auto-fill with Profile Vault data
**Possible Causes:**
- Field selectors not matching mock HTML structure
- Profile Vault returning placeholder data (not real data)
- ATS script not receiving `ATS_INIT` message
- Timing issue - script injecting before page ready

**Debug Steps:**
- Check browser console on ATS tab for `[ATS]` logs
- Verify `ATS_INIT` message is received
- Check if `detectATSType()` returns correct type
- Verify field selectors match mock HTML

### 3. Indeed Not Working
**Symptom:** No logs, no activity on Indeed mock page
**Expected:** Should see `[Indeed] Content script loaded` and scraping activity
**Possible Causes:**
- Manifest.json matching not working
- Content script not injecting
- `isJobsPage()` returning false
- Script initialization failing silently

**Debug Steps:**
- Check `chrome://extensions` - verify manifest.json is correct
- Check browser console on `http://localhost:3000/mocks/indeed-jobs.html`
- Verify content script file exists in `dist/content/content-indeed.js`
- Check if script is in IIFE wrapper (should prevent duplicate injection)

### 4. Tab Cleanup Not Working
**Symptom:** Tabs not closing after form filling
**Expected:** Tab should close automatically after `ATS_APPLIED` message
**Location:** `ui/src/background/index.ts` - `finishATSTab()` function

---

## 🔍 Debugging Commands

```bash
# Rebuild extension
cd ui && npm run build:dev

# Check for TypeScript errors
cd ui && npx tsc --noEmit

# Check manifest.json syntax
cat ui/public/manifest.json | jq .

# Check if content scripts are built
ls -la ui/dist/content/
```

---

## 📋 Testing Checklist

- [ ] LinkedIn content script loads on mock page
- [ ] Indeed content script loads on mock page  
- [ ] Jobs are scraped from LinkedIn mock page
- [ ] Jobs are scraped from Indeed mock page
- [ ] Apply buttons are clicked automatically
- [ ] ATS tabs are detected when opened
- [ ] Only one ATS tab processes at a time (others queued)
- [ ] ATS script injects into Greenhouse mock page
- [ ] ATS script detects Greenhouse type correctly
- [ ] Profile Vault data loads (even if placeholder)
- [ ] Form fields are found and filled
- [ ] Tab closes after form filling
- [ ] Next tab in queue processes automatically

---

## 🎯 Next Steps (Priority Order)

### 1. Fix Indeed Content Script Loading
- Verify manifest.json matching
- Check if script is injecting
- Add more logging to debug

### 2. Fix Multiple Tabs Issue
- Review queue logic in `handleATSTab()`
- Add mutex/lock to prevent race conditions
- Test with multiple rapid clicks

### 3. Fix Form Filling
- Verify field selectors match mock HTML
- Add more detailed logging in `fillFormFields()`
- Check if Profile Vault data structure is correct
- Test field finding logic

### 4. Add Account Creation/CAPTCHA Detection
- Detect "Create Account" / "Sign Up" pages
- Detect CAPTCHA presence
- Skip and mark as `ATS_SKIP` with reason
- Close tab immediately

---

## 📚 Related Documentation

- `docs/ATS_CONTENT_SCRIPT_ARCHITECTURE.md` - Architecture overview
- `docs/ATS_IMPLEMENTATION_PLAN.md` - Detailed implementation plan
- `docs/ATS_IMPLEMENTATION_STATUS.md` - Status tracking
- `BACKLOG.md` - Full backlog (JZ-015, JZ-017, JZ-009B for account creation)

---

## 🔑 Key Code Locations

**ATS Detection:**
- Background: `ui/src/background/index.ts` - `detectATSFromUrl()` (line ~100)
- Content: `ui/src/content/ats/index.ts` - `detectATSType()` (line ~82)

**Queue System:**
- `ui/src/background/index.ts` - `handleATSTab()` (line ~748), `processATSTab()` (line ~765), `finishATSTab()` (line ~825)

**Form Filling:**
- `ui/src/content/ats/index.ts` - `fillFormFields()` (line ~191), `fillField()` (line ~145)

**Apply Button Clicking:**
- LinkedIn: `ui/src/content/linkedin/index.ts` - `clickApply()` (line ~389)
- Indeed: `ui/src/content/indeed/index.ts` - `clickApply()` (line ~378)

**Profile Vault Loading:**
- Background: `ui/src/background/index.ts` - `GET_PROFILE_VAULT` handler (line ~575)
- Content: `ui/src/content/ats/index.ts` - `loadProfileVault()` (line ~130)

---

## 💡 Architecture Decisions

1. **Single Generic ATS Script:** One script handles all ATS platforms (Greenhouse, Lever, etc.) with platform-specific field mappers
2. **Queue System:** Only one ATS tab processes at a time to prevent overwhelming the browser
3. **Dynamic Injection:** ATS script injected via `chrome.scripting.executeScript` (not manifest) because ATS URLs are dynamic
4. **Job Context Passing:** Job context (title, company) passed via `ATS_TAB_OPENING` message before tab opens, stored in `pendingATSContexts` Map

---

## 🚨 Critical Notes

- Profile Vault currently returns **placeholder data** - not connected to real IndexedDB yet
- Form submission not implemented yet (Story 14)
- Resume upload not implemented yet (Story 12)
- Multi-step forms not handled yet (Story 13)
- Account creation detection not implemented yet (Story JZ-009B)
- CAPTCHA detection not implemented yet (Story JZ-015)

---

## 📝 Environment Setup

```bash
# Start dev servers (from root)
npm run dev

# This runs:
# - UI dev server (port 5173)
# - API dev server (port 3001)
# - Mock server (port 3000)

# Build extension (from ui/)
cd ui && npm run build:dev

# Load extension in Chrome:
# 1. Go to chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select ui/dist folder
```

---

**Good luck! The foundation is there, but the queue system and form filling need debugging.**


