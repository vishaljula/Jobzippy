# Jobzippy - Product Backlog

**Status Legend:** 🔴 Not Started | 🟡 In Progress | 🟢 Complete

---

## Epic 1: Project Setup & Infrastructure

### JZ-001: Project Scaffolding & Build System
**Priority:** P0 (Blocker)  
**Status:** 🟢 **COMPLETE**  
**Story Points:** 3  
**Dependencies:** None

**Description:**  
Set up the Chrome extension project structure with modern build tooling, TypeScript, and development environment.

**Acceptance Criteria:**
- [x] Chrome extension manifest v3 configured
- [x] TypeScript setup with strict mode
- [x] Build system (Vite) for extension bundling
- [x] Hot reload for development (`npm run dev`)
- [x] Project structure organized (background, content, sidepanel)
- [x] ESLint and Prettier configured
- [x] Package.json with all dependencies
- [x] .gitignore properly configured

**Completed:** ✅ All files created, build successful, extension ready to load

**Technical Notes:**
```
/Jobzippy
  /src
    /background      # Service worker
    /content         # Content scripts for job sites
    /sidepanel       # Main UI
    /components      # Reusable UI components
    /lib             # Utilities
    /types           # TypeScript definitions
  /public
    manifest.json
    icons/
  /dist              # Build output
```

---

### JZ-002: Design System & UI Foundation
**Priority:** P0 (Blocker)  
**Status:** 🟢 **COMPLETE**  
**Story Points:** 5  
**Dependencies:** JZ-001

**Description:**  
Create a modern, stylish design system with reusable components for the extension UI.

**Acceptance Criteria:**
- [x] Color palette defined (primary, secondary, accent, neutral)
- [x] Typography system (font families, sizes, weights)
- [x] Component library setup (shadcn/ui + Radix UI)
- [x] Button, Input, Card, Dialog, Toast components
- [x] Select/Dropdown and Tabs components
- [x] Side-panel layout with header, navigation, content areas
- [x] Responsive design for different panel widths
- [x] Loading states and animations (via tailwindcss-animate)
- [x] Error state components (via toast system)

**Completed:** ✅ shadcn/ui integrated, 7 components added, Toaster system configured

**Design Direction:**
- Modern, professional, trustworthy
- Clean and minimal (not cluttered)
- AI-forward aesthetic (subtle gradients, smooth transitions)
- Accessibility compliant (WCAG AA)

---

### JZ-003: Development & Testing Infrastructure
**Priority:** P1  
**Status:** 🟢 **COMPLETE**  
**Story Points:** 3  
**Dependencies:** JZ-001

**Description:**  
Set up testing framework, CI/CD pipeline, and quality assurance tools.

**Acceptance Criteria:**
- [x] Vitest + React Testing Library configured
- [x] Playwright for E2E testing
- [x] GitHub Actions workflow for CI
- [x] Pre-commit hooks (lint, type-check) with Husky + lint-staged
- [x] Test coverage reporting (v8 provider)
- [x] Testing documentation (TESTING.md)

**Completed:** ✅ Full testing infrastructure with 12 passing tests, CI/CD, and pre-commit hooks

---

## Epic 2: Authentication & User Management

### JZ-004: Google OAuth Integration (PKCE)
**Priority:** P0 (Blocker)  
**Status:** 🔴  
**Story Points:** 5  
**Dependencies:** JZ-001

**Description:**  
Implement Google OAuth 2.0 with PKCE flow for secure authentication in the Chrome extension.

**Acceptance Criteria:**
- [ ] OAuth 2.0 PKCE flow implemented
- [ ] Scopes requested: `openid`, `email`, `profile`, `drive.file`, `spreadsheets`
- [ ] Optional Gmail scope: `gmail.readonly` with clear consent
- [ ] Token storage in chrome.storage.local (encrypted)
- [ ] Token refresh logic
- [ ] Logout functionality
- [ ] OAuth consent screen copy matches spec
- [ ] Error handling for auth failures

**OAuth Scopes:**
```
Required:
- openid email profile
- https://www.googleapis.com/auth/drive.file
- https://www.googleapis.com/auth/spreadsheets

Optional:
- https://www.googleapis.com/auth/gmail.readonly
```

---

### JZ-005: Firebase/Firestore Backend Setup
**Priority:** P0 (Blocker)  
**Status:** 🔴  
**Story Points:** 3  
**Dependencies:** JZ-004

**Description:**  
Set up Firebase project with Firestore for minimal user metadata storage.

**Acceptance Criteria:**
- [ ] Firebase project created
- [ ] Firestore security rules configured
- [ ] User collection schema implemented (see spec §9)
- [ ] Referrals collection schema implemented
- [ ] Firebase SDK integrated in extension
- [ ] User document created on first auth
- [ ] Environment variables for Firebase config

