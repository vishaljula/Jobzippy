# Sequential Orchestrator V2 Flow

Complete step-by-step flow for the background orchestrator (`orchestrator-v2.ts`) processing jobs sequentially.

## State Structure

```typescript
interface SequentialJobState {
  platform: 'LinkedIn' | 'Indeed';
  tabId: number | null;
  atsTabId: number | null; // (temporary storage during ATS flow)
  // Sequential processing state (NOT a queue - just pointer-based)
  scrapedJobIds: string[];      // List of job IDs on current page
  currentJobIndex: number;       // Pointer to current job (0, 1, 2...)
  currentPage: number;
  hasNextPage: boolean;
  
  isProcessing: boolean;         // Currently processing a job
  isActive: boolean;             // Agent running
}
```

---

## Complete Sequential Flow

### Step 1: START_AGENT
- **Location**: Background orchestrator
- **Note**: LinkedIn/Indeed tabs are opened by sidepanel BEFORE this step (sidepanel calls `buildSearchUrls()`, opens tabs with `chrome.tabs.create()`, then sends START_AGENT message). Background orchestrator receives START_AGENT with tabs already existing.
- **Action**: 
  - Initialize state (platform, tabId, currentJobIndex=0, scrapedJobIds=[])
  - Set engineState = 'RUNNING'
  - Broadcast engine state to UI
- **Next**: GOTO Step 2

---

### Step 2: SCRAPE_JOBS (if scrapedJobIds empty or exhausted)
- **Condition**: `scrapedJobIds.length === 0` OR `currentJobIndex >= scrapedJobIds.length`
- **Executor Command**: `SCRAPE_JOBS`
- **Executor Action**:
  - Scrapes job cards from current LinkedIn/Indeed page
  - Extracts: jobIds, titles, companies, locations, URLs
  - Checks for Next page button to determine `hasNextPage`
  - Calculates current page number
- **Returns**: `{jobIds: string[], jobs: JobCard[], hasNextPage: boolean, currentPage: number}`
- **Background Action**:
  - Store: `scrapedJobIds = jobIds`
  - Store: `hasNextPage`
  - Store: `currentPage`
- **Next**: GOTO Step 3

---

### Step 3: CHECK_DUPLICATE (for current jobId)
- **Action**:
  - Query IndexedDB: `jobExists(platform, jobId)`
  - Get existing job status
- **Decision**:
  - IF exists with terminal status (`completed`, `failed`, `skipped`):
    - SKIP to Step 13 (SKIP_TO_NEXT_JOB)
  - IF doesn't exist OR exists but can be processed:
    - Continue to Step 4

---

### Step 4: CLICK_JOB_CARD
- **Executor Command**: `CLICK_JOB_BY_ID {jobId}`
- **Executor Action**:
  - Finds job card in DOM: `[data-job-id="${jobId}"]`
  - Scrolls job card into view
  - Clicks job card title link (with preventDefault to avoid navigation)
  - **Waits for job details panel to load**: `waitForJobDetailsDom(5000)` - waits for DOM element to appear
  - **Scrapes job description** from details panel container
  - **Detects applyType**: Checks for "Easy Apply" button in details panel
    - IF Easy Apply button found → `applyType = 'easy_apply'`
    - ELSE → `applyType = 'external'`
- **Returns**: `{success: boolean, description: string, applyType: 'easy_apply'|'external'}`
- **Background Action**:
  - IF success=false → SKIP to Step 13
  - Store: `jobDescription`, `applyType` in state
- **Next**: GOTO Step 5

---

### Step 5: VERIFY_JOB_DETAILS_LOADED
- **Check**: Executor returned success and description
- **Decision**:
  - IF no description or success=false:
    - SKIP to Step 13 (mark as failed)
  - ELSE:
    - Continue to Step 6

---

### Step 6: CLICK_APPLY_BUTTON
- **Executor Command**: `CLICK_APPLY_BUTTON {jobId}`
- **Executor Action**:
  - Finds Apply/Easy Apply button in job details panel
  - Clicks the button
  - **Sets up race condition**: `Promise.race([waitForLinkedInModal(0), waitForMessage('EXTERNAL_ATS_OPENED')])`
    - `waitForLinkedInModal(0)`: Polls DOM for modal element appearance (indefinite wait)
    - `waitForMessage('EXTERNAL_ATS_OPENED')`: Waits for message from background script (indefinite wait)
  - **Timeout**: Also wrapped in 60-second timeout per job (fails job if neither happens)
- **Returns**: 
  ```typescript
  {
    success: boolean,
    type: 'modal'|'external'|'timeout',
    atsUrl?: string (if external),
    timeout?: boolean (if timed out)
  }
  ```
- **Background Action**:
  - IF timeout → SKIP to Step 13 (mark as failed)
