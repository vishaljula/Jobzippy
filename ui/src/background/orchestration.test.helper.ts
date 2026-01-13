/**
 * Test Helper: Chrome Extension API Mocks and Executor Injection
 *
 * Provides utilities to set up Chrome extension APIs in test environment
 * and inject the executor content script into Playwright pages.
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { execSync } from 'child_process'; // Fixed: execSync is from child_process, not fs
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Page, Browser } from 'playwright';
import { vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXECUTOR_BUILD_PATH = join(__dirname, '../../dist/content/executor-v2.js');
const EXECUTOR_SOURCE_PATH = join(__dirname, '../content/executor-v2.ts');
const PROJECT_ROOT = join(__dirname, '../..');

/**
 * Check if source file is newer than built file
 */
function isSourceNewer(): boolean {
  if (!existsSync(EXECUTOR_BUILD_PATH)) {
    return true; // Build doesn't exist, need to build
  }

  if (!existsSync(EXECUTOR_SOURCE_PATH)) {
    return false; // Source doesn't exist (shouldn't happen)
  }

  const sourceStat = statSync(EXECUTOR_SOURCE_PATH);
  const buildStat = statSync(EXECUTOR_BUILD_PATH);

  return sourceStat.mtime > buildStat.mtime;
}

/**
 * Ensure executor-v2 is built before tests
 * Automatically builds if missing or if source is newer
 */
export function ensureExecutorBuilt(): void {
  if (isSourceNewer()) {
    const reason = existsSync(EXECUTOR_BUILD_PATH)
      ? 'Source file is newer than build'
      : 'Executor build not found';
    console.log(`[Test Helper] ${reason}. Building executor-v2 automatically...`);
    try {
      execSync('npm run build:executor-v2', {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
      });
      console.log('[Test Helper] ✓ Executor built successfully');
    } catch (error) {
      console.error('[Test Helper] ✗ Failed to build executor-v2 automatically');
      console.error('[Test Helper] Please run manually: npm run build:executor-v2');
      throw error;
    }
  }
}

/**
 * Load executor code from built bundle
 * Automatically builds if missing or if source is newer
 */
function loadExecutorCode(): string {
  // Auto-build if missing or outdated
  ensureExecutorBuilt();

  if (!existsSync(EXECUTOR_BUILD_PATH)) {
    throw new Error(`Executor build failed. Please run: npm run build:executor-v2`);
  }

  return readFileSync(EXECUTOR_BUILD_PATH, 'utf-8');
}

/**
 * Set up Chrome API mocks in page context and inject executor
 */
