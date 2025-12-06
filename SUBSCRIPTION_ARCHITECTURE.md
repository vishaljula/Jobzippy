# JobZippy Subscription & Security Architecture

**Status:** ✅ Architecture Defined - Ready for Implementation  
**Last Updated:** December 6, 2025  
**Pricing:** $9.99/month with 3-day free trial (card required upfront)

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [The Problem & Solution](#the-problem--solution)
3. [User Entry Points](#user-entry-points)
4. [Complete User Flows](#complete-user-flows)
5. [Technical Architecture](#technical-architecture)
6. [Protected Functions](#protected-functions)
7. [Security Enforcement](#security-enforcement)
8. [Implementation Checklist](#implementation-checklist)
9. [Testing & Validation](#testing--validation)

---

## 🎯 Executive Summary

### **The Goal**
Build a secure, user-friendly subscription system that:
- ✅ Shows pricing BEFORE onboarding (prevents bad reviews)
- ✅ Prevents freeloaders from bypassing payment
- ✅ Works seamlessly with Chrome extension + website
- ✅ Enforces 300 applications/month limit server-side
- ✅ Provides smooth authentication across website and extension

### **The Approach**
- **Hosted Stripe Checkout** on `jobzippy.ai` (not embedded in extension)
- **Server-side validation** for all monetized features
- **Dual entry points:** website-first (ideal) or Chrome Web Store direct (reality)
- **Firebase Auth token sharing** between website and extension
- **Cloud Functions + API backend** for subscription enforcement

---

## 🔍 The Problem & Solution

### **Problem 1: Manifest V3 CSP Restrictions**

**What we tried:** Embedded Stripe Checkout (modal in extension)

**Why it failed:**
```
Chrome Manifest V3 Content Security Policy blocks external scripts
   ↓
Can't load https://js.stripe.com/v3/ in extension pages
   ↓
Even sandboxed iframes can't bypass this restriction
   ↓
Result: Blank modal, checkout never loads
```

**Solution:** Hosted Stripe Checkout
- Opens Stripe's payment page in a new tab (`https://checkout.stripe.com/...`)
- No CSP issues (runs on Stripe's domain)
- Redirects back to `jobzippy.ai` after payment
- Website communicates with extension via `chrome.runtime.sendMessage`

---

### **Problem 2: Users Onboarding Before Seeing Price**

**Original flow (BAD):**
```
Install → Onboarding (5-10 min) → "Surprise! It's paid" → 1-star reviews
```

**Why this hurts:**
- ❌ Users feel tricked/baited
- ❌ "Waste of time!" reviews
- ❌ Low conversion (invested time, but not buying)
- ❌ Bad Chrome Web Store rating

**Solution: Show pricing FIRST**
```
Install → Welcome page with pricing → Payment → Then onboard
```

**Result:**
- ✅ Transparent pricing upfront
- ✅ Only paying users complete onboarding
- ✅ Better reviews
- ✅ Higher quality conversions

---

### **Problem 3: Client-Side Code Can Be Bypassed**

**Current reality:**
```javascript
// Extension background script (can be modified by users)
if (subscription.status !== 'active') {
  throw new Error('Subscription required'); // ← User can comment this out
}
applyToJob(jobData); // Still runs!
```

**Solution: Server-Side Enforcement**
- Extension MUST call backend API to get permission
- Backend validates subscription in Firestore (users can't modify this)
- Backend returns essential data (vault, fill instructions, or runToken)
- Without backend response, extension can't proceed

---

## 🚪 User Entry Points

### **Entry Point A: Marketing Website First** (Ideal Path)

```
1. User discovers JobZippy
2. Visits https://jobzippy.ai
3. Sees features, pricing, testimonials
4. Clicks "Start Free Trial"
5. Signs in with Google (Firebase Auth)
6. Redirected to Stripe Checkout
7. Completes payment (card required, 3-day trial)
8. Redirected to jobzippy.ai/success
9. Downloads extension from success page
10. Extension auto-authenticates (reads Firebase token from cookie/message)
11. Shows dashboard immediately - NO second sign-in needed!
```

**Benefits:**
- ✅ Best UX (only sign in once)
- ✅ Payment before download (no surprises)
- ✅ Can show better branding during checkout
- ✅ Higher trust (professional website)

---

### **Entry Point B: Chrome Web Store Direct** (Reality)

```
1. User finds extension in Chrome Web Store
2. Clicks "Add to Chrome"
3. Extension installs → triggers chrome.runtime.onInstalled
4. Opens https://jobzippy.ai/welcome?installed=true in new tab
5. Welcome page shows:
   - What JobZippy does (1 sentence)
   - "3-Day Free Trial" badge
   - "$9.99/month after trial"
   - Big "Start Free Trial" button
6. User clicks "Start Free Trial"
7. Signs in with Google
8. Redirected to Stripe Checkout
9. Completes payment
10. Redirected to jobzippy.ai/success?session_id=cs_xxx
11. Success page:
    - Shows "Payment successful!"
    - Sends message to extension: chrome.runtime.sendMessage()
    - Extension detects subscription, shows dashboard
```

**Key insight:** Even direct Web Store installs redirect to website for payment!

---

## 🔄 Complete User Flows

### **Flow 1: New User (Website First)**

```mermaid
User visits jobzippy.ai
   ↓
[Start Free Trial]
   ↓
Sign in with Google (Firebase Auth)
   ↓
POST /api/create-checkout
   Authorization: Bearer <firebase-id-token>
   ↓
Backend:
   - Verifies Firebase token
   - Creates Stripe Checkout Session
   - Returns session.url
   ↓
Browser redirects to Stripe
   ↓
User enters card: 4242 4242 4242 4242
   ↓
Stripe webhook → Firebase Cloud Function
   ↓
Updates Firestore:
   users/{userId}/subscription = {
     status: 'trialing',
     stripeCustomerId: 'cus_xxx',
     trialEndsAt: +3 days,
     currentPeriodEnd: +1 month
   }
   ↓
Stripe redirects to:
   jobzippy.ai/success?session_id=cs_xxx
   ↓
Success page:
   - "Payment successful!"
   - "Download the extension"
   - [Download from Chrome Web Store]
   ↓
User installs extension
   ↓
Extension startup:
   - Checks for Firebase auth cookie
   - Found! → Auto sign-in
   - Reads subscription from Firestore
   - Shows dashboard
   ↓
User ready to apply to jobs!
```

---

### **Flow 2: New User (Chrome Web Store First)**

```mermaid
User finds extension in Web Store
   ↓
[Add to Chrome]
   ↓
Extension installed
   ↓
chrome.runtime.onInstalled listener fires
   ↓
Opens tab: jobzippy.ai/welcome?installed=true
   ↓
Welcome page shows:
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🎯 JobZippy - AI Job Application Bot
   
   ✓ Auto-fill LinkedIn, Indeed, Glassdoor
   ✓ AI-powered cover letters
   ✓ Google Sheets tracking
   
   💎 3-Day Free Trial
   Then $9.99/month • Cancel anytime
   
   [Start Free Trial] ← Big button
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ↓
User clicks [Start Free Trial]
   ↓
Sign in with Google
   ↓
POST /api/create-checkout
   ↓
Redirect to Stripe checkout
   ↓
Payment completed
   ↓
Stripe webhook updates Firestore
   ↓
Redirect to jobzippy.ai/success
   ↓
Success page sends message:
   chrome.runtime.sendMessage(EXTENSION_ID, {
     type: 'SUBSCRIPTION_ACTIVE',
     userId: user.uid
   })
   ↓
Extension receives message:
   - Refreshes subscription status from Firestore
   - Shows dashboard
   ↓
User ready to apply!
```

---

### **Flow 3: Applying to Job (Secure)**

```mermaid
User clicks "Apply to Job" in extension
   ↓
Extension: POST /api/jobs/apply
   Authorization: Bearer <firebase-id-token>
   Body: { jobId, platform, jobData }
   ↓
Backend API (/api/jobs/apply):
   1. Verify Firebase ID token
   2. Get user from Firestore: users/{userId}
   3. Check subscription.status:
      - 'active' or 'trialing' → proceed
      - other → return 403 Forbidden
   4. Check usage quota:
      - usage.applications_this_month < 300 → proceed
      - >= 300 → return 429 Too Many Requests
   5. Increment usage counter:
      - usage.applications_this_month += 1
   6. Return success + essential data:
      {
        allowed: true,
        remaining: 253,
        vault: { name, email, phone, resume, ... },
        runToken: "jwt-signed-token"
      }
   ↓
Extension receives response:
   - Extract vault data (can't get this without backend!)
   - Create JobSession
   - Fill form with vault data
   - Submit application
   ↓
Extension: POST /api/jobs/complete
   Authorization: Bearer <firebase-id-token>
   Body: { jobId, runToken, status: 'success' }
   ↓
Backend logs completion
   ↓
Job applied successfully!
```

**🔒 Security:**
- ✅ Extension CAN'T bypass backend (needs vault data)
- ✅ Backend enforces subscription (can't be modified)
- ✅ Usage tracked server-side (can't be faked)
- ✅ runToken prevents replay attacks

---

## 🏗️ Technical Architecture

### **Components**

```
┌─────────────────────────────────────────────────────────────┐
│                      USER'S BROWSER                         │
│                                                             │
│  ┌──────────────────┐         ┌──────────────────┐        │
│  │   jobzippy.ai    │         │  Chrome Extension │        │
│  │   (Next.js)      │◄───────►│   (Manifest V3)   │        │
│  │                  │         │                   │        │
│  │  - Welcome       │ Message │  - Background     │        │
│  │  - Checkout      │ Passing │  - Content Scripts│        │
│  │  - Success       │         │  - Sidepanel UI   │        │
│  └────────┬─────────┘         └─────────┬─────────┘        │
│           │                             │                  │
└───────────┼─────────────────────────────┼──────────────────┘
            │                             │
            │ HTTPS                       │ HTTPS
            │                             │
┌───────────▼─────────────────────────────▼──────────────────┐
│                    BACKEND SERVICES                        │
│                                                            │
│  ┌──────────────────┐  ┌──────────────────┐              │
│  │  API Backend     │  │ Firebase Services │              │
│  │  (Express/GCR)   │  │                  │              │
│  │                  │  │  - Auth          │              │
│  │  /jobs/apply     │◄─┤  - Firestore     │              │
│  │  /jobs/complete  │  │  - Functions     │              │
│  │  /create-checkout│  │    * webhook     │              │
│  │  /subscription/* │  │    * reset usage │              │
│  │  /vault/*        │  │                  │              │
│  └────────┬─────────┘  └──────────────────┘              │
│           │                                               │
└───────────┼───────────────────────────────────────────────┘
            │
            │ HTTPS
            ▼
┌─────────────────────────────────────────────────────────┐
│                   STRIPE API                            │
│                                                         │
│  - Checkout Sessions                                    │
│  - Subscriptions                                        │
│  - Webhooks                                             │
│  - Customer Portal                                      │
└─────────────────────────────────────────────────────────┘
```

---

### **Data Flow**

#### **Authentication:**
```
Website:
  User signs in with Google
     ↓
  Firebase Auth creates session
     ↓
  Token stored in cookie: domain=.jobzippy.ai
     ↓
Extension:
  Reads cookie via chrome.cookies.get()
     ↓
  OR receives message from website
     ↓
  Signs in with Firebase using token
     ↓
  Both share same user session!
```

#### **Subscription State:**
```
Stripe (source of truth)
   ↓ Webhook
Firebase Firestore
   ↓ Read
Website & Extension (display only)
```

#### **Job Application:**
```
User action in Extension
   ↓ Request permission
Backend API (validates)
   ↓ Returns vault + token
Extension (executes)
   ↓ Reports completion
Backend API (logs)
```

---

## 🔒 Protected Functions

**Definition:** Operations that MUST run server-side where users can't tamper with code.

### **Critical (Must Implement)**

#### **1. Apply to Job** 🔴 HIGHEST PRIORITY

**Endpoint:** `POST /api/jobs/apply`

**Request:**
```typescript
Authorization: Bearer <firebase-id-token>
Content-Type: application/json

{
  "jobId": "linkedin_12345",
  "platform": "linkedin",
  "jobData": {
    "title": "Software Engineer",
    "company": "Acme Inc",
    "location": "Remote"
  }
}
```

**Backend Logic:**
```typescript
export async function applyToJob(req: Request, res: Response) {
  // 1. Verify Firebase ID token
  const idToken = req.headers.authorization?.split('Bearer ')[1];
  if (!idToken) return res.status(401).json({ error: 'Unauthorized' });
  
  const decodedToken = await admin.auth().verifyIdToken(idToken);
  const userId = decodedToken.uid;
  
  // 2. Get user document from Firestore
  const userDoc = await admin.firestore().doc(`users/${userId}`).get();
  const userData = userDoc.data();
  
  // 3. Check subscription status (can't be bypassed!)
  const subscription = userData?.subscription;
  if (!subscription || 
      (subscription.status !== 'active' && subscription.status !== 'trialing')) {
    return res.status(403).json({ 
      error: 'Active subscription required',
      subscriptionStatus: subscription?.status || 'none'
    });
  }
  
  // 4. Check usage quota
  const usage = userData?.usage?.applications_this_month || 0;
  const limit = 300;
  
  if (usage >= limit) {
    return res.status(429).json({ 
      error: 'Monthly application limit reached',
      limit,
      used: usage,
      resetDate: userData?.usage?.month_started
    });
  }
  
  // 5. Increment usage counter (atomic)
  await admin.firestore().doc(`users/${userId}`).update({
    'usage.applications_this_month': admin.firestore.FieldValue.increment(1),
    'usage.last_application': admin.firestore.FieldValue.serverTimestamp()
  });
  
  // 6. Get vault data (essential - extension needs this!)
  const vaultDoc = await admin.firestore()
    .doc(`users/${userId}/vault/profile`).get();
  const vault = vaultDoc.data();
  
  // 7. Generate run token (prevents replay)
  const runToken = jwt.sign(
    { userId, jobId: req.body.jobId, timestamp: Date.now() },
    JWT_SECRET,
    { expiresIn: '10m' }
  );
  
  // 8. Return permission + essential data
  return res.json({
    allowed: true,
    remaining: limit - usage - 1,
    vault: {
      name: vault?.name,
      email: vault?.email,
      phone: vault?.phone,
      resume: vault?.resume,
      // ... other fields
    },
    runToken
  });
}
```

**Why this is secure:**
- ✅ Extension MUST call this to get vault data
- ✅ User can't modify backend code
- ✅ Usage tracked server-side
- ✅ Subscription validated server-side
- ✅ Even if user bypasses frontend check, backend rejects

---

#### **2. Complete Job Application**

**Endpoint:** `POST /api/jobs/complete`

**Request:**
```typescript
Authorization: Bearer <firebase-id-token>
Content-Type: application/json

{
  "jobId": "linkedin_12345",
  "runToken": "eyJhbGciOiJIUzI1...",
  "status": "success" | "failed",
  "errorMessage": "optional"
}
```

**Backend Logic:**
```typescript
export async function completeJob(req: Request, res: Response) {
  // 1. Verify Firebase token
  const userId = await verifyFirebaseToken(req);
  
  // 2. Verify run token (prevents fake completions)
  const runToken = req.body.runToken;
  const decoded = jwt.verify(runToken, JWT_SECRET);
  
  if (decoded.userId !== userId || decoded.jobId !== req.body.jobId) {
    return res.status(403).json({ error: 'Invalid run token' });
  }
  
  // 3. Log completion
  await admin.firestore().collection('job_completions').add({
    userId,
    jobId: req.body.jobId,
    status: req.body.status,
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
    errorMessage: req.body.errorMessage
  });
  
  // 4. If failed, optionally refund usage count
  if (req.body.status === 'failed') {
    await admin.firestore().doc(`users/${userId}`).update({
      'usage.applications_this_month': admin.firestore.FieldValue.increment(-1)
    });
  }
  
  return res.json({ success: true });
}
```

---

#### **3. Check Subscription/Quota**

**Endpoint:** `GET /api/subscription/status`

**Request:**
```typescript
Authorization: Bearer <firebase-id-token>
```

**Response:**
```typescript
{
  "subscription": {
    "status": "trialing" | "active" | "past_due" | "canceled",
    "tier": "pro",
    "currentPeriodEnd": "2025-01-15T00:00:00Z",
    "trialEndsAt": "2025-12-09T00:00:00Z",
    "cancelAtPeriodEnd": false
  },
  "usage": {
    "limit": 300,
    "used": 47,
    "remaining": 253,
    "periodStart": "2025-12",
    "lastReset": "2025-12-01T00:00:00Z"
  }
}
```

**Backend Logic:**
```typescript
export async function getSubscriptionStatus(req: Request, res: Response) {
  const userId = await verifyFirebaseToken(req);
  
  const userDoc = await admin.firestore().doc(`users/${userId}`).get();
  const data = userDoc.data();
  
  return res.json({
    subscription: data?.subscription || { status: 'none', tier: 'free' },
    usage: {
      limit: 300,
      used: data?.usage?.applications_this_month || 0,
      remaining: 300 - (data?.usage?.applications_this_month || 0),
      periodStart: data?.usage?.month_started,
      lastReset: data?.usage?.last_reset
    }
  });
}
```

---

#### **4. Create Checkout Session** ✅ Already Implemented!

**Endpoint:** Firebase Cloud Function `createCheckoutSession`

**Already secure - no changes needed.**

---

#### **5. Stripe Webhook Handler** ✅ Already Implemented!

**Endpoint:** Firebase Cloud Function `stripeWebhook`

**Already secure - no changes needed.**

---

### **Important (Should Implement Soon)**

#### **6. Generate AI Cover Letter** (When implemented)

**Endpoint:** `POST /api/ai/cover-letter`

**Request:**
```typescript
Authorization: Bearer <firebase-id-token>
Content-Type: application/json

{
  "jobDescription": "We are looking for a senior engineer...",
  "resume": "John Doe\nSoftware Engineer..."
}
```

**Backend Logic:**
```typescript
export async function generateCoverLetter(req: Request, res: Response) {
  const userId = await verifyFirebaseToken(req);
  
  // Check subscription (premium feature)
  const subscription = await getSubscriptionStatus(userId);
  if (subscription.status !== 'active' && subscription.status !== 'trialing') {
    return res.status(403).json({ error: 'Premium feature - subscription required' });
  }
  
  // Call OpenAI (API key safe on server)
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You are a cover letter writing expert...' },
      { role: 'user', content: `Job: ${req.body.jobDescription}\n\nResume: ${req.body.resume}` }
    ]
  });
  
  return res.json({
    coverLetter: response.choices[0].message.content
  });
}
```

**Why protect:**
- OpenAI API key stays on server (not exposed)
- Expensive calls are gated by subscription
- Can track usage / implement rate limiting

---

#### **7. Delete Account**

**Endpoint:** `DELETE /api/account`

**Backend Logic:**
```typescript
export async function deleteAccount(req: Request, res: Response) {
  const userId = await verifyFirebaseToken(req);
  
  // 1. Cancel Stripe subscription
  const userDoc = await admin.firestore().doc(`users/${userId}`).get();
  const stripeCustomerId = userDoc.data()?.subscription?.stripeCustomerId;
  
  if (stripeCustomerId) {
    const subscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId
    });
    
    for (const sub of subscriptions.data) {
      await stripe.subscriptions.cancel(sub.id);
    }
  }
  
  // 2. Delete Firestore data
  await admin.firestore().doc(`users/${userId}`).delete();
  await admin.firestore().doc(`users/${userId}/vault/profile`).delete();
  
  // 3. Delete Firebase Auth user
  await admin.auth().deleteUser(userId);
  
  // 4. Log for compliance
  await admin.firestore().collection('account_deletions').add({
    userId,
    deletedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  return res.json({ success: true });
}
```

---

### **Optional (Nice to Have)**

#### **8. Rate Limit Google Sheets Backup**

**Current:** Extension calls Google Sheets API directly with OAuth token

**Problem:** Users could spam backups, hit Google quotas

**Solution:** Proxy through backend with rate limiting

```typescript
export async function createBackup(req: Request, res: Response) {
  const userId = await verifyFirebaseToken(req);
  
  // Check last backup time
  const userDoc = await admin.firestore().doc(`users/${userId}`).get();
  const lastBackup = userDoc.data()?.lastBackup;
  
  if (lastBackup && Date.now() - lastBackup.toMillis() < 3600000) {
    return res.status(429).json({ 
      error: 'Backups limited to once per hour',
      nextAllowed: new Date(lastBackup.toMillis() + 3600000)
    });
  }
  
  // Update last backup time
  await admin.firestore().doc(`users/${userId}`).update({
    lastBackup: admin.firestore.FieldValue.serverTimestamp()
  });
  
  return res.json({ allowed: true });
}
```

---

## 🛡️ Security Enforcement

### **Principle: Defense in Depth**

**Layer 1: Client-Side Check (UX)**
```typescript
// Extension - fast check for immediate feedback
const subscription = await getDoc(doc(firestore, `users/${userId}`));
if (subscription.data()?.subscription?.status !== 'active') {
  showUpgradeDialog(); // Fast feedback
  return;
}
```

**Layer 2: Server-Side Validation (Security)**
```typescript
// Backend API - real enforcement
const response = await fetch('/api/jobs/apply', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});

if (response.status === 403) {
  // Even if client check was bypassed, server blocks
  throw new Error('Subscription required');
}
```

**Layer 3: Essential Data Withholding (Enforcement)**
```typescript
// Backend returns vault data extension needs
// User can't proceed without this data
const { vault, runToken } = await response.json();

// Use vault data for form filling
fillForm(vault);
```

**Result:**
- Fast UX (Layer 1 shows error immediately)
- Secure (Layer 2 prevents bypass)
- Enforced (Layer 3 makes bypass useless - no data to fill forms)

---

### **JWT Run Tokens**

**Purpose:** Prevent users from calling `/jobs/complete` without actually applying

**How it works:**
```typescript
// Backend generates token when granting permission
const runToken = jwt.sign(
  { 
    userId: 'user123',
    jobId: 'linkedin_456',
    timestamp: Date.now()
  },
  JWT_SECRET,
  { expiresIn: '10m' } // Short-lived
);

// Extension must present this token when reporting completion
POST /api/jobs/complete
{
  "jobId": "linkedin_456",
  "runToken": "eyJhbGciOiJI..."
}

// Backend verifies token matches job and user
jwt.verify(runToken, JWT_SECRET);
```

**Benefits:**
- ✅ User can't fake completions
- ✅ Can't increment usage without permission
- ✅ Time-limited (10 min expiry)

---

### **Firestore Security Rules** (Additional Layer)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read their own data
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if false; // Only backend can write
    }
    
    // Vault data is read-only from client
    match /users/{userId}/vault/{document} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if false; // Only backend can write
    }
  }
}
```

**Benefits:**
- Even if user modifies extension code, Firestore blocks direct writes
- Subscription status can't be tampered with
- Usage counters can't be reset

---

## ✅ Implementation Checklist

### **Phase 1: Website Integration** (Required for Stripe)

- [ ] **1.1** Add `chrome.runtime.onInstalled` listener to extension
  ```typescript
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      chrome.tabs.create({
        url: 'https://jobzippy.ai/welcome?installed=true'
      });
    }
  });
  ```

- [ ] **1.2** Update `manifest.json` to allow extension messaging
  ```json
  {
    "externally_connectable": {
      "matches": ["https://jobzippy.ai/*"]
    }
  }
  ```

- [ ] **1.3** Create welcome page (`marketing-ui/app/welcome/page.tsx`)
  - Show what JobZippy does (1 sentence)
  - Display "3-Day Free Trial" badge prominently
  - Show "$9.99/month after trial"
  - Big "Start Free Trial" button
  - NO onboarding form yet (payment first!)

- [ ] **1.4** Create success page (`marketing-ui/app/success/page.tsx`)
  ```typescript
  // Extract session_id from URL
  const sessionId = searchParams.get('session_id');
  
  // Verify with Stripe (optional)
  // ...
  
  // Send message to extension
  useEffect(() => {
    chrome.runtime.sendMessage(EXTENSION_ID, {
      type: 'SUBSCRIPTION_ACTIVE',
      sessionId
    });
  }, []);
  
  // Show success message + next steps
  ```

- [ ] **1.5** Add external message listener in extension
  ```typescript
  // ui/src/background/index.ts
  chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    if (sender.origin !== 'https://jobzippy.ai') return;
    
    if (message.type === 'SUBSCRIPTION_ACTIVE') {
      // Refresh subscription from Firestore
      refreshSubscriptionStatus();
      // Show success notification
      sendResponse({ received: true });
    }
  });
  ```

---

### **Phase 2: Secure API Endpoints**

- [ ] **2.1** Update `/api/create-checkout` endpoint
  ```typescript
  // api/src/routes/checkout.ts
  router.post('/create-checkout', async (req, res) => {
    // Verify Firebase ID token from Authorization header
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    // Create Stripe session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: decodedToken.email,
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      subscription_data: {
        trial_period_days: 3,
        metadata: { userId: decodedToken.uid }
      },
      success_url: 'https://jobzippy.ai/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://jobzippy.ai/welcome'
    });
    
    res.json({ url: session.url, sessionId: session.id });
  });
  ```

- [ ] **2.2** Create `/api/jobs/apply` endpoint (NEW)
  ```typescript
  // api/src/routes/jobs.ts
  router.post('/apply', authenticateFirebase, async (req, res) => {
    const userId = req.user.uid;
    
    // Validate subscription
    const userDoc = await admin.firestore().doc(`users/${userId}`).get();
    const subscription = userDoc.data()?.subscription;
    
    if (subscription?.status !== 'active' && subscription?.status !== 'trialing') {
      return res.status(403).json({ error: 'Subscription required' });
    }
    
    // Check quota
    const usage = userDoc.data()?.usage?.applications_this_month || 0;
    if (usage >= 300) {
      return res.status(429).json({ error: 'Monthly limit reached' });
    }
    
    // Increment usage
    await admin.firestore().doc(`users/${userId}`).update({
      'usage.applications_this_month': admin.firestore.FieldValue.increment(1)
    });
    
    // Get vault data
    const vaultDoc = await admin.firestore()
      .doc(`users/${userId}/vault/profile`).get();
    
    // Generate run token
    const runToken = jwt.sign(
      { userId, jobId: req.body.jobId, timestamp: Date.now() },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );
    
    res.json({
      allowed: true,
      remaining: 300 - usage - 1,
      vault: vaultDoc.data(),
      runToken
    });
  });
  ```

- [ ] **2.3** Create `/api/jobs/complete` endpoint (NEW)
  ```typescript
  router.post('/complete', authenticateFirebase, async (req, res) => {
    const userId = req.user.uid;
    
    // Verify run token
    const decoded = jwt.verify(req.body.runToken, process.env.JWT_SECRET);
    if (decoded.userId !== userId) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    
    // Log completion
    await admin.firestore().collection('job_completions').add({
      userId,
      jobId: req.body.jobId,
      status: req.body.status,
      completedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({ success: true });
  });
  ```

- [ ] **2.4** Create `/api/subscription/status` endpoint (NEW)
  ```typescript
  router.get('/status', authenticateFirebase, async (req, res) => {
    const userId = req.user.uid;
    const userDoc = await admin.firestore().doc(`users/${userId}`).get();
    const data = userDoc.data();
    
    res.json({
      subscription: data?.subscription || { status: 'none' },
      usage: {
        limit: 300,
        used: data?.usage?.applications_this_month || 0,
        remaining: 300 - (data?.usage?.applications_this_month || 0)
      }
    });
  });
  ```

- [ ] **2.5** Add Firebase auth middleware
  ```typescript
  // api/src/middleware/auth.ts
  export async function authenticateFirebase(req, res, next) {
    const token = req.headers.authorization?.split('Bearer ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      req.user = decodedToken;
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }
  ```

---

### **Phase 3: Extension Updates**

- [ ] **3.1** Update job application flow to call backend first
  ```typescript
  // ui/src/background/index.ts
  case 'APPLY_JOB_START': {
    // Get Firebase ID token
    const token = await auth.currentUser?.getIdToken();
    
    if (!token) {
      sendResponse({ success: false, error: 'Not authenticated' });
      return;
    }
    
    // Call backend API to validate subscription + get vault
    const response = await fetch('https://api.jobzippy.ai/jobs/apply', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jobId: msg.data.jobId,
        platform: msg.data.platform,
        jobData: msg.data
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      
      if (response.status === 403) {
        // Subscription required
        sendResponse({ 
          success: false, 
          error: 'SUBSCRIPTION_REQUIRED',
          message: error.error 
        });
        return;
      }
      
      if (response.status === 429) {
        // Quota exceeded
        sendResponse({ 
          success: false, 
          error: 'QUOTA_EXCEEDED',
          message: error.error 
        });
        return;
      }
    }
    
    // Get vault data and run token
    const { vault, runToken, remaining } = await response.json();
    
    // Store run token for later
    const session: JobSession = {
      jobId: msg.data.jobId,
      sourceTabId,
      status: 'pending',
      startedAt: Date.now(),
      runToken, // Store for completion
      vault // Store for form filling
    };
    
    jobSessions.set(msg.data.jobId, session);
    
    // Continue with existing job flow...
    // (form filling, submission, etc.)
  }
  ```

- [ ] **3.2** Update job completion to report to backend
  ```typescript
  // When job completes (success or failure)
  async function completeJob(jobId: string, status: 'success' | 'failed', error?: string) {
    const session = jobSessions.get(jobId);
    if (!session?.runToken) return;
    
    const token = await auth.currentUser?.getIdToken();
    
    await fetch('https://api.jobzippy.ai/jobs/complete', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jobId,
        runToken: session.runToken,
        status,
        errorMessage: error
      })
    });
    
    // Clean up
    jobSessions.delete(jobId);
  }
  ```

- [ ] **3.3** Add subscription check on extension startup
  ```typescript
  // ui/src/lib/auth/AuthContext.tsx
  useEffect(() => {
    if (user) {
      // Fetch subscription status from backend (source of truth)
      fetch('https://api.jobzippy.ai/subscription/status', {
        headers: { 'Authorization': `Bearer ${await user.getIdToken()}` }
      })
        .then(r => r.json())
        .then(data => {
          setSubscriptionStatus(data.subscription);
          setUsageQuota(data.usage);
        });
    }
  }, [user]);
  ```

- [ ] **3.4** Show subscription UI in dashboard
  ```typescript
  // ui/src/sidepanel/App.tsx
  {subscriptionStatus?.status === 'none' && (
    <SubscriptionCard /> // Show trial offer
  )}
  
  {(subscriptionStatus?.status === 'active' || 
    subscriptionStatus?.status === 'trialing') && (
    <SubscriptionStatus 
      status={subscriptionStatus}
      usage={usageQuota}
    />
  )}
  ```

---

### **Phase 4: Firebase Configuration**

- [ ] **4.1** Update Firestore Security Rules
  ```javascript
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /users/{userId} {
        allow read: if request.auth != null && request.auth.uid == userId;
        allow write: if false; // Only backend/functions can write
      }
      
      match /users/{userId}/vault/{document} {
        allow read: if request.auth != null && request.auth.uid == userId;
        allow write: if false;
      }
      
      match /job_completions/{document} {
        allow read, write: if false; // Backend only
      }
    }
  }
  ```

- [ ] **4.2** Add Cloud Function for monthly usage reset
  ```typescript
  // functions/src/index.ts
  export const resetMonthlyUsage = functions.pubsub
    .schedule('0 0 1 * *') // First day of each month at midnight
    .timeZone('America/Los_Angeles')
    .onRun(async () => {
      const usersSnapshot = await admin.firestore()
        .collection('users')
        .where('subscription.status', 'in', ['active', 'trialing'])
        .get();
      
      const batch = admin.firestore().batch();
      
      usersSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
          'usage.applications_this_month': 0,
          'usage.month_started': new Date().toISOString().slice(0, 7),
          'usage.last_reset': admin.firestore.FieldValue.serverTimestamp()
        });
      });
      
      await batch.commit();
      
      functions.logger.info(`Reset usage for ${usersSnapshot.size} users`);
    });
  ```

- [ ] **4.3** Deploy Cloud Functions
  ```bash
  cd functions
  firebase deploy --only functions
  ```

---

### **Phase 5: Environment Variables**

- [ ] **5.1** Update `functions/.env`
  ```env
  STRIPE_SECRET_KEY=sk_test_xxxxx
  STRIPE_PRICE_ID=price_xxxxx
  STRIPE_WEBHOOK_SECRET=whsec_xxxxx
  ```

- [ ] **5.2** Create `api/.env`
  ```env
  FIREBASE_PROJECT_ID=jobzippy-d4002
  FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
  FIREBASE_CLIENT_EMAIL=firebase-adminsdk@jobzippy-d4002.iam.gserviceaccount.com
  JWT_SECRET=your-random-secret-here
  STRIPE_SECRET_KEY=sk_test_xxxxx
  ```

- [ ] **5.3** Update extension to use production API URL
  ```typescript
  // ui/src/lib/config.ts
  export const API_BASE_URL = 
    process.env.NODE_ENV === 'production'
      ? 'https://api.jobzippy.ai'
      : 'http://localhost:8787';
  ```

---

### **Phase 6: Deployment**

- [ ] **6.1** Deploy marketing website to Vercel/Netlify
  ```bash
  cd marketing-ui
  npm run build
  # Deploy to hosting platform
  ```

- [ ] **6.2** Deploy API backend to Google Cloud Run
  ```bash
  cd api
  npm run build
  gcloud run deploy jobzippy-api \
    --source . \
    --region us-central1 \
    --allow-unauthenticated
  ```

- [ ] **6.3** Update DNS for `api.jobzippy.ai`

- [ ] **6.4** Build and upload extension to Chrome Web Store
  ```bash
  cd ui
  npm run build
  # Upload dist/ folder to Chrome Web Store
  ```

---

## 🧪 Testing & Validation

### **Test Case 1: Website-First Flow**

1. Visit `https://jobzippy.ai`
2. Click "Start Free Trial"
3. Sign in with Google
4. Complete Stripe checkout with test card `4242 4242 4242 4242`
5. Redirected to success page
6. Download extension
7. Extension auto-authenticates
8. Dashboard shows subscription status
9. Click "Apply to Job"
10. Verify backend API call succeeds
11. Job application completes

