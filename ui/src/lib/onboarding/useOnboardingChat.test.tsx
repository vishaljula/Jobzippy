import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProfileVault, UserInfo } from '@/lib/types';
import { useOnboardingChat } from './useOnboardingChat';

vi.mock('@/lib/vault/service', () => {
  const mockVault: Record<string, ProfileVault | null> = {};
  return {
    vaultService: {
      load: vi.fn(async (store: string) => mockVault[store] ?? null),
      save: vi.fn(async () => {}),
    },
  };
});

const storageState: Record<string, unknown> = {};

const storageMock = vi.hoisted(() => ({
  getStorage: vi.fn(async (key: string) => storageState[key]),
  setStorage: vi.fn(async (key: string, value: unknown) => {
    storageState[key] = value;
  }),
}));

vi.mock('@/lib/storage', () => storageMock);

const demoUser: UserInfo = {
  sub: 'user-123',
  email: 'test@example.com',
  email_verified: true,
  name: 'Test User',
  given_name: 'Test',
  family_name: 'User',
  picture: '',
};

describe('useOnboardingChat', () => {
  beforeEach(() => {
    Object.keys(storageState).forEach((key) => delete storageState[key]);
    storageMock.getStorage.mockClear();
    storageMock.setStorage.mockClear();
  });

  it('starts with greeting and requests resume when no snapshot exists', async () => {
    const { result } = renderHook(() => useOnboardingChat({ enabled: true, user: demoUser }));
    await act(async () => {});
    expect(result.current.messages[0]?.content).toMatch(/drop your latest resume/i);
    expect(result.current.progress.status).toBe('idle');
  });

  it('loads existing snapshot for returning user', async () => {
    storageState.onboardingConversations = {
      [demoUser.sub]: {
        version: 1,
        messages: [
          {
            id: '1',
            role: 'assistant',
            kind: 'text',
            content: 'Welcome back!',
            createdAt: new Date().toISOString(),
          },
        ],
        deferredTasks: [],
        pendingFieldPath: null,
        missingFields: [],
        progress: {
          completed: 5,
          total: 5,
          percentage: 100,
          status: 'ready',
        },
        draft: null,
        hasResume: true,
        lastUpdated: new Date().toISOString(),
      },
    };

    const { result } = renderHook(() => useOnboardingChat({ enabled: true, user: demoUser }));
    await act(async () => {});

    expect(result.current.messages[0]?.content).toBe('Welcome back!');
    expect(result.current.progress.status).toBe('ready');
  });

  it('does not send messages when disabled', async () => {
    const { result } = renderHook(() => useOnboardingChat({ enabled: false, user: demoUser }));
    await act(async () => {});
    await act(async () => {
      await result.current.sendMessage({ text: 'hello' });
    });
    expect(result.current.messages.length).toBe(1);
  });

  it('startOver resets conversation to greeting', async () => {
    const { result } = renderHook(() => useOnboardingChat({ enabled: true, user: demoUser }));
    await act(async () => {});
    await act(async () => {
      await result.current.startOver();
    });
    expect(result.current.messages.length).toBe(1);
    expect(result.current.messages[0]?.content).toMatch(/drop your latest resume/i);
  });
});
