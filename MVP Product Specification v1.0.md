# Jobzippy – MVP Specification (LOCKED DESIGN)

**Tagline:** *Your personal agentic AI assistant who manages your job applications.*

*A working name that meets the “starts with Job + AI vibe” requirement. Swap later if desired (e.g., ****JobBlitz****, ****JobFlow****, ****JobBot****).*\
**Scope:** Lean, privacy-first MVP that auto-applies to jobs, logs to a user-owned Google Sheet, and supports offline operations via user-owned Google services. Referral payouts are cash, with anti-fraud controls.

---

## 1) Product Overview

**Goal:** A browser extension + optional user-owned cloud runner that automatically finds, filters, applies, and tracks job applications across major job boards, with daily WhatsApp/SMS status.\
**Stand-out features:**

- **H‑1B/OPT "Sponsorship Required – Yes/No"** filter using historical sponsor data.
- **Referral payouts** (\$3/paid user; unlock after 45 days; \$25 min; phone OTP).
- **User-owned storage** for sensitive data; we store only automation-critical metadata.

**Primary platforms (MVP):** LinkedIn, Indeed (baseline); Glassdoor, Dice, ZipRecruiter (next-up).\
**Browsers:** Chrome first. Firefox/Safari later.

---

## 2) Operating Modes

### 2.1 Online Mode (default)

- Encrypted **IndexedDB Profile Vault** inside the extension.
- Content scripts fill and submit applications.
- Every application is appended to a **user-owned Google Sheet**.

### 2.2 Offline Mode (compliant)

- **Option A (Default for replies):** Google **Apps Script** bound to the user’s Sheet reads **labeled** recruiter emails (metadata only) and updates the Sheet on a schedule.
- **Option B (Advanced for applying):** **BYO‑Cloud Runner** (user’s own GCP Cloud Run) runs Playwright-based apply cycles. Tokens/cookies and any minimal fields live in the user’s GCP (Secret Manager). Writes to the user’s Sheet. Optional Gmail metadata read for the recruiter label.

> Our servers store only account + billing + referral metadata; no resumes/EEO/criminal data or email contents.

---

## 3) User Experience Flow

1. **Install extension → Sign in with Google (OAuth)**
2. **Create My Google Sheet** (template with headers)
3. **Quick Setup Wizard** (2–3 mins):
   - Upload resume (parsed locally into Profile Vault)
   - Set job filters (titles, locations, salary, remote)
   - **Sponsorship Required – Yes/No** preference
   - EEO/veteran/disability/criminal answer policies (answer/skip/ask/never)
4. **Start Auto‑Apply** (quota + schedule)
5. (Optional) **Enable Offline:**
   - Apps Script for email reply sync (one-click installer)
   - BYO‑Cloud Runner deploy to the user’s GCP
6. **Daily summary** via WhatsApp/SMS
7. **Referrals:** share code/link; payouts cash after hold window

---

## 4) MVP Features (Committed)

- Chrome extension side-panel UI
- Resume parse to Profile Vault (in-browser; encrypted)
- Job search + filter + **auto-apply** on supported boards
- **Google Sheet application log** (user-owned)
- **Daily WhatsApp/SMS summary** (Twilio)
- **Email replies sync**: Apps Script (default) or labeled Gmail metadata polling
- **H‑1B/OPT sponsorship** filter (Yes/No/Unknown)
- **Auto-apply scheduling** (hours + daily quota)
- **Referral payouts** with phone OTP; 45‑day unlock; \$25 min; PayPal/Stripe payout

---

## 5) Storage & Privacy Model

| Data                                                  | Extension (IndexedDB) | User’s Google Sheet | Our Server      | User’s GCP (BYO-Cloud)                     |
| ----------------------------------------------------- | --------------------- | ------------------- | --------------- | ------------------------------------------ |
| Resume, EEO, criminal answers                         | ✔ (encrypted)         | ✖                   | ✖               | (optional minimal fields if user consents) |
| Filters (titles, locations, salary, keywords)         | ✔                     | ✖                   | (optional copy) | ✔                                          |
| Session cookies for job sites                         | ✔                     | ✖                   | ✖               | ✔                                          |
| App log (job/company/url/status)                      | (cache)               | ✔ (source of truth) | ✖               | ✔ (writes to Sheet)                        |
| Gmail replies (headers only)                          | (if Gmail open)       | ✔                   | ✖               | ✔ (metadata-only; labeled)                 |
| Billing (Stripe id), phone-verified, referral metrics | ✖                     | ✖                   | ✔               | ✖                                          |

