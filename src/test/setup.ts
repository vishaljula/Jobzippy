/**
 * Test setup file
 * Configures testing environment for Vitest + React Testing Library
 */

import '@testing-library/jest-dom';
import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock matchMedia for Sonner (toast library)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {}, // deprecated
    removeListener: () => {}, // deprecated
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Mock chrome API for extension tests
global.chrome = {
  runtime: {
    id: 'test-extension-id',
    getManifest: () => ({ version: '0.1.0' }),
    onMessage: {
      addListener: () => {},
      removeListener: () => {},
    },
    sendMessage: () => Promise.resolve({}),
  },
  storage: {
    local: {
      get: () => Promise.resolve({}),
      set: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    },
    onChanged: {
      addListener: () => {},
      removeListener: () => {},
    },
  },
  tabs: {
    query: () => Promise.resolve([]),
    sendMessage: () => Promise.resolve({}),
  },
  alarms: {
    create: () => {},
    clear: () => Promise.resolve(true),
    onAlarm: {
      addListener: () => {},
      removeListener: () => {},
    },
  },
  sidePanel: {
    setOptions: () => Promise.resolve(),
    setPanelBehavior: () => Promise.resolve(),
  },
} as unknown as typeof chrome;
