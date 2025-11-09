import { describe, expect, it, beforeEach, vi } from 'vitest';

import { FirestoreRepository, DEFAULT_GMAIL_LABEL } from './userRepository';

const docMock = vi.fn((db: unknown, collection: string, id: string) => ({
  db,
  path: `${collection}/${id}`,
}));
const getDocMock = vi.fn();
const setDocMock = vi.fn();
const updateDocMock = vi.fn();

vi.mock('firebase/firestore', () => ({
  doc: (...args: [unknown, string, string]) => docMock(...args),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
}));

describe('FirestoreRepository', () => {
  const repository = new FirestoreRepository({} as never);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('creates default user document when none exists', async () => {
    const now = 1_700_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(now);
    getDocMock.mockResolvedValue({
      exists: () => false,
    });

    await repository.ensureUserDocument('uid-123', {
      email: 'user@example.com',
      googleSub: 'google-sub',
      displayName: 'User Example',
      photoURL: 'https://example.com/avatar.png',
    });

    expect(setDocMock).toHaveBeenCalledTimes(1);
    const callArgs = setDocMock.mock.calls[0] ?? [];
    const payload = callArgs[1];

    expect(payload).toMatchObject({
      email: 'user@example.com',
      google_sub: 'google-sub',
      gmail_label: DEFAULT_GMAIL_LABEL,
      profile: {
        name: 'User Example',
        picture: 'https://example.com/avatar.png',
      },
      created_at: now,
      updated_at: now,
      last_login_at: now,
    });
    vi.useRealTimers();
  });

  it('updates existing user document with latest login info', async () => {
    const now = 1_700_000_100_000;
    vi.useFakeTimers();
    vi.setSystemTime(now);
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({
        metadata: { referral_source: 'friend' },
      }),
    });

    await repository.ensureUserDocument('uid-123', {
      email: 'user@example.com',
      googleSub: 'google-sub',
      displayName: 'User Example',
      photoURL: 'https://example.com/avatar.png',
      metadata: { onboarding_complete: true },
    });

    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const updateArgs = updateDocMock.mock.calls[0] ?? [];
    const payload = updateArgs[1];

    expect(payload).toMatchObject({
      email: 'user@example.com',
      google_sub: 'google-sub',
      'profile.name': 'User Example',
      'profile.picture': 'https://example.com/avatar.png',
      updated_at: now,
      last_login_at: now,
      metadata: {
        referral_source: 'friend',
        onboarding_complete: true,
      },
    });
    vi.useRealTimers();
  });

  it('creates referral documents with timestamps', async () => {
    const now = 1_700_000_200_000;
    vi.useFakeTimers();
    vi.setSystemTime(now);

    await repository.createReferralDocument('ref-1', {
      referrerId: 'u1',
      referredId: 'u2',
      status: 'pending',
    });

    expect(setDocMock).toHaveBeenCalledTimes(1);
    const referralArgs = setDocMock.mock.calls[0] ?? [];
    const payload = referralArgs[1];

    expect(payload).toMatchObject({
      referrerId: 'u1',
      referredId: 'u2',
      status: 'pending',
      createdAt: now,
      unlockedAt: null,
    });
    vi.useRealTimers();
  });
});
