## Jobzippy — Chat Assignments, Context, and Run/QA Instructions

This document briefs all parallel chats with consistent context, scope, and “done” criteria. It also captures the run/build workflow you requested: one active UI dev session, one API server on 8787, and testing one branch at a time.

### Project snapshot (brief)
- Goal: Chrome extension that parses resumes, manages a local encrypted vault, auto-applies to jobs, logs to a user-owned Google Sheet, and provides optional daily summaries and email reply sync.
- Implemented: Google OAuth PKCE; IndexedDB encrypted vault (AES‑GCM + PBKDF2); resume intake pipeline with Claude/OpenAI fallback + heuristics; initial onboarding; CI/testing infra; Cloud Run token service (API) scaffolding with tests; stricter CORS.
- Not yet implemented (key P0/P1): Conversational chat runtime; Chat UI polish; Google Sheet creation/append/update; LinkedIn/Indeed search + ATS application engine; AI decision engine; Gmail reply sync; cover letters; scheduling + coordinator.
- Security: Local-only vault for sensitive data; user-owned Google Sheet as source of truth for app logs; minimal server metadata; no email contents stored; CORS allowlist.

### Extension dev workflow (your chosen approach)
- One active worktree/branch at a time for UI dev (others idle).
- One API server on http://localhost:8787 when backend is needed.
- Build and load: `npm run build` in the active worktree → load `ui/dist` via chrome://extensions (Developer Mode → Load unpacked).
- Dev iterate: run `npm run dev` only in the active worktree; reload extension on rebuilds.
- API dev: run `npm run dev --workspace=api` only when the current story requires API changes.

### Environment
- Default to a single shared `.env` at repo root.
- Optional `.env.local` in a worktree only if you need a temporary local override (not committed).
- Typical vars:
  - VITE_API_URL=http://localhost:8787
  - API only (no VITE_): GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, ALLOWED_ORIGINS, PORT=8787

---

## Chat Assignments (5 stacks)

Base branch: `main`. Each chat owns a cohesive stack of stories. All acceptance criteria are in `BACKLOG.md`.

### Chat 1 → Branch: `feat/jz-009-stack`
- Stories: JZ-009 (Conversational Onboarding) + JZ-009A (Chat UI Component)
- Scope:
  - Build reusable `ChatInterface` component (bubbles, typing indicator, auto-scroll, retry, timestamps, avatar, error states).
  - Conversation state management (messages, persistence hooks for history of user actions).
  - Resume-first flow: prefill from vault/intake results; ask only missing fields; validation and clarification; “Start Over”; Save & Continue.
  - Wire streaming placeholder and function-calling/structured-extraction hooks (may stub API responses at first).
- Key files to touch:
  - `ui/src/components/...` (chat UI), `ui/src/lib/onboarding`, `ui/src/sidepanel/App.tsx`
  - `ui/src/lib/intake/*`, `ui/src/lib/vault/*` (integration points only)
- Done when:
  - Acceptance criteria for both stories are met, with unit tests for UI behaviors and message state.
  - Chat UI is reusable and integrated into onboarding surface.
  - Error/empty/typing states implemented and accessible.
- QA (manual):
  - Send/receive message flow, auto-scroll, typing indicator, retry on error.
  - Resume upload prefill → missing-fields follow-ups.
  - Skip/later deferrals recorded without vault write.
  - “Start Over” resets state; Save & Continue restores.

### Chat 2 → Branch: `feat/jz-011-stack`
- Stories: JZ-011 (Create Sheet) + JZ-012 (Append Row) + JZ-013 (Update Status)
- Scope:
  - Create Google Sheet with headers (A→Q), freeze header row, store `sheet_id`.
  - Append row idempotently by `app_id` with retry/backoff; offline queue for later sync.
  - Update status for existing rows by `app_id` (batch updates).
  - Minimal UI affordances to trigger and show outcome (toast/log).
- Key files:
  - `ui/src/lib/*` for Google API wrapper; `ui/src/sidepanel/*` for triggers.
- Done when:
  - Sheet creation works end-to-end; `sheet_id` persisted.
  - Append and update pass tests; handles rate limits.
- QA:
  - Create sheet once; assert headers and freeze.
  - Append row; re-append same `app_id` is idempotent.
  - Update status in batch; verify values in Sheet.

### Chat 3 → Branch: `feat/jz-014-015`
- Stories: JZ-014 (LinkedIn Job Search content script) + JZ-015 (AI Application Engine)
- Scope:
  - Inject content script on linkedin.com/jobs/*; extract listings, pagination, JD.
  - AI-powered form filling for Easy Apply; placeholders for external ATS detection.
  - Respect vault policies; upload resume when needed; jitter/back-off.
- Key files:
  - `ui/src/content/linkedin/*`, `ui/src/background/*`, `ui/src/lib/intake/*`, `ui/src/lib/vault/*`
- Done when:
  - Search extraction reliable; Easy Apply flow submits basic apps with data from vault.
  - Logs to Sheet via existing functions (from Chat 2).
- QA:
  - Simulated runs on test pages; verify logs and rate-limiting behavior.

### Chat 4 → Branch: `feat/jz-019-020-020a`
- Stories: JZ-019 (Scheduler) + JZ-020 (Coordinator) + JZ-020A (AI Decision Engine)
- Scope:
  - chrome.alarms-based scheduler with daily quota.
  - Coordinator orchestrates platform runs, back-off, queue.
  - AI Decision Engine (match score, reasoning, deal-breakers).
- Done when:
  - Runs respect schedule/quota and produce deterministic logs.
  - Decision engine integrated as a gate before apply.
- QA:
  - Simulate alarms; verify quotas and back-off.
  - Confirm apply/skip decisions logged with reasoning.

### Chat 5 → Branch: `feat/jz-021`
- Story: JZ-021 (Smart Gmail Reply Detection)
- Scope: Gmail metadata search → match to applications with LLM assistance; update Sheet if confidence ≥ 70%.
- QA: Provide test harness to feed metadata; verify matches and updates.

---

## Run and Test Instructions (for all chats)
1) Build UI in the active worktree:
   - `npm run build`
   - Load `ui/dist` via chrome://extensions (Developer Mode → Load unpacked)
2) Dev iterate (only one worktree at a time):
   - `npm run dev` (UI)
   - Reload the extension between iterations if needed.
3) API (only if needed for the current story):
   - `npm run dev --workspace=api`
   - Ensure `VITE_API_URL=http://localhost:8787` in `.env`
4) Tests:
   - UI unit tests: `npm run test --workspace=ui`
   - API tests: `npm run test --workspace=api`
   - E2E (selected): `npm run test:e2e` (UI)

---

## Definition of Done (all chats)
- Meets acceptance criteria in `BACKLOG.md`.
- No lint/type errors (`npm run lint`, `npm run type-check`).
- Unit tests updated/passing; add tests for critical paths.
- Docs updated where applicable (README snippets or inline usage notes).

Coordinate status in `TEAM_STATUS.md`. Build one branch at a time; keep only one dev server and one API server running concurrently.


