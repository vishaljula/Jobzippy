# Jobzippy - Product Backlog

**Status Legend:** 🔴 Not Started | 🟡 In Progress | 🟢 Complete | ⚪ Deprecated

---

## 🤖 **AGENTIC AI CAPABILITIES**

Jobzippy is a TRUE AI AGENT, not just automation:

### **1. Conversational Onboarding (JZ-009)**
- Chat-based setup (not traditional forms!)
- Natural language understanding
- Context-aware follow-up questions

### **2. Intelligent Resume Parsing (JZ-008)**
- GPT-4 powered extraction
- Handles any resume format
- Extracts skills, experience, education

### **3. Full ATS Navigation (JZ-015, JZ-017)**
- Not just Easy Apply (0-1% conversion) ❌
- **Full ATS support:** Greenhouse, Lever, Workday, iCIMS ✅
- Auto-creates accounts on ATS platforms
- Navigates complex multi-page flows
- **Result: 5-15% conversion** (10x better!)

### **4. AI Form Understanding (JZ-015)**
- GPT-4 reads and understands ANY form field
- Generates contextual responses
- Tailors answers to job description
- Handles behavioral questions

### **5. Job Match Intelligence (JZ-020A)**
- AI analyzes each job (match score 0-100)
- Decides: Apply or Skip (with reasoning)
- Filters spam/low-quality jobs
- Transparent decision-making

### **6. Smart Email Detection (JZ-021)**
- Gmail API with intelligent search
- NO manual label setup needed!
- AI matches emails to applications
- Privacy-first (metadata only)

### **7. AI Cover Letters (JZ-052)**
- Tailored to each job
- Professional quality
- Highlights relevant experience
- Higher response rates

**Total AI Stories: 8 (marked as AGENTIC)**

### **💰 AI Cost Estimates (per user/month):**

| Feature | Model | Cost per Use | Monthly Usage | Total |
|---------|-------|--------------|---------------|-------|
| Resume parsing | GPT-4o | $0.01 | 1x (one-time) | $0.01 |
| Conversational onboarding | GPT-4 | $0.05 | 1x (one-time) | $0.05 |
| Job match analysis | GPT-4o-mini | $0.002 | 50 jobs | $0.10 |
| Form field responses | GPT-4o-mini | $0.01 | 20 applications | $0.20 |
| Email matching | GPT-4o-mini | $0.001 | 30 emails | $0.03 |
| Cover letters | GPT-4o | $0.02 | 10 letters | $0.20 |
| **Total per user/month** | | | | **~$0.59** |

**At scale (1,000 users):** ~$590/month in AI costs  
**Revenue (1,000 users @ $29/mo):** $29,000/month  
**AI cost as % of revenue:** 2% ✅ **Very acceptable!**

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
**Status:** 🟢 **COMPLETE**  
**Story Points:** 5  
**Dependencies:** JZ-001

**Description:**  
Implement Google OAuth 2.0 with PKCE flow for secure authentication in the Chrome extension.

**Acceptance Criteria:**
- [x] OAuth 2.0 PKCE flow implemented
- [x] Scopes requested: `openid`, `email`, `profile`, `drive.file`, `spreadsheets`
- [x] Optional Gmail scope: `gmail.readonly` with clear consent
- [x] Token storage in chrome.storage.local (encrypted by Chrome)
- [x] Token refresh logic with 5-minute buffer
- [x] Logout functionality with token revocation
- [x] OAuth consent screen copy matches spec
- [x] Error handling for auth failures

**Completed:** ✅ Full OAuth PKCE implementation with 11 passing tests, Google-branded UI, token refresh

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
- [x] Firebase project scaffolding + env wiring (see FIREBASE_SETUP.md)
- [ ] Firestore security rules configured *(pending future schema story)*
- [ ] User collection schema implemented (see spec §9)
- [ ] Referrals collection schema implemented
- [ ] Firebase SDK integrated in extension
- [ ] User document created on first auth
- [x] Environment variables for Firebase config

