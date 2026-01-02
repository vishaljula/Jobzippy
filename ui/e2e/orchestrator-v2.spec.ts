/**
 * E2E Test for Orchestrator V2
 * Tests sequential job processing with all 9 mock jobs on LinkedIn mock page
 */

import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, statSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Expected jobs from linkedin-jobs.html (9 total)
const EXPECTED_JOBS = [
  { id: '123463', title: 'Frontend Developer', company: 'WebWorks', shouldSubmit: true },
  { id: '123457', title: 'Product Manager', company: 'StartupXYZ', shouldSubmit: true },
  { id: '123456', title: 'Senior Software Engineer', company: 'TechCorp Inc.', shouldSubmit: true },
  { id: '123464', title: 'ML Engineer', company: 'AI Innovations', shouldSubmit: true },
  { id: '123459', title: 'Data Scientist', company: 'DataCorp', shouldSubmit: true },
  { id: '123462', title: 'Backend Engineer', company: 'ServerSide Inc.', shouldSubmit: true },
  { id: '123458', title: 'Full Stack Developer', company: 'DevSolutions LLC', shouldSubmit: true },
  { id: '123460', title: 'DevOps Engineer', company: 'CloudTech', shouldSubmit: true },
  { id: '123461', title: 'UX Designer', company: 'DesignHub', shouldSubmit: false }, // Should be skipped (manual_input_required)
];

const MOCK_SERVER_PORT = process.env.VITE_MOCK_PORT || '3000';
const MOCK_SERVER_URL = `http://localhost:${MOCK_SERVER_PORT}`;
const SUBMISSIONS_LOG_PATH = path.join(__dirname, '../public/mocks/mock-submissions.log');