async function injectExecutorIntoPage(page: Page): Promise<void> {
  const executorCode = loadExecutorCode();

  await page.evaluate((code) => {
    // Set up Chrome API mocks BEFORE executor code runs
    (window as any).chrome = {
      runtime: {
        sendMessage: (message: any, callback?: (response: any) => void) => {
          return new Promise((resolve, reject) => {
            try {
              // Executor sending message to background (e.g., JOB_COMPLETED, ATS_COMPLETE, OPEN_ATS_TAB)
              // Add to pending messages queue for Node.js polling to pick up
              (window as any).__pendingExecutorMessages =
                (window as any).__pendingExecutorMessages || [];
              (window as any).__pendingExecutorMessages.push(message);

              // Also dispatch event for backwards compatibility
              const event = new CustomEvent('executor-to-background', {
                detail: message,
              });
              window.dispatchEvent(event);

              // Message successfully dispatched - resolve Promise
              const response = { success: true };
              if (callback) {
                setTimeout(() => callback(response), 0);
              }
              resolve(response);
            } catch (error) {
              // If event dispatch fails, reject Promise
              const errorResponse = { success: false, error: String(error) };
              if (callback) {
                setTimeout(() => callback(errorResponse), 0);
              }
              reject(error);
            }
          });
        },
        onMessage: {
          addListener: (handler: any) => {
            (window as any).__executorMessageListeners =
              (window as any).__executorMessageListeners || [];
            (window as any).__executorMessageListeners.push(handler);
          },
          removeListener: (handler: any) => {
            const listeners = (window as any).__executorMessageListeners || [];
            const index = listeners.indexOf(handler);
            if (index > -1) listeners.splice(index, 1);
          },
        },
        id: 'test-extension-id',
      },
    };

    // Create message bridge for background → executor communication
    (window as any).__executorResponseHandlers = new Map();

    // Listen for messages from background (via chrome.tabs.sendMessage mock)
    window.addEventListener('background-to-executor', async (event: any) => {
      const { message, messageId } = event.detail;
      const listeners = (window as any).__executorMessageListeners || [];

      if (listeners.length > 0) {
        const sender = {
          tab: { id: 1 },
          frameId: 0,
          id: 'test-extension-id',
          url: window.location.href,
        };

        // Call the executor's message handler
        for (const listener of listeners) {
          const sendResponse = (response: any) => {
            window.dispatchEvent(
              new CustomEvent('executor-to-background-response', {
                detail: { messageId, response },
              })
            );
          };

          const result = listener(message, sender, sendResponse);
          if (result === true) {
            // Async handler - sendResponse will be called later
            (window as any).__executorResponseHandlers.set(messageId, sendResponse);
          } else if (result !== undefined) {
            // Sync handler - send response immediately
            sendResponse(result);
          }
        }
      }
    });

    // Intercept link clicks that open new tabs (external ATS)
    // This mimics chrome.tabs.onCreated which fires immediately
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target as HTMLElement;
        const link = target.closest('a[target="_blank"]') as HTMLAnchorElement;

        if (link && link.href) {
          const href = link.href;
          // Check if it's an external ATS link
          if (
            href.includes('/mocks/') &&
            (href.includes('apply') || href.includes('workday') || href.includes('greenhouse'))
          ) {
            // Extract jobId from URL or stored context
            const jobIdMatch = href.match(/[?&]job=([^&]+)/);
            const jobId = jobIdMatch ? jobIdMatch[1] : (window as any).__currentJobId;

            if (jobId) {
              // Send EXTERNAL_ATS_OPENED immediately (mimicking chrome.tabs.onCreated)
              const message = {
                type: 'EXTERNAL_ATS_OPENED',
                data: {
                  jobId: jobId,
                  atsTabId: 2,
                  atsUrl: href,
                },
              };

              console.log(
                '[Test Helper] Intercepted external link click, sending EXTERNAL_ATS_OPENED:',
                message
              );

              // Trigger all message listeners immediately
              const listeners = (window as any).__executorMessageListeners || [];
              const sender = {
                tab: { id: 1 },
                frameId: 0,
                id: 'test-extension-id',
                url: window.location.href,
              };

              // Use setTimeout to ensure this happens after the click event propagates
              setTimeout(() => {
                for (const listener of listeners) {
                  try {
                    listener(message, sender, () => {});
                  } catch (error) {
                    console.error('[Test Helper] Error calling listener:', error);
                  }
                }
              }, 0);
            }
          }
        }
      },
      true
    ); // Use capture phase to intercept before default behavior

    // Inject the executor code
    eval(code);
  }, executorCode);
}

/**
 * Set up Chrome API mocks in Node.js context (for background script)
 * Now supports multiple tabs (tabId -> Page mapping)
 */