**Expected:**
- ✅ Only signed in once
- ✅ Subscription shows "trialing"
- ✅ Usage shows "0/300"
- ✅ Job applies successfully
- ✅ Usage increments to "1/300"

---

### **Test Case 2: Chrome Web Store First Flow**

1. Install extension from Chrome Web Store
2. Extension opens welcome page automatically
3. Click "Start Free Trial" on welcome page
4. Sign in with Google
5. Complete Stripe checkout
6. Redirected to success page
7. Extension receives subscription message
8. Dashboard shows active subscription
9. Apply to job
10. Verify backend validates

**Expected:**
- ✅ Welcome page opens automatically
- ✅ Pricing shown before any onboarding
- ✅ Subscription activates after payment
- ✅ Job application works

---

### **Test Case 3: Bypass Attempt (Security)**

1. Install extension
2. Do NOT subscribe
3. Open Chrome DevTools
4. Try to modify background script to skip check
5. Try to call job application

**Expected:**
- ✅ Backend API returns 403 Forbidden
- ✅ No vault data returned
- ✅ Job application cannot proceed
- ✅ Usage not incremented

---

### **Test Case 4: Quota Limit**

1. Subscribe to plan
2. Use backend API to set usage to 299
3. Apply to 1 job → succeeds
4. Try to apply to another job → blocked