- **Encryption:** Profile Vault uses WebCrypto (AES‑GCM). Optional PIN strengthens key derivation.
- **Backups:** Optional encrypted backup to user’s Google Drive (AppData). Key stays on device; user can export/import with PIN.

---

## 6) OAuth Scopes & Consent Copy

**Identity & Drive/Sheets**

- `openid email profile` — Identify you and keep you signed in.
- `https://www.googleapis.com/auth/drive.file` — Create and access files **we create** in your Drive (e.g., your Jobzippy Sheet).
- `https://www.googleapis.com/auth/spreadsheets` — Read and write **your** Jobzippy Sheet.

**(Optional) Gmail metadata-only**

- `https://www.googleapis.com/auth/gmail.readonly` — Read **metadata** (From/Subject/Date) on **your chosen label** (e.g., Jobzippy/Recruiters) to update your Sheet when recruiters reply.

*Consent copy (inline):*

> Jobzippy will create and update a Google Sheet in your Drive to log applications. With your permission, it can also read **metadata only** from a Gmail **label you choose** (e.g., Jobzippy/Recruiters) to update statuses when recruiters reply. Jobzippy does **not** read or store email bodies or your other labels.

---

## 7) Google Sheet Creation & Schema (Template)

**How it works:** After Google OAuth, Jobzippy calls the Google Sheets API to **automatically create** a tracking sheet **inside the user’s Google Drive** (scope: `drive.file`). The user does not manually create or share a sheet. We store the resulting `sheetId` to append/update rows. Job logs live in this sheet; profile data (resume, EEO, etc.) remains in the local encrypted Profile Vault.

**Creation trigger:**

- Default: user clicks **Create My Job Log Sheet** in the side‑panel (can be auto‑created immediately after OAuth if desired).
- Ownership: the sheet is owned by the user; Jobzippy only accesses files it created.

**Columns:** **Title:** `Jobzippy – Applications (First Last)`\
**Columns (A→Q):**

1. `app_id` (UUID)
2. `date_applied` (ISO)
3. `platform` (LinkedIn/Indeed/…)
4. `job_title`
5. `company`
6. `location`
7. `job_url`
8. `status` (`applied` | `replied` | `interview_requested` | `offer` | `rejected` | `skipped` | `reply_unmatched`)
9. `email_thread_id`
10. `email_from`
11. `email_subject`
12. `last_email_at` (ISO)
13. `notes`
14. `salary`
15. `match_score` (0–100)
16. `visa_sponsor_flag` (`YES` | `NO` | `UNKNOWN`)

---

## 8) IndexedDB Profile Vault (Client) – Schema

```json
{
  "profile": {
    "identity": { "first_name": "", "last_name": "", "phone": "", "email": "", "address": "" },
    "work_auth": { "visa_type": "F-1 STEM OPT", "sponsorship_required": true },
    "preferences": { "remote": true, "locations": ["Dallas, TX"], "salary_min": 120000, "start_date": "2 weeks" }
  },
  "compliance": {
    "veteran_status": "prefer_not",
    "disability_status": "prefer_not",
    "criminal_history_policy": "ask_if_required"
  },
  "history": {
    "employment": [
      { "company": "", "title": "", "start": "YYYY-MM", "end": "YYYY-MM|present", "duties": "", "city": "", "state": "" }
    ],
    "education": [
      { "school": "", "degree": "", "field": "", "start": "YYYY", "end": "YYYY" }
    ]
  },
  "policies": {
    "eeo": "skip_if_optional",
    "salary": "answer",
    "relocation": "answer",
    "work_shift": "ask_if_required"
  }
}
```

---

## 9) Firestore (Server) – Minimal Schema

**Collection:** `users/{userId}`

