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
4. After the database is created, open **Rules** and replace the default rules with the contents of `firebase/firestore.rules`
5. Publish the rules

## 5. Local Development Verification

```bash
npm run dev
```

You should see:

```
[API] Server listening on port 8787
```

The UI will lazy-load Firebase when needed. On first successful Google OAuth login the extension signs into Firebase using the Google ID token and creates/updates a user document in `users/{firebaseUid}` with the schema defined in §9 of the spec.

## 6. Troubleshooting

- **Missing id_token:** Ensure the OAuth scope includes `openid` and that the Cloud Run token service forwards the `id_token`. Without it Firebase sign-in will be skipped.
- **Permission denied:** Confirm the published Firestore rules match `firebase/firestore.rules` and that the Firebase project has Google sign-in enabled under **Authentication → Sign-in method**.