### JZ-005B: Firestore Integration Validation (NEW)
**Priority:** P0  **Status:** 🔴  **Story Points:** 2  **Dependencies:** JZ-005

**Description:**  Add end-to-end tests / integration harness to verify Firestore writes once schema is finalized.

**Acceptance Criteria:**
- [ ] Local emulator script or test harness documented
- [ ] Seed data + teardown utilities
- [ ] Automated check in CI (optional)
- [ ] Update FIREBASE_SETUP.md with testing instructions

---
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

### JZ-006A: OAuth Consent Screen Optimization (NEW)
**Priority:** P1  
**Status:** 🔴  
**Story Points:** 2  
**Dependencies:** JZ-004

**Description:**  
Improve OAuth consent screen to build trust and clearly explain what we access.

**Acceptance Criteria:**
- [ ] Add professional app description to OAuth consent screen
- [ ] Add app logo to consent screen
- [ ] Add Privacy Policy URL (jobzippy.ai/privacy)
- [ ] Add Terms of Service URL (jobzippy.ai/terms)
- [ ] Add App Homepage URL (jobzippy.ai)
- [ ] Clear explanation of data access in consent screen
- [ ] Remove blue warning banner about missing Privacy/TOS links
- [ ] Professional appearance for user trust

**OAuth Consent Screen Description (to add):**
```
Jobzippy is your AI assistant for job applications. 

We create a Google Sheet in YOUR Drive to track your job applications. 
We only access the Sheet we create - not your other files.

Optionally, you can enable email tracking to detect recruiter replies 
automatically (with your permission, in a later step).

All your data stays in YOUR Google account.
```

**Why This Matters:**
- Builds trust with transparent explanation
- Removes scary warning about missing Privacy/TOS
- Professional appearance
- Higher conversion on consent screen
- Required for OAuth verification later

---

### JZ-005A: Cloud Run OAuth Token Service (NEW)
**Priority:** P0 (Blocker)  
**Status:** 🔴  
**Story Points:** 5  
**Dependencies:** JZ-004

**Description:**  
Stand up a secure Node.js/Express microservice on Google Cloud Run to exchange Google OAuth authorization codes for tokens using the client secret.

**Acceptance Criteria:**
- [ ] Repository reorganized into `ui/` and `api/` npm workspaces with shared root tooling
- [ ] Node.js + TypeScript project scaffolded (Express, tsconfig, eslint, testing)
- [ ] Endpoint `POST /oauth/google/exchange` accepts `code`, `code_verifier`, `redirect_uri`
- [ ] Backend calls Google token endpoint with `client_id`, `client_secret`, `code`, `code_verifier`, `redirect_uri`, `grant_type`
- [ ] Validates inputs, handles Google error responses, and returns tokens (access, refresh, expires_in)
- [ ] Secrets stored in Google Secret Manager and injected into Cloud Run environment variables
- [ ] `GET /healthz` endpoint for monitoring/uptime checks
- [ ] CORS configured to allow requests from the Chrome extension only
- [ ] Unit tests for success and failure paths (mock Google endpoint)
- [ ] Dockerfile + GitHub Actions workflow to build/test/deploy to Cloud Run (staging + prod)
- [ ] Extension updated to call Cloud Run endpoint instead of Google token endpoint directly
- [ ] Documentation updates (`OAUTH_SETUP.md`, `README`) covering backend setup, env vars, deployment, sample curl request

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

### JZ-008: AI-Powered Resume Parser (AGENTIC)
**Priority:** P0  
**Status:** 🔴  
**Story Points:** 8  
**Dependencies:** JZ-007

**Description:**  
Use LLM to intelligently extract structured data from any resume format.

**Acceptance Criteria:**
- [ ] File upload UI (drag & drop + file picker)
- [ ] Support PDF and DOCX formats
- [ ] Extract text from resume (pdf.js, mammoth.js)
- [ ] **Use OpenAI GPT-4 for structured extraction**
- [ ] JSON schema response (ProfileVault structure)
- [ ] Extract: name, email, phone, work history, education, **skills, technologies**
- [ ] Handle any resume format (chronological, functional, creative)
- [ ] Show AI-extracted preview with confidence
- [ ] Allow manual editing of AI results
- [ ] Resume stored as encrypted blob
- [ ] Error handling for unparseable resumes

