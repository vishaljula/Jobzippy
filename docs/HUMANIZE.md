# Humanize Implementation

> Anti-detection layer for job application automation.
> Goal: "Human-ish + resilient", not "undetectable".

## Terminology

| Term | Meaning |
|------|---------|
| **Background Mode** | Tabs open with `active: false` - user isn't distracted |
| **Observer Mode** | Tabs open with `active: true` - user watches automation |
| **Humanize** | Anti-detection: jitter, realistic typing, proper events |

These are separate concerns. This document focuses on **Humanize**.

---

## Current State

### ✅ Implemented

| Feature | Location | Notes |
|---------|----------|-------|
| `jitter(min, max)` | `lib/humanize.ts` | Random delay between actions (default 800-1500ms) |
| `microJitter(min, max)` | `lib/humanize.ts` | Short delay for keystrokes (30-120ms) |
| `thinkPause()` | `lib/humanize.ts` | Longer pause for major transitions (1-3s) |
| `humanType(element, text)` | `lib/humanize.ts` | Character-by-character with keydown/input/keyup |
| `humanClick(element)` | `lib/humanize.ts` | mouseover→mousedown→mouseup→click sequence |
| `humanSelect(select, value)` | `lib/humanize.ts` | Focus→select→blur with events |
| `humanToggle(input, checked)` | `lib/humanize.ts` | Click checkbox/radio via label |
| `attachFile(input, file)` | `lib/humanize.ts` | File input with proper events |
| `scrollIntoViewIfNeeded()` | `lib/humanize.ts` | Smooth scroll if element not in viewport |
| Form field jitter | `form-filler.ts` | 300-800ms delay between fields |
| Human typing for inputs | `form-filler.ts` | Uses `humanType` for text ≤100 chars |
| Humanized clicks | `navigator.ts` | All navigation clicks use `humanClick` |
| Humanized clicks | `executor-v2.ts` | Job card, apply, pagination clicks |
| Submit with humanClick | `navigator.ts` | Submit uses humanized click (500-1000ms jitter) |

### Configuration

```typescript
// lib/humanize.ts
export const humanizeConfig = {
  enabled: true,           // Master switch for all humanization
  defaultJitterMin: 800,   // Default min delay (ms)
  defaultJitterMax: 1500,  // Default max delay (ms)
  keystrokeDelayMin: 30,   // Min delay between keystrokes
  keystrokeDelayMax: 120,  // Max delay between keystrokes
  useHumanTyping: true,    // Use char-by-char typing
};
```

---

## Submit Mode

Submit is **enabled** and uses humanized click with 500-1000ms jitter:

```typescript
await humanClick(submitAction.element as HTMLElement, { jitterBefore: true, minJitter: 500, maxJitter: 1000 });
```

### To Disable Submissions (Dry Run)

In `ui/src/content/ats/navigator.ts` around line 959, comment out the humanClick and add early return:

```typescript
// await humanClick(submitAction.element as HTMLElement, { ... });
return true; // Dry run - skip submit
```

---

## Event Sequences

### Text Input (humanType)
```
focus → (for each char: keydown → input → keyup) → change → blur
```

### Click (humanClick)
```
mouseover → mousedown → (50-100ms hold) → mouseup → click → native click()
```

### Select (humanSelect)
```
focus → set value → input → change → blur
```

---

## Timing Defaults

| Action | Delay Range | Notes |
|--------|-------------|-------|
| Between clicks | 800-1500ms | Main jitter |
| Between form fields | 300-800ms | Faster for form filling |
| Between keystrokes | 30-120ms | Natural typing speed |
| After focus, before typing | 50-150ms | Small pause |
| Before blur | 100-300ms | Small pause |
| Think pause | 1000-3000ms | Major transitions |
| CAPTCHA checkbox | 500-1000ms | Extra careful |

---

## Files Modified

1. **`ui/src/lib/humanize.ts`** - Core humanization utilities (NEW)
2. **`ui/src/content/ats/form-filler.ts`** - Uses humanType, humanSelect, humanToggle
3. **`ui/src/content/ats/navigator.ts`** - Uses humanClick, jitter, submit disabled
4. **`ui/src/content/executor-v2.ts`** - Uses humanClick for all clicks

---

## What's NOT Implemented (Low Priority)

| Feature | Why Not Needed |
|---------|----------------|
| Mouse movement simulation | Hard in extensions, low detection risk |
| Scroll simulation | Background tabs don't render viewport |
| Timing entropy analysis | Random jitter is sufficient |
| Rate limiting per site | Handled at orchestration level |

---

## Testing

1. Set `humanizeConfig.enabled = true` (default)
2. Run automation on LinkedIn
3. Watch console logs for "humanClick", "humanType" messages
4. Forms should fill slowly, character by character
5. Submit should be skipped (dry run mode)

To disable humanization for faster testing:
```typescript
import { humanizeConfig } from '../lib/humanize';
humanizeConfig.enabled = false;
```

