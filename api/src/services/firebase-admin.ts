import admin from 'firebase-admin';
import { config } from '../config.js';

let firebaseApp: admin.app.App | null = null;

export function initializeFirebaseAdmin(): admin.app.App {
  if (firebaseApp) {
    return firebaseApp;
  }

  // Initialize Firebase Admin with service account
  const serviceAccount = {
    projectId: config.firebase.projectId,
    privateKey: config.firebase.privateKey?.replace(/\\n/g, '\n'),
    clientEmail: config.firebase.clientEmail,
  };

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    projectId: config.firebase.projectId,
  });

  return firebaseApp;
}

export function getFirebaseAdmin(): admin.app.App {
  if (!firebaseApp) {
    return initializeFirebaseAdmin();
  }
  return firebaseApp;
}

export function getAuth(): admin.auth.Auth {
  return getFirebaseAdmin().auth();
}

export function getFirestore(): admin.firestore.Firestore {
  return getFirebaseAdmin().firestore();
}