**AI Implementation:**
```typescript
const extraction = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{
    role: "system",
    content: "Extract structured data from resume. Handle any format."
  }, {
    role: "user",
    content: resumeText
  }],
  response_format: { 
    type: "json_schema",
    json_schema: ProfileVaultSchema 
  }
});
```

**Cost:** ~$0.01 per resume (acceptable one-time cost)

---

### JZ-009: Conversational AI Onboarding (AGENTIC)
**Priority:** P0  
**Status:** 🔴  
**Story Points:** 13 ⬆️ (was 8)  
**Dependencies:** JZ-006, JZ-008

**Description:**  
Chat-based AI conversation to collect user profile and preferences (NOT traditional forms!).

**Acceptance Criteria:**
- [ ] **Chat interface with AI assistant** (not multi-step form!)
- [ ] Natural language input from user
- [ ] AI asks contextual follow-up questions
- [ ] Real-time validation and clarification
- [ ] Extract structured data from conversational responses
- [ ] Handle varied input styles ("yes", "yep", "sure", "I need sponsorship")
- [ ] Resume upload + AI extraction first
- [ ] AI pre-fills from resume, asks only what's missing
- [ ] Collect: work auth, preferences, salary, remote, compliance policies
- [ ] Show conversation history (editable)
- [ ] "Start Over" option
- [ ] Save & Continue Later capability
- [ ] Progress indicator (% complete)
- [ ] Final review: "Here's what I understand..."

**Conversational Flow:**
```
AI: "Hi! I'm your Jobzippy assistant. What's your name?"
User: "John Smith"

AI: "Great! What type of roles are you looking for?"
User: "senior software engineer, remote preferred"

AI: "Perfect! Salary expectations?"
User: "at least 150k"

AI: "Got it. Do you need visa sponsorship?"
User: "yes I'm on F-1 OPT"

AI: "✓ Understood! Let me confirm:
     - Senior Software Engineer roles
     - Remote preferred
     - Minimum $150k
     - F-1 OPT, sponsorship required
     
     Does this look correct?"
```

**AI Implementation:**
- OpenAI GPT-4 with function calling
- Structured data extraction from chat
- Conversation state management
- Validation on each response

---

### JZ-009A: Chat UI Component (AGENTIC - NEW!)
**Priority:** P0  
**Status:** 🔴  
**Story Points:** 5  
**Dependencies:** JZ-002

**Description:**  
Beautiful chat interface component for AI conversations (reusable across app).

**Acceptance Criteria:**
- [ ] Chat message bubbles (user vs AI)
- [ ] Typing indicators ("AI is typing...")
- [ ] Smooth animations (messages slide in)
- [ ] Avatar for AI assistant
- [ ] Timestamp on messages
- [ ] Input field with send button
- [ ] Enter to send, Shift+Enter for new line
- [ ] Auto-scroll to latest message
- [ ] Loading state while AI responds
- [ ] Error handling (retry button)
- [ ] Message history (scrollable)
- [ ] Copy message content
- [ ] "Start Over" button
- [ ] Mobile-responsive

**Component API:**
```typescript
<ChatInterface
  onUserMessage={(msg) => handleAIResponse(msg)}
  messages={conversationHistory}
  isTyping={isAIThinking}
  avatar={<Sparkles />}
/>
```

---

### JZ-009B: ATS Account Manager (AGENTIC - NEW!)
**Priority:** P1  
**Status:** 🔴  
**Story Points:** 8  
**Dependencies:** JZ-015

**Description:**  
AI automatically creates and manages accounts on ATS platforms (Greenhouse, Lever, Workday, etc.).

**Acceptance Criteria:**