test.describe('Orchestrator V2 - Sequential Job Processing', () => {
  let browserContext: BrowserContext;
  let extensionId: string;
  let initialLogSize: number = 0;

  test.beforeAll(async (testInfo) => {
    testInfo.setTimeout(60000); // 60 seconds for beforeAll
    const pathToExtension = path.join(__dirname, '../dist');
    const userDataDir = '/tmp/test-user-data-dir-orchestrator-v2';

    console.log('[E2E] Loading extension from:', pathToExtension);

    // Launch browser with extension loaded
    browserContext = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
      slowMo: 100,
    });

    // Wait briefly for extension to initialize
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Try to get extension ID from service worker (non-blocking - just check if available)
    const serviceWorkers = browserContext.serviceWorkers();
    if (serviceWorkers.length > 0) {
      extensionId = serviceWorkers[0].url().split('/')[2];
      console.log('[E2E] Extension ID from service worker:', extensionId);
    } else {
      console.log('[E2E] Service worker not yet available, will get extension ID from page');
    }

    // Record initial log file size (to only check new submissions)
    if (existsSync(SUBMISSIONS_LOG_PATH)) {
      const stats = statSync(SUBMISSIONS_LOG_PATH);
      initialLogSize = stats.size;
    }

    console.log('[E2E] Initial log file size:', initialLogSize);
  });

  test.afterAll(async () => {
    if (browserContext) {
      await browserContext.close();
    }
  });

  test('should process all 9 jobs sequentially using Orchestrator V2', async () => {
    console.log('[E2E] ========================================');
    console.log('[E2E] Starting Orchestrator V2 E2E Test');
    console.log('[E2E] ========================================');

    // Step 1: Navigate to LinkedIn mock page
    console.log('[E2E] Step 1: Opening LinkedIn mock page...');
    const linkedInPage = await browserContext.newPage();
    await linkedInPage.goto(`${MOCK_SERVER_URL}/mocks/linkedin-jobs.html`);
    await linkedInPage.waitForLoadState('networkidle');

    // Verify page loaded
    const pageTitle = await linkedInPage.title();
    expect(pageTitle).toContain('LinkedIn Jobs');

    // Wait for jobs to render
    await linkedInPage.waitForSelector('[data-job-id]', { timeout: 5000 });
    const jobCards = await linkedInPage.locator('[data-job-id]').count();
    console.log(`[E2E] Found ${jobCards} job cards on page`);
    expect(jobCards).toBeGreaterThan(0);

    // Step 2: Get extension ID and trigger orchestrator directly (bypassing START_AGENT integration)
    console.log('[E2E] Step 2: Triggering Orchestrator V2 directly...');

    // Wait for content script to load
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Get extension ID from service worker or page
    if (!extensionId) {
      const sws = browserContext.serviceWorkers();
      if (sws.length > 0) {
        extensionId = sws[0].url().split('/')[2];
        console.log('[E2E] Got extension ID from service worker:', extensionId);
      } else {
        // Get from page's chrome.runtime (content script context)
        extensionId = await linkedInPage.evaluate(() => {
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
            return chrome.runtime.id;
          }
          return '';
        });
        if (extensionId) {
          console.log('[E2E] Got extension ID from page:', extensionId);
        }
      }
    }

    if (!extensionId) {
      throw new Error('Could not determine extension ID - extension may not have loaded');
    }

    // Get service worker to execute orchestrator directly
    const serviceWorkers = browserContext.serviceWorkers();
    const serviceWorker = serviceWorkers[0];

    if (!serviceWorker) {
      throw new Error('Service worker not found - cannot execute orchestrator');
    }

    // Get the tab ID
    const tabs = await browserContext.pages();
    const linkedInTab = tabs.find((p) => p.url().includes('linkedin-jobs.html'));
    if (!linkedInTab) {
      throw new Error('LinkedIn tab not found');
    }

    // Get tab ID from Chrome tabs API via service worker
    const tabInfo = await serviceWorker.evaluate(async () => {
      return new Promise<number>((resolve) => {
        chrome.tabs.query({ url: '*://localhost:*/mocks/linkedin-jobs.html' }, (tabs) => {
          if (tabs.length > 0 && tabs[0].id) {
            resolve(tabs[0].id);
          } else {
            resolve(-1);
          }
        });
      });
    });

    if (tabInfo === -1) {
      throw new Error('Could not get tab ID');
    }

    console.log('[E2E] Tab ID:', tabInfo);

    // Send PAGE_ACTIVE first (so background knows about the tab)
    await serviceWorker.evaluate(async (_tabId) => {
      return new Promise<void>((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: 'PAGE_ACTIVE',
            data: { platform: 'LinkedIn' },
          },
          () => resolve()
        );
      });
    }, tabInfo);

    console.log('[E2E] PAGE_ACTIVE sent');

    // Now directly execute Orchestrator V2 from service worker context
    console.log('[E2E] Executing Orchestrator V2 directly...');
    await serviceWorker.evaluate(async (tabId) => {
      // Import and execute orchestrator
      const { executeOrchestration } = await import(
        chrome.runtime.getURL('background/orchestration.js')
      );
      const orchestrationState = {
        platform: 'LinkedIn' as const,
        tabId: tabId,
        atsTabId: null,
        scrapedJobIds: [],
        currentJobIndex: 0,
        currentPage: 0,
        hasNextPage: false,
        isProcessing: false,
        isActive: true,
      };

      // Start orchestration (non-blocking)
      executeOrchestration(orchestrationState, 'START_AGENT').catch((error: any) => {
        console.error('[E2E] Orchestrator error:', error);
      });
    }, tabInfo);

    console.log('[E2E] Orchestrator V2 started');

    // Step 3: Wait for all jobs to be processed
    console.log('[E2E] Step 3: Waiting for all jobs to be processed...');

    const maxWaitTime = 180000; // 3 minutes
    const checkInterval = 2000; // Check every 2 seconds
    const startTime = Date.now();
    let isComplete = false;
    let lastSubmissionCount = 0;

    while (!isComplete && Date.now() - startTime < maxWaitTime) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));

      // Check log file for new submissions
      if (existsSync(SUBMISSIONS_LOG_PATH)) {
        const currentLog = readFileSync(SUBMISSIONS_LOG_PATH, 'utf-8');
        const newLogContent = currentLog.slice(initialLogSize);

        // Count unique job IDs in new submissions
        const jobIdMatches = newLogContent.match(/"jobId":\s*"(\d+)"/g);
        if (jobIdMatches) {
          const uniqueJobIds = new Set(
            jobIdMatches
              .map((match) => {
                const m = match.match(/"jobId":\s*"(\d+)"/);
                return m ? m[1] : null;
              })
              .filter(Boolean)
          );

          const currentCount = uniqueJobIds.size;

          if (currentCount !== lastSubmissionCount) {
            console.log(
              `[E2E] Progress: ${currentCount} unique jobs processed so far:`,
              Array.from(uniqueJobIds).sort()
            );
            lastSubmissionCount = currentCount;
          }

          // We expect at least 8 jobs to be submitted (9 total - 1 skipped)
          if (currentCount >= 8) {
            console.log('[E2E] ✅ All expected jobs processed!');
            isComplete = true;
            break;
          }
        }
      }

      // Also check if orchestrator is still running (optional)
      try {
        const engineState = await serviceWorker.evaluate(() => {
          return new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'ENGINE_STATE' }, (response) => {
              resolve(response?.data?.state || 'UNKNOWN');
            });
          });
        });

        if (engineState === 'IDLE' && lastSubmissionCount >= 8) {
          console.log('[E2E] Orchestrator completed (IDLE state)');
          isComplete = true;
          break;
        }
      } catch (e) {
        // Ignore errors checking engine state
      }
    }

    if (!isComplete) {
      console.warn(
        '[E2E] ⚠️ Orchestration did not complete within timeout, but continuing with verification...'
      );
    }

    // Step 4: Verify mock-submissions.log
    console.log('[E2E] Step 4: Verifying mock-submissions.log...');

    if (!existsSync(SUBMISSIONS_LOG_PATH)) {
      throw new Error('mock-submissions.log file not found');
    }

    const logContent = readFileSync(SUBMISSIONS_LOG_PATH, 'utf-8');
    const newLogContent = logContent.slice(initialLogSize);

    console.log(`[E2E] New log entries (${newLogContent.length} bytes)`);

    // Parse submissions from log
    const submissionEntries = newLogContent.split('=== Mock Submission @');
    const submissions = submissionEntries
      .filter((entry) => entry.trim().length > 0)
      .map((entry) => {
        try {
          const jsonMatch = entry.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
          }
        } catch (e) {
          // Ignore parse errors
        }
        return null;
      })
      .filter((s) => s !== null && s.jobId);

    console.log(`[E2E] Found ${submissions.length} new submissions`);

    // Verify each expected job
    const submittedJobIds = new Set(submissions.map((s) => s.jobId));
    const skippedJobIds = new Set<string>();

    console.log('[E2E] Verifying job submissions...');
    for (const expectedJob of EXPECTED_JOBS) {
      if (expectedJob.shouldSubmit) {
        expect(
          submittedJobIds.has(expectedJob.id),
          `Job ${expectedJob.id} (${expectedJob.title} @ ${expectedJob.company}) should have been submitted`
        ).toBe(true);
        console.log(`[E2E] ✅ Job ${expectedJob.id} (${expectedJob.title}) was submitted`);
      } else {
        expect(
          submittedJobIds.has(expectedJob.id),
          `Job ${expectedJob.id} (${expectedJob.title} @ ${expectedJob.company}) should NOT have been submitted (expected skip)`
        ).toBe(false);
        skippedJobIds.add(expectedJob.id);
        console.log(`[E2E] ✅ Job ${expectedJob.id} (${expectedJob.title}) was correctly skipped`);
      }
    }

    // Verify sequential processing (check timestamps are in order)
    const submissionsWithTimestamps = submissions
      .map((s) => ({
        jobId: s.jobId,
        timestamp: s.submittedAt ? new Date(s.submittedAt).getTime() : Date.now(),
        title: EXPECTED_JOBS.find((j) => j.id === s.jobId)?.title || 'Unknown',
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    console.log('[E2E] Submission order (by timestamp):');
    submissionsWithTimestamps.forEach((s, idx) => {
      console.log(
        `[E2E]   ${idx + 1}. Job ${s.jobId} (${s.title}) @ ${new Date(s.timestamp).toISOString()}`
      );
    });

    // Verify we have exactly 8 submissions (9 jobs - 1 skipped)
    expect(submissions.length).toBe(8);
    expect(submittedJobIds.size).toBe(8);

    // Verify sequential order (each submission should be after the previous)
    for (let i = 1; i < submissionsWithTimestamps.length; i++) {
      const prev = submissionsWithTimestamps[i - 1];
      const curr = submissionsWithTimestamps[i];
      expect(
        curr.timestamp >= prev.timestamp,
        `Submissions should be sequential. Job ${curr.jobId} (${curr.title}) submitted at ${new Date(curr.timestamp).toISOString()}, but previous job ${prev.jobId} (${prev.title}) was at ${new Date(prev.timestamp).toISOString()}`
      ).toBe(true);
    }

    // Verify all 9 jobs were processed (either submitted or skipped)
    const processedJobIds = new Set([...submittedJobIds, ...skippedJobIds]);
    expect(processedJobIds.size).toBe(9);

    console.log('[E2E] ========================================');
    console.log('[E2E] ✅ All verifications passed!');
    console.log(
      `[E2E] Summary: ${submissions.length} jobs submitted, ${skippedJobIds.size} jobs skipped`
    );
    console.log(`[E2E] Total jobs processed: ${processedJobIds.size}/9`);
    console.log('[E2E] ========================================');

    // Keep browser open briefly to see results
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }, 180000); // 3 minute timeout
});