**Firestore Schema:**
```javascript
users/{userId}: {
  email, stripe_customer_id, subscription_status,
  phone_verified, referral_code, referred_by,
  sheet_id, cloud_run_enabled, gmail_label,
  payout_method, referral_stats
}

referrals/{refId}: {
  referrer_id, referred_id, status, created_at, unlocked_at
}
```

---

### JZ-006: User Onboarding Flow
**Priority:** P0  
**Status:** 🔴  
**Story Points:** 5  
**Dependencies:** JZ-002, JZ-004

**Description:**  
Create the initial user onboarding experience with Google sign-in and welcome screen.

**Acceptance Criteria:**
- [ ] Welcome screen with value proposition
- [ ] "Sign in with Google" button
- [ ] OAuth consent flow triggered
- [ ] User redirected to setup wizard after auth
- [ ] First-time user vs returning user detection
- [ ] Onboarding progress indicator
- [ ] Skip/resume onboarding capability

---

## Epic 3: Profile Management (IndexedDB Vault)

### JZ-007: IndexedDB Profile Vault Setup
**Priority:** P0 (Blocker)  
**Status:** 🔴  
**Story Points:** 5  
**Dependencies:** JZ-001

**Description:**  
Implement encrypted local storage for sensitive user profile data using IndexedDB and WebCrypto.

**Acceptance Criteria:**
- [ ] IndexedDB database created ("JobzippyVault")
- [ ] Object stores: profile, compliance, history, policies
- [ ] WebCrypto AES-GCM encryption implemented
- [ ] Key derivation from user password/PIN (PBKDF2)
- [ ] Encryption/decryption utilities
- [ ] CRUD operations for profile data
- [ ] Schema validation matching spec §8
- [ ] Export profile (encrypted JSON)
- [ ] Import profile functionality

**Schema (from spec):**
```javascript
{
  profile: { identity, work_auth, preferences },
  compliance: { veteran_status, disability_status, criminal_history_policy },
  history: { employment[], education[] },
  policies: { eeo, salary, relocation, work_shift }
}
```

---

### JZ-008: Resume Upload & Parser
**Priority:** P0  
**Status:** 🔴  
**Story Points:** 8  
**Dependencies:** JZ-007

**Description:**  
Allow users to upload resume (PDF/DOCX) and parse it to populate Profile Vault.

**Acceptance Criteria:**
- [ ] File upload UI (drag & drop + file picker)
- [ ] Support PDF and DOCX formats
- [ ] Client-side parsing (pdf.js, mammoth.js, or similar)
- [ ] Extract: name, email, phone, work history, education
- [ ] Map parsed data to Profile Vault schema
- [ ] Allow manual editing of parsed data
- [ ] Show parsing confidence/review screen
- [ ] Resume stored as encrypted blob (optional)
- [ ] Error handling for unparseable resumes

**Libraries to Consider:**
- pdf.js for PDF parsing
- mammoth.js for DOCX
- OpenAI API for structured extraction (optional, costs $)

---

### JZ-009: Setup Wizard - Profile & Preferences
**Priority:** P0  
**Status:** 🔴  
**Story Points:** 8  
**Dependencies:** JZ-006, JZ-008

**Description:**  
Multi-step wizard to collect user profile, preferences, and compliance policies.

**Acceptance Criteria:**
- [ ] Step 1: Upload & review resume
- [ ] Step 2: Work authorization (visa type, sponsorship required Y/N)
- [ ] Step 3: Job preferences (titles, locations, salary min, remote)
- [ ] Step 4: Compliance policies (EEO, veteran, disability, criminal)
- [ ] Step 5: Application policies (answer/skip/ask/never)
- [ ] Progress indicator (1/5, 2/5, etc.)
- [ ] Back/Next navigation
- [ ] All data saved to Profile Vault
- [ ] Validation on each step
- [ ] "Save & Continue Later" option

**Wizard Steps:**
1. Resume upload
2. Work auth & sponsorship
3. Job search filters
4. Compliance answers
5. Review & confirm

---

### JZ-010: Profile Management Dashboard
**Priority:** P1  
**Status:** 🔴  
**Story Points:** 5  
**Dependencies:** JZ-009

**Description:**  
Allow users to view and edit their profile after initial setup.

**Acceptance Criteria:**
- [ ] Profile overview page
- [ ] Edit sections: Identity, Work Auth, Preferences, Policies
- [ ] Form validation
- [ ] Save changes to Profile Vault
- [ ] "Re-upload resume" option
- [ ] Export profile (encrypted backup)
- [ ] Import profile from backup
- [ ] Delete all data option

---

## Epic 4: Google Sheets Integration

### JZ-011: Google Sheet Creation (Template)
**Priority:** P0 (Blocker)  
**Status:** 🔴  
**Story Points:** 5  
**Dependencies:** JZ-004

**Description:**  
Automatically create a Google Sheet in user's Drive to track job applications.

