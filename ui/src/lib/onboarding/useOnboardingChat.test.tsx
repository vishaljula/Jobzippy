import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnboardingChat } from './useOnboardingChat';

const mockUser = {
  sub: 'user-123',
  email: 'test@example.com',
  email_verified: true,
  name: 'Test User',
  given_name: 'Test',
  family_name: 'User',
  picture: '',
};

describe('useOnboardingChat', () => {
  it('initializes with a welcome message and asks for missing fields', async () => {
    const { result } = renderHook(() => useOnboardingChat({ enabled: true, user: mockUser }));
    // wait a tick
    await act(async () => {});
    expect(result.current.isLoading).toBe(false);
    expect(result.current.messages.length).toBeGreaterThan(0);
    expect(result.current.messages[0]?.content.toLowerCase()).toContain(
      "i'll help complete your profile"
    );
  });

  it('records defer with "later" and acknowledges', async () => {
    const { result } = renderHook(() => useOnboardingChat({ enabled: true, user: mockUser }));
    await act(async () => {});
    await act(async () => {
      await result.current.sendMessage({ text: 'later' });
    });
    expect(result.current.deferredTasks.length).toBe(1);
    const last = result.current.messages[result.current.messages.length - 1];
    expect(last?.kind).toBe('notice');
  });

  it('startOver clears conversation and draft', async () => {
    const { result } = renderHook(() => useOnboardingChat({ enabled: true, user: mockUser }));
    await act(async () => {});
    await act(async () => {
      await result.current.startOver();
    });
    expect(result.current.messages.length).toBe(0);
  });
});
