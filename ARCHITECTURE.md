# Job Application Architecture - Complete Flow

## Overview
The system has 3 main components:
1. **LinkedIn Content Script** (`ui/src/content/linkedin/index.ts`) - Main agent that processes jobs
2. **Background Script** (`ui/src/background/index.ts`) - Orchestrates tab management and messaging
3. **ATS Content Script** (`ui/src/content/ats/index.ts`) - Handles external ATS form filling

---

## Complete Flow: How a Job Gets Applied

### PHASE 1: Agent Initialization
**Script:** `linkedin/index.ts` → `startAgent()`

1. User clicks "Start Agent" in UI
2. UI sends `START_AGENT` message to background script
3. Background script sends `START_AGENT` to LinkedIn content script
4. LinkedIn content script creates `AgentController` instance
5. `AgentController.start()` begins main loop:
   - Scrapes job cards from page
   - Filters jobs (skips applied, etc.)
   - Loops through each job sequentially

---

### PHASE 2: Processing a Single Job (LinkedIn Modal Flow)
**Script:** `linkedin/index.ts` → `processJob()`

**Step 1: Click Job Card**
- Finds job card element
- Clicks it
- Waits 1.5s for details to load

**Step 2: Click Apply Button**
- Finds "Apply" button
- Sends `APPLY_CLICK_START` message to background script (tracks timestamp)
- Clicks the button

**Step 3: Wait for Form/Modal (2 seconds)**
- Waits 2 seconds for form/modal to appear
- **NEW:** Checks every 200ms for external tab during this wait
- If external tab detected → jumps to EXTERNAL ATS FLOW (see below)

**Step 4: Fill Form (if modal appeared)**
- Calls `intelligentNavigate()` from `navigator.ts`
- `intelligentNavigate()`:
  - Classifies page type (form, modal, signup, etc.)
  - Detects form fields (name, email, phone, resume, etc.)
  - Creates `FormFiller` instance
  - Fills all detected fields from vault
  - Submits form
  - Returns success/failure

**Step 5: Mark as Applied**
- If `intelligentNavigate()` returns success:
  - Increments `jobsApplied` counter
  - Resets inactivity timeout
  - Sends `JOB_APPLIED` message to background
  - Continues to next job

---

### PHASE 3: External ATS Flow (When Apply Button Opens New Tab)
**Scripts:** `linkedin/index.ts` + `background/index.ts` + `ats/index.ts`

**Step 1: External Tab Detection**
- When Apply button is clicked, browser opens new tab
- **Background Script** (`background/index.ts`):
  - `webNavigation.onCreatedNavigationTarget` listener fires
  - Detects new tab opened from LinkedIn tab
  - Checks if URL matches ATS pattern (greenhouse, workday, etc.)
  - Stores job info in `externalATSJobs` map: `{ tabId, jobId, sourceTabId }`
  - Stores click timestamp in `applyClickRecords`

