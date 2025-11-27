# Proposed Architecture v2 - Event-Driven, Single Source of Truth

## Core Principles

1. **Single Source of Truth**: Background script owns ALL job session state
2. **Event-Driven**: No polling, use events/messages
3. **DOM-Based Waits**: Replace arbitrary sleeps with DOM readiness checks
4. **Clear Separation**: Content scripts = DOM logic, Background = orchestration

---

## Architecture Overview

### Three Roles (Unchanged)
- **LinkedIn Content Script**: DOM agent on LinkedIn, handles modal forms
- **Background Script**: Tab manager + cross-tab orchestrator + state owner
- **ATS Content Script**: DOM agent on external ATS, handles external forms

---

## Key Data Structures

### Background Script: JobSession (Single Source of Truth)

```typescript
type JobSessionStatus = 
  | 'pending'           // Job started, waiting for Apply click result
  | 'linkedin-modal'   // LinkedIn modal detected, filling locally
  | 'ats-opened'       // External ATS tab opened
  | 'ats-filling'      // ATS content script injected, filling form
  | 'ats-complete'     // ATS form submitted successfully
  | 'failed';          // Failed or timed out

interface JobSession {
  jobId: string;
  sourceTabId: number;        // LinkedIn tab ID
  atsTabId?: number;          // External ATS tab ID (if external)
  status: JobSessionStatus;
  startedAt: number;
  timerId?: number;           // Single timeout for entire ATS flow
  result?: {
    success: boolean;
    error?: string;
  };
}

const jobSessions = new Map<string, JobSession>(); // keyed by jobId
```

### LinkedIn Content Script: Minimal State

```typescript
// Only tracks promises waiting for completion
const pendingJobs = new Map<string, {
  resolve: (result: { success: boolean; error?: string }) => void;
  reject: (error: Error) => void;
  timeoutId?: number;
}>();

// Counters (not session state)
let jobsApplied = 0;
let lastJobAppliedTime = Date.now();
```

---

## Message Types

### From LinkedIn to Background

```typescript
// Start a job application
APPLY_JOB_START: {
  type: 'APPLY_JOB_START';
  data: {
    jobId: string;
    sourceTabId: number;
  };
}

// LinkedIn modal completed (success/failure)
JOB_COMPLETED: {
  type: 'JOB_COMPLETED';
  data: {
    jobId: string;
    success: boolean;
    error?: string;
  };
}
```

### From Background to LinkedIn

```typescript
// External ATS tab was opened
EXTERNAL_ATS_OPENED: {
  type: 'EXTERNAL_ATS_OPENED';
  data: {
    jobId: string;
    atsTabId: number;
  };
}

// External ATS flow completed
EXTERNAL_ATS_DONE: {
  type: 'EXTERNAL_ATS_DONE';
  data: {
    jobId: string;
    success: boolean;
    error?: string;
  };
}
```

### From Background to ATS Tab

```typescript
// Command to fill external ATS form
FILL_EXTERNAL_ATS: {
  type: 'FILL_EXTERNAL_ATS';
  data: {
    jobId: string;
  };
}
```

### From ATS Tab to Background

```typescript
// ATS content script ready
ATS_CONTENT_SCRIPT_READY: {
  type: 'ATS_CONTENT_SCRIPT_READY';
  data: {
    jobId: string;  // Passed via URL param or background lookup
  };
}

// ATS form completed
ATS_COMPLETE: {
  type: 'ATS_COMPLETE';
  data: {
    jobId: string;
    success: boolean;
    error?: string;
  };
}
```

---

## Complete Flow: Event-Driven

### PHASE 1: Job Start (LinkedIn Tab)

**Step 1: Register Job with Background**
```typescript
// In processJob()
await chrome.runtime.sendMessage({
  type: 'APPLY_JOB_START',
  data: { jobId: job.id, sourceTabId: currentTabId }
});

// Background creates JobSession:
// { jobId, sourceTabId, status: 'pending', startedAt: Date.now() }
```

**Step 2: Setup Promise BEFORE Clicking**
```typescript
const jobPromise = waitForJobCompletion(jobId);
// Stores resolve/reject in pendingJobs map
```

