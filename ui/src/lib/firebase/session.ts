import { GoogleAuthProvider, getAuth, signInWithCredential, signOut } from 'firebase/auth';

import type { UserInfo } from '@/lib/types';
import { getStoredTokens } from '@/lib/oauth/google-auth';
import { getFirebaseApp } from './client';
import { FirestoreRepository } from './userRepository';
import { logger } from '@/lib/logger';

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
  logger.log('FirebaseSession', '🔄 Starting Firebase authentication...');

  const tokens = await getStoredTokens();

  if (!tokens?.id_token) {
    logger.log('FirebaseSession', '⚠️ Missing id_token; skipping Firebase Auth handshake');
    return;
  }

  const auth = getAuth(getFirebaseApp());
  const credential = GoogleAuthProvider.credential(tokens.id_token);

  try {
    let firebaseUid: string;
    let _isNewUser = false;

    if (!auth.currentUser) {
      logger.log('FirebaseSession', '📝 No current Firebase user, signing in...');
      const credentialResult = await signInWithCredential(auth, credential);
      firebaseUid = credentialResult.user.uid;
      _isNewUser = true;
      logger.log('FirebaseSession', `✓ Firebase sign-in complete. UID: ${firebaseUid}`);

      await ensureUserDocument(firebaseUid, {
        email: user.email,
        googleSub: user.sub,
        displayName: user.name,
        photoURL: user.picture,
      });
      logger.log('FirebaseSession', '✓ User document created in Firestore');
    } else if (auth.currentUser.email !== user.email) {
      logger.log(
        'FirebaseSession',
        '🔄 Different user detected, signing out and re-authenticating...'
      );
      await signOut(auth);
      const credentialResult = await signInWithCredential(auth, credential);
      firebaseUid = credentialResult.user.uid;
      logger.log('FirebaseSession', `✓ Re-authenticated with new UID: ${firebaseUid}`);

      await ensureUserDocument(firebaseUid, {
        email: user.email,
        googleSub: user.sub,
        displayName: user.name,
        photoURL: user.picture,
      });
      logger.log('FirebaseSession', '✓ User document updated in Firestore');
    } else {
      firebaseUid = auth.currentUser.uid;
      logger.log('FirebaseSession', `✓ Using existing Firebase user. UID: ${firebaseUid}`);

      await ensureUserDocument(firebaseUid, {
        email: user.email,
        googleSub: user.sub,
        displayName: user.name,
        photoURL: user.picture,
      });
      logger.log('FirebaseSession', '✓ User document synchronized in Firestore');
    }

    // CRITICAL: Save Firebase UID to chrome.storage as userId
    // This is needed for backup/restore operations
    await chrome.storage.local.set({ userId: firebaseUid });
    logger.log('FirebaseSession', `✓ Saved userId to chrome.storage: ${firebaseUid}`);

    // Check if user has an existing backup sheet ID in Firestore
    // If so, restore it to chrome.storage immediately
    logger.log('FirebaseSession', '🔍 Checking Firestore for existing backup sheet ID...');
    const repository = new FirestoreRepository();
    const existingSheetId = await repository.getBackupSheetId(firebaseUid);

    if (existingSheetId) {
      await chrome.storage.local.set({ backupSheetId: existingSheetId });
      logger.log(
        'FirebaseSession',
        `✅ Restored backup sheet ID from Firestore: ${existingSheetId}`
      );
    } else {
      logger.log(
        'FirebaseSession',
        '→ No existing backup sheet ID found in Firestore (new user or first backup pending)'
      );
    }

    logger.log('FirebaseSession', '✅ Firebase session complete!');
  } catch (error) {
    logger.error('FirebaseSession', 'Failed to synchronize Firebase session', error);
    throw error;
  }
}

export async function disconnectFirebaseAuth(): Promise<void> {
  logger.log('FirebaseSession', '🔄 Disconnecting Firebase session...');

  const auth = getAuth(getFirebaseApp());
  if (!auth.currentUser) {
    logger.log('FirebaseSession', '→ No active Firebase session to disconnect');
    return;
  }

  try {
    await signOut(auth);
    logger.log('FirebaseSession', '✓ Firebase sign-out complete');

    // Clear userId and backupSheetId from chrome.storage on logout
    await chrome.storage.local.remove(['userId', 'backupSheetId']);
    logger.log('FirebaseSession', '✓ Cleared userId and backupSheetId from chrome.storage');

    logger.log('FirebaseSession', '✅ Firebase session disconnected successfully');
  } catch (error) {
    logger.error('FirebaseSession', 'Failed to disconnect Firebase session', error);
  }
}