**Expected:**
- ✅ 300th application succeeds
- ✅ 301st application blocked with 429 status
- ✅ Error message shows "Monthly limit reached"

---

### **Test Case 5: Subscription Cancellation**

1. Subscribe to plan
2. Cancel subscription in Stripe Dashboard
3. Wait for webhook to fire
4. Try to apply to job

**Expected:**
- ✅ Webhook updates Firestore to "canceled"
- ✅ Backend API blocks application
- ✅ Dashboard shows "Subscription Expired"

---

### **Test Case 6: Trial Expiry**

1. Create test subscription with trial
2. Use Stripe test clock to advance 3 days
3. Try to apply to job after trial ends
4. Verify subscription converts to paid

**Expected:**
- ✅ During trial: applications work
- ✅ After trial ends: auto-converts to paid
- ✅ If payment fails: status → "past_due"
- ✅ Past due blocks applications

---

## 📊 Firestore Data Structure

```typescript
// users/{userId}
{
  email: "user@example.com",
  createdAt: Timestamp,
  updatedAt: Timestamp,
  
  subscription: {
    status: "trialing" | "active" | "past_due" | "canceled" | "paused",
    tier: "free" | "pro",
    stripeCustomerId: "cus_xxxxx",
    stripeSubscriptionId: "sub_xxxxx",
    stripePriceId: "price_xxxxx",
    currentPeriodEnd: Timestamp,
    cancelAtPeriodEnd: boolean,
    trialEndsAt: Timestamp | null,
  },
  
  usage: {
    applications_this_month: 47,
    month_started: "2025-12", // YYYY-MM
    last_reset: Timestamp,
    last_application: Timestamp
  },
  
  onboarding: {
    status: "completed",
    completedAt: Timestamp
  }
}

// users/{userId}/vault/profile
{
  name: "John Doe",
  email: "john@example.com",
  phone: "(555) 555-5555",
  location: "San Francisco, CA",
  resume: "Blob or base64",
  // ... other vault fields
}

// job_completions/{id}
{
  userId: "user123",
  jobId: "linkedin_456",
  status: "success" | "failed",
  errorMessage: "optional",
  completedAt: Timestamp
}
```

