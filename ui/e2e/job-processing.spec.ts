import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Job Processing E2E', () => {
  let browserContext: BrowserContext;
  let extensionId: string;

  test.beforeAll(async () => {
    const pathToExtension = path.join(__dirname, '../dist');
    const userDataDir = '/tmp/test-user-data-dir-jobzippy';

    console.log('Loading extension from:', pathToExtension);

    // Launch browser in headful mode with extension loaded
    browserContext = await chromium.launchPersistentContext(userDataDir, {
      headless: false, // Headful mode so you can see the browser
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
      slowMo: 500, // Slow down actions so you can see what's happening
    });

    // Wait for extension to load - give it more time
    await new Promise((resolve) => setTimeout(resolve, 3000));

    let backgroundPage = browserContext.backgroundPages()[0];
    if (!backgroundPage) {
      console.log('Waiting for background page...');
      try {
        backgroundPage = await browserContext.waitForEvent('backgroundpage', { timeout: 10000 });
      } catch (e) {
        console.error('Failed to get background page:', e);
        console.log(
          'Available pages:',
          browserContext.pages().map((p) => p.url())
        );
        throw new Error('Extension did not load properly - no background page found');
      }
    }

    // Get extension ID from background page URL
    extensionId = backgroundPage.url().split('/')[2];
    console.log('Extension loaded with ID:', extensionId);
  }, 60000); // Increase timeout to 60s

  test.afterAll(async () => {
    await browserContext.close();
  });

  test('should process jobs on LinkedIn mock page', async () => {
    console.log('Opening LinkedIn mock page...');
    const page = await browserContext.newPage();
    await page.goto('http://localhost:5173/mocks/linkedin-jobs.html');
    await page.waitForLoadState('networkidle');

    // Open side panel (simulated by opening extension page in tab for MVP)
    console.log('Opening extension side panel...');
    const extensionPage = await browserContext.newPage();
    await extensionPage.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
    await extensionPage.waitForLoadState('networkidle');

    // Wait a bit for extension to initialize
    await extensionPage.waitForTimeout(2000);

    // Click "Start Auto-Apply"
    console.log('Clicking Start Auto-Apply...');
    const startButton = extensionPage.locator('button:has-text("Start Auto-Apply")');
    await startButton.waitFor({ state: 'visible', timeout: 5000 });
    await startButton.click();

    // Verify status changes
    console.log('Waiting for engine to start...');
    await expect(extensionPage.locator('text=Running')).toBeVisible({ timeout: 10000 });

    // Switch back to mock page and verify interactions
    await page.bringToFront();
    console.log('Waiting for job processing...');

    // Wait for details pane to update (indicating a click happened)
    // The mock page updates #job-details-title when a card is clicked
    await expect(page.locator('#job-details-title')).not.toHaveText(
      'Select a job to view details',
      { timeout: 15000 }
    );

    // Verify specific job details loaded
    const title = await page.locator('#job-details-title').textContent();
    expect(title).toBeTruthy();
    console.log('✅ Successfully processed job:', title);

    // Keep browser open for a bit so you can see the result
    await page.waitForTimeout(3000);
  });
});