```json
{
  "email": "",
  "stripe_customer_id": "",
  "subscription_status": "active|past_due|canceled",
  "phone_verified": true,
  "referral_code": "abc123",
  "referred_by": "xyz789",
  "sheet_id": "<GoogleSheetId>",
  "cloud_run_enabled": false,
  "gmail_label": "Jobzippy/Recruiters",
  "payout_method": { "type": "paypal|stripe_connect", "identifier": "" },
  "referral_stats": { "paid_referrals": 0, "locked_cents": 0, "unlocked_cents": 0, "last_unlock_at": "" }
}
```

**Collection:** `referrals/{refId}` — map referred → referrer, status.

---

## 10) H‑1B/OPT Sponsorship Filter ("Sponsorship Required – Yes/No")

- Source sets: USCIS H‑1B disclosure data + public aggregators (normalized offline).
- Matching: fuzzy match on employer names/aliases; parent/subsidiary map; staffing agencies flagged.
- Result per job/company: `YES`, `NO`, or `UNKNOWN`.
- User preference: Apply only if `YES` (or include `UNKNOWN`).

---

## 11) Email Reply Sync

### 11.1 Default (Apps Script bound to Sheet)

- User clicks **Install Email Sync** in the extension → opens a prefilled Apps Script project bound to the Sheet.
- User adds a Gmail **filter** that applies label `Jobzippy/Recruiters` to recruiter/ATS messages.
- Time-driven trigger runs every hour.

**Apps Script stub:**

```javascript
function syncRecruiterReplies() {
  const label = GmailApp.getUserLabelByName('Jobzippy/Recruiters');
  if (!label) return;
  const threads = label.getThreads(0, 100); // latest 100
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheets()[0];
  const rows = sh.getDataRange().getValues(); // include header
  const header = rows[0];
  const idx = (name) => header.indexOf(name);
  const mapByCompany = new Map();
  for (let r = 1; r < rows.length; r++) {
    const company = rows[r][idx('company')];
    const appId = rows[r][idx('app_id')];
    mapByCompany.set(company + '|' + appId, r + 1); // 1-based row index
  }
  threads.forEach(th => {
    const msg = th.getMessages().slice(-1)[0];
    const subj = msg.getSubject();
    const from = msg.getFrom();
    const date = msg.getDate();
    const companyGuess = subj.split('-')[0].trim();
    // naive match first; improve later with regex/urls
    for (const key of mapByCompany.keys()) {
      if (key.startsWith(companyGuess + '|')) {
        const row = mapByCompany.get(key);
        sh.getRange(row, idx('status') + 1).setValue('replied');
        sh.getRange(row, idx('email_subject') + 1).setValue(subj);
        sh.getRange(row, idx('email_from') + 1).setValue(from);
        sh.getRange(row, idx('last_email_at') + 1).setValue(date);
        break;
      }
    }
  });
}
```

### 11.2 Optional (Labeled Gmail metadata via API)

- Scope: `gmail.readonly`, `format=metadata`.
- Query: `label:Jobzippy/Recruiters newer_than:7d`.
- Read headers: From, Subject, Date. Update Sheet by `app_id`/company.

---

## 12) BYO‑Cloud Runner (User’s GCP) – Deploy

**Prereqs:** User has a GCP project and billing enabled (free tier likely covers).

**Env vars:**

- `SHEET_ID` – target Google Sheet
- `GMAIL_LABEL` – e.g., `Jobzippy/Recruiters` (optional)
- `DAILY_QUOTA` – e.g., `50`
- `SCHEDULE` – e.g., `09:00-17:00` local
- `FILTERS_JSON` – titles, locations, salary, keywords (small)
- Secrets in **Secret Manager**: OAuth client/refresh tokens; site cookies

**gcloud one‑liner (example):**

```bash
gcloud run deploy jobpilot-runner \
  --image=gcr.io/<project>/jobpilot-runner:latest \
  --platform=managed \
  --region=us-central1 \
  --set-env-vars=SHEET_ID=<id>,GMAIL_LABEL=Jobzippy/Recruiters,DAILY_QUOTA=50,SCHEDULE=09:00-17:00 \
  --set-secrets=GOOGLE_OAUTH_REFRESH_TOKEN=projects/<p>/secrets/refresh:latest \
  --allow-unauthenticated
```

(We’ll provide a small web UI in the extension to generate these envs and push.)

**Runner responsibilities:**

- Search → filter → apply (Playwright)
- Append to Sheet
- Read labeled Gmail metadata (optional) → update Sheet
- Respect quotas/schedules; back off on detection/CAPTCHA

