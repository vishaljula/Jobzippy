import type { Firestore } from 'firebase/firestore';

import { getFirestoreDb } from './client';

export type UserDocument = {
  email: string;
  createdAt: number;
  lastLoginAt: number;
  metadata?: Record<string, unknown>;
};

export type ReferralDocument = {
  referrerId: string;
  referredId: string;
  status: 'pending' | 'unlocked' | 'paid';
  createdAt: number;
  unlockedAt?: number;
};

/**
 * Placeholder repository for Firestore interactions.
 * The actual read/write logic will be implemented in future stories
 * once the onboarding flow finalizes the required schema.
 */
export class FirestoreRepository {
  #db: Firestore;

  constructor(db: Firestore = getFirestoreDb()) {
    this.#db = db;
  }

  /**
   * TODO: Implement user document upsert once onboarding data model is finalized.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async ensureUserDocument(_userId: string, _data: Partial<UserDocument>): Promise<void> {
    if (import.meta.env.DEV) {
      console.warn('ensureUserDocument is not implemented yet. Pending onboarding story.');
    }
  }

  /**
   * TODO: Implement referral document creation once referral flow is defined.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async createReferralDocument(_referralId: string, _data: ReferralDocument): Promise<void> {
    if (import.meta.env.DEV) {
      console.warn('createReferralDocument is not implemented yet. Pending referral story.');
    }
  }
}