---

## 🔗 URLs & Endpoints

### **Production URLs**

| Service | URL |
|---------|-----|
| Marketing Site | `https://jobzippy.ai` |
| Welcome Page | `https://jobzippy.ai/welcome?installed=true` |
| Success Page | `https://jobzippy.ai/success?session_id={CHECKOUT_SESSION_ID}` |
| API Backend | `https://api.jobzippy.ai` |
| Chrome Extension | `chrome-extension://[extension-id]/sidepanel.html` |

### **API Endpoints**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/create-checkout` | Create Stripe checkout session |
| `POST` | `/api/jobs/apply` | Validate subscription + start job |
| `POST` | `/api/jobs/complete` | Log job completion |
| `GET` | `/api/subscription/status` | Get subscription + usage |
| `POST` | `/api/ai/cover-letter` | Generate cover letter (future) |
| `DELETE` | `/api/account` | Delete user account (future) |

### **Firebase Cloud Functions**

| Function | Type | Purpose |
|----------|------|---------|
| `createCheckoutSession` | HTTP | Create Stripe checkout (alternative to API) |
| `stripeWebhook` | HTTP | Handle Stripe events |
| `resetMonthlyUsage` | Scheduled | Reset usage counters monthly |

---

## 💰 Pricing Configuration

**Stripe Price ID (Test):** `price_1SbBM43mnoQdTKv9auRYt15C`