**Account Creation:**
- [ ] Detect "Create Account" / "Sign Up" pages
- [ ] Fill registration form with user data
- [ ] Handle email verification (poll Gmail for verification link)
- [ ] Click verification link automatically
- [ ] Complete profile setup
- [ ] Store credentials securely (chrome.storage)

**Account Login:**
- [ ] Detect if account exists for ATS
- [ ] Auto-fill credentials
- [ ] Handle "forgot password" if needed
- [ ] Handle 2FA (show user prompt if required)
- [ ] Store session cookies

**ATS Platform Support:**
- [ ] Greenhouse
- [ ] Lever
- [ ] Workday
- [ ] iCIMS
- [ ] Taleo
- [ ] BambooHR
- [ ] JazzHR

**Security:**
- [ ] Encrypt ATS credentials
- [ ] Separate keychain per platform
- [ ] User can view/edit saved accounts
- [ ] Delete account option

**AI Detection:**
- [ ] Use AI to detect ATS type from DOM
- [ ] Adapt to platform-specific flows
- [ ] Handle unexpected layouts

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

### JZ-015: AI-Powered Job Application Engine (AGENTIC)
**Priority:** P0  
**Status:** 🔴  
**Story Points:** 21 ⬆️ (was 13)  
**Dependencies:** JZ-014

**Description:**  
Intelligent AI agent that applies to jobs across Easy Apply AND external ATS systems (Greenhouse, Lever, Workday).

**Acceptance Criteria:**

**Easy Apply (LinkedIn/Indeed):**
- [ ] Click "Easy Apply" / "Apply Now" button
- [ ] Fill form fields from Profile Vault
- [ ] Handle multi-step applications
- [ ] Upload resume if required

**External ATS Navigation (NEW - HIGH VALUE!):**
- [ ] Detect external apply links (Greenhouse, Lever, Workday, iCIMS, Taleo)
- [ ] **Navigate to company career page**
- [ ] **Detect if account creation needed**
- [ ] **Auto-create account if needed** (email verification handling)
- [ ] **Auto-login if account exists**
- [ ] Navigate through multi-page application flows
- [ ] Detect ATS type (Greenhouse vs Lever vs Workday patterns)
- [ ] Handle ATS-specific quirks

**AI Form Understanding (NEW - AGENTIC!):**
- [ ] **Use GPT-4 to understand form fields** (not hardcoded rules!)
- [ ] **Generate contextual responses** based on job description + resume
- [ ] Handle open-ended questions: "Why do you want this job?"
- [ ] Handle behavioral questions: "Describe a time when..."
- [ ] Tailor responses to specific company/role
- [ ] Answer common questions (work auth, salary, start date)
- [ ] Handle EEO questions per user policy

**Smart Decision Making:**
- [ ] Detect low-quality jobs (spam, MLM, commission-only)
- [ ] Skip jobs below match threshold
- [ ] Log reasoning for skips

**Standard Features:**
- [ ] Detect and handle CAPTCHAs (skip job)
- [ ] Human-like delays (jitter)
- [ ] Error handling & logging
- [ ] Mark job as applied/skipped with reasoning

**Why This Matters:**
- Easy Apply only = 0-1% response rate ❌
- Full ATS applications = 5-15% response rate ✅
- 70%+ of good jobs use external ATS ✅

**AI Implementation:**
```typescript
// Understand form field
const fieldResponse = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{
    role: "system",
    content: "Generate appropriate response for job application field."
  }, {
    role: "user",
    content: `
      Field: "${fieldLabel}"
      Job: ${jobDescription}
      Resume: ${userResume}
      Generate 2-3 sentence response.
    `
  }]
});
```

**Cost:** ~$0.05-0.10 per complex application (worth it for higher conversion!)

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

### JZ-017: Indeed AI Application Engine (AGENTIC)
**Priority:** P0  
**Status:** 🔴  
**Story Points:** 21 ⬆️ (was 13)  
**Dependencies:** JZ-016

**Description:**  
AI-powered application engine for Indeed (Easy Apply + external ATS) - same agentic capabilities as JZ-015.