export function setupChromeAPIMocks(
  pages: Map<number, Page>, // Map of tabId -> Playwright Page
  pagesByJobId: Map<string, Page[]> // Map of jobId -> array of pages (for cleanup)
): {
  backgroundMessageListeners: Array<
    (message: any, sender: any, sendResponse: (response: any) => void) => void
  >;
  tabsRemoveSpy: ReturnType<typeof vi.fn>; // Expose the spy
  pages: Map<number, Page>; // Expose pages map for verification
  cleanup: () => void;
} {
  const backgroundMessageListeners: Array<
    (message: any, sender: any, sendResponse: (response: any) => void) => void
  > = [];
  let messagePollInterval: NodeJS.Timeout | null = null;

  // Mock chrome.tabs.sendMessage (background → executor)
  // Route to correct page based on tabId
  const tabsSendMessage = vi.fn(
    (tabId: number, message: any, callback?: (response: any) => void) => {
      return new Promise((resolve, reject) => {
        const targetPage = pages.get(tabId);
        if (!targetPage) {
          const error = `Tab ${tabId} not found in pages map`;
          console.error('[Test Mock]', error);
          if (callback) callback({ status: 'error', message: error });
          reject(new Error(error));
          return;
        }

        const messageId = Date.now() + Math.random();

        targetPage
          .evaluate(
            ({ message, messageId }) => {
              return new Promise((resolve) => {
                const handler = (event: any) => {
                  if (event.detail.messageId === messageId) {
                    window.removeEventListener('executor-to-background-response', handler);
                    resolve(event.detail.response);
                  }
                };
                window.addEventListener('executor-to-background-response', handler);

                // Trigger the message to executor
                window.dispatchEvent(
                  new CustomEvent('background-to-executor', {
                    detail: { message, messageId },
                  })
                );

                // Timeout after 30 seconds
                setTimeout(() => {
                  window.removeEventListener('executor-to-background-response', handler);
                  resolve({ status: 'error', message: 'Timeout waiting for executor response' });
                }, 30000);
              });
            },
            { message, messageId }
          )
          .then((response) => {
            if (callback) callback(response);
            resolve(response);
          })
          .catch((error) => {
            const errResponse = { status: 'error', message: String(error) };
            if (callback) callback(errResponse);
            reject(error);
          });
      });
    }
  );

  // Mock chrome.tabs.create
  const tabsCreate = vi.fn((options: any, callback?: (tab: any) => void) => {
    const tab = { id: 2, url: options.url };
    if (callback) callback(tab);
    return Promise.resolve(tab);
  });

  // Track all pages opened per job (job detail pages + ATS pages)
  // const pagesByJobId = new Map<string, Page[]>(); // jobId -> array of pages

  // Mock chrome.tabs.remove (close tab)
  const tabsRemove = vi.fn(async (tabId: number | number[], callback?: () => void) => {
    const tabIds = Array.isArray(tabId) ? tabId : [tabId];
    console.log(`[Test Mock] chrome.tabs.remove called for tabId(s): ${tabIds.join(', ')}`);

    const closePromises: Promise<void>[] = [];

    for (const id of tabIds) {
      const page = pages.get(id);
      if (page) {
        console.log(`[Test Mock] Closing and removing tab ${id} from pages map`);
        pages.delete(id);
        closePromises.push(
          page.close().catch((err) => {
            console.warn(`[Test Mock] Error closing page ${id}:`, err);
          })
        );
      } else {
        console.warn(`[Test Mock] Tab ${id} not found in pages map`);
      }

      // If closing ATS tab (tabId 2), also close all job detail pages for associated jobs
      if (id === 2) {
        // Close all pages (job detail + ATS) for all tracked jobs
        for (const [jobId, jobPages] of pagesByJobId.entries()) {
          console.log(
            `[Test Mock] Closing ${jobPages.length} page(s) associated with job ${jobId}`
          );
          for (const jobPage of jobPages) {
            // Don't double-close if it's already in the pages map (already handled above)
            if (!Array.from(pages.values()).includes(jobPage)) {
              closePromises.push(
                jobPage.close().catch((err) => {
                  console.warn(`[Test Mock] Error closing job detail page for job ${jobId}:`, err);
                })
              );
            }
          }
          pagesByJobId.delete(jobId);
        }
      }
    }

    await Promise.all(closePromises);
    console.log(`[Test Mock] Successfully closed ${tabIds.length} tab(s) and associated pages`);

    if (callback) callback();
  });

  // Mock chrome.runtime.sendMessage (background → UI)
  const runtimeSendMessage = vi.fn((message: any, callback?: (response: any) => void) => {
    console.log('[Test Mock] Background → UI:', message.type, message.data);
    if (callback) setTimeout(() => callback({}), 0);
    return Promise.resolve({});
  });

  // Mock chrome.runtime.onMessage (for background to receive messages from executor)
  const runtimeOnMessage = {
    addListener: vi.fn((handler: any) => {
      backgroundMessageListeners.push(handler);
    }),
    removeListener: vi.fn((handler: any) => {
      const index = backgroundMessageListeners.indexOf(handler);
      if (index > -1) backgroundMessageListeners.splice(index, 1);
    }),
  };

  // Start polling IMMEDIATELY to forward executor messages to background listeners
  // This is needed because the simple test doesn't call chrome.runtime.onMessage.addListener
  // but the executor still sends messages like OPEN_ATS_TAB via chrome.runtime.sendMessage
  messagePollInterval = setInterval(async () => {
    const mainPage = pages.get(1);
    if (!mainPage) return;

    let messages;
    try {
      messages = await mainPage.evaluate(() => {
        // Poll from the main LinkedIn page
        const pending = (window as any).__pendingExecutorMessages || [];
        (window as any).__pendingExecutorMessages = [];
        return pending;
      });
    } catch (error) {
      // Page might be closed or navigating
      return;
    }

    if (messages) {
      for (const message of messages) {
        // Handle OPEN_ATS_TAB specially - open the page via window.open
        if (message.type === 'OPEN_ATS_TAB' && message.data?.url && message.data?.jobId) {
          console.log(
            `[Test Mock] Handling OPEN_ATS_TAB: ${message.data.url} for job ${message.data.jobId}`
          );

          try {
            // Store jobId in window before opening so it can be retrieved
            await mainPage.evaluate(
              ({ url, jobId }) => {
                (window as any).__currentJobId = jobId;
                // Open new tab via window.open - this triggers context.on('page')
                window.open(url, '_blank');
              },
              { url: message.data.url, jobId: message.data.jobId }
            );
            // The context.on('page') handler will take care of:
            // - Injecting executor
            // - Mapping to tabId 2
            // - Sending EXTERNAL_ATS_OPENED message
          } catch (error) {
            console.error('[Test Mock] Error opening ATS tab:', error);
          }
          continue; // Don't forward to normal listeners
        }

        // Forward other messages to background listeners
        for (const listener of backgroundMessageListeners) {
          listener(message, { tab: { id: 1 } }, () => {}); // Sender is always { tab: { id: 1 } } for main page
        }
      }
    }
  }, 100);

  // Mock chrome.storage.local
  const storageLocalGet = vi.fn(
    (
      key: string | string[] | { [key: string]: any } | null,
      callback?: (items: { [key: string]: any }) => void
    ) => {
      return new Promise((resolve) => {
        let keys: string[];

        // Handle different input formats
        if (typeof key === 'string') {
          keys = [key];
        } else if (Array.isArray(key)) {
          keys = key;
        } else if (key && typeof key === 'object') {
          keys = Object.keys(key);
        } else {
          keys = [];
        }

        const result: { [key: string]: any } = {};

        // Return user_info for testing
        if (keys.includes('user_info') || keys.length === 0) {
          result.user_info = {
            email: 'test@example.com',
            id: 'test-user-id',
          };
        }

        if (callback) callback(result);
        resolve(result);
      });
    }
  );

  // Note: Executor message forwarding is now set up in injectExecutorIntoPage
  // Messages are added directly to __pendingExecutorMessages in chrome.runtime.sendMessage mock

  // Set global chrome object
  global.chrome = {
    tabs: {
      sendMessage: tabsSendMessage,
      create: tabsCreate,
      remove: tabsRemove, // Add this line
    } as any,
    runtime: {
      sendMessage: runtimeSendMessage,
      onMessage: runtimeOnMessage,
      lastError: null,
    } as any,
    storage: {
      local: {
        get: storageLocalGet,
        set: vi.fn((_items: { [key: string]: any }, callback?: () => void) => {
          if (callback) callback();
          return Promise.resolve();
        }),
      } as any,
    } as any,
  } as any;

  return {
    backgroundMessageListeners,
    tabsRemoveSpy: tabsRemove, // Expose spy
    pages, // Expose pages map
    cleanup: () => {
      if (messagePollInterval) {
        clearInterval(messagePollInterval);
        messagePollInterval = null;
      }
    },
  };
}

