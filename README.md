# Jobzippy

> Your personal agentic AI assistant who manages your job applications

A Chrome extension that automatically finds, filters, applies, and tracks job applications across major job boards, with daily WhatsApp/SMS status updates.

## ✨ Features

- 🎯 **Auto-Apply**: Automatically apply to jobs matching your preferences
- 📊 **Google Sheets Integration**: All applications logged in your own Google Sheet
- 🔔 **Daily Summaries**: WhatsApp/SMS updates on your progress
- 🛡️ **Privacy First**: Your data stays encrypted and under your control
- 🌍 **H-1B/OPT Filter**: Filter companies by visa sponsorship status
- 💰 **Referral System**: Earn cash for referring paid users

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Chrome browser

### Installation for Development

1. Clone the repository:
```bash
git clone <repo-url>
cd Jobzippy
```

2. Install dependencies:
```bash
npm install
```

3. Build the extension:
```bash
npm run build
```

4. Load in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `ui/dist` folder

### Development

Start the development build with hot reload:
```bash
npm run dev
```

This delegates to the `ui` workspace watcher. Refresh the extension in Chrome after each rebuild.

## 📁 Project Structure

```
Jobzippy/
├── ui/                        # Chrome extension workspace (React + Vite)
│   ├── src/                   # Extension source
│   ├── public/                # Manifest + icons
│   ├── e2e/                   # Playwright E2E tests
│   ├── package.json           # UI workspace manifest
│   └── config files           # Tailwind, Vite, Vitest, etc.
├── api/                       # Cloud Run token exchange service (Express)
│   ├── src/                   # API source code
│   ├── package.json           # API workspace manifest
│   ├── Dockerfile             # Cloud Run container image
│   └── config files           # tsconfig, eslint, vitest
├── package.json               # Monorepo root (npm workspaces)
├── package-lock.json          # Shared lockfile for all workspaces
├── .github/workflows/ci.yml   # CI pipeline (UI + API)
├── docs & specs               # Product documentation
└── README.md                  # This file
```

## 🛠️ Tech Stack

- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Storage**: IndexedDB (idb) + chrome.storage
- **Backend**: Cloud Run (Express API) + Firebase/Firestore (upcoming stories)
- **APIs**: Google Sheets, Gmail, Twilio, Stripe

## ☁️ Cloud Run Token Service (`api/`)

> **Local setup:** Copy `.env.example` to `.env` and fill in real Google OAuth credentials before running `npm run dev`. The API listens on `PORT=8787` by default to match the UI's `VITE_API_URL`.


- Exchanges OAuth authorization codes & refresh tokens using the server-side client secret
- Express + TypeScript app with Zod validation and Vitest + Supertest coverage
- Dockerfile for Cloud Run deployments (`api/Dockerfile`)
- Environment variables:
  - `GOOGLE_OAUTH_CLIENT_ID`
  - `GOOGLE_OAUTH_CLIENT_SECRET`
  - `ALLOWED_ORIGINS` (comma-separated list, e.g. `chrome-extension://<id>`)
  - `PORT` (default 8787 locally; Cloud Run sets this automatically)
- Local development: `npm run dev --workspace=api`
- Production entrypoint: `npm run start --workspace=api`

## 📝 Scripts

### Root (npm workspaces)

- `npm run dev` – Run UI + API dev servers in parallel
- `npm run dev:ui` / `npm run dev:api` – Run each workspace individually
- `npm run build` – Build both workspaces (UI → `ui/dist`, API → `api/dist`)
- `npm run lint` – ESLint for UI + API
- `npm run lint:fix` – Auto-fix lint issues in both workspaces
- `npm run test` – Run Vitest suites (UI + API)
- `npm run test:ui` / `npm run test:api` – Run unit tests per workspace
- `npm run test:e2e` – Playwright smoke tests for the extension (UI only)
- `npm run type-check` – UI TypeScript project references
- `npm run format` – Prettier formatting for UI files

### UI workspace (`ui/`)

- `npm run dev` – Vite build/watch (used by root script)
- `npm run test`, `npm run test:coverage`, `npm run test:e2e`, etc.

### API workspace (`api/`)

- `npm run dev` – Run Express API locally with live reload
- `npm run build` – Compile to `api/dist` (deployment artifact)
- `npm run start` – Execute the compiled server (Cloud Run entrypoint)

## 🎨 Design System

The extension uses a modern, professional design with:

- **Primary Color**: Blue gradient (#0ea5e9)
- **Secondary Color**: Purple gradient (#a855f7)
- **Font**: Inter
- **UI Library**: Custom components with Tailwind CSS

## 🔐 Privacy & Security

- Resume and sensitive data encrypted locally (AES-GCM)
- Application logs stored in YOUR Google Sheet (you own the data)
- We only store account/billing metadata on our servers
- No email contents or sensitive info transmitted

## 📄 License

[To be determined]

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## 📖 Documentation

- [Product Specification](MVP%20Product%20Specification%20v1.0.md)
- [Product Backlog](BACKLOG.md)
- [Firebase Setup](FIREBASE_SETUP.md)
- [API Documentation](#) (Coming soon)

## 🐛 Issues & Support

For bugs and feature requests, please use [GitHub Issues](#).

## 🗺️ Roadmap

See [BACKLOG.md](BACKLOG.md) for the complete development roadmap.

---

Built with ❤️ for job seekers