**Acceptance Criteria:**
- [ ] Handle Indeed Quick Apply
- [ ] **Navigate to external company sites** (not just Easy Apply!)
- [ ] **Detect and handle all major ATS systems**
- [ ] **Auto-create accounts on ATS platforms**
- [ ] **AI-powered form field understanding**
- [ ] **Generate contextual responses** for open-ended questions
- [ ] Upload resume if required
- [ ] Handle multi-page flows
- [ ] Detect and skip low-quality jobs
- [ ] Handle CAPTCHAs (skip job)
- [ ] Human-like delays
- [ ] Error handling & logging with reasoning

**Note:** Shares core AI engine with JZ-015. Same intelligent capabilities across all platforms.

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
- [ ] **Integrate AI decision engine** (JZ-020A)

---

### JZ-020A: AI Job Match & Decision Engine (AGENTIC - NEW!)
**Priority:** P0  
**Status:** 🔴  
**Story Points:** 8  
**Dependencies:** JZ-015

**Description:**  
AI analyzes each job and decides whether to apply, with reasoning. Prevents wasting applications on poor matches.

**Acceptance Criteria:**

**AI Analysis:**
- [ ] Analyze job description with GPT-4
- [ ] Compare to user's profile (skills, experience, preferences)
- [ ] Calculate match score (0-100)
- [ ] Generate reasoning for decision
- [ ] Check deal-breakers (salary, location, sponsorship)

**Decision Logic:**
- [ ] Apply if score >= 70
- [ ] Skip if score < 70
- [ ] Log reasoning in Sheet
- [ ] Show reasoning in UI

**Quality Filters:**
- [ ] Detect spam jobs (MLM, commission-only, "be your own boss")
- [ ] Detect overposted jobs (>100 applicants in 24h)
- [ ] Detect outdated postings (>30 days old)
- [ ] Flag suspicious patterns

**Learning (Future):**
- [ ] Track which jobs get responses
- [ ] Adjust match algorithm based on success
- [ ] User feedback: "Good match" / "Bad match"

**Example Output:**
```
Job: Senior Software Engineer @ TechCorp
Match Score: 87%
Decision: APPLY ✓

Reasoning:
✓ Strong skill match (React, TypeScript, AWS)
✓ Visa sponsorship: YES
✓ Remote: Yes
✓ Salary range: $140-180k (meets $150k min)
✓ Experience level appropriate (5+ years)

Applying...
```

**AI Implementation:**
```typescript
const analysis = await openai.chat.completions.create({
  model: "gpt-4o-mini",  // Fast & cheap for decisions
  messages: [{
    role: "system",
    content: "Analyze job match quality. Provide score and reasoning."
  }, {
    role: "user",
    content: `
      Job Description: ${jobDescription}
      User Profile: ${userProfile}
      User Requirements: ${requirements}
    `
  }],
  response_format: {
    type: "json_schema",
    json_schema: {
      match_score: number,
      should_apply: boolean,
      reasoning: string[],
      deal_breakers: string[]
    }
  }
});
```

**Cost:** ~$0.002 per job analysis (2¢ per 10 jobs analyzed)

**Why This Matters:**
- Prevents wasting quota on poor matches
- Higher response rates (quality > quantity)
- User understands why AI skipped/applied
- Transparency builds trust

---

## Epic 6: Email Reply Sync

### JZ-021: Smart Gmail Reply Detection (AGENTIC)
**Priority:** P1  
**Status:** 🔴  
**Story Points:** 8 ⬆️ (was 5)  
**Dependencies:** JZ-011, JZ-004

**Description:**  
Intelligent email detection using Gmail API - NO manual label setup! AI-powered matching.

**Acceptance Criteria:**

**Smart Gmail Search:**
- [ ] Build Gmail query from user's Sheet data (companies applied to)
- [ ] Search emails from last 7-30 days only
- [ ] Include common recruiter domains (linkedin, indeed, greenhouse, lever, workday)
- [ ] Include company names from applications
- [ ] Filter by keywords (application, interview, next steps, offer)
- [ ] Handle query length limits (batch if >50 companies)
- [ ] Read metadata only (From, Subject, Date) - privacy first!

