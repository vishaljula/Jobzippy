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
   - Select the `dist` folder

### Development

Start the development build with hot reload:
```bash
npm run dev
```

This will watch for file changes and rebuild automatically. You'll need to refresh the extension in Chrome after each rebuild.

## 📁 Project Structure

```
Jobzippy/
├── public/
│   ├── manifest.json          # Chrome extension manifest
│   └── icons/                 # Extension icons
├── src/
│   ├── background/            # Background service worker
│   │   └── index.ts
│   ├── content/               # Content scripts for job sites
│   │   ├── linkedin/
│   │   │   └── index.ts
│   │   └── indeed/
│   │       └── index.ts
│   ├── sidepanel/             # Main UI (React)
│   │   ├── index.html
│   │   ├── index.tsx
│   │   ├── App.tsx
│   │   └── styles.css
│   └── lib/                   # Shared utilities
│       ├── types.ts
│       └── storage.ts
├── scripts/                   # Build scripts
├── dist/                      # Build output (generated)
└── package.json
```

## 🛠️ Tech Stack

- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Storage**: IndexedDB (idb) + chrome.storage
- **Backend**: Firebase/Firestore
- **APIs**: Google Sheets, Gmail, Twilio, Stripe

## 📝 Scripts

- `npm run dev` - Start development build with watch mode
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors automatically
- `npm run format` - Format code with Prettier
- `npm run type-check` - Run TypeScript type checking

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
- [API Documentation](#) (Coming soon)

## 🐛 Issues & Support

For bugs and feature requests, please use [GitHub Issues](#).

## 🗺️ Roadmap

See [BACKLOG.md](BACKLOG.md) for the complete development roadmap.

---

Built with ❤️ for job seekers

