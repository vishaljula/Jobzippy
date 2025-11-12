## Team Status – 5 Chat Stacks

Base: `main`. One active UI dev and one API server (8787) at a time.

### Legend
- [ ] To do
- [~] In progress
- [x] Done
- [!] Blocked

---

### Chat 1 — Branch `feat/jz-009-stack`
- Stories: JZ-009 + JZ-009A
- Status:
  - [ ] ChatInterface component complete (bubbles, typing, timestamps, retry, copy, error states)
  - [ ] Message state management + persistence hooks
  - [ ] Resume-first flow; ask missing fields only; Start Over; Save & Continue
  - [ ] Streaming/function-call stubs integrated
  - [ ] Unit tests for UI behaviors

### Chat 2 — Branch `feat/jz-011-stack`
- Stories: JZ-011 + JZ-012 + JZ-013
- Status:
  - [ ] Create Sheet with headers (A→Q), freeze header row, persist `sheet_id`
  - [ ] Append row idempotently by `app_id`, retry/backoff, offline queue
  - [ ] Update status by `app_id` (batch)
  - [ ] Unit tests (API wrapper + idempotency)

### Chat 3 — Branch `feat/jz-014-015`
- Stories: JZ-014 + JZ-015
- Status:
  - [ ] LinkedIn search extraction (listings, pagination, JD)
  - [ ] Easy Apply flow from vault data; jitter/back-off; upload resume
  - [ ] External ATS detection stub
  - [ ] Logs to Sheet via Chat 2 functions
  - [ ] E2E smoke on test pages (where feasible)

### Chat 4 — Branch `feat/jz-019-020-020a`
- Stories: JZ-019 + JZ-020 + JZ-020A
- Status:
  - [ ] Scheduler (chrome.alarms) + daily quota
  - [ ] Coordinator orchestrates platform runs, back-off, queue
  - [ ] AI Decision Engine integrated (score, reasoning, deal-breakers)
  - [ ] Tests for quota/back-off and decision gating

### Chat 5 — Branch `feat/jz-021`
- Story: JZ-021
- Status:
  - [ ] Gmail metadata query builder
  - [ ] LLM-assisted matching → confidence
  - [ ] Update Sheet if confidence ≥ 70%
  - [ ] Harness with fixtures and unit tests

---

## Runbook (all chats)
1) UI build: `npm run build` → load `ui/dist` via chrome://extensions (Load unpacked).
2) UI dev: `npm run dev` (only one worktree at a time) → reload extension to test.
3) API (if needed): `npm run dev --workspace=api` (port 8787).
4) Tests: `npm run test --workspace=ui`, `npm run test --workspace=api`, selective `npm run test:e2e`.

Record decisions and blockers directly in this file under each chat’s section.