**AI-Powered Matching:**
- [ ] **Use LLM to match emails to applications** (not simple string matching!)
- [ ] Handle variations: "Google LLC" vs "Google" vs "Alphabet Inc"
- [ ] Parse email subject for company/position clues
- [ ] Confidence scoring (0-100)
- [ ] Only update Sheet if confidence > 70%

**One-Click Enable:**
- [ ] Clear consent dialog explaining what we access
- [ ] "Enable Email Tracking" button
- [ ] Request gmail.readonly scope
- [ ] Start polling (hourly background task)
- [ ] Show status in UI ("Checked 2 hours ago, found 3 replies")

**Privacy First:**
- [ ] Only access emails matching search criteria
- [ ] Read metadata only (not body contents)
- [ ] No emails stored on our servers
- [ ] User can revoke anytime

**No Manual Setup Required!** ✨

**AI Implementation:**
```typescript
// Smart email-to-application matching
const match = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{
    role: "system",
    content: "Match email to job application. Return confidence 0-100."
  }, {
    role: "user",
    content: `
      Email from: ${emailFrom}
      Email subject: ${emailSubject}
      Companies applied: ${JSON.stringify(companies)}
    `
  }],
  response_format: { 
    type: "json_schema",
    json_schema: { company_match, app_id, confidence }
  }
});
```

**Cost:** ~$0.001 per email check (very cheap!)

---

### JZ-022: DEPRECATED - Merged into JZ-021
**Priority:** P2  
**Status:** ⚪ DEPRECATED  
**Story Points:** 0  
**Dependencies:** N/A

**Description:**  
This story has been merged into JZ-021. We no longer need a separate "optional" implementation since JZ-021 now uses smart Gmail API detection by default (no Apps Script needed).

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

### JZ-042: Privacy Policy & Terms of Service Pages
**Priority:** P1  
**Status:** 🔴  
**Story Points:** 5 ⬆️ (was 3)  
**Dependencies:** None

**Description:**  
Create and host legal documents (Privacy Policy, Terms of Service) for compliance, OAuth verification, and user trust.

**Acceptance Criteria:**

