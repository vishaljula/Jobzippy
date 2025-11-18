# Job Application Engine – Simple Task List (Ordered)

Each item is one small feature we can build and test on its own.

Statuses:
- 0) Tutorial carousel after onboarding – 🟢
- 1) Start/Stop the engine – 🟢
- 2) Login check (LinkedIn/Indeed) – 🟢
- 3) Build search URLs from filters – 🟢
- 4) Iterate search results – 🟢
- 5) Read job details – 🔴
- 6) Decide apply/skip (+ external hand‑off) – 🔴
- 7) Handle Easy Apply (baseline) – 🔴
- 8) Detect the ATS – 🔴
- 9) Find form & recognize fields – 🔴
- 10) Fill from Profile Vault – 🔴
- 11) Upload resume & short answers – 🔴
- 12) Handle multi‑step – 🔴
- 13) Submit & confirm – 🔴
- 14) Create application record – 🔴
- 15) Save in local storage – 🔴
- 16) Append to Google Sheet – 🔴
- 17) Quotas & delays – 🔴
- 18) Stop safely – 🔴
- 19) Update dashboard live – 🔴
- 20) Error toasts – 🔴
- 21) Dev logs – 🔴
- 22) Flags & settings – 🔴
- 23) Test fixtures – 🔴
- 24) E2E happy path – 🔴

0) After onboarding: show a short Tutorial carousel
- When onboarding finishes and a full profile exists in the Profile Vault, show a 3–4 step guide:
  - ✅ Step 1: Make sure you’re logged into LinkedIn and Indeed in this browser
  - ✅ Step 2: Keep this browser window open while Jobzippy runs
  - ✅ Step 3: We’ll never ask for your passwords, we just use your existing sessions
  - ✅ Step 4: You can stop anytime; we save progress automatically
- Test: appears only after onboarding complete; dismissible; does not block.

1) Start/Stop the engine
- Click “Start Applying” to run. Click “Stop” to pause.
- Show a short status line (e.g., “Running on LinkedIn…”).
- Test: starting, stopping, and clean exit.

2) Check if the user is logged in (LinkedIn, Indeed)
- Detect LinkedIn and Indeed login state.
- If not logged in, show a warning and a Retry button.
- Test: logged-in vs login-page detection.

How we detect login state (plan):
- LinkedIn content script: on `linkedin.com/jobs/*`, check for elements only shown when authenticated (e.g., global nav with avatar/button) and absence of “Sign in” prompts. As a fallback, look for known login form selectors (`input[name="session_key"]`, `/login` in URL).
- Indeed content script: on `indeed.com/*`, detect user nav elements (e.g., account menu) vs presence of “Sign in”/“Create account” links or `/account/login` routes.
- Report a boolean via `chrome.runtime.sendMessage({ type: 'AUTH_CHECK', data: { platform, loggedIn }})`.

3) Build search URLs from user filters
- Use user filters (titles, locations, remote, salary).
- Create valid LinkedIn and Indeed search URLs.
- Test: inputs produce expected URLs.

Where filters come from:
- Profile Vault in IndexedDB: `profile.preferences` in `ProfileVault` (see `ui/src/lib/types.ts`), loaded via `vaultService.load(VAULT_STORES.profile, password)`.
- Titles/keywords: derived from recent employment titles in `history.employment` (see `useJobMatches`), with a sensible default if empty.
- Sponsorship rule: `profile.work_auth.sponsorship_required`.

4) Go through search results
- Open results pages and loop over job cards.
- Respect daily and per‑platform limits.
- Test: page navigation and limit enforcement.

5) Read job details
- Get title, company, location, description, and apply button type.
- Test: multiple page layouts still work.

6) Decide apply or skip (basic rules) — includes opening company site when needed
- Score match (0–100) using filters and sponsorship rule.
- Decide “apply” or “skip” and say why.
- If decision is “apply” and the job is external, click “Apply on company site” and wait for the new tab (ATS hand‑off).
- Test: predictable outcomes for sample jobs.

7) Handle Easy Apply (baseline)
- either skip or do a very simple fill.
- Test: skip is counted correctly.

8) Detect the ATS
- Detect Greenhouse, Lever, SmartRecruiters, Workable, Ashby, BambooHR.
- If unknown, mark as “unsupported” and skip.
- Test: known hosts map to the right ATS.

10) Find the form and recognize fields
- Find the main application form.
- Identify fields like first name, last name, email, phone, resume, etc.
- Test: sample pages classify fields correctly.

11) Fill fields from the Profile Vault
- Fill recognized fields from saved user info and policies.
- Test: field → value mapping works (including EEO rules).

12) Upload resume and optional text answers
- Upload the resume file.
- Optionally fill short free‑text answers (simple version).
- Test: file input and basic text fill.

13) Handle multi‑step forms
- Click Next/Back as needed, up to a safe step limit.
- If too long or complex, skip politely.
- Test: step counting and safe bail‑out.

14) Submit and confirm success
- Click the main Submit/Apply button.
- Detect success/confirmation on the ATS page.
- Test: success selectors per ATS.

15) Create an application record
- Build a record with job details and status = “applied”.
- Save it to local storage (single source of truth).
- Test: schema and idempotent writes.

16) Save applications in local storage
- Persist successful applications to extension storage (IndexedDB or chrome.storage).
- Maintain uniqueness by `app_id` and allow status updates later.
- Test: write, read, subscribe, and survive refresh.

17) Add the application to Google Sheet (async)
- Queue a background write to the user’s Sheet.
- Retry on errors; don’t block the UI.
- Test: queued writes and retries.

18) Use quotas and human‑like delays
- Enforce daily and per‑platform limits.
- Add small random delays between actions.
- Test: limits and delay behavior (seeded for tests).

19) Stop safely
- When user clicks Stop, finish the current job.
- Close any tabs we opened and clear timers.
- Test: mid‑run stop is clean.

20) Update the dashboard live
- Read from local storage and update the list and donut.
- Test: new items appear without a refresh.

21) Show errors as toasts
- Show non‑blocking toasts (e.g., “Login required. Skipped.”).
- Test: correct messages and no duplicates.

22) Helpful logs (dev‑only)
- Write simple, structured logs for each step.
- Test: order and content of log events.

23) Feature flags and settings
- Add simple on/off flags (Easy Apply, step limit, delays).
- Test: defaults and overrides.

24) Test fixtures for pages
- Create reusable sample pages per ATS.
- Test: classifiers and mappers against fixtures.

25) End‑to‑end happy path (mocked)
- Simulate: search → open ATS → fill → submit → save.
- Test: full run passes with mocks.