**Step 3: Click Job Card (DOM-Based Wait)**
```typescript
await clickJobCard(job);
await waitForJobDetailsDom(); // DOM-based, not sleep(1500)
// Uses MutationObserver or polling with DOM checks
```

**Step 4: Click Apply Button**
```typescript
await clickApplyButton();
// No APPLY_CLICK_START needed - background already knows job started
```

**Step 5: Race Between Modal vs External Tab**
```typescript
const outcome = await Promise.race([
  waitForLinkedInModal(),                    // DOM-based detection
  waitForMessage('EXTERNAL_ATS_OPENED', jobId) // Event from background
]);

if (outcome.type === 'LINKEDIN_MODAL') {
  // Handle inline modal
  const success = await intelligentNavigate();
  await chrome.runtime.sendMessage({
    type: 'JOB_COMPLETED',
    data: { jobId, success }
  });
} else if (outcome.type === 'EXTERNAL_ATS_OPENED') {
  // Wait for EXTERNAL_ATS_DONE
  const result = await jobPromise;
  // Promise resolves when background sends EXTERNAL_ATS_DONE
}
```

---

### PHASE 2: External ATS Detection (Background)

**Step 1: Detect New Tab**
```typescript
// webNavigation.onCreatedNavigationTarget listener
chrome.webNavigation.onCreatedNavigationTarget.addListener((details) => {
  const session = findJobSessionBySourceTab(details.sourceTabId);
  if (!session || session.status !== 'pending') return;
  
  if (isATSUrl(details.url)) {
    session.atsTabId = details.tabId;
    session.status = 'ats-opened';
    
    // Immediately notify LinkedIn tab
    chrome.tabs.sendMessage(session.sourceTabId, {
      type: 'EXTERNAL_ATS_OPENED',
      data: { jobId: session.jobId, atsTabId: details.tabId }
    });
    
    // Set single timeout for entire ATS flow
    session.timerId = setTimeout(() => {
      handleATSTimeout(session.jobId);
    }, 180000); // 3 minutes
  }
});
```

**Step 2: Inject ATS Content Script**
```typescript
// chrome.tabs.onUpdated listener
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  
  const session = findJobSessionByATSTab(tabId);
  if (!session || session.status !== 'ats-opened') return;
  
  // Inject content script
  chrome.scripting.executeScript({
    target: { tabId },
    files: ['content/content-ats.js']
  });
  
  session.status = 'ats-filling';
});
```

---

### PHASE 3: ATS Content Script (External Tab)

**Step 1: Send Ready Signal**
```typescript
// On load
const jobId = extractJobIdFromUrl(); // or get from background
chrome.runtime.sendMessage({
  type: 'ATS_CONTENT_SCRIPT_READY',
  data: { jobId }
});
```

**Step 2: Receive Fill Command**
```typescript
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'FILL_EXTERNAL_ATS') {
    intelligentNavigate()
      .then((result) => {
        chrome.runtime.sendMessage({
          type: 'ATS_COMPLETE',
          data: {
            jobId: message.data.jobId,
            success: result.success,
            error: result.message
          }
        });
      });
  }
});
```

---

### PHASE 4: Completion (Background)

**Step 1: Handle ATS Complete**
```typescript
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'ATS_COMPLETE') {
    const session = jobSessions.get(message.data.jobId);
    if (!session) return;
    
    session.status = 'ats-complete';
    session.result = {
      success: message.data.success,
      error: message.data.error
    };
    
    // Clear timeout
    if (session.timerId) {
      clearTimeout(session.timerId);
    }
    
    // Notify LinkedIn tab
    chrome.tabs.sendMessage(session.sourceTabId, {
      type: 'EXTERNAL_ATS_DONE',
      data: {
        jobId: session.jobId,
        success: message.data.success,
        error: message.data.error
      }
    });
    
    // Close ATS tab after delay
    if (session.atsTabId) {
      setTimeout(() => {
        chrome.tabs.remove(session.atsTabId!);
      }, 1000);
    }
    
    // Cleanup
    jobSessions.delete(session.jobId);
  }
});
```

**Step 2: LinkedIn Resolves Promise**
```typescript
// In LinkedIn content script
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'EXTERNAL_ATS_DONE') {
    const pending = pendingJobs.get(message.data.jobId);
    if (pending) {
      if (message.data.success) {
        pending.resolve({ success: true });
        jobsApplied++;
        lastJobAppliedTime = Date.now();
      } else {
        pending.reject(new Error(message.data.error || 'ATS failed'));
      }
      pendingJobs.delete(message.data.jobId);
    }
  }
});
```

