# Testing Guide

## Overview

Jobzippy uses a comprehensive testing strategy:
- **Unit Tests**: Vitest + React Testing Library
- **E2E Tests**: Playwright
- **Pre-commit Hooks**: Husky + lint-staged
- **CI/CD**: GitHub Actions

---

## Unit Tests

### Running Tests

```bash
# Run tests in watch mode
npm test

# Run tests with UI
npm run test:ui

# Run tests once (CI mode)
npm run test:run

# Run with coverage
npm run test:coverage
```

### Writing Tests

Tests are colocated with components:

```
src/components/ui/button.tsx
src/components/ui/button.test.tsx  ← Test file
```

**Example:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './button';

describe('Button', () => {
  it('renders button with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });
});
```

### Test Environment

- **Framework**: Vitest (faster alternative to Jest)
- **Library**: React Testing Library
- **Environment**: jsdom
- **Mocks**: Chrome extension APIs automatically mocked in `src/test/setup.ts`

---

## E2E Tests

### Running E2E Tests

```bash
# Run E2E tests
npm run test:e2e

# Run with UI
npm run test:e2e:ui
```

### Writing E2E Tests

E2E tests are in the `e2e/` directory:

```
e2e/
├── extension.spec.ts  ← Extension loading tests
├── linkedin.spec.ts   ← LinkedIn automation tests
└── indeed.spec.ts     ← Indeed automation tests
```

**Example:**
```typescript
import { test, expect } from '@playwright/test';

test('loads extension', async ({ page }) => {
  // Test extension loading
});
```

### Note on Extension E2E Testing

Full Chrome extension E2E testing requires special setup:
- Load extension in Chromium with proper flags
- Use puppeteer-core for extension testing
- For MVP, focus on unit/integration tests + manual testing

---

## Pre-commit Hooks

Husky runs checks before each commit:

1. **Lint staged files** - ESLint fixes
2. **Format staged files** - Prettier
3. **Type check** - TypeScript validation

This ensures code quality before it reaches the repo.

**To skip hooks (not recommended):**
```bash
git commit --no-verify
```

---

## Coverage

### Viewing Coverage Reports

```bash
npm run test:coverage
```

Coverage reports are generated in:
- `coverage/` - Full HTML report
- `coverage/coverage-final.json` - JSON for CI

**Open HTML report:**
```bash
open coverage/index.html
```

### Coverage Goals

| Metric | Target |
|--------|--------|
| Statements | 80% |
| Branches | 75% |
| Functions | 80% |
| Lines | 80% |

---

## CI/CD

### GitHub Actions Workflow

On every push/PR to `main` or `feat/**` branches:

1. **Test Job**
   - Type check
   - Lint
   - Run unit tests
   - Generate coverage report
   - Upload to Codecov

2. **Build Job**
   - Build extension
   - Upload dist/ as artifact

3. **E2E Job**
   - Run Playwright tests
   - Upload test reports

### Viewing CI Results

- Go to GitHub Actions tab
- Click on the workflow run
- View job logs and artifacts

---

## Testing Best Practices

### 1. Test User Behavior, Not Implementation

❌ **Bad:**
```typescript
expect(component.state.count).toBe(1);
```

✅ **Good:**
```typescript
expect(screen.getByText('1')).toBeInTheDocument();
```

### 2. Use Accessibility Queries

Prefer queries that reflect how users find elements:

```typescript
// Preferred (accessible)
screen.getByRole('button', { name: /submit/i })
screen.getByLabelText(/email/i)
screen.getByText(/welcome/i)

// Avoid (implementation details)
screen.getByClassName('btn-primary')
screen.getByTestId('submit-button')
```

### 3. Mock Chrome APIs When Needed

Chrome APIs are auto-mocked in `src/test/setup.ts`. Override if needed:

```typescript
import { vi } from 'vitest';

vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({
  userId: '123',
});
```

### 4. Test Error States

```typescript
it('shows error message on failure', async () => {
  // Trigger error
  await user.click(screen.getByRole('button'));
  
  // Assert error displayed
  expect(screen.getByRole('alert')).toHaveTextContent('Error');
});
```

### 5. Use User Events

```typescript
import userEvent from '@testing-library/user-event';

it('handles user interaction', async () => {
  const user = userEvent.setup();
  
  await user.type(screen.getByLabelText(/email/i), 'test@example.com');
  await user.click(screen.getByRole('button', { name: /submit/i }));
});
```

---

## Debugging Tests

### Run Single Test

```bash
# Vitest
npm test -- button.test.tsx

# Playwright
npm run test:e2e -- extension.spec.ts
```

### Debug in VS Code

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Vitest Tests",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["run", "test"],
  "console": "integratedTerminal"
}
```

### Playwright Debug Mode

```bash
npx playwright test --debug
```

---

## Troubleshooting

### Tests Failing in CI But Passing Locally

1. Check Node.js version matches CI (18.x)
2. Run `npm ci` instead of `npm install`
3. Check for timezone/locale issues

### Chrome API Mocks Not Working

Update mocks in `src/test/setup.ts`:

```typescript
global.chrome.storage.local.get = vi.fn().mockResolvedValue({});
```

### Flaky E2E Tests

1. Add explicit waits
2. Increase timeout
3. Use `waitFor` from Testing Library

---

## Resources

- [Vitest Docs](https://vitest.dev)
- [React Testing Library](https://testing-library.com/react)
- [Playwright Docs](https://playwright.dev)
- [Chrome Extension Testing](https://developer.chrome.com/docs/extensions/mv3/tut_testing/)

---

**Happy Testing! 🧪**

