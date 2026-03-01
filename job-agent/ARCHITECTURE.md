# Jobzippy Job-Agent Architecture

```mermaid
flowchart TD
    %% External
    GH["🌐 Job APIs\nGreenhouse etc."]
    ProfileJSON["📋 profile.json"]
    ResumePDF["📄 resume.pdf"]

    %% Orchestration
    subgraph Orch["⚙️ Orchestration"]
        Agent["job-agent.ts"]
        E2E["test/e2e-single.ts"]
        GenPlans["generate-fill-plans.ts"]
    end

    %% Layer 1
    subgraph L1["🔍 Layer 1 — Job Discovery"]
        Finder["finder.ts\nFetch · filter · rank jobs"]
    end

    %% Layer 2a — DOM Extraction
    subgraph L2a["🧩 Layer 2a — DOM Extraction"]
        CF["extractor/common-fields.js\nInject into page · stamp data-jz-id\nExtract label, type, value, required"]
        FF["extractor/field-filter.ts\nRemove ATS autofill widgets"]
        CB["extractor/combobox.ts\nOpen each dropdown · read all options"]
    end

    %% Layer 2b — Vision Extraction (NEW)
    subgraph L2b["👁️ Layer 2b — Vision Extraction (NEW)"]
        VE["extractor/vision-extractor.ts\nFull-page screenshot → Claude Haiku Vision\nFinds button groups · EEO checkboxes\nthat DOM extractor misses\nOutputs: VisionField[]"]
        VD["llm/vision-defaults.ts\nEEO fields → 'I prefer not to answer'\nwork auth → Yes · sponsorship → No"]
    end

    %% Layer 3 — LLM Planning (DOM only)
    subgraph L3["🧠 Layer 3 — LLM Planning (DOM fields only)"]
        Planner["llm/planner.ts\nDOM elements + profile → Claude Haiku\n→ FillAction per field (jz-id stamped)"]
        Reconciler["llm/plan-reconciler.ts\nExact → Fuzzy → Fallback\nFix LLM values not in options"]
    end

    %% Layer 3b — Merge (NEW)
    subgraph L3b["🔀 Layer 3b — Plan Merge (NEW)"]
        Merge["llm/merge-planner.ts\nDOM plan (jz-id actions)\n+ Vision-only fields (label+answer)\n= MergedAction[]\nDOM wins on any overlap"]
    end

    %% Layer 4 — Form Filling
    subgraph L4["✍️ Layer 4 — Form Filling"]
        OptFilter["extractor/option-matcher.ts\nFuzzy match value → real option text"]
        Filler["filler/fill.ts\ninput_text: clear + type\ncombobox: pressSequentially → getByRole → click\nupload_file: setInputFiles\nclick_button: container(label).getByRole(button,name) ← NEW\ncheckbox: container(label).getByRole(checkbox,name) ← NEW"]
    end

    %% Data stores
    FillPlans["📁 extractions/fill-plans/\nCached LLM plans per job"]
    AuditDir["📁 extractions/audit/\nScreenshots · dom.json · vision-plan.json\nper apply run"]

    %% Result
    Result["✅ ApplicationResult"]

    %% Flow — Discovery
    GH --> Finder --> Agent
    ProfileJSON --> Planner
    ProfileJSON --> VE
    ResumePDF --> Filler

    %% Flow — Extraction
    Agent --> CF
    E2E --> CF
    GenPlans --> CF

    CF --> FF --> CB
    CB --> Planner
    CB --> VE

    %% Flow — Vision
    VE --> VD --> Merge

    %% Flow — Planning
    Planner --> Reconciler --> Merge
    Reconciler --> FillPlans

    %% Flow — Filling
    Merge --> Filler
    OptFilter -. used by .-> Reconciler
    OptFilter -. used by .-> Filler
    Filler --> AuditDir
    Filler --> Result

    %% Style
    classDef layer fill:#1e293b,stroke:#334155,color:#e2e8f0
    classDef newlayer fill:#1e1b4b,stroke:#4338ca,color:#c7d2fe
    classDef external fill:#0f172a,stroke:#475569,color:#94a3b8,stroke-dasharray:4
    classDef store fill:#172554,stroke:#1d4ed8,color:#bfdbfe
    classDef result fill:#14532d,stroke:#15803d,color:#bbf7d0

    class L1,L2a,L3,L4 layer
    class L2b,L3b newlayer
    class GH,ProfileJSON,ResumePDF external
    class FillPlans,AuditDir store
    class Result result
```

## Pipeline Summary

| Layer | What it does | Key tech |
|---|---|---|
| **Discovery** | Finds matching jobs from APIs, filters by profile preferences | Greenhouse API |
| **DOM Extraction** | Injects script into live form, stamps every field with `data-jz-id`, expands all dropdowns to read real options | Playwright + `common-fields.js` |
| **Field Filter** | Removes ATS autofill widgets (Ashby resume-autofill) before LLM sees them | `field-filter.ts` |
| **Vision Extraction** *(new)* | Takes full-page screenshot, asks Claude Vision for ALL visible fields including button groups and EEO checkboxes that DOM misses. Returns `VisionField[]` with `visual_type`, `choices`, `answer` | Claude Haiku Vision |
| **LLM Planning** | Sends **DOM-only** enriched field list + profile to LLM, gets back a `FillAction` per field (jz-id stamped, real option values) | Claude Haiku (Anthropic) |
| **Plan Reconciler** | Catches LLM values not in the options list — corrects before any fill attempt | Pure TS logic |
| **Plan Merge** *(new)* | Combines DOM jz-id plan + vision-only fields into `MergedAction[]`. DOM always wins on overlap. Vision adds fields DOM never saw. | Pure TS logic |
| **Filling** | Executes each action. DOM actions → `data-jz-id`. Vision `click_button` → proximity text selector. | Playwright |

## Key Design Decisions

- **Vision is additive only** — DOM-stamped actions are never replaced by vision. LLM never sees vision fields.
- **Single screenshot per apply** — one Claude Vision call covers the entire form gap. ~$0.002/apply with Haiku.
- **Proximity text selector for vision actions** — `page.locator('*', { hasText: label }).last().getByRole('button', { name: answer })` — no coordinates, no Stagehand dependency.
- **EEO defaults without LLM** — `vision-defaults.ts` pattern-matches question text to apply "I prefer not to answer" automatically.
- **`common-fields.js` untouched** — Skyvern vendor code stays pristine. All augmentation is post-extraction.
- **Combobox options read at extraction time** — LLM sees real options, not guesses.
- **Plan reconciler as a named layer** — LLM drift is corrected deterministically, not by re-prompting.
- **`pressSequentially` not `fill()`** — keeps React dropdown open during typing.
- **`getByRole('option')` no `force:true`** — fires proper mousedown/up/click events so React registers the selection.