---

## 13) Playwright – Apply Loop (Pseudocode)

```ts
for (const platform of enabledPlatforms) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: userCookies[platform] });
  const page = await ctx.newPage();
  await page.goto(platform.searchUrl(filters));

  const jobs = await collectJobs(page, filters);
  for (const job of jobs) {
    if (!passesVisaSponsorFilter(job.company)) continue;
    const ok = await openJobAndApply(page, job, profileVaultPolicies);
    if (ok) await appendSheetRow(job, 'applied');
    await humanWaitJitter();
    if (quotaReached()) break;
  }

  await browser.close();
}
```

---

## 14) Notifications (Daily Summary)

**WhatsApp/SMS template:**

```
Jobzippy – Daily Summary
Applied: {{applied}} (LinkedIn {{li}}, Indeed {{in}})
Replies: {{replies}} ({{companies}})
Next run: {{tomorrow_time}}
Reply STOP to unsubscribe.
```

---

## 15) Referrals & Anti‑Fraud (MVP)

- **\$3 per paid referral**; **cash payout** after **45 days** and **1 successful renewal**.
- **Minimum payout \$25** (stackable).
- **Phone OTP** required to become a referrer.
- **US‑only** at launch.
- **Self‑referrals** allowed or disallowed (toggle in config; default: disallow same card).
- **Payout methods:** PayPal or Stripe Connect (batch weekly/biweekly).
- **Abuse controls:** refer cap before manual review; IP/device heuristics optional.

**Firestore referral fields:** see §9. Unlock worker tallies invoice events from Stripe and moves `locked_cents → unlocked_cents` after 45 days.

---

## 16) Compliance & Disclosures (MVP)

- **Terms of Use:** Auto-apply may violate some site TOS; user accepts responsibility.
- **Privacy Policy:** We do not store resumes/EEO/criminal history or email contents; application logs live in the user’s Sheet; minimal account data in Firestore; tokens encrypted.
- **Messaging:** WhatsApp/SMS uses approved templates; include STOP opt‑out.
- **Google Verification:** Required when moving beyond test users for Sheets/Gmail scopes.
- **Chargebacks:** 45‑day payout hold + renewal requirement; phone OTP.

---

## 17) One‑Week Build Plan

**Day 1** – Extension scaffold, Google OAuth (PKCE), Profile Vault (IndexedDB + crypto), Create Sheet.\
**Day 2** – LinkedIn Easy Apply content scripts, Sheet append, side‑panel UI.\
**Day 3** – Indeed apply path, scheduling (hours/quota), basic sponsor filter stub.\
**Day 4** – Twilio SMS/WhatsApp summaries; Referral code gen; Phone OTP.\
**Day 5** – Stripe Checkout + Portal + webhooks; referral accounting (locked/unlocked).\
**Day 6** – Apps Script installer for reply sync; optional labeled Gmail metadata client polling.\
**Day 7** – BYO‑Cloud Runner (basic deploy script), testing, packaging, draft ToS/Privacy.

---

## 18) Open Configuration Flags

- **Enable Gmail API metadata sync** (default off; Apps Script recommended)
- **Allow applying to UNKNOWN sponsor companies** (on/off)
- **Self‑referrals** (allow/deny)
- **BYO‑Cloud Runner** enabled (on/off)

---

## 19) Future Roadmap (Post‑MVP)

- Firefox/Safari support
- Multi‑platform expansion (Glassdoor, Dice, ZipRecruiter, Monster)
- Smarter matching (skills → JD), cover letters later
- Analytics (apply → interview → offer funnel)
- KYC gating for high‑volume referrers (if needed)
- Partnerships/APIs with job boards/ATS

---

## 20) Quick Dev Notes & Standards

- **Delays/jitter** between actions to reduce bot detection
- **Back‑off** on CAPTCHA/detection; mark job as `skipped`
- **Idempotent writes** to Sheet (`app_id` key)
- **Token security** (extension storage + Firestore w/ KMS; revoke options)
- **Export/erase** buttons to meet user‑data expectations even if we don’t store resumes

---

**This spec is LOCKED for MVP.** Any change requests should specify: *Why*, *User impact*, *Timeline delta*, *Risk.*

