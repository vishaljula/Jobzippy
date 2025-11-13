import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { IntakeProcessResult } from '@/lib/intake/types';
import type { ProfileVault, UserInfo } from '@/lib/types';
import { useOnboardingChat } from './useOnboardingChat';

vi.mock('@/lib/vault/service', () => {
  const mockVault: Record<string, ProfileVault | null> = {};
  return {
    vaultService: {
      load: vi.fn(async (store: string, _password: string) => mockVault[store] ?? null),
      save: vi.fn(async () => {}),
    },
  };
});

const storageState: Record<string, unknown> = {};

vi.mock('@/lib/storage', () => ({
  getStorage: vi.fn(async (key: string) => storageState[key]),
  setStorage: vi.fn(async (key: string, value: unknown) => {
    storageState[key] = value;
  }),
}));

const mockProcessResume = vi.fn<[], Promise<IntakeProcessResult>>();
vi.mock('@/lib/intake/service', () => ({
  processResumeWithAgent: (...args: unknown[]) => mockProcessResume(...(args as never)),
}));

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
    mockProcessResume.mockReset();
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

  it('processes resume upload and advances to question flow', async () => {
    mockProcessResume.mockResolvedValue({
      extraction: {
        text: 'resume',
        raw: new ArrayBuffer(0),
        metadata: { fileName: 'resume.pdf', fileType: 'pdf', fileSize: 1234 },
      },
      llm: {
        profile: {
          identity: {
            first_name: 'John',
            last_name: 'Doe',
            phone: '',
            email: 'john@example.com',
            address: '',
          },
          work_auth: { visa_type: '', sponsorship_required: false },
          preferences: { remote: true, locations: [], salary_min: 0, start_date: '' },
        },
        compliance: {
          disability_status: 'prefer_not',
          veteran_status: 'prefer_not',
          criminal_history_policy: 'ask_if_required',
        },
        history: { employment: [], education: [] },
        policies: {
          eeo: 'ask_if_required',
          salary: 'ask_if_required',
          relocation: 'ask_if_required',
          work_shift: 'ask_if_required',
        },
        previewSections: [],
        summary: 'Parsed resume',
        confidence: 0.8,
      },
      knownFields: {},
      missingFields: [],
    });

    const { result } = renderHook(() => useOnboardingChat({ enabled: true, user: demoUser }));
    await act(async () => {});

    await act(async () => {
      await result.current.sendMessage({
        text: 'here you go',
        attachments: [new File(['resume'], 'resume.pdf', { type: 'application/pdf' })],
      });
    });

    expect(mockProcessResume).toHaveBeenCalled();
    expect(result.current.messages.some((msg) => msg.kind === 'preview')).toBe(true);
    expect(result.current.progress.status).toBe('collecting');
  });

  it('records defer with "later" and acknowledges', async () => {
    const { result } = renderHook(() => useOnboardingChat({ enabled: true, user: demoUser }));
    await act(async () => {});
    await act(async () => {
      await result.current.sendMessage({ text: 'later' });
    });
    expect(result.current.deferredTasks.length).toBe(1);
    const last = result.current.messages[result.current.messages.length - 1];
    expect(last?.kind).toBe('notice');
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
