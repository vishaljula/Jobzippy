# Orchestrator V2 Architecture - Context Summary

## Current State & Problem

### Issues with Existing Architecture
The current job application flow has several architectural problems:
1. **Fragile message passing**: Events passed between background script, content scripts, and UI with unclear ownership
2. **Non-sequential processing**: Logs showed jobs starting non-sequentially despite UI indicating sequential behavior
3. **Missing tracking**: ATS_COMPLETE handler was missing `track()` calls, causing UI/log mismatches (UI showed 6 applied, logs only 2)
4. **State management**: Multiple intermediate persistence points (`persistJobQueued`, `persistJobApplying`, `persistJobAtsFilling`) causing confusion
5. **Unclear control flow**: Difficult to trace where control resides at each step of the job application process

### Current Flow (Before Refactoring)
- Sidepanel sends `START_AGENT` → Background
- Background has `processJobQueue` logic (may not be fully active)
- LinkedIn content script (`ui/src/content/linkedin/index.ts`) contains `AgentController` class that orchestrates job loop
- ATS content script (`ui/src/content/ats/index.ts`) auto-runs `intelligentNavigate()` on injection
- Multiple message types passed around: `JOB_COMPLETED`, `ATS_COMPLETE`, `ATS_CONTENT_SCRIPT_READY`, etc.
- Jobs persisted to IndexedDB at multiple stages with intermediate statuses

## Proposed Solution: Orchestrator V2

### Core Architectural Principles
1. **Centralized Control**: Background orchestrator maintains ALL state and control flow
2. **Stateless Executors**: Content scripts become stateless executors that receive commands and return results
3. **Sequential Processing**: Strict one-job-at-a-time processing using pointer-based state (no queue)
4. **Single Persistence Point**: Only final job status saved to IndexedDB (completed/failed/skipped)
5. **Clear Command/Response Pattern**: Background sends commands, executors respond synchronously

### State Structure
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

### Executor Commands (Unified executor-v2.ts)
1. **SCRAPE_JOBS** - Scrapes job cards from current page
2. **CLICK_JOB_BY_ID {jobId}** - Clicks job card, waits for details, detects apply type
3. **CLICK_APPLY_BUTTON** - Clicks apply button, detects modal vs external ATS
4. **FILL_FORM {jobId, formType}** - Calls `intelligentNavigate()` for form filling
5. **NAVIGATE_NEXT_PAGE** - Navigates to next page of job listings

### Key Flow Document
See `ORCHESTRATOR_V2_FLOW.md` for complete step-by-step flow (14 steps + sub-steps for modal/external branches).

**High-level flow:**
1. START_AGENT (tabs opened by sidepanel BEFORE this)
2. SCRAPE_JOBS (if needed)
3. CHECK_DUPLICATE (skip if terminal status exists)
4. CLICK_JOB_CARD
5. VERIFY_JOB_DETAILS_LOADED
6. CLICK_APPLY_BUTTON (detects modal vs external)
7. BRANCH: MODAL (7a→7b) or EXTERNAL (7c→7d→7e)
   - Both use `intelligentNavigate()` with classification loop
8. PERSIST_COMPLETION (ONLY persistence point - saves final status to IndexedDB)
9. CLEANUP (clear atsTabId, timeouts)
10. INCREMENT_JOB_INDEX
11. CHECK_MORE_JOBS_ON_PAGE → Step 3 or Step 12
12. CHECK_NEXT_PAGE → Step 2 (scrape) or Step 14 (DONE)
13. SKIP_TO_NEXT_JOB (for duplicates/errors) → Step 10
14. DONE

### Key Decisions Made

1. **Tab Opening**: Stays in sidepanel (`ui/src/sidepanel/App.tsx`). Sidepanel opens LinkedIn/Indeed tabs using `chrome.tabs.create()` BEFORE sending `START_AGENT` message to background.

2. **Persistence Strategy**: 
   - **REMOVED**: All intermediate persistence (`persistJobQueued`, `persistJobApplying`, `persistJobAtsFilling`)
   - **KEPT**: Only `persistJobCompleted()` in Step 8, which saves final status (completed/failed/skipped) to IndexedDB
   - Better naming: Consider renaming `persistJobCompleted` to `saveJobResult` or similar