- **Next**: GOTO Step 7 (BRANCH based on type)

---

### Step 7: BRANCH - MODAL vs EXTERNAL

---

#### Step 7a: MODAL FLOW - WAIT_FOR_MODAL_STABLE
- **Condition**: `type === 'modal'`
- **Action**: Executor already confirmed modal appeared, background just waits for executor response
- **Next**: GOTO Step 7b

---

#### Step 7b: MODAL FLOW - FILL_MODAL_FORM (Multi-step intelligent navigation)
- **Executor Command**: `FILL_FORM {jobId, formType: 'linkedin_modal', context: 'modal'}`
- **Executor Action**: Calls `intelligentNavigate()` which runs a classification loop:

  **LOOP: while (attempts < maxAttempts = 10):**
  
  **i. CLASSIFY_PAGE** (Note: This classification is part of intelligentNavigate() loop and works for both LinkedIn modal and ATS full-page flows - see Step 7e)
     - Classifies current modal/page state:
       - `'form'` - Application form found (fields + submit button)
       - `'form_modal'` - Form in modal overlay
       - `'modal'` - Options modal (e.g., Workday: Autofill/Manual/Last Application)
       - `'intermediate'` - Has Apply button but not full form yet
       - `'captcha'` - CAPTCHA detected
       - `'signup'` - Account creation/login page
       - `'unknown'` - Cannot classify
  
  **ii. HANDLE_PAGE_TYPE:**
  
  **IF 'form' or 'form_modal':**
      - Check: IF submit button NOT visible BUT Apply button visible:
        - Handle as intermediate step first (click Apply to open real form)
        - Continue loop
      - ELSE:
        - Create form filler from vault data
        - Fill all form fields with user data
        - Wait for DOM to stabilize (validation)
        - Validate form (check for invalid required fields)
        - IF form valid:
          - Click submit button
          - Wait for success indicator (alert/DOM/URL change/heuristic)
          - Return `{success: true, reason: 'form_found'}`
        - IF form invalid but can force submit:
          - Try clicking submit anyway
          - Check for success indicators
          - IF success detected → Return `{success: true}`
          - ELSE → Return `{success: false, reason: 'manual_input_required'}`
  
  **IF 'modal' (options modal):**
      - Check if modal is visible
      - IF modal hidden: Find and click button to show modal, wait for it to appear
      - Filter visible apply actions
      - Select best option (priority: Autofill > Manual > Last Application > First visible)
      - Click selected option
      - Continue loop (modal closes, form appears)
  
  **IF 'intermediate':**
      - Find Apply button
      - Click it
      - Continue loop (advances to form page)
  
  **IF 'captcha':**
      - Check if simple checkbox CAPTCHA
      - IF simple: Click checkbox, continue loop
      - IF complex: Return `{success: false, reason: 'complex_captcha', message: '...'}`
  
  **IF 'signup':**
      - Check for guest/skip option
      - IF guest option exists: Click it, continue loop
      - IF no guest option: Return `{success: false, reason: 'account_required', message: '...'}`
  
  **IF 'unknown':**
      - Return `{success: false, reason: 'unknown_page', message: '...'}`
  
  **iii. IF terminal result (success or failure) → BREAK LOOP**
  
  **iv. ELSE continue loop (re-classify new DOM state after action)**
  
  **After loop:**
  - Check for success alert message (if result.success=false but alert says success, override)
  - Close modal
  - Return final result
  
- **Returns**: 
  ```typescript
  {
    success: boolean,
    reason: 'form_found'|'complex_captcha'|'account_required'|'manual_input_required'|'max_attempts'|'unknown_page',
    message?: string
  }
  ```
- **Background Action**: 
  - Executor sends `JOB_COMPLETED` message to background
  - GOTO Step 8

---

#### Step 7c: EXTERNAL FLOW - OPEN_ATS_TAB
- **Condition**: `type === 'external'` AND `atsUrl` provided
- **Action**: 
  - `chrome.tabs.create({url: atsUrl + '?job=' + jobId})`
  - Store: `atsTabId` in state
- **Next**: GOTO Step 7d

---

#### Step 7d: EXTERNAL FLOW - WAIT_FOR_ATS_READY
- **Action**: 
  - Wait for `ATS_CONTENT_SCRIPT_READY` message from ATS tab
  - Message contains: `{jobId, tabId}`
- **Background Action**:
  - Verify `tabId` matches `atsTabId` stored in state (from Step 7c)
  - Set 60-second timeout for ATS completion
- **Next**: GOTO Step 7e

---

