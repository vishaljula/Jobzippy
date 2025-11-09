import { GoogleAuthProvider, getAuth, signInWithCredential, signOut } from 'firebase/auth';

import type { UserInfo } from '@/lib/types';
import { getStoredTokens } from '@/lib/oauth/google-auth';
import { getFirebaseApp } from './client';
import { FirestoreRepository } from './userRepository';

interface EnsureUserDocumentInput {
  email: string;
  googleSub: string;
  displayName?: string;
  photoURL?: string;
  referredBy?: string | null;
}

async function ensureUserDocument(userId: string, payload: EnsureUserDocumentInput) {
  const repository = new FirestoreRepository();
  await repository.ensureUserDocument(userId, {
    email: payload.email,
    googleSub: payload.googleSub,
    displayName: payload.displayName,
    photoURL: payload.photoURL,
    referredBy: payload.referredBy ?? null,
  });
}

export async function connectFirebaseAuth(user: UserInfo): Promise<void> {
  const tokens = await getStoredTokens();

  if (!tokens?.id_token) {
    if (import.meta.env.DEV) {
      console.warn('[Firebase] Missing id_token; skipping Firebase Auth handshake');
    }
    return;
  }

  const auth = getAuth(getFirebaseApp());
  const credential = GoogleAuthProvider.credential(tokens.id_token);

  try {
    if (!auth.currentUser) {
      const credentialResult = await signInWithCredential(auth, credential);
      await ensureUserDocument(credentialResult.user.uid, {
        email: user.email,
        googleSub: user.sub,
        displayName: user.name,
        photoURL: user.picture,
      });
      return;
    }

    if (auth.currentUser.email !== user.email) {
      await signOut(auth);
      const credentialResult = await signInWithCredential(auth, credential);
      await ensureUserDocument(credentialResult.user.uid, {
        email: user.email,
        googleSub: user.sub,
        displayName: user.name,
        photoURL: user.picture,
      });
      return;
    }

    await ensureUserDocument(auth.currentUser.uid, {
      email: user.email,
      googleSub: user.sub,
      displayName: user.name,
      photoURL: user.picture,
    });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[Firebase] Failed to synchronize user session', error);
    }
    throw error;
  }
}

export async function disconnectFirebaseAuth(): Promise<void> {
  const auth = getAuth(getFirebaseApp());
  if (!auth.currentUser) {
    return;
  }

  try {
    await signOut(auth);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[Firebase] Failed to sign out', error);
    }
  }
}
