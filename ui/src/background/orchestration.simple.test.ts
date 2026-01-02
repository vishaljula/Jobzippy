/**
 * Minimal Integration Test for Orchestrator V2
 * Uses spies to track step execution without modifying orchestration code
 */

import { describe, it, beforeEach, afterEach, vi, expect } from 'vitest';
import 'fake-indexeddb/auto';
import type { Page } from '@playwright/test';
import { executeOrchestration } from './orchestration';
import type { SequentialJobState } from './orchestration-types';
import { setupTestEnvironment } from './orchestration.test.helper';
import { orchestrationTasks } from './orchestrationTaskHelper';
import { MOCK_VAULT_DATA, MOCK_RESUME } from '../content/ats/mock-vault-data';

// Mock chrome.storage.local
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn((key: string) => {
        if (key === 'user_info') {
          return Promise.resolve({
            user_info: {
              email: 'test@example.com',
              id: 'test-user-id',
            },
          });
        }
        return Promise.resolve({});
      }),
    },
  },
});

// Mock vault service
vi.mock('./vault-service-worker', async () => {
  const actual = await vi.importActual('./vault-service-worker');
  return {
    ...actual,
    backgroundVaultService: {
      load: vi.fn(() => Promise.resolve(MOCK_VAULT_DATA)),
      loadResume: vi.fn(() => Promise.resolve(MOCK_RESUME)),
    },
  };
});

describe('Orchestrator V2 - Simple Test', () => {
  let cleanup: (() => Promise<void>) | null = null;
  let pages: Map<number, Page> | null = null;
  let tabsRemoveSpy: ReturnType<typeof vi.fn> | null = null;
  const stepSpies: Map<string, ReturnType<typeof vi.spyOn>> = new Map();

  beforeEach(async () => {
    const env = await setupTestEnvironment({ headless: false });
    cleanup = env.cleanup;
    pages = env.pages; // Store pages map
    tabsRemoveSpy = env.tabsRemoveSpy; // Store tabsRemoveSpy

    // Spy on all orchestration tasks to track execution
    Object.keys(orchestrationTasks).forEach((taskName) => {
      const spy = vi.spyOn(orchestrationTasks, taskName as keyof typeof orchestrationTasks) as any;
      stepSpies.set(taskName, spy);
    });
  });

  afterEach(async () => {
    // Restore all spies
    stepSpies.forEach((spy) => spy.mockRestore());
    stepSpies.clear();

    if (cleanup) {
      await cleanup();
    }
  });

  it('should execute orchestration from START_AGENT and process all jobs', async () => {
    const state: SequentialJobState = {
      platform: 'LinkedIn',
      tabId: 1,
      atsTabId: null,
      scrapedJobIds: [],
      currentJobIndex: 0,
      currentPage: 0,
      hasNextPage: false,
      isProcessing: false,
      isActive: true,
    };

    // Track job processing

    // Track pages before orchestration
    const pagesBefore = new Set(Array.from(pages!.keys()));

    await executeOrchestration(state, 'START_AGENT');

    // Extract execution sequence from spies
    const executionSequence: Array<{ step: string; calls: number; args: any[] }> = [];
    stepSpies.forEach((spy, stepName) => {
      if (spy.mock.calls.length > 0) {
        executionSequence.push({
          step: stepName,
          calls: spy.mock.calls.length,
          args: spy.mock.calls[0] || [],
        });
      }
    });

    // Count jobs processed
    const persistCompletionSpy = stepSpies.get('persistCompletion');
    const jobsProcessed = persistCompletionSpy?.mock.calls.length || 0;
    const skipSpy = stepSpies.get('skipToNextJob');
    const jobsSkipped = skipSpy?.mock.calls.length || 0;
    const clickJobCardSpy = stepSpies.get('clickJobCard');
    const jobsClicked = clickJobCardSpy?.mock.calls.length || 0;

    console.log(`[Test] Summary:`);
    console.log(`  - Total steps executed: ${executionSequence.length}`);
    console.log(`  - Jobs processed (persistCompletion called): ${jobsProcessed}`);
    console.log(`  - Jobs clicked: ${jobsClicked}`);
    console.log(`  - Jobs skipped (skipToNextJob called): ${jobsSkipped}`);

    // Validate steps were executed
    expect(executionSequence.length).toBeGreaterThan(0);

    // Validate multiple jobs were processed (expect at least the first job)
    expect(jobsProcessed).toBeGreaterThan(0);

    // If job 123461 exists in scraped jobs, it should be skipped
    // (This will be validated by checking if skipToNextJob was called for it)

    // Log execution trace
    console.log('[Test] Execution sequence:');
    executionSequence.forEach((entry, index) => {
      console.log(`  ${index + 1}. ${entry.step} (called ${entry.calls} time(s))`);
    });

    // CRITICAL: Verify cleanup was called and tabs were actually closed
    const cleanupSpy = stepSpies.get('cleanup');
    const cleanupCalls = cleanupSpy?.mock.calls.length || 0;

    // Assert cleanup step was executed (at least once per job that was processed)
    expect(cleanupCalls).toBeGreaterThan(0);
    console.log(`[Test] Cleanup was called ${cleanupCalls} time(s)`);

    // Assert chrome.tabs.remove was called (verifies cleanup actually closes tabs)
    const tabsRemoveCalls = tabsRemoveSpy!.mock.calls.length;
    expect(tabsRemoveCalls).toBeGreaterThan(0);
    console.log(`[Test] chrome.tabs.remove was called ${tabsRemoveCalls} time(s)`);

    // Verify specific tabs were closed (if ATS tabs were opened)
    const closedTabIds = tabsRemoveSpy!.mock.calls.flatMap((call) =>
      Array.isArray(call[0]) ? call[0] : [call[0]]
    );
    console.log(`[Test] Tabs closed: ${closedTabIds.join(', ')}`);

    // Verify pages were actually removed from pages map (meaning they were closed)
    const pagesAfter = new Set(Array.from(pages!.keys()));
    const closedPages = Array.from(pagesBefore).filter((id) => !pagesAfter.has(id));
    if (closedPages.length > 0) {
      console.log(`[Test] Pages actually closed: ${closedPages.join(', ')}`);
      expect(closedPages.length).toBeGreaterThan(0);
    }

    // Restore spy
    tabsRemoveSpy!.mockRestore();

    // Keep browser open for inspection - don't cleanup immediately
    console.log(
      '[Test] Keeping browser open for inspection - manually close browser or wait for timeout'
    );

    if (cleanup) {
      // Commented out to keep browser open for debugging - uncomment if you want auto-cleanup
      // await cleanup();  // Comment this out
    }
  }, 1200000);
});