**Privacy Policy (jobzippy.ai/privacy):**
- [ ] Create HTML page with Privacy Policy
- [ ] Section: What data we collect (account email, billing, Sheet metadata)
- [ ] Section: What data we DON'T collect (resumes, EEO, email contents)
- [ ] Section: Where data lives (user's Sheet, IndexedDB, Firestore)
- [ ] Section: How we use data (authentication, billing, features)
- [ ] Section: Data sharing - anonymized aggregates disclosure
- [ ] Section: Google API access (Drive, Sheets, Gmail scopes explained)
- [ ] Section: User rights (export, delete, revoke access)
- [ ] Section: Security measures (encryption, Chrome storage)
- [ ] Section: Contact information (support@jobzippy.ai)
- [ ] Last updated date
- [ ] Mobile-responsive design
- [ ] Professional formatting

**Terms of Service (jobzippy.ai/terms):**
- [ ] Create HTML page with Terms of Service
- [ ] Section: Service description (AI job application assistant)
- [ ] Section: User responsibilities
  - Auto-apply may violate some site TOS (user accepts risk)
  - Accurate information required
  - Account security
- [ ] Section: Subscription terms
  - Pricing: $14.99/month or $149/year
  - Cancellation policy (anytime, no questions)
  - Refund policy (pro-rated for annual)
  - Free trial terms (7 days or 10 applications)
- [ ] Section: Referral program terms
  - $3 per paid referral
  - 45-day hold + 1 renewal requirement
  - $25 minimum payout
  - Anti-fraud measures
- [ ] Section: Limitation of liability
- [ ] Section: Dispute resolution
- [ ] Section: Changes to terms
- [ ] Last updated date

**Website/Hosting:**
- [ ] Set up simple static website (Vercel/Netlify/GitHub Pages)
- [ ] Domain: jobzippy.ai
- [ ] Landing page (jobzippy.ai)
- [ ] Privacy page (jobzippy.ai/privacy)
- [ ] Terms page (jobzippy.ai/terms)
- [ ] SSL certificate (HTTPS)
- [ ] Mobile responsive
- [ ] Fast loading

**Integration:**
- [ ] Add links to OAuth consent screen (Google Cloud)
- [ ] Add links in extension footer
- [ ] Add links in Settings page
- [ ] Add links in sign-up flow

**Templates to Use:**
- Termly.io (free privacy policy generator)
- iubenda
- GetTerms.io
- Customize for Jobzippy specifics

**Why This Matters:**
- Required for OAuth verification
- Removes warning on consent screen
- Builds user trust
- Legal compliance (GDPR, CCPA)
- Professional appearance

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

### JZ-052: AI Cover Letter Generation (AGENTIC)
**Priority:** P1 ⬆️ (was P3)  
**Status:** 🔴  
**Story Points:** 5  
**Dependencies:** JZ-007, JZ-015

**Description:**  
Generate tailored, professional cover letters using AI for each application.

**Acceptance Criteria:**
- [ ] Generate cover letter from job description + user resume
- [ ] Highlight relevant experience for specific role
- [ ] Professional tone and formatting
- [ ] 3-4 paragraphs (250-350 words)
- [ ] Personalize to company and role
- [ ] Extract key requirements from JD
- [ ] Match to user's experience
- [ ] Include specific examples
- [ ] Option to regenerate with different tone
- [ ] User can edit before applying
- [ ] Cache generated letters (reuse for similar roles)

**AI Implementation:**
```typescript
const coverLetter = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{
    role: "system",
    content: "Generate tailored cover letter. Professional tone, specific examples."
  }, {
    role: "user",
    content: `
      Job: ${jobTitle} at ${company}
      Job Description: ${jobDescription}
      
      My Resume: ${userResume}
      My Experience: ${relevantExperience}
      
      Generate a compelling cover letter.
    `
  }]
});
```

**Cost:** ~$0.02 per cover letter

**Why P1 Now:**
- Many ATS systems require/request cover letters
- AI-generated = professional quality
- Tailored to each job = higher response rates
- Differentiates from bulk applicants

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

**Total Stories:** 59 (55 original + 3 new agentic + 1 new infrastructure)  
**Active Stories:** 58 (1 deprecated: JZ-022)  
**P0 (Blocker):** 20 stories (+2 agentic: JZ-009A, JZ-020A, +1 infrastructure: JZ-005A)  
**P1 (High):** 30 stories (+1 agentic: JZ-009B, +1 promoted: JZ-052)  
**P2 (Medium):** 4 stories  
**P3 (Low/Future):** 4 stories (-1 promoted)  

**Estimated Total Story Points:** ~395 points (+65 for agentic features)

### **Completed:**
- ✅ JZ-001: Project Scaffolding (3 pts)
- ✅ JZ-002: Design System (5 pts)
- ✅ JZ-003: Testing Infrastructure (3 pts)
- ✅ JZ-004: Google OAuth (5 pts)
- **Total Completed:** 16 points / 390 = 4% complete

### **New Agentic Stories:**
- 🤖 JZ-008: AI Resume Parser (was basic parser)
- 🤖 JZ-009: Conversational Onboarding (was form wizard)
- 🤖 JZ-009A: Chat UI Component (NEW)
- 🤖 JZ-009B: ATS Account Manager (NEW)
- 🤖 JZ-015: AI Application Engine (was Easy Apply only)
- 🤖 JZ-017: Indeed AI Engine (was basic automation)
- 🤖 JZ-020A: AI Decision Engine (NEW)
- 🤖 JZ-021: Smart Gmail Detection (was manual labels)
- 🤖 JZ-052: AI Cover Letters (promoted to P1)

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