#### Step 7e: EXTERNAL FLOW - FILL_ATS_FORM (Multi-step intelligent navigation)
- **Executor Command** (in ATS tab): `FILL_FORM {jobId, formType: 'ats', context: 'full_page'}`
- **Executor Action**: Calls `intelligentNavigate()` - **SAME LOGIC as Step 7b**:
  - Same classification loop
  - Same page type handlers (form/modal/intermediate/captcha/signup)
  - Handles multi-step navigation through ATS flow
  - Handles modals (e.g., Workday options modal)
  - Handles account creation requirements
  - Handles CAPTCHA
  - Returns same result structure
- **Returns**: Same as Step 7b
- **Background Action**: 
  - Executor sends `ATS_COMPLETE` message to background
  - Close ATS tab after 1 second delay
  - GOTO Step 8

---

### Step 8: PERSIST_COMPLETION
- **Check result.reason**:
  - IF `'complex_captcha'` OR `'account_required'`:
    - `persistJobCompleted(jobId, false, reason)` → status='skipped'
  - IF `'manual_input_required'`:
    - `persistJobCompleted(jobId, false, reason)` → status='skipped'
  - IF `'form_found'` AND `success=true`:
    - `persistJobCompleted(jobId, true)` → status='completed'
  - IF `'form_found'` AND `success=false`:
    - `persistJobCompleted(jobId, false, message)` → status='failed'
  - IF `'max_attempts'` OR `'unknown_page'`:
    - `persistJobCompleted(jobId, false, reason)` → status='failed'
- **Note**: "persist" = save to IndexedDB. `persistJobCompleted()` creates/updates job record with final status ('completed'|'failed'|'skipped'), saves to IndexedDB, and broadcasts update to UI via DASHBOARD_JOB_UPDATED message. This is the ONLY place jobs are saved to DB - no intermediate persistence during processing.
- **Track**: `track('Job ${jobId} ${success ? 'successfully applied' : `failed: ${reason}`}')`
- **Next**: GOTO Step 9

---

### Step 9: CLEANUP
- **Action**: 
  - Clear `atsTabId` from state (if set)
  - Clear all timeouts for jobId
- **Next**: GOTO Step 10

---

### Step 10: INCREMENT_JOB_INDEX
- **Action**: `state.currentJobIndex++`
- **Next**: GOTO Step 11

---

### Step 11: CHECK_MORE_JOBS_ON_PAGE
- **Check**: `currentJobIndex < scrapedJobIds.length`
- **Decision**:
  - IF true (more jobs on current page):
    - GOTO Step 3 (process next job)
  - IF false (exhausted current page):
    - GOTO Step 12

---

### Step 12: CHECK_NEXT_PAGE
- **Check**: `hasNextPage === true`
- **Decision**:
  - IF true:
    - **Executor Command**: `NAVIGATE_NEXT_PAGE`
    - **Executor Action**:
      - Finds Next page button in DOM
      - Clicks it
      - Waits for URL to change
      - Waits for new job cards to load (DOM changes, different job IDs)
    - **Returns**: `{success: boolean}`
    - **Background Action**: GOTO Step 2 (scrape new page)
  - IF false:
    - GOTO Step 14 (DONE)

---

### Step 13: SKIP_TO_NEXT_JOB (Duplicate or Error)
- **Action**: 
  - Job was skipped due to duplicate, error, or failure
  - No persistence needed (already handled or will be handled)
- **Next**: GOTO Step 10 (INCREMENT_JOB_INDEX)

---

### Step 14: DONE
- **Action**:
  - Set `engineState = 'IDLE'`
  - Cleanup state (reset currentJobIndex, scrapedJobIds, etc.)
  - Broadcast engine state to UI
  - Track: `track('Agent stopped')`

---

## Executor Command Reference

All commands are handled by unified `executor-v2.ts`:

1. **SCRAPE_JOBS**
   - Returns: `{jobIds: string[], jobs: JobCard[], hasNextPage: boolean, currentPage: number}`

2. **CLICK_JOB_BY_ID {jobId}**
   - Returns: `{success: boolean, description: string, applyType: 'easy_apply'|'external'}`

3. **CLICK_APPLY_BUTTON**
   - Returns: `{success: boolean, type: 'modal'|'external'|'timeout', atsUrl?: string}`

4. **FILL_FORM {jobId, formType: 'linkedin_modal'|'ats'}**
   - Returns: `{success: boolean, reason: string, message?: string}`
   - Also sends: `JOB_COMPLETED` (if linkedin_modal) or `ATS_COMPLETE` (if ats)

5. **NAVIGATE_NEXT_PAGE**
   - Returns: `{success: boolean}`

---

## Notes

- All executor commands are stateless - they execute and return immediately
- Background orchestrator maintains all state and control flow
- No queue - sequential pointer-based processing (currentJobIndex)
- Each step waits for executor response before proceeding
- All error paths lead to Step 13 (SKIP_TO_NEXT_JOB) which increments index and continues
