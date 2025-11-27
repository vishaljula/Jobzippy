/**
 * Test setup file
 * Configures the test environment and mocks
 */

import { afterEach, vi } from 'vitest';

// Mock chrome API
global.chrome = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
    },
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
} as unknown as typeof chrome;

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    href: 'http://localhost:3000',
    hostname: 'localhost',
    pathname: '/',
    search: '',
    hash: '',
    ancestorOrigins: {} as DOMStringList,
    assign: vi.fn(),
    reload: vi.fn(),
    replace: vi.fn(),
    origin: 'http://localhost:3000',
    protocol: 'http:',
    host: 'localhost:3000',
    port: '3000',
  },
  writable: true,
});

// Clean up after each test
afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});