**Settings:**
- **Price:** $9.99/month
- **Trial:** 3 days
- **Card Required:** Yes (upfront)
- **Billing Cycle:** Monthly
- **Limit:** 300 applications/month

**Test Cards:**
```
Success: 4242 4242 4242 4242
Decline: 4000 0000 0000 0002
3D Secure: 4000 0027 6000 3184
```

---

## 🎓 Key Learnings & Best Practices

### **1. Manifest V3 Limitations**
- ❌ Can't load external scripts (Stripe.js)
- ❌ Sandboxed pages don't bypass CSP
- ✅ Solution: Hosted checkout on website

### **2. Show Pricing First**
- ❌ Bad: Onboard → surprise paywall
- ✅ Good: Show price → payment → onboard
- Result: Better reviews, higher trust

### **3. Server-Side Enforcement**
- ❌ Client-side checks can be bypassed
- ✅ Server validates subscription
- ✅ Server withholds essential data (vault)
- Result: Users can't get free service

### **4. Dual Entry Points**
- Support both website-first and Web Store-first
- Both flows redirect to website for payment
- Website is required (not optional)

### **5. Token Security**
- ❌ Never put tokens in URLs
- ✅ Use Authorization header
- ✅ Generate short-lived run tokens
- ✅ Verify tokens server-side