**Acceptance Criteria:**
- [ ] Use Google Sheets API to create sheet
- [ ] Sheet titled "Jobzippy – Applications (First Last)"
- [ ] 16 columns as per spec §7
- [ ] Header row formatted (bold, frozen)
- [ ] Sheet ID stored in Firestore and chrome.storage
- [ ] Sheet ownership verified (user owns it)
- [ ] Error handling if sheet creation fails
- [ ] "View My Sheet" button in UI

**Columns (A→P):**
```
app_id, date_applied, platform, job_title, company, location,
job_url, status, email_thread_id, email_from, email_subject,
last_email_at, notes, salary, match_score, visa_sponsor_flag
```

---

### JZ-012: Append Application to Sheet
**Priority:** P0  
**Status:** 🔴  
**Story Points:** 3  
**Dependencies:** JZ-011

**Description:**  
Write job application data to Google Sheet when a job is applied to.

**Acceptance Criteria:**
- [ ] Function to append row to sheet
- [ ] Generate UUID for app_id
- [ ] Populate all required columns
- [ ] Handle API rate limits
- [ ] Idempotent writes (don't duplicate by app_id)
- [ ] Retry logic on failure
- [ ] Queue for offline writes (sync when online)
- [ ] Success/error feedback to user

---

### JZ-013: Update Application Status in Sheet
**Priority:** P1  
**Status:** 🔴  
**Story Points:** 3  
**Dependencies:** JZ-012

**Description:**  
Update existing rows in Google Sheet when application status changes.

**Acceptance Criteria:**
- [ ] Find row by app_id
- [ ] Update status column (applied → replied → interview_requested, etc.)
- [ ] Update email metadata columns
- [ ] Batch updates for performance
- [ ] Handle concurrent updates
- [ ] Error handling

---

## Epic 5: Job Search & Apply Automation

### JZ-014: LinkedIn Content Script - Job Search
**Priority:** P0  
**Status:** 🔴  
**Story Points:** 8  
**Dependencies:** JZ-001, JZ-007

**Description:**  
Content script to scrape LinkedIn job listings based on user filters.

**Acceptance Criteria:**
- [ ] Inject content script on linkedin.com/jobs/*
- [ ] Navigate to search results based on filters
- [ ] Extract job listings: title, company, location, URL, salary
- [ ] Detect "Easy Apply" jobs
- [ ] Pagination handling
- [ ] Extract job description details
- [ ] Send jobs to background script
- [ ] Handle LinkedIn DOM changes gracefully
- [ ] Respect rate limits/delays

---

### JZ-015: LinkedIn Content Script - Easy Apply Automation
**Priority:** P0  
**Status:** 🔴  
**Story Points:** 13  
**Dependencies:** JZ-014

**Description:**  
Automate the LinkedIn Easy Apply flow using user's Profile Vault data.

**Acceptance Criteria:**
- [ ] Click "Easy Apply" button
- [ ] Fill form fields from Profile Vault
- [ ] Handle multi-step applications
- [ ] Answer common questions (work auth, salary, start date)
- [ ] Handle EEO questions per user policy
- [ ] Upload resume if required
- [ ] Submit application
- [ ] Detect and handle CAPTCHAs (skip job)
- [ ] Human-like delays (jitter)
- [ ] Error handling & logging
- [ ] Mark job as applied/skipped

**Common Questions to Handle:**
- Work authorization
- Sponsorship needed
- Salary expectations
- Start date
- Relocation willingness
- EEO (race, gender, veteran, disability)
- Criminal history

---

### JZ-016: Indeed Content Script - Job Search
**Priority:** P0  
**Status:** 🔴  
**Story Points:** 8  
**Dependencies:** JZ-014

**Description:**  
Content script to scrape Indeed job listings based on user filters.

**Acceptance Criteria:**
- [ ] Inject content script on indeed.com
- [ ] Navigate to search results based on filters
- [ ] Extract job listings
- [ ] Detect "Apply Now" vs external jobs
- [ ] Pagination handling
- [ ] Extract job description details
- [ ] Send jobs to background script

---

### JZ-017: Indeed Content Script - Apply Automation
**Priority:** P0  
**Status:** 🔴  
**Story Points:** 13  
**Dependencies:** JZ-016

**Description:**  
Automate the Indeed apply flow using user's Profile Vault data.

**Acceptance Criteria:**
- [ ] Click "Apply Now" button
- [ ] Fill form fields from Profile Vault
- [ ] Handle Indeed's apply flow variations
- [ ] Answer common questions
- [ ] Upload resume if required
- [ ] Submit application
- [ ] Handle CAPTCHAs (skip job)
- [ ] Human-like delays
- [ ] Error handling & logging

---

### JZ-018: H-1B/OPT Sponsorship Filter
**Priority:** P0  
**Status:** 🔴  
**Story Points:** 8  
**Dependencies:** None (can be parallel)

**Description:**  
Build a sponsorship database and matching logic to filter companies by visa sponsorship.

**Acceptance Criteria:**
- [ ] Download USCIS H-1B disclosure data
- [ ] Normalize company names/aliases
- [ ] Build parent/subsidiary map
- [ ] Flag staffing agencies
- [ ] Fuzzy matching function (company name → YES/NO/UNKNOWN)
- [ ] Store data efficiently (JSON/SQLite in extension)
- [ ] Filter jobs based on user preference
- [ ] Update data quarterly (manual for MVP)

**Data Sources:**
- USCIS H-1B Disclosure Data
- Public aggregators (h1bdata.info, myvisajobs.com)

---

### JZ-019: Auto-Apply Scheduler
**Priority:** P0  
**Status:** 🔴  
**Story Points:** 5  
**Dependencies:** JZ-015, JZ-017

**Description:**  
Schedule auto-apply runs based on user-defined hours and daily quota.

**Acceptance Criteria:**
- [ ] Set active hours (e.g., 09:00-17:00)
- [ ] Set daily quota (e.g., 50 applications)
- [ ] Background service worker schedules runs
- [ ] chrome.alarms API for scheduling
- [ ] Pause/resume functionality
- [ ] Quota tracking (reset daily)
- [ ] Status indicator in UI (next run, quota used)
- [ ] Manual "Run Now" option

---

### JZ-020: Apply Loop Coordinator (Background Service Worker)
**Priority:** P0  
**Status:** 🔴  
**Story Points:** 8  
**Dependencies:** JZ-015, JZ-017, JZ-019

**Description:**  
Orchestrate the apply loop across multiple platforms, manage quota, handle errors.

**Acceptance Criteria:**
- [ ] Coordinate LinkedIn, Indeed apply loops
- [ ] Track daily quota across platforms
- [ ] Apply jitter/delays between applications
- [ ] Handle rate limiting/detection (back-off)
- [ ] Queue jobs to apply
- [ ] Retry failed applications (limited)
- [ ] Update Google Sheet after each application
- [ ] Update UI with real-time progress
- [ ] Log all actions for debugging

---

## Epic 6: Email Reply Sync

### JZ-021: Apps Script - Email Reply Sync (Default)
**Priority:** P1  
**Status:** 🔴  
**Story Points:** 5  
**Dependencies:** JZ-011

**Description:**  
Provide a one-click installer for Google Apps Script to sync recruiter replies.

**Acceptance Criteria:**
- [ ] Generate Apps Script code from template (spec §11.1)
- [ ] "Install Email Sync" button in UI
- [ ] Open Apps Script editor with pre-filled code
- [ ] Instructions for user to:
  - Create Gmail filter/label "Jobzippy/Recruiters"
  - Add time-driven trigger (hourly)
- [ ] Script reads labeled emails (metadata only)
- [ ] Script updates Google Sheet (status → replied)
- [ ] Naive company name matching (improve later)
- [ ] Error handling in script

**User Flow:**
1. Click "Enable Email Sync" in extension
2. Opens Apps Script bound to their sheet
3. User authorizes script
4. User creates Gmail filter → label
5. User sets hourly trigger
6. Done

---

### JZ-022: Gmail API - Email Reply Sync (Optional)
**Priority:** P2  
**Status:** 🔴  
**Story Points:** 5  
**Dependencies:** JZ-004, JZ-013

**Description:**  
Alternative to Apps Script: poll Gmail API for labeled recruiter emails and update sheet.

**Acceptance Criteria:**
- [ ] Request gmail.readonly scope (optional)
- [ ] Query: `label:Jobzippy/Recruiters newer_than:7d`
- [ ] Read headers only (From, Subject, Date)
- [ ] Match email to application in sheet (by company/app_id)
- [ ] Update sheet status
- [ ] Poll every hour (background service)
- [ ] Handle API quota limits
- [ ] User can choose Apps Script OR Gmail API

---

## Epic 7: Notifications

### JZ-023: Twilio Integration for SMS/WhatsApp
**Priority:** P1  
**Status:** 🔴  
**Story Points:** 5  
**Dependencies:** JZ-005

**Description:**  
Set up Twilio for daily WhatsApp/SMS summaries.

**Acceptance Criteria:**
- [ ] Twilio account & API keys configured
- [ ] Phone number verification in user profile
- [ ] WhatsApp template approved (see spec §14)
- [ ] SMS fallback if WhatsApp unavailable
- [ ] Daily summary function (serverless/Cloud Function)
- [ ] Summary includes: applied count, replies, next run time
- [ ] STOP to unsubscribe handling
- [ ] Delivery status tracking

**Message Template:**
```
Jobzippy – Daily Summary
Applied: 12 (LinkedIn 8, Indeed 4)
Replies: 2 (Acme Corp, TechCo)
Next run: Tomorrow 9:00 AM
Reply STOP to unsubscribe.
```

---

### JZ-024: Daily Summary Scheduler
**Priority:** P1  
**Status:** 🔴  
**Story Points:** 3  
**Dependencies:** JZ-023

**Description:**  
Scheduled job to send daily summaries to all active users.

**Acceptance Criteria:**
- [ ] Cloud Function/Firestore trigger
- [ ] Runs daily at user-preferred time (default 6 PM)
- [ ] Fetch user's sheet data (applications today, replies)
- [ ] Generate summary message
- [ ] Send via Twilio
- [ ] Log delivery status
- [ ] Handle opt-outs

---

## Epic 8: Referral System

### JZ-025: Referral Code Generation
**Priority:** P1  
**Status:** 🔴  
**Story Points:** 3  
**Dependencies:** JZ-005

**Description:**  
Generate unique referral codes for users and track referrals.

**Acceptance Criteria:**
- [ ] Generate unique 6-8 char referral code on first auth
- [ ] Store in Firestore user doc
- [ ] Display referral code in UI
- [ ] Shareable referral link
- [ ] Track referred_by on new user signup
- [ ] Create referral record in Firestore
- [ ] Referral attribution (cookie or query param)

---

### JZ-026: Phone OTP Verification for Referrers
**Priority:** P1  
**Status:** 🔴  
**Story Points:** 5  
**Dependencies:** JZ-023, JZ-025

**Description:**  
Require phone verification (OTP) to become eligible for referral payouts.

**Acceptance Criteria:**
- [ ] Phone number input in settings
- [ ] Send OTP via Twilio SMS
- [ ] Verify OTP code
- [ ] Mark user as phone_verified in Firestore
- [ ] Only phone-verified users can receive payouts
- [ ] Re-verify if phone changes
- [ ] Rate limiting on OTP sends

---

### JZ-027: Referral Dashboard
**Priority:** P1  
**Status:** 🔴  
**Story Points:** 5  
**Dependencies:** JZ-025, JZ-026

**Description:**  
UI to view referral stats, earnings, and payout options.

**Acceptance Criteria:**
- [ ] Show referral code & link
- [ ] List referred users (anonymized)
- [ ] Show locked vs unlocked earnings
- [ ] Show total payouts received
- [ ] Payout method setup (PayPal email or Stripe Connect)
- [ ] Minimum payout threshold ($25) indicator
- [ ] Payout history

**Metrics Displayed:**
- Total referrals: X
- Paid referrals: Y
- Locked earnings: $Z (unlocks in N days)
- Unlocked earnings: $A
- Total paid out: $B

---

### JZ-028: Referral Payout Accounting
**Priority:** P1  
**Status:** 🔴  
**Story Points:** 8  
**Dependencies:** JZ-027

**Description:**  
Backend logic to calculate, unlock, and process referral payouts.

**Acceptance Criteria:**
- [ ] Listen to Stripe invoice.paid events
- [ ] Track referred user's subscription status
- [ ] Lock $3 per paid referral for 45 days
- [ ] Unlock after 45 days + 1 successful renewal
- [ ] Move locked_cents → unlocked_cents
- [ ] Trigger payout when unlocked >= $25
- [ ] Process payout via PayPal API or Stripe Connect
- [ ] Mark payout as complete
- [ ] Handle payout failures
- [ ] Email notification on payout

---

## Epic 9: Billing & Payments

### JZ-029: Stripe Checkout Integration
**Priority:** P1  
**Status:** 🔴  
**Story Points:** 5  
**Dependencies:** JZ-005

**Description:**  
Integrate Stripe for subscription payments.

**Acceptance Criteria:**
- [ ] Stripe account setup
- [ ] Create subscription product (e.g., $29/mo)
- [ ] Stripe Checkout session creation
- [ ] Redirect to Checkout from extension
- [ ] Handle success/cancel redirects
- [ ] Store stripe_customer_id in Firestore
- [ ] Subscription status tracking (active/past_due/canceled)

**Pricing (TBD):**
- Free trial: 7 days or 10 applications
- Monthly: $29/mo
- Annual: $290/yr (save 2 months)

---

### JZ-030: Stripe Customer Portal
**Priority:** P1  
**Status:** 🔴  
**Story Points:** 3  
**Dependencies:** JZ-029

**Description:**  
Allow users to manage subscription via Stripe Customer Portal.

**Acceptance Criteria:**
- [ ] "Manage Subscription" button in UI
- [ ] Create Stripe billing portal session
- [ ] Redirect to portal
- [ ] Users can update payment method
- [ ] Users can cancel subscription
- [ ] Users can view invoices

---

### JZ-031: Stripe Webhooks
**Priority:** P1  
**Status:** 🔴  
**Story Points:** 5  
**Dependencies:** JZ-029

**Description:**  
Handle Stripe webhook events to update subscription status and trigger referral accounting.

**Acceptance Criteria:**
- [ ] Webhook endpoint (Cloud Function or Express)
- [ ] Verify webhook signatures
- [ ] Handle events:
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`
- [ ] Update Firestore subscription_status
- [ ] Trigger referral accounting on invoice.paid
- [ ] Error handling & retry logic
- [ ] Webhook logs for debugging

---

### JZ-032: Subscription Gate / Paywall
**Priority:** P1  
**Status:** 🔴  
**Story Points:** 3  
**Dependencies:** JZ-029

**Description:**  
Enforce subscription requirement after free trial.

**Acceptance Criteria:**
- [ ] Track free trial usage (applications count or days)
- [ ] Show "Upgrade to Pro" modal when trial ends
- [ ] Disable auto-apply if not subscribed
- [ ] Allow manual applies during trial
- [ ] Grace period for failed payments (3 days)
- [ ] Re-enable features when subscription active

---

## Epic 10: BYO Cloud Runner (Advanced)

### JZ-033: Cloud Runner Docker Image
**Priority:** P2  
**Status:** 🔴  
**Story Points:** 13  
**Dependencies:** JZ-015, JZ-017

**Description:**  
Create a Docker image for user's own GCP Cloud Run that runs Playwright apply loops.

**Acceptance Criteria:**
- [ ] Dockerfile with Node.js + Playwright
- [ ] Apply loop logic (LinkedIn, Indeed)
- [ ] Read config from env vars (SHEET_ID, QUOTA, SCHEDULE, FILTERS_JSON)
- [ ] Read secrets from GCP Secret Manager (OAuth tokens, cookies)
- [ ] Write to user's Google Sheet
- [ ] Optional: read labeled Gmail metadata
- [ ] Scheduling logic (cron-like within container)
- [ ] Health check endpoint
- [ ] Logging to stdout (GCP Logging)
- [ ] Graceful shutdown
- [ ] Build & push to gcr.io or Docker Hub

---

### JZ-034: Cloud Runner Deploy UI
**Priority:** P2  
**Status:** 🔴  
**Story Points:** 8  
**Dependencies:** JZ-033

**Description:**  
UI in extension to help users deploy Cloud Runner to their GCP project.

**Acceptance Criteria:**
- [ ] "Enable Offline Mode" wizard
- [ ] Instructions to create GCP project
- [ ] Generate gcloud deploy command
- [ ] Copy to clipboard
- [ ] Verify deployment (ping health endpoint)
- [ ] Store cloud_run_enabled flag in Firestore
- [ ] Handle errors/troubleshooting tips
- [ ] Disable/re-deploy option

**Generated Command Example:**
```bash
gcloud run deploy jobzippy-runner \
  --image=gcr.io/jobzippy/runner:latest \
  --platform=managed \
  --region=us-central1 \
  --set-env-vars=SHEET_ID=abc123,QUOTA=50,SCHEDULE=09:00-17:00 \
  --set-secrets=REFRESH_TOKEN=projects/X/secrets/token:latest \
  --allow-unauthenticated
```

---

## Epic 11: Side-Panel UI & Dashboard

### JZ-035: Main Dashboard / Home Screen
**Priority:** P0  
**Status:** 🔴  
**Story Points:** 8  
**Dependencies:** JZ-002, JZ-012

**Description:**  
Main dashboard showing application stats, recent activity, and quick actions.

**Acceptance Criteria:**
- [ ] Stats cards: Total Applied, Replies, Interviews, Offers
- [ ] Recent applications list (from cache or Sheet)
- [ ] Quick actions: Run Now, View Sheet, Settings
- [ ] Quota usage indicator (X/50 today)
- [ ] Next scheduled run time
- [ ] Status: Active / Paused / Error
- [ ] Beautiful charts (optional: applied over time)

---

### JZ-036: Settings Page
**Priority:** P1  
**Status:** 🔴  
**Story Points:** 5  
**Dependencies:** JZ-002

**Description:**  
Settings UI for all user preferences and configurations.

**Acceptance Criteria:**
- [ ] Sections: Profile, Preferences, Schedule, Notifications, Referrals, Subscription, Privacy
- [ ] Edit profile (redirect to JZ-010)
- [ ] Edit job filters (titles, locations, salary, remote)
- [ ] Edit schedule (hours, quota)
- [ ] Toggle notifications (WhatsApp, SMS, email)
- [ ] Referral settings (code, payout method)
- [ ] Subscription management (link to portal)
- [ ] Privacy: Export data, Delete account
- [ ] Save changes functionality

---

### JZ-037: Activity/History Page
**Priority:** P2  
**Status:** 🔴  
**Story Points:** 5  
**Dependencies:** JZ-035

**Description:**  
Detailed view of all applications with filtering and search.

**Acceptance Criteria:**
- [ ] Table view of all applications (from Sheet)
- [ ] Columns: Date, Company, Title, Status, Platform
- [ ] Filter by status (applied, replied, rejected, etc.)
- [ ] Search by company or title
- [ ] Sort by date, status
- [ ] Click to view job details
- [ ] Export to CSV option
- [ ] Pagination or infinite scroll

---

## Epic 12: Testing & Quality Assurance

### JZ-038: Unit Tests for Core Logic
**Priority:** P1  
**Status:** 🔴  
**Story Points:** 8  
**Dependencies:** JZ-003

**Description:**  
Write unit tests for critical functions.

**Acceptance Criteria:**
- [ ] Profile Vault encryption/decryption tests
- [ ] Resume parser tests (sample PDFs/DOCX)
- [ ] Sponsorship filter matching tests
- [ ] Google Sheets API wrapper tests
- [ ] OAuth token refresh tests
- [ ] Referral accounting logic tests
- [ ] Form filling logic tests
- [ ] 80%+ code coverage on core utils

---

### JZ-039: E2E Tests for Apply Flow
**Priority:** P1  
**Status:** 🔴  
**Story Points:** 13  
**Dependencies:** JZ-003, JZ-015, JZ-017

**Description:**  
End-to-end tests for LinkedIn and Indeed apply automation.

**Acceptance Criteria:**
- [ ] Playwright test for LinkedIn Easy Apply
- [ ] Playwright test for Indeed apply
- [ ] Mock job listings
- [ ] Assert form fields filled correctly
- [ ] Assert application submitted
- [ ] Assert Sheet updated
- [ ] Run in CI on every PR
- [ ] Handle flakiness (retries)

---

### JZ-040: Manual QA Test Plan
**Priority:** P1  
**Status:** 🔴  
**Story Points:** 5  
**Dependencies:** None

**Description:**  
Comprehensive manual test plan for all features.

**Acceptance Criteria:**
- [ ] Test cases for each user flow
- [ ] Test matrix (browsers, platforms, edge cases)
- [ ] Bug tracking sheet/tool
- [ ] Smoke test checklist for releases
- [ ] Performance testing (extension doesn't slow browser)
- [ ] Security review checklist

---

## Epic 13: Deployment & Distribution

### JZ-041: Chrome Web Store Listing
**Priority:** P1  
**Status:** 🔴  
**Story Points:** 5  
**Dependencies:** JZ-001, JZ-002

**Description:**  
Prepare and publish extension to Chrome Web Store.

**Acceptance Criteria:**
- [ ] Developer account created
- [ ] Extension manifest production-ready
- [ ] Icons (16x16, 48x48, 128x128)
- [ ] Screenshots for listing (1280x800)
- [ ] Promo images (marquee, small tile)
- [ ] Privacy policy URL
- [ ] Terms of service URL
- [ ] Description & keywords
- [ ] Submit for review
- [ ] Address reviewer feedback
- [ ] Published to Web Store

**Store Listing Copy:**
- Name: Jobzippy
- Tagline: Your AI assistant for job applications
- Description: [Compelling copy highlighting features]
- Category: Productivity

---

### JZ-042: Privacy Policy & Terms of Service
**Priority:** P1  
**Status:** 🔴  
**Story Points:** 3  
**Dependencies:** None

**Description:**  
Draft legal documents for compliance.

**Acceptance Criteria:**
- [ ] Privacy Policy (see spec §16 for guidance)
  - What data we collect (minimal)
  - What data we DON'T collect (resumes, EEO, emails)
  - Where data lives (user's Sheet, IndexedDB, Firestore)
  - User rights (export, delete)
- [ ] Terms of Service
  - Auto-apply may violate site TOS (user accepts risk)
  - Referral terms (45-day hold, $25 min, fraud prevention)
  - Subscription terms (cancellation, refunds)
- [ ] Host on website or GitHub Pages
- [ ] Link from extension

---

### JZ-043: Google API Verification (OAuth Scopes)
**Priority:** P1  
**Status:** 🔴  
**Story Points:** 8  
**Dependencies:** JZ-004, JZ-042

**Description:**  
Submit for Google OAuth verification for sensitive scopes.

**Acceptance Criteria:**
- [ ] Complete OAuth app verification questionnaire
- [ ] Provide privacy policy
- [ ] Explain scope usage (drive.file, spreadsheets, gmail.readonly)
- [ ] Screencast demonstrating flows
- [ ] Security review (if required)
- [ ] Address Google's feedback
- [ ] Verification approved

**Note:** This can take 4-6 weeks. Test with limited users meanwhile.

---

### JZ-044: CI/CD Pipeline
**Priority:** P1  
**Status:** 🔴  
**Story Points:** 5  
**Dependencies:** JZ-003

**Description:**  
Automate build, test, and release process.

**Acceptance Criteria:**
- [ ] GitHub Actions workflow for:
  - Lint & type-check on every push
  - Run tests on every PR
  - Build extension on release tags
- [ ] Automated versioning (semver)
- [ ] Generate .zip for Chrome Web Store
- [ ] Upload to Web Store API (optional automation)
- [ ] Release notes generation
- [ ] Rollback strategy

---

### JZ-045: Monitoring & Error Tracking
**Priority:** P1  
**Status:** 🔴  
**Story Points:** 3  
**Dependencies:** JZ-001

**Description:**  
Set up error tracking and analytics.

**Acceptance Criteria:**
- [ ] Sentry or similar for error tracking
- [ ] Log errors from extension (background, content, UI)
- [ ] Source maps uploaded for debugging
- [ ] Alert on critical errors
- [ ] Privacy-compliant analytics (optional: Plausible, Fathom)
- [ ] Track key metrics: DAU, applications/user, conversion funnel

---

## Epic 14: Documentation

### JZ-046: User Documentation / Help Center
**Priority:** P2  
**Status:** 🔴  
**Story Points:** 5  
**Dependencies:** None

**Description:**  
Create user-facing documentation and FAQs.

**Acceptance Criteria:**
- [ ] Getting Started guide
- [ ] How to set up filters
- [ ] How to enable email sync
- [ ] How to deploy Cloud Runner (advanced)
- [ ] Troubleshooting common issues
- [ ] FAQs
- [ ] Video tutorials (optional)
- [ ] Hosted on website or Notion

---

### JZ-047: Developer Documentation
**Priority:** P2  
**Status:** 🔴  
**Story Points:** 3  
**Dependencies:** None

**Description:**  
Internal documentation for developers.

**Acceptance Criteria:**
- [ ] README with setup instructions
- [ ] Architecture overview diagram
- [ ] Code structure guide
- [ ] How to add a new job platform
- [ ] API documentation (if applicable)
- [ ] Troubleshooting for devs
- [ ] Contributing guidelines

---

### JZ-048: README & Project Documentation
**Priority:** P1  
**Status:** 🔴  
**Story Points:** 2  
**Dependencies:** JZ-001

**Description:**  
Create a comprehensive README for the repository.

**Acceptance Criteria:**
- [ ] Project overview
- [ ] Features list
- [ ] Installation for development
- [ ] Build & run instructions
- [ ] Testing instructions
- [ ] Deployment instructions
- [ ] License (MIT or similar)
- [ ] Contributing guidelines
- [ ] Links to docs, privacy policy, terms

---

## Epic 15: Post-MVP / Future Enhancements

### JZ-049: Glassdoor Support
**Priority:** P3  
**Status:** 🔴  
**Story Points:** 13  
**Dependencies:** JZ-020

**Description:**  
Add Glassdoor job search and apply automation.

---

### JZ-050: Dice Support
**Priority:** P3  
**Status:** 🔴  
**Story Points:** 13  
**Dependencies:** JZ-020

---

### JZ-051: ZipRecruiter Support
**Priority:** P3  
**Status:** 🔴  
**Story Points:** 13  
**Dependencies:** JZ-020

---

### JZ-052: Cover Letter Generation (AI)
**Priority:** P3  
**Status:** 🔴  
**Story Points:** 8  
**Dependencies:** JZ-007

**Description:**  
Use AI (OpenAI API) to generate tailored cover letters.

---

### JZ-053: Analytics Dashboard (Funnel)
**Priority:** P3  
**Status:** 🔴  
**Story Points:** 8  
**Dependencies:** JZ-037

**Description:**  
Visualize apply → reply → interview → offer funnel.

---

### JZ-054: Firefox Support
**Priority:** P3  
**Status:** 🔴  
**Story Points:** 8  
**Dependencies:** JZ-041

---

### JZ-055: Safari Support
**Priority:** P3  
**Status:** 🔴  
**Story Points:** 13  
**Dependencies:** JZ-041

---

## Summary

**Total Stories:** 55  
**P0 (Blocker):** 17 stories  
**P1 (High):** 28 stories  
**P2 (Medium):** 5 stories  
**P3 (Low/Future):** 5 stories  

**Estimated Total Story Points:** ~325 points

---

## Sprint Planning Suggestions

### Sprint 1 (Week 1) – Foundation
- JZ-001, JZ-002, JZ-003, JZ-004, JZ-005, JZ-007, JZ-048

### Sprint 2 (Week 2) – Core Profile & Sheets
- JZ-006, JZ-008, JZ-009, JZ-011, JZ-012

### Sprint 3 (Week 3) – LinkedIn Automation
- JZ-014, JZ-015, JZ-019, JZ-020, JZ-018

### Sprint 4 (Week 4) – Indeed Automation
- JZ-016, JZ-017

### Sprint 5 (Week 5) – UI & Dashboard
- JZ-010, JZ-035, JZ-036, JZ-037

### Sprint 6 (Week 6) – Billing & Referrals
- JZ-025, JZ-026, JZ-027, JZ-029, JZ-030, JZ-031, JZ-032

### Sprint 7 (Week 7) – Notifications & Email Sync
- JZ-013, JZ-021, JZ-023, JZ-024, JZ-028

### Sprint 8 (Week 8) – Testing & QA
- JZ-038, JZ-039, JZ-040

### Sprint 9 (Week 9) – Deployment & Docs
- JZ-041, JZ-042, JZ-043, JZ-044, JZ-045, JZ-046, JZ-047

### Sprint 10+ – Cloud Runner & Post-MVP
- JZ-033, JZ-034, JZ-049-055

---

**Next Steps:**
1. Review & prioritize stories
2. Pick first story to tackle
3. Update status as we progress (🔴 → 🟡 → 🟢)
4. Add sub-tasks or notes to stories as needed