/**
 * Set up test environment: browser, page, Chrome mocks, and executor injection
 */
export async function setupTestEnvironment(
  options: {
    mockServerUrl?: string;
    headless?: boolean;
  } = {}
): Promise<{
  browser: Browser;
  page: Page;
  pages: Map<number, Page>; // Add this
  tabsRemoveSpy: ReturnType<typeof vi.fn>; // Expose tabsRemoveSpy
  cleanup: () => Promise<void>;
}> {
  const { chromium } = await import('playwright');
  const { mockServerUrl = 'http://localhost:3000', headless = false } = options;

  // Launch browser
  const browser = await chromium.launch({
    headless,
    devtools: !headless,
    args: ['--disable-web-security'],
  });

  const page = await browser.newPage();
  const pages = new Map<number, Page>();
  pages.set(1, page); // tabId 1 = LinkedIn page

  // Track all pages opened per job (job detail pages + ATS pages)
  const pagesByJobId = new Map<string, Page[]>(); // jobId -> array of pages

  // Get the browser context
  const context = page.context();

  // Listen for new pages using context (more reliable for target="_blank" links)
  context.on('page', async (newPage) => {
    console.log('[Test Helper] New page event fired via context');

    // Wait for navigation to complete (URL might be 'about:blank' initially)
    try {
      await newPage.waitForURL('**', { timeout: 5000 });
    } catch (error) {
      console.log('[Test Helper] Page navigation timeout or already navigated');
    }

    const url = newPage.url();
    console.log('[Test Helper] New page opened with URL:', url);

    // Extract jobId from URL
    const jobIdFromUrl = url.match(/[?&](?:job|currentJobId)=([^&]+)/)?.[1];
    const jobIdFromPage = await newPage.evaluate(() => {
      return (window as any).__currentJobId;
    });
    const jobId = jobIdFromUrl || jobIdFromPage;

    const isATSPage = url.includes('/mocks/') && !url.includes('linkedin-jobs');
    const isJobDetailPage = url.includes('linkedin-jobs') && url.includes('currentJobId');

    // Track page for cleanup (if we have a jobId)
    if (jobId) {
      if (!pagesByJobId.has(jobId)) {
        pagesByJobId.set(jobId, []);
      }
      pagesByJobId.get(jobId)!.push(newPage);
      console.log(`[Test Helper] Tracked page for job ${jobId}: ${url}`);
    }

    if (isATSPage) {
      console.log('[Test Helper] Detected ATS page, injecting executor...');

      // Wait for page to load
      await newPage.waitForLoadState('domcontentloaded');

      // Inject executor into ATS page
      await injectExecutorIntoPage(newPage);

      // Track this page as tabId 2 (ATS tab)
      pages.set(2, newPage);
      console.log('[Test Helper] ✓ Injected executor into ATS page and mapped to tabId 2');
      console.log('[Test Helper] Pages map now has:', Array.from(pages.keys()));

      // Listen for navigation in this page (same-tab navigation)
      newPage.on('framenavigated', async (frame) => {
        if (frame === newPage.mainFrame()) {
          const url = frame.url();
          console.log('[Test Helper] ATS page (tabId 2) navigated to:', url);

          // Re-inject executor after navigation
          console.log('[Test Helper] Re-injecting executor after ATS navigation...');
          await injectExecutorIntoPage(newPage);
          console.log('[Test Helper] ✓ Executor re-injected after ATS navigation');
        }
      });

      // If it's an ATS page, send EXTERNAL_ATS_OPENED to the MAIN LinkedIn page (page 1)
      // The executor on the LinkedIn page is waiting for this message
      const jobIdFromUrl = url.match(/[?&]job=([^&]+)/)?.[1];
      const jobIdFromPage = await newPage.evaluate(() => {
        return (window as any).__currentJobId;
      });

      const jobId = jobIdFromUrl || jobIdFromPage;

      if (!jobId) {
        console.warn('[Test Helper] Could not determine jobId, skipping EXTERNAL_ATS_OPENED');
        return;
      }

      // Get the main LinkedIn page (page 1) to send the message to
      const mainPage = pages.get(1);
      if (!mainPage) {
        console.warn(
          '[Test Helper] Main page (tabId 1) not found, cannot send EXTERNAL_ATS_OPENED'
        );
        return;
      }

      // Send EXTERNAL_ATS_OPENED message to the main LinkedIn page (where executor is waiting)
      await mainPage.evaluate(
        ({ url, jobId }) => {
          const message = {
            type: 'EXTERNAL_ATS_OPENED',
            data: {
              jobId: jobId,
              atsTabId: 2,
              atsUrl: url,
            },
          };

          console.log('[Test Helper] Sending EXTERNAL_ATS_OPENED to main page:', message);
          const listeners = (window as any).__executorMessageListeners || [];

          const sender = {
            tab: { id: 1 },
            frameId: 0,
            id: 'test-extension-id',
            url: window.location.href,
          };

          for (const listener of listeners) {
            try {
              listener(message, sender, () => {});
            } catch (error) {
              console.error('[Test Helper] Error calling listener:', error);
            }
          }
        },
        { url, jobId }
      );

      console.log('[Test Helper] Sent EXTERNAL_ATS_OPENED to main page executor');
    } else if (isJobDetailPage) {
      // Job detail page - inject executor and track
      console.log(`[Test Helper] Detected job detail page for job ${jobId}`);
      await newPage.waitForLoadState('domcontentloaded');
      await injectExecutorIntoPage(newPage);
    } else {
      console.log('[Test Helper] Page does not match ATS pattern, skipping. URL:', url);
    }
  });

  // Load mock page
  try {
    await page.goto(`${mockServerUrl}/mocks/linkedin-jobs.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 5000,
    });
    await page.waitForSelector('[data-job-id]', { timeout: 5000 });
  } catch (error) {
    console.warn('[Test Helper] Mock server not available, creating fallback page');
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head><title>LinkedIn Jobs Mock</title></head>
        <body>
          <div data-job-id="1">
            <h3>Software Engineer</h3>
            <h4>Tech Company</h4>
            <span>San Francisco, CA</span>
          </div>
          <div data-job-id="2">
            <h3>Product Manager</h3>
            <h4>Startup Inc</h4>
            <span>Remote</span>
          </div>
        </body>
      </html>
    `);
  }

  // Inject executor
  await injectExecutorIntoPage(page);

  // Set up Chrome API mocks with pages map and pagesByJobId
  const { cleanup: cleanupMocks, tabsRemoveSpy } = setupChromeAPIMocks(pages, pagesByJobId);

  return {
    browser,
    page,
    pages, // Return pages map
    tabsRemoveSpy, // Expose tabsRemoveSpy for assertions
    cleanup: async () => {
      cleanupMocks();
      // Browser will stay open for debugging - uncomment to close:
      // await browser.close();
    },
  };
}