---

## DOM-Based Waits (Replace Sleeps)

### waitForJobDetailsDom()
```typescript
async function waitForJobDetailsDom(timeoutMs = 5000): Promise<void> {
  const start = performance.now();
  
  while (performance.now() - start < timeoutMs) {
    // LinkedIn-specific selectors
    const panel = document.querySelector('[data-job-details-panel]') ||
                  document.querySelector('.jobs-details__main-content');
    
    if (panel) {
      const title = panel.querySelector('h2, [data-job-title], .jobs-details-top-card__job-title');
      if (title && title.textContent?.trim()) {
        return; // Job details loaded
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  throw new Error('Job details panel did not load within timeout');
}
```

### waitForLinkedInModal()
```typescript
async function waitForLinkedInModal(timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const start = performance.now();
    
    // Check immediately
    if (isModalVisible()) {
      resolve(true);
      return;
    }
    
    // Watch for modal appearance
    const observer = new MutationObserver(() => {
      if (isModalVisible()) {
        observer.disconnect();
        resolve(true);
      } else if (performance.now() - start > timeoutMs) {
        observer.disconnect();
        resolve(false);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Timeout fallback
    setTimeout(() => {
      observer.disconnect();
      resolve(false);
    }, timeoutMs);
  });
}

function isModalVisible(): boolean {
  const modal = document.querySelector('.jobs-easy-apply-modal') ||
                document.querySelector('[data-test-modal]') ||
                document.querySelector('.jobs-easy-apply-content');
  return modal !== null && 
         window.getComputedStyle(modal).display !== 'none';
}
```

### waitForMessage()
```typescript
function waitForMessage(
  messageType: string,
  jobId: string,
  timeoutMs = 10000
): Promise<{ type: string; data: any }> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Timeout waiting for ${messageType} for job ${jobId}`));
    }, timeoutMs);
    
    const listener = (message: any) => {
      if (message.type === messageType && message.data?.jobId === jobId) {
        clearTimeout(timeoutId);
        chrome.runtime.onMessage.removeListener(listener);
        resolve(message);
      }
    };
    
    chrome.runtime.onMessage.addListener(listener);
  });
}
```

---

## Migration Strategy

### Phase 1: Add New Architecture (Non-Breaking)
1. Add `JobSession` type and `jobSessions` map to background
2. Add new message handlers alongside old ones
3. Add DOM-based wait functions
4. Keep old code running

### Phase 2: Migrate LinkedIn Tab
1. Update `processJob()` to use new flow
2. Remove polling (`CHECK_NEW_TAB`)
3. Remove `pendingExternalATS` map
4. Use `waitForJobCompletion()` instead

### Phase 3: Migrate Background Script
1. Move all state to `jobSessions`
2. Remove `externalATSJobs`, `pendingATSTabs`, `applyClickRecords`
3. Update all handlers to use `JobSession`

### Phase 4: Cleanup
1. Remove old message types
2. Remove old state maps
3. Remove old polling code

---

## Benefits

1. **No Race Conditions**: Promise stored before click, background owns state
2. **No Polling**: Pure event-driven
3. **Robust Waits**: DOM-based instead of arbitrary sleeps
4. **Single Source of Truth**: All state in background
5. **Easier Debugging**: One place to check job status
6. **Better Error Handling**: Centralized timeout management

---

## Testing Strategy

### Unit Tests (TDD)
1. Test `waitForJobDetailsDom()` with mock DOM
2. Test `waitForLinkedInModal()` with mock mutations
3. Test `waitForMessage()` with mock messages
4. Test `JobSession` state transitions

### Integration Tests
1. Test full LinkedIn modal flow
2. Test full external ATS flow
3. Test timeout handling
4. Test error recovery

### Manual Testing Checklist
- [ ] LinkedIn modal form fills correctly
- [ ] External ATS tab detected immediately
- [ ] Promise resolves when ATS completes
- [ ] Timeout works correctly
- [ ] Multiple jobs process sequentially
- [ ] No false "applied" marks

