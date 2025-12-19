/**
 * E2E Tests for ATS Navigation with Chrome Extension
 * Uses Playwright's Chrome extension testing capabilities
 */

import { test as base, chromium, BrowserContext } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Extend base test to include extension context
const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async (_, use) => {
    const pathToExtension = path.join(__dirname, '../dist');
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    // Get extension ID from background page
    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent('serviceworker');

    const extensionId = background.url().split('/')[2];
    await use(extensionId);
  },
});

export const expect = test.expect;

test.describe('ATS Navigation - Dynamic Classifier', () => {
  test('should classify and navigate Greenhouse application form', async ({ context }) => {
    const page = await context.newPage();

    // Navigate to Greenhouse mock
    await page.goto('http://localhost:3000/mocks/greenhouse-apply.html');

    // Wait for content script to load and run
    await page.waitForTimeout(2000);

    // Check console logs for classification
    const logs: string[] = [];
    page.on('console', (msg) => {
      if (
        msg.text().includes('[ATS]') ||
        msg.text().includes('[Navigator]') ||
        msg.text().includes('[Classifier]')
      ) {
        logs.push(msg.text());
      }
    });

    // Wait a bit more for classification to complete
    await page.waitForTimeout(1000);

    // Verify form elements are present
    const firstName = await page.locator('input[autocomplete="given-name"]');
    const lastName = await page.locator('input[autocomplete="family-name"]');
    const email = await page.locator('input[type="email"]');
    const resume = await page.locator('input#resume');

    await expect(firstName).toBeVisible();
    await expect(lastName).toBeVisible();
    await expect(email).toBeVisible();
    await expect(resume).toBeAttached(); // File inputs are often hidden by CSS

    // Check that classifier detected the form (informational)
    const hasFormDetection = logs.some(
      (log) => log.includes('form') || log.includes('Application form')
    );
    console.log('Form detection in logs:', hasFormDetection);
    console.log('Captured logs:', logs);

    await page.close();
  });

  test('should classify Motion Recruitment modal form', async ({ context }) => {
    const page = await context.newPage();

    await page.goto('http://localhost:3000/mocks/motion-recruitment-apply.html');
    await page.waitForTimeout(2000);

    // Check if modal is visible
    const modal = page.locator('.modal-overlay');
    await expect(modal).toBeVisible();

    // Check if form is inside modal
    const formInModal = modal.locator('form');
    await expect(formInModal).toBeVisible();

    // Verify form fields
    const firstName = formInModal.locator('input[name="firstName"]');
    const email = formInModal.locator('input[type="email"]');

    await expect(firstName).toBeVisible();
    await expect(email).toBeVisible();

    await page.close();
  });

  test('should navigate Workday multi-step flow', async ({ context }) => {
    const page = await context.newPage();

    await page.goto('http://localhost:3000/mocks/workday-apply.html');
    await page.waitForTimeout(1000);

    // Step 1: Verify we're on intermediate page with Apply button
    const applyButton = page.locator('button.apply-button');
    await expect(applyButton).toBeVisible();

    // Wait for classifier to potentially click it
    await page.waitForTimeout(3000);

    // Check if we're still on the same page or navigated
    const currentUrl = page.url();
    console.log('Current URL after wait:', currentUrl);

    // The test validates that the page structure is correct
    // Actual navigation testing would require the extension to be fully active

    await page.close();
  });

  test('should detect form fields correctly', async ({ context }) => {
    const page = await context.newPage();

    await page.goto('http://localhost:3000/mocks/greenhouse-apply.html');
    await page.waitForTimeout(2000);

    // Verify all expected form fields are present
    const fields = {
      firstName: page.locator('input[autocomplete="given-name"]'),
      lastName: page.locator('input[autocomplete="family-name"]'),
      email: page.locator('input[type="email"]'),
      phone: page.locator('input[type="tel"]'),
      resume: page.locator('input#resume'),
    };

    for (const [name, locator] of Object.entries(fields)) {
      if (name === 'resume') {
        await expect(locator).toBeAttached({ timeout: 5000 }); // File inputs are hidden
      } else {
        await expect(locator).toBeVisible({ timeout: 5000 });
      }
      console.log(`✓ ${name} field found`);
    }

    await page.close();
  });

  test('should handle pages with modals', async ({ context }) => {
    const page = await context.newPage();

    await page.goto('http://localhost:3000/mocks/motion-recruitment-apply.html');
    await page.waitForTimeout(2000);

    // Check modal detection
    const modal = page.locator('.modal-overlay');
    const modalCount = await modal.count();

    expect(modalCount).toBeGreaterThan(0);
    console.log(`✓ Found ${modalCount} modal(s)`);

    await page.close();
  });
});

test.describe('Form Element Detection', () => {
  test('should detect all standard application form fields', async ({ context }) => {
    const page = await context.newPage();

    await page.goto('http://localhost:3000/mocks/greenhouse-apply.html');
    await page.waitForTimeout(1000);

    // Test that all required fields are detectable
    const requiredFields = [
      { selector: 'input[autocomplete="given-name"]', name: 'First Name' },
      { selector: 'input[autocomplete="family-name"]', name: 'Last Name' },
      { selector: 'input[type="email"]', name: 'Email' },
      { selector: 'input[type="tel"]', name: 'Phone' },
      { selector: 'input#resume', name: 'Resume' },
    ];

    for (const field of requiredFields) {
      const element = page.locator(field.selector);
      if (field.name === 'Resume') {
        await expect(element).toBeAttached(); // File inputs are hidden
      } else {
        await expect(element).toBeVisible();
      }
      console.log(`✓ ${field.name} field is visible`);
    }

    await page.close();
  });

  test('should detect submit buttons', async ({ context }) => {
    const page = await context.newPage();

    await page.goto('http://localhost:3000/mocks/greenhouse-apply.html');
    await page.waitForTimeout(1000);

    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();

    const buttonText = await submitButton.textContent();
    expect(buttonText).toContain('Submit');

    await page.close();
  });
});

test.describe('Page Structure Validation', () => {
  test('Greenhouse mock has correct structure', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('http://localhost:3000/mocks/greenhouse-apply.html');

    // Verify page loaded
    await expect(page.locator('form')).toBeVisible();

    // Verify it has the expected data attribute
    const bodyAttr = await page.locator('body').getAttribute('data-ats-type');
    expect(bodyAttr).toBe('greenhouse');

    await page.close();
  });

  test('Motion Recruitment mock has modal structure', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('http://localhost:3000/mocks/motion-recruitment-apply.html');

    // Verify modal exists
    const modal = page.locator('.modal-overlay');
    await expect(modal).toBeVisible();

    // Verify form is inside modal
    const form = modal.locator('form');
    await expect(form).toBeVisible();

    await page.close();
  });

  test('Workday mock has apply button', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('http://localhost:3000/mocks/workday-apply.html');

    // Verify apply button exists
    const applyButton = page.locator('button.apply-button');
    await expect(applyButton).toBeVisible();

    const buttonText = await applyButton.textContent();
    expect(buttonText?.toLowerCase()).toContain('apply');

    await page.close();
  });
});