3. **No JobSession**: Removed JobSession concept entirely. State managed directly in orchestrator's `SequentialJobState`. `atsTabId` stored temporarily in state during ATS flow.

4. **Classification**: `intelligentNavigate()` internally performs page classification in a loop. No separate FORM_CLASSIFICATION step needed - it's part of the intelligent navigation logic for both modal and ATS flows.

5. **Sequential Processing**: Uses `currentJobIndex` pointer, NOT a queue. Each job processed one at a time, waiting for completion before moving to next.

## Implementation Status

### ✅ Completed
- [x] Flow document created and refined (`ORCHESTRATOR_V2_FLOW.md`)
- [x] All architectural questions answered and documented
- [x] Key decisions clarified (tab opening, persistence, state management)

### 🔴 Not Yet Implemented
- [ ] Create `orchestrator-v2.ts` in background script
- [ ] Create unified `executor-v2.ts` content script
- [ ] Extract scraper functions from LinkedIn content script
- [ ] Integrate `intelligentNavigate()` into executor
- [ ] Feature flag for safe rollout
- [ ] Remove intermediate persistence calls from existing code
- [ ] Remove/refactor legacy `processJobQueue` code
- [ ] Remove legacy `content/agent-controller.ts` (commented out)

## Files to Modify/Create

### New Files
- `ui/src/background/orchestrator-v2.ts` - Main orchestrator logic
- `ui/src/content/executor-v2.ts` - Unified executor (replaces LinkedIn/ATS content script logic)

### Files to Modify
- `ui/src/background/index.ts` - Add orchestrator-v2 handler (behind feature flag)
- `ui/src/content/linkedin/index.ts` - Refactor to use executor-v2 commands
- `ui/src/content/ats/index.ts` - Refactor to use executor-v2 commands
- `ui/src/background/job-persistence.ts` - Remove intermediate persistence, keep only `persistJobCompleted`

### Files to Review/Remove
- `ui/src/content/agent-controller.ts` - Legacy, commented out, can be removed

## Integration with Existing Code

### intelligentNavigate()
- Located in `ui/src/content/ats/navigator.ts`
- **Keep as-is** - this is the core form filling logic
- Called by executor via `FILL_FORM` command
- Handles both LinkedIn modals and external ATS pages
- Internal classification loop handles: form, modal, intermediate, captcha, signup, unknown

### Job Persistence
- Located in `ui/src/background/job-persistence.ts`
- Current functions: `persistJobQueued`, `persistJobApplying`, `persistJobAtsFilling`, `persistJobCompleted`
- **Action**: Remove first 3, keep only `persistJobCompleted` (or rename for clarity)

### Sidepanel Integration
- `ui/src/sidepanel/App.tsx` - `startAgent()` function (line ~732)
- Currently opens tabs and sends `START_AGENT` message
- **Action**: Keep tab opening logic here, orchestrator receives message with tabs already open

## Next Steps

1. **Create orchestrator-v2.ts skeleton** with state structure and step handlers
2. **Create executor-v2.ts** with command handlers (SCRAPE_JOBS, CLICK_JOB_BY_ID, etc.)
3. **Extract scraper functions** from LinkedIn content script
4. **Implement Step 1-2** (START_AGENT, SCRAPE_JOBS) as proof of concept
5. **Add feature flag** to toggle between old and new flow
6. **Test sequentially** with one job, then expand to full flow
7. **Migrate remaining steps** one by one
8. **Remove legacy code** once new flow is stable

## Notes

- The flow document (`ORCHESTRATOR_V2_FLOW.md`) is the source of truth for implementation
- All 14 steps are fully specified with executor commands, background actions, and transitions
- Error paths all lead to Step 13 (SKIP_TO_NEXT_JOB) which increments index and continues
- Both modal and external ATS flows converge at Step 8 (PERSIST_COMPLETION)
- Only terminal statuses (completed/failed/skipped) are persisted to IndexedDB




