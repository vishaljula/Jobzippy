# Observer Mode (Visible Automation)

Current: **Stealth Mode** - All tabs open in background

To enable Observer Mode (user sees LinkedIn Easy Apply forms), change in `src/sidepanel/App.tsx` line ~766:

```ts
// Stealth (current):
chrome.tabs.create({ url: urls.linkedin, active: false }, ...);

// Observer:
chrome.tabs.create({ url: urls.linkedin, active: true }, ...);
```

