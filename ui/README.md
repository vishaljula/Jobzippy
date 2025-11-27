# Jobzippy UI & Chrome Extension

This package contains the React-based UI (Side Panel) and the Content Scripts for the Jobzippy Chrome Extension.

## Build Architecture

This project uses a **dual-build strategy** to handle the specific requirements of Chrome Extensions.

### 1. Main Application (`vite.config.ts`)
*   **Target**: Side Panel, Background Script, Mock Pages.
*   **Format**: Standard ES Modules (Vite default).
*   **Features**: Code splitting, shared chunks, HMR (Hot Module Replacement).
*   **Entry Points**: `src/sidepanel/index.html`, `src/background/index.ts`.

### 2. Content Scripts (`vite.content.config.ts`)
*   **Target**: `content-linkedin.js`, `content-indeed.js`, `content-ats.js`.
*   **Format**: **IIFE** (Immediately Invoked Function Expression).
*   **Why?**: Chrome Content Scripts do not support ES Modules (`import`/`export`) natively in all contexts, and Vite's default code splitting creates shared chunks that cause "Cannot use import statement outside a module" errors.
*   **Solution**: We use a dedicated build config (`vite.content.config.ts`) that forces each content script to be bundled into a **single, self-contained file** with zero external imports.

## Development Commands

### `npm run dev` (Recommended)
Runs the development environment in **parallel watch mode**:
1.  Starts the Main App build watcher.
2.  Starts the Content Script build watchers (one for each script).

Use this command for all development. It ensures that content scripts are always rebuilt as valid IIFEs whenever you change the code.

### `npm run build`
Performs a full production build:
1.  Cleans the `dist` directory.
2.  Builds the Main App.
3.  Builds all Content Scripts sequentially.

## Project Structure

*   `src/sidepanel`: React application for the extension side panel.
*   `src/background`: Service worker logic.
*   `src/content`: Content scripts injected into target websites.
    *   `linkedin`: LinkedIn-specific logic.
    *   `indeed`: Indeed-specific logic.
    *   `ats`: Generic ATS navigation logic.
*   `src/lib`: Shared utilities (Auth, Vault, etc.).

## Troubleshooting

**"Cannot use import statement outside a module"**
*   **Cause**: A content script was built as an ES module (likely by the main Vite config) instead of an IIFE.
*   **Fix**: Ensure you are running `npm run dev` (which uses the correct parallel build) and NOT just `vite build --watch`. The content scripts must be built using `vite.content.config.ts`.
