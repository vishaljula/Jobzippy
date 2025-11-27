import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore';

import { getFirestoreDb } from './client';

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'none';

export type PayoutMethod = {
  type: 'paypal' | 'stripe_connect' | null;
  identifier: string | null;
};

export type ReferralStatus = 'pending' | 'unlocked' | 'paid';

export interface UserDocument {
  email: string;
  google_sub: string;
  subscription_status: SubscriptionStatus;
  stripe_customer_id: string | null;
  phone_verified: boolean;
  referral_code: string | null;
  referred_by: string | null;
  sheet_id: string | null;
  cloud_run_enabled: boolean;
  gmail_label: string | null;
  payout_method: PayoutMethod;
  referral_stats: {
    paid_referrals: number;
    locked_cents: number;
    unlocked_cents: number;
    last_unlock_at: string | null;
  };
  profile: {
    name: string | null;
    picture: string | null;
  };
  metadata?: Record<string, unknown>;
  created_at: number;
  updated_at: number;
  last_login_at: number;
}

export interface EnsureUserDocumentPayload {
  email: string;
  googleSub: string;
  displayName?: string;
  photoURL?: string;
  referredBy?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ReferralDocument {
  referrerId: string;
  referredId: string;
  status: ReferralStatus;
  createdAt?: number;
  unlockedAt?: number | null;
  notes?: string | null;
}

export const DEFAULT_GMAIL_LABEL = 'Jobzippy/Recruiters';

function createDefaultUserDocument(
  payload: EnsureUserDocumentPayload,
  timestamp: number
): UserDocument {
  return {
    email: payload.email,
    google_sub: payload.googleSub,
    subscription_status: 'trialing',
    stripe_customer_id: null,
    phone_verified: false,
    referral_code: null,
    referred_by: payload.referredBy ?? null,
    sheet_id: null,
    cloud_run_enabled: false,
    gmail_label: DEFAULT_GMAIL_LABEL,
    payout_method: { type: null, identifier: null },
    referral_stats: {
      paid_referrals: 0,
      locked_cents: 0,
      unlocked_cents: 0,
      last_unlock_at: null,
    },
    profile: {
      name: payload.displayName ?? null,
      picture: payload.photoURL ?? null,
    },
    metadata: payload.metadata ?? {},
    created_at: timestamp,
    updated_at: timestamp,
    last_login_at: timestamp,
  };
}

export class FirestoreRepository {
  #db: Firestore;

  constructor(db: Firestore = getFirestoreDb()) {
    this.#db = db;
  }

  async ensureUserDocument(userId: string, data: EnsureUserDocumentPayload): Promise<void> {
    if (!userId) {
      throw new Error('Cannot upsert user document without a userId.');
    }

    const userRef = doc(this.#db, 'users', userId);
    const snapshot = await getDoc(userRef);
    const now = Date.now();

    if (!snapshot.exists()) {
      const document = createDefaultUserDocument(data, now);
      await setDoc(userRef, document);
      return;
    }

    const existingData = snapshot.data() as Partial<UserDocument> | undefined;
    const updatePayload: Record<string, unknown> = {
      email: data.email,
      google_sub: data.googleSub,
      updated_at: now,
      last_login_at: now,
    };

    if (typeof data.displayName !== 'undefined') {
      updatePayload['profile.name'] = data.displayName ?? null;
    }

    if (typeof data.photoURL !== 'undefined') {
      updatePayload['profile.picture'] = data.photoURL ?? null;
    }

    if (typeof data.referredBy !== 'undefined') {
      updatePayload.referred_by = data.referredBy ?? null;
    }

    if (data.metadata) {
      updatePayload.metadata = {
        ...(existingData?.metadata ?? {}),
        ...data.metadata,
      };
    }

    await updateDoc(userRef, updatePayload as DocumentData);
  }

  async createReferralDocument(referralId: string, data: ReferralDocument): Promise<void> {
    if (!referralId) {
      throw new Error('Cannot create referral without an identifier.');
    }

    const referralRef = doc(this.#db, 'referrals', referralId);
    const payload: ReferralDocument = {
      ...data,
      createdAt: data.createdAt ?? Date.now(),
      unlockedAt: data.unlockedAt ?? null,
    };

    await setDoc(referralRef, payload);
  }

  async updateSheetId(userId: string, sheetId: string): Promise<void> {
    if (!userId) {
      throw new Error('Cannot update sheet id without a userId.');
    }
    const userRef = doc(this.#db, 'users', userId);
    await updateDoc(userRef, {
      sheet_id: sheetId,
      updated_at: Date.now(),
    });
  }
}
