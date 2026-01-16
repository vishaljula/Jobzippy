# Observer Mode vs Stealth Mode

## Current Status: **Observer Mode** (active: true)

⚠️ **Stealth mode is temporarily disabled** due to issues with background tab automation:
- `getBoundingClientRect()` returns zeros in background tabs
- `scrollIntoView({ behavior: 'smooth' })` doesn't work (uses requestAnimationFrame which is paused)
- Click events may be deferred until tab is focused
- Timer throttling in background tabs causes delays

**TODO: Revisit stealth mode implementation**

---

## Configuration

Tabs are opened in 3 places:

### 1. LinkedIn Search Tab (`src/sidepanel/App.tsx` ~line 810)
```ts
chrome.tabs.create({ url: urls.linkedin, active: true }, ...);
```

### 2. External ATS Tab (`src/background/index.ts` - OPEN_EXTERNAL_ATS_TAB)
```ts
chrome.tabs.create({ url, active: true }, ...);
```

### 3. ATS Tab (`src/background/index.ts` - OPEN_ATS_TAB)
```ts
chrome.tabs.create({ url, active: true }, ...);
```

---

## To Enable Stealth Mode (Future)

Change all 3 locations to `active: false`. But this requires fixes for:

1. **Visibility checks** - `isElementActuallyVisible()` in `navigator.ts` uses `getBoundingClientRect()` which returns 0 in background tabs. Need to use `offsetWidth`/`offsetHeight` when `document.hidden === true`.

2. **Scrolling** - `scrollIntoViewIfNeeded()` in `humanize.ts` uses smooth scroll which doesn't work in background tabs. May need to skip scrolling entirely for background tabs.

3. **Click events** - Even with fixes above, Chrome may defer click events in background tabs. May need to temporarily activate tab just for submit actions.

4. **Timer throttling** - `setTimeout`/`setInterval` are throttled to ~1s in background tabs after 10 seconds. Jitter delays may become much longer.

---

## Research Notes

From Chrome documentation:
- Background tabs have throttled timers (capped to ~1s after 10 seconds inactive)
- `requestAnimationFrame` is paused entirely in background tabs
- `getBoundingClientRect()` returns zeros for elements in background tabs
- Some user gesture requirements may block programmatic clicks

Potential solutions explored:
- Using `document.hidden` to detect background tab and use fallback methods
- Using `offsetWidth`/`offsetHeight` instead of `getBoundingClientRect()`
- Using `behavior: 'instant'` instead of `smooth` for scrolling
- Temporarily activating tab for critical actions (disrupts user workflow)