**Step 2: LinkedIn Tab Waits for External Tab**
- **LinkedIn Content Script** (`linkedin/index.ts`):
  - During Step 3 wait (or after), checks for external tab:
    - Sends `CHECK_NEW_TAB` message to background
    - Background queries all tabs, finds one with `openerTabId` matching source tab
    - Returns `newTabId` if found
  - If external tab detected:
    - Stores promise in `pendingExternalATS` map: `{ jobId: { resolve, reject } }`
    - Closes modal on LinkedIn page
    - **AWAITS** promise resolution (blocks until external ATS completes)
    - Returns from `processJob()` (doesn't mark as applied yet)

**Step 3: Background Script Injects ATS Content Script**
- **Background Script** (`background/index.ts`):
  - `chrome.tabs.onUpdated` listener fires when external tab loads
  - Checks if tab is in `externalATSJobs` map
  - Programmatically injects `content-ats.js` using `chrome.scripting.executeScript`
  - Sets up timeout (2 minutes) in `pendingATSTabs` map
  - Waits for `ATS_CONTENT_SCRIPT_READY` message

**Step 4: ATS Content Script Loads**
- **ATS Content Script** (`ats/index.ts`):
  - Script loads in external tab
  - Immediately sends `ATS_CONTENT_SCRIPT_READY` message to background
  - Sets up 30-second safety timeout (fallback if background never sends command)
  - **DOES NOT** auto-run `intelligentNavigate()` (waits for command)

**Step 5: Background Sends Fill Command**
- **Background Script** (`background/index.ts`):
  - Receives `ATS_CONTENT_SCRIPT_READY` message
  - Clears timeout from `pendingATSTabs`
  - Sends `FILL_EXTERNAL_ATS` message to external tab
  - If timeout expires (2 min) → closes tab, sends `EXTERNAL_ATS_DONE` with failure

**Step 6: ATS Content Script Fills Form**
- **ATS Content Script** (`ats/index.ts`):
  - Receives `FILL_EXTERNAL_ATS` message
  - Clears safety timeout
  - Calls `intelligentNavigate()`:
    - Classifies page (form, modal, intermediate, etc.)
    - Fills form fields from vault
    - Handles multi-step flows (e.g., Workday modal → form)
    - Submits form
  - If success → sends `EXTERNAL_ATS_COMPLETE` to background
  - If failure → sends `EXTERNAL_ATS_FAILED` to background

**Step 7: Background Notifies LinkedIn Tab**
- **Background Script** (`background/index.ts`):
  - Receives `EXTERNAL_ATS_COMPLETE` or `EXTERNAL_ATS_FAILED`
  - Looks up job info from `externalATSJobs` map
  - Sends `EXTERNAL_ATS_DONE` message to LinkedIn tab:
    - **source tab** (LinkedIn tab):
    - `{ type: 'EXTERNAL_ATS_DONE', data: { success: true/false, jobId, error? } }`
  - Closes external tab after short delay
  - Cleans up `externalATSJobs` and `pendingATSTabs` maps

**Step 8: LinkedIn Tab Resolves Promise**
- **LinkedIn Content Script** (`linkedin/index.ts`):
  - `EXTERNAL_ATS_DONE` message handler receives message
  - Looks up promise in `pendingExternalATS` map using `jobId`
  - If promise found:
    - If success → resolves promise, increments `jobsApplied`, sends `JOB_APPLIED`
    - If failure → rejects promise, adds error to results
  - Promise resolution unblocks `processJob()` → continues to next job

---

## Message Flow Diagram

```
LinkedIn Tab                    Background Script              External ATS Tab
     |                                |                              |
     |-- APPLY_CLICK_START ---------->|                              |
     |                                |                              |
     |                                |<-- webNavigation.onCreated  |
     |                                |    NavigationTarget          |
     |                                |                              |
     |                                |-- Store in externalATSJobs   |
     |                                |                              |
     |-- CHECK_NEW_TAB -------------->|                              |
     |<-- { newTabId: 123 } ----------|                              |
     |                                |                              |
     |-- Store promise, await ------->|                              |
     |                                |                              |
     |                                |<-- tabs.onUpdated            |
     |                                |                              |
     |                                |-- Inject content-ats.js ----->|
     |                                |                              |
     |                                |<-- ATS_CONTENT_SCRIPT_READY -|
     |                                |                              |
     |                                |-- FILL_EXTERNAL_ATS -------->|
     |                                |                              |
     |                                |<-- intelligentNavigate()     |
     |                                |    (fills form, submits)     |
     |                                |                              |
     |                                |<-- EXTERNAL_ATS_COMPLETE ----|
     |                                |                              |
     |<-- EXTERNAL_ATS_DONE ----------|                              |
     |                                |                              |
     |-- Resolve promise, continue    |                              |
```

---

## Key Data Structures

### Background Script (`background/index.ts`)
- `externalATSJobs: Map<tabId, ExternalATSJob>` - Tracks external tabs and their job info
- `pendingATSTabs: Map<tabId, PendingATSTab>` - Tracks tabs waiting for ready signal
- `applyClickRecords: Map<tabId, ApplyClickRecord>` - Tracks when Apply was clicked

### LinkedIn Content Script (`linkedin/index.ts`)
- `pendingExternalATS: Map<jobId, { resolve, reject }>` - Promises waiting for external ATS completion
- `results.jobsApplied` - Counter for successful applications
- `lastJobAppliedTime` - For inactivity timeout

---

## Race Conditions & Current Issues

### Problem 1: Timing Race Condition
- External tab navigates BEFORE LinkedIn tab checks for it
- **Current Fix:** Check every 200ms during Step 3 wait
- **Still Broken:** Tab can navigate during the 200ms gap

### Problem 2: Promise Not Stored
- If external tab navigates before promise is stored, LinkedIn tab doesn't wait
- **Current Fix:** Store promise immediately when tab detected
- **Still Broken:** Detection happens AFTER navigation

### Problem 3: Back/Forward Cache (bfcache)
- When external tab navigates, it can enter bfcache
- This breaks the message channel
- **Current Fix:** Don't auto-run `intelligentNavigate()`, wait for command
- **Status:** Fixed, but requires careful timing

---

## Recommendations for Simplification

1. **Use Event-Driven Architecture:**
   - Background script should notify LinkedIn tab IMMEDIATELY when external tab is created
   - Don't rely on polling (`CHECK_NEW_TAB`)

2. **Store Promise BEFORE Clicking Apply:**
   - Store promise at start of `processJob()`
   - Resolve/reject based on outcome

3. **Single Source of Truth:**
   - Background script should be the only one tracking external tabs
   - LinkedIn tab should just listen for notifications

4. **Remove Polling:**
   - Replace `CHECK_NEW_TAB` polling with event notifications
   - Use `EXTERNAL_TAB_CREATED` message instead

5. **Simplify Promise Management:**
   - Use a single promise per job, not multiple checks
   - Store it once, resolve once