### **6. Usage Tracking**
- Server increments atomically
- Reset via scheduled Cloud Function
- Display in UI (read-only)
- Enforce limits server-side

---

## 📚 References

### **Stripe Documentation**
- [Checkout Session](https://stripe.com/docs/api/checkout/sessions)
- [Subscriptions](https://stripe.com/docs/billing/subscriptions/overview)
- [Webhooks](https://stripe.com/docs/webhooks)
- [Test Cards](https://stripe.com/docs/testing)

### **Chrome Extension**
- [Manifest V3](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Content Security Policy](https://developer.chrome.com/docs/extensions/mv3/intro/mv3-overview/#content-security-policy)
- [External Messaging](https://developer.chrome.com/docs/extensions/mv3/messaging/#external)

### **Firebase**
- [Auth Admin SDK](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Cloud Functions](https://firebase.google.com/docs/functions)
- [Scheduled Functions](https://firebase.google.com/docs/functions/schedule-functions)

---

## ✅ Summary Checklist

**Architecture:**
- [x] Understand Manifest V3 CSP limitations
- [x] Choose hosted checkout over embedded
- [x] Plan for dual entry points
- [x] Define security layers

**Website:**
- [ ] Create welcome page
- [ ] Create success page
- [ ] Deploy to jobzippy.ai

**Backend:**
- [ ] Implement `/api/jobs/apply`
- [ ] Implement `/api/jobs/complete`
- [ ] Implement `/api/subscription/status`
- [ ] Deploy to Google Cloud Run

**Extension:**
- [ ] Add onInstalled listener
- [ ] Update job flow to call backend
- [ ] Add subscription status display
- [ ] Handle external messages

**Firebase:**
- [ ] Update Firestore security rules
- [ ] Create usage reset function
- [ ] Deploy functions

**Testing:**
- [ ] Test website-first flow
- [ ] Test Web Store-first flow
- [ ] Test bypass attempts
- [ ] Test quota limits
- [ ] Test subscription lifecycle

---

## 🎯 Next Steps

1. **Implement Phase 1** (Website Integration) - Enables Stripe checkout
2. **Implement Phase 2** (API Endpoints) - Secures subscription validation
3. **Implement Phase 3** (Extension Updates) - Enforces backend calls
4. **Test End-to-End** - Validate all flows work
5. **Deploy to Production** - Go live!

---

---

## 📝 Implementation Stories (One-by-One Tasks)

### **Priority 1: Critical Path (Must Have for Launch)**

#### **Story 1.1: Extension opens welcome page on install**
- [ ] Add `chrome.runtime.onInstalled` listener that opens `jobzippy.ai/welcome?installed=true` on first install

#### **Story 1.2: Create welcome page with pricing displayed**
- [ ] Build `marketing-ui/app/welcome/page.tsx` that shows features, "3-day trial", "$9.99/month", and "Start Free Trial" button

#### **Story 1.3: Implement secure checkout creation endpoint**
- [ ] Create `POST /api/create-checkout` that validates Firebase token and returns Stripe checkout URL

#### **Story 1.4: Wire up welcome page to call checkout endpoint**
- [ ] Connect "Start Free Trial" button to sign in with Google, get Firebase token, call `/api/create-checkout`, redirect to Stripe

#### **Story 1.5: Create success page that notifies extension**
- [ ] Build `marketing-ui/app/success/page.tsx` that sends `chrome.runtime.sendMessage` to extension with subscription confirmation

#### **Story 1.6: Extension listens for subscription activation message**
- [ ] Add `chrome.runtime.onMessageExternal` listener in background script to receive activation from website

#### **Story 1.7: Implement backend job application validation endpoint**
- [ ] Create `POST /api/jobs/apply` that checks subscription, enforces quota (300/month), returns vault data + run token

#### **Story 1.8: Extension calls backend before applying to jobs**
- [ ] Update `APPLY_JOB_START` handler to call `/api/jobs/apply` first, extract vault + runToken, then proceed with form filling

#### **Story 1.9: Extension reports job completion to backend**
- [ ] Create `POST /api/jobs/complete` endpoint and call it from extension when job succeeds/fails with runToken

#### **Story 1.10: Display subscription status in dashboard**
- [ ] Add `SubscriptionStatus` component that fetches and shows subscription tier, trial status, and usage (X/300 applications)

---

### **Priority 2: Security Hardening (Can't Launch Without)**

#### **Story 2.1: Update Firestore security rules to block client writes**
- [ ] Deploy Firestore rules that only allow reads for authenticated users, writes only from backend/functions

#### **Story 2.2: Add JWT secret to backend environment**
- [ ] Generate random JWT secret, add to `api/.env`, use for signing run tokens

#### **Story 2.3: Verify run token in job completion endpoint**
- [ ] Update `/api/jobs/complete` to verify JWT signature and match userId + jobId

#### **Story 2.4: Move vault data to server-side only access**
- [ ] Ensure vault data is ONLY returned from `/api/jobs/apply`, not readable directly from Firestore by extension

#### **Story 2.5: Test bypass attempts and confirm they fail**
- [ ] Manually try to modify extension code to skip backend call, verify job application fails without vault data

---

### **Priority 3: Polish & UX (Nice to Have)**

#### **Story 3.1: Show usage quota in dashboard**
- [ ] Display "47/300 applications this month" with progress bar in `SubscriptionStatus` component

#### **Story 3.2: Handle subscription errors gracefully**
- [ ] Show user-friendly error messages when subscription is expired, quota exceeded, or payment failed

#### **Story 3.3: Add loading states during checkout**
- [ ] Show spinner on "Start Free Trial" button while calling backend and redirecting to Stripe

#### **Story 3.4: Implement monthly usage reset Cloud Function**
- [ ] Create scheduled function `resetMonthlyUsage` that runs on 1st of each month to reset all users' counters

#### **Story 3.5: Add "Manage Subscription" button**
- [ ] Create Stripe Customer Portal link and add button in dashboard to manage subscription/billing

#### **Story 3.6: Show trial countdown**
- [ ] Display "2 days left in trial" when subscription status is "trialing"

#### **Story 3.7: Handle first-time user with existing subscription**
- [ ] If user signs in from website and already has subscription, auto-redirect to extension (skip onboarding)

#### **Story 3.8: Add analytics tracking**
- [ ] Track key events: trial started, first job applied, subscription converted, quota hit

---

### **Priority 4: Future Enhancements (Post-Launch)**

#### **Story 4.1: Implement AI cover letter generation**
- [ ] Create `POST /api/ai/cover-letter` endpoint that calls OpenAI with user's resume + job description

#### **Story 4.2: Rate limit Google Sheets backups**
- [ ] Proxy backup requests through backend with 1-per-hour rate limit

#### **Story 4.3: Add delete account endpoint**
- [ ] Create `DELETE /api/account` that cancels Stripe subscription, deletes Firestore data, and removes Firebase Auth user

#### **Story 4.4: Implement referral rewards system**
- [ ] Track referrals in Firestore, give bonus applications for successful referrals

#### **Story 4.5: Add job recommendations API**
- [ ] Create AI-powered endpoint that suggests best-fit jobs based on user profile

#### **Story 4.6: Build admin dashboard**
- [ ] Create protected admin UI to view user subscriptions, usage stats, and system health

---

### **Testing Stories (Run After Each Priority)**

#### **Test T.1: End-to-end website-first flow**
- [ ] Install extension via website → payment → download → auto-authenticated → apply to job → success

#### **Test T.2: End-to-end Web Store-first flow**
- [ ] Install from Web Store → opens welcome page → payment → subscription active → apply to job → success

#### **Test T.3: Security bypass test**
- [ ] Modify extension code to skip backend call → verify job application fails → no vault data

#### **Test T.4: Quota limit test**
- [ ] Set usage to 299 → apply to 1 job (succeeds) → apply to another (blocked with 429)

#### **Test T.5: Subscription lifecycle test**
- [ ] Trial starts → apply to jobs → trial expires → auto-converts to paid → cancel → blocked

#### **Test T.6: Payment failure test**
- [ ] Use declining card → verify checkout fails gracefully → no subscription created

---

## 🎯 Quick Start Guide (What to Build First)

**Week 1 - Minimal Viable Subscription (MVS):**
1. Stories 1.1 - 1.6 (Website integration + checkout)
2. Test: Can user complete checkout and get redirected?

**Week 2 - Backend Enforcement:**
3. Stories 1.7 - 1.9 (API validation)
4. Stories 2.1 - 2.5 (Security)
5. Test: Can backend block freeloaders?

**Week 3 - Polish:**
6. Story 1.10 (Dashboard UI)
7. Stories 3.1 - 3.3 (UX improvements)
8. Run all tests T.1 - T.6

**Week 4 - Launch:**
9. Deploy everything to production
10. Update Chrome Web Store listing
11. Go live! 🚀

---

## 📊 Story Status Tracker

```
Priority 1 (Critical):    [ ] 0/10 complete
Priority 2 (Security):    [ ] 0/5 complete
Priority 3 (Polish):      [ ] 0/8 complete
Priority 4 (Future):      [ ] 0/6 complete
Testing:                  [ ] 0/6 complete
───────────────────────────────────────
Total:                    [ ] 0/35 complete
```

---

**Document Version:** 1.0  
**Authors:** AI Assistant + User (Adi) + ChatGPT Feedback  
**Status:** Ready for Implementation 🚀

