# Firebase / Firestore Setup (JZ-005)

> **Goal:** Provision Firebase for storing minimal user metadata and referrals. Detailed schemas will be finalized in future stories when onboarding and referral flows are implemented.

## 1. Create Firebase Project

1. Visit [Firebase Console](https://console.firebase.google.com/)
2. Click **Add project** → name it `jobzippy` (or your choice)
3. Disable Google Analytics for now
4. Wait for provisioning to finish

## 2. Register Web App

1. Inside the project, go to **Build → Realtime Database / Firestore** (either entry point works)
2. Click the `</>` web icon to **Add app**
3. App nickname: `Jobzippy Extension`
4. Hosting: **Skip for now**
5. Copy the config snippet – we need these values:
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`
   - `measurementId` (optional)

## 3. Update `.env`

Copy `.env.example` to `.env` (if you haven’t already) and fill in the Firebase values:

```ini
VITE_FIREBASE_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_FIREBASE_AUTH_DOMAIN=jobzippy.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=jobzippy
VITE_FIREBASE_STORAGE_BUCKET=jobzippy.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef123456
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

> These variables are consumed by the UI workspace via `firebase/app` and are safe to expose in client code. **Do not** place admin credentials in the extension.

## 4. Firestore Database

1. Navigate to **Build → Firestore Database**
2. Click **Create database** → choose **Start in production mode**
3. Select the nearest region (eg. `us-central1`)
4. Leave the rules for now – we’ll tighten them once schemas are finalized

## 5. Long-Term TODOs (Future Stories)

- Define user and referral schemas once conversational onboarding finishes
- Write security rules to enforce per-user access
- Add Cloud Functions or scheduled jobs if we need server-side aggregation
- Consider Firebase Authentication if we want to mirror users outside Chrome

## 6. Local Development Verification

```bash
npm run dev
```

You should see:

```
[API] Server listening on port 8787
```

The UI will lazy-load Firebase when needed. `FirestoreRepository` currently logs TODO warnings—these will be replaced with real read/write logic in future tickets.
